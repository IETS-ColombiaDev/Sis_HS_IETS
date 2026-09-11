"""Grafo de gobernanza del ciclo: nodos, contexto para el LLM y vistas guardadas."""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from . import ttm
from .methodology import TECHNOLOGY_STATUS_LABELS
from .models import (
    Cluster,
    Cycle,
    EvaluationDoc,
    StrategyGraph,
    TechType,
    Technology,
)
from .strategy_service import (
    PHASE_LABELS,
    _phase_bucket,
    _tech_name,
    dashboard_for,
)


FUNNEL_STEPS = (
    ("captured", "Capturadas"),
    ("filtered", "Filtradas"),
    ("prioritized", "Priorizadas"),
    ("evaluated", "Evaluadas"),
    ("published", "Publicadas"),
)

STATUS_TO_FUNNEL = {
    "capturada_no_asignada": "captured",
    "asignada_a_ciclo": "captured",
    "filtrada_apta_priorizacion": "filtered",
    "priorizada": "prioritized",
    "bajo_vigilancia": "filtered",
    "en_evaluacion": "evaluated",
    "publicada": "published",
}


def _node(
    key: str,
    kind: str,
    label: str,
    *,
    parent: str = "",
    subtitle: str = "",
    children: list[str] | None = None,
    prompts: list[str] | None = None,
    meta: dict | None = None,
    collapsed: bool = False,
) -> dict:
    return {
        "id": key,
        "type": kind,
        "label": label,
        "subtitle": subtitle,
        "parent": parent,
        "children": children or [],
        "prompts": prompts or [],
        "meta": meta or {},
        "collapsed": collapsed,
    }


def build_graph(
    db: Session,
    cycle: Cycle,
    *,
    include_restricted: bool,
    cluster_id: int | None = None,
    tech_type_id: int | None = None,
    band: str = "",
    status: str = "",
    phase: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
    priority_min: int | None = None,
    stage: str = "",
) -> dict:
    dash = dashboard_for(
        db,
        cycle,
        include_restricted=include_restricted,
        cluster_id=cluster_id,
        tech_type_id=tech_type_id,
        band=band,
        status=status,
        phase=phase,
        date_from=date_from,
        date_to=date_to,
        priority_min=priority_min,
        stage=stage,
    )
    scatter = dash.get("ttm_scatter") or []
    funnel = dash.get("funnel") or {}
    comparators = {c["technology_id"]: c for c in (dash.get("comparators") or [])}
    budgets = {b["technology_id"]: b for b in (dash.get("budget_items") or [])}

    tech_ids = [row["technology_id"] for row in scatter]
    techs = (
        {t.id: t for t in db.query(Technology).filter(Technology.id.in_(tech_ids)).all()}
        if tech_ids
        else {}
    )
    cluster_names = {c.id: c.name for c in db.query(Cluster).all()}
    type_names = {t.id: t.name for t in db.query(TechType).all()}

    nodes: list[dict] = []
    edges: list[dict] = []

    cycle_id = f"cycle:{cycle.id}"
    nodes.append(
        _node(
            cycle_id,
            "cycle",
            cycle.code,
            subtitle=f"{len(scatter)} tecnologías · {cycle.status}",
            prompts=[
                "Resuma este ciclo para un tomador de decisión de MinSalud: qué avanzó y qué falta.",
                "¿Qué tecnologías del ciclo merecen vigilancia estrecha o Mini-HTA y por qué?",
                "¿Dónde se atasca el embudo y qué habría que desbloquear antes del boletín?",
            ],
            meta={"cycle_id": cycle.id, "status": cycle.status},
        )
    )

    funnel_ids = []
    prev_funnel = cycle_id
    for code, label in FUNNEL_STEPS:
        fid = f"funnel:{code}"
        funnel_ids.append(fid)
        count = int(funnel.get(code) or 0)
        nodes.append(
            _node(
                fid,
                "funnel",
                label,
                parent=cycle_id,
                subtitle=f"{count} tecnologías",
                prompts=[
                    f"¿Qué significa que {count} tecnologías estén en '{label}' en este ciclo?",
                    "¿Qué riesgo operativo hay si esta etapa no avanza?",
                ],
                meta={"step": code, "count": count},
            )
        )
        edges.append({"source": prev_funnel, "target": fid, "kind": "funnel"})
        prev_funnel = fid
    nodes[0]["children"] = funnel_ids + nodes[0]["children"]

    cluster_children: dict[str, list[str]] = {}
    for row in scatter:
        tech = techs.get(row["technology_id"])
        if tech is None:
            continue
        cid = f"cluster:{tech.cluster_id or 0}"
        if cid not in cluster_children:
            cluster_children[cid] = []
            cname = cluster_names.get(tech.cluster_id) or row.get("cluster") or "Sin clúster"
            nodes.append(
                _node(
                    cid,
                    "cluster",
                    cname,
                    parent=cycle_id,
                    subtitle="Grupo de enfermedad",
                    collapsed=True,
                    prompts=[
                        f"¿Qué tecnologías de {cname} concentran más riesgo para el SGSSS?",
                        "Compare time-to-market y puntaje P1-P6 dentro de este clúster.",
                    ],
                    meta={"cluster_id": tech.cluster_id, "cluster": cname},
                )
            )
            edges.append({"source": cycle_id, "target": cid, "kind": "contains"})
            nodes[0]["children"].append(cid)
        cluster_children[cid].append(f"tech:{tech.id}")

    for row in scatter:
        tech = techs.get(row["technology_id"])
        if tech is None:
            continue
        tid = f"tech:{tech.id}"
        parent = f"cluster:{tech.cluster_id or 0}"
        child_ids = [f"detail:{tech.id}:ttm", f"detail:{tech.id}:evidence"]
        if include_restricted:
            child_ids.append(f"detail:{tech.id}:budget")
            child_ids.append(f"detail:{tech.id}:comparators")
        ncts = [str(x) for x in (tech.nct_ids or []) if x][:4]
        nodes.append(
            _node(
                tid,
                "technology",
                _tech_name(tech),
                parent=parent,
                subtitle=f"{TECHNOLOGY_STATUS_LABELS.get(row.get('status'), row.get('status'))} · {row.get('points') or 0} pts",
                collapsed=True,
                children=child_ids,
                prompts=[
                    f"Explique {_tech_name(tech)} para un comité: evidencia, fase y cercanía al mercado.",
                    "¿Qué implicaría su llegada al SGSSS en los próximos 24 meses?",
                    "¿Qué vacíos de evidencia o de registro INVIMA debería pedirle el IETS al desarrollador?",
                ],
                meta={
                    "technology_id": tech.id,
                    "cluster": row.get("cluster"),
                    "status": row.get("status"),
                    "points": row.get("points"),
                    "band": row.get("band"),
                    "months": row.get("months"),
                    "phase": row.get("phase"),
                    "nct_ids": ncts,
                    "type": type_names.get(tech.tech_type_id, ""),
                },
            )
        )
        edges.append({"source": parent, "target": tid, "kind": "contains"})
        # La etapa la calcula el datamart con el expediente del ciclo: una
        # tecnologia `en_evaluacion` con informe publicado cuelga de "Publicadas".
        step = row.get("stage") or STATUS_TO_FUNNEL.get(row.get("status") or "", "")
        if step:
            edges.append({"source": f"funnel:{step}", "target": tid, "kind": "status"})

        nodes.append(
            _node(
                f"detail:{tech.id}:ttm",
                "ttm",
                "Time-to-market",
                parent=tid,
                subtitle=f"{row.get('band_label') or row.get('band')} · {row.get('months') if row.get('months') is not None else 's/d'} m",
                prompts=[
                    f"Interprete el time-to-market de {_tech_name(tech)} y qué franja debería usar el tablero.",
                ],
                meta={"band": row.get("band"), "months": row.get("months"), "basis": row.get("basis")},
            )
        )
        edges.append({"source": tid, "target": f"detail:{tech.id}:ttm", "kind": "detail"})

        evidence_bits = []
        if ncts:
            evidence_bits.append(", ".join(ncts))
        if tech.development_phase:
            evidence_bits.append(tech.development_phase)
        nodes.append(
            _node(
                f"detail:{tech.id}:evidence",
                "evidence",
                "Evidencia y ensayos",
                parent=tid,
                subtitle=evidence_bits[0] if evidence_bits else "Sin NCT público",
                prompts=[
                    f"¿Qué ensayos o evidencia sostienen a {_tech_name(tech)} y qué falta para Colombia?",
                ],
                meta={
                    "nct_ids": ncts,
                    "phase": tech.development_phase or "",
                    "indication": (tech.indication or "")[:280],
                    "summary": (tech.summary or "")[:400],
                },
            )
        )
        edges.append({"source": tid, "target": f"detail:{tech.id}:evidence", "kind": "detail"})

        if include_restricted:
            budget = budgets.get(tech.id) or {}
            nodes.append(
                _node(
                    f"detail:{tech.id}:budget",
                    "budget",
                    "Impacto presupuestal",
                    parent=tid,
                    subtitle="Años 1-3",
                    prompts=[
                        f"Comente el orden de magnitud presupuestal de {_tech_name(tech)} y sus supuestos.",
                    ],
                    meta={
                        "year1": budget.get("year1"),
                        "year2": budget.get("year2"),
                        "year3": budget.get("year3"),
                    },
                )
            )
            edges.append({"source": tid, "target": f"detail:{tech.id}:budget", "kind": "detail"})
            comp = comparators.get(tech.id) or {}
            nodes.append(
                _node(
                    f"detail:{tech.id}:comparators",
                    "comparators",
                    "Comparadores SGSSS",
                    parent=tid,
                    subtitle="Alternativas cubiertas",
                    prompts=[
                        f"Compare {_tech_name(tech)} con lo que ya se usa en el SGSSS.",
                    ],
                    meta={"comparators": (comp.get("comparators") or "")[:500]},
                )
            )
            edges.append({"source": tid, "target": f"detail:{tech.id}:comparators", "kind": "detail"})

    for node in nodes:
        if node["type"] == "cluster":
            kids = cluster_children.get(node["id"], [])
            node["children"] = kids
            node["subtitle"] = f"{len(kids)} tecnologías"

    roots = [cycle_id]
    return {
        "cycle_id": cycle.id,
        "cycle_code": cycle.code,
        "restricted": include_restricted,
        "default_expanded": [cycle_id, *funnel_ids],
        "roots": roots,
        "nodes": nodes,
        "edges": edges,
    }


def node_context(db: Session, cycle: Cycle, node_key: str, *, include_restricted: bool) -> str:
    graph = build_graph(db, cycle, include_restricted=include_restricted)
    node = next((n for n in graph["nodes"] if n["id"] == node_key), None)
    if node is None:
        return f"Nodo {node_key} no encontrado en el grafo del ciclo {cycle.code}."
    lines = [
        f"CICLO: {cycle.code} ({cycle.status})",
        f"NODO: {node['label']} [{node['type']}]",
        f"Detalle: {node.get('subtitle') or ''}",
    ]
    meta = node.get("meta") or {}
    for key, value in meta.items():
        if value in (None, "", [], {}):
            continue
        lines.append(f"- {key}: {value}")
    if node["type"] == "technology" and meta.get("technology_id"):
        tech = db.get(Technology, int(meta["technology_id"]))
        if tech:
            lines.append(f"Indicación: {(tech.indication or '')[:400]}")
            lines.append(f"Resumen: {(tech.summary or '')[:500]}")
            lines.append(f"Fase: {tech.development_phase or 's/d'}")
            lines.append(f"Regulatorio: {tech.regulatory_status or 's/d'}")
            calc = ttm.compute_for(db, tech)
            lines.append(f"TTM: {calc.get('band_label')} ({calc.get('months')} meses; base {calc.get('basis')})")
            doc = (
                db.query(EvaluationDoc)
                .filter(EvaluationDoc.cycle_id == cycle.id, EvaluationDoc.technology_id == tech.id)
                .first()
            )
            if doc:
                lines.append(f"Informe: {doc.product_level} · {doc.status}")
    if node["type"] == "cycle":
        funnel = next((n for n in graph["nodes"] if n["id"] == f"funnel:published"), None)
        lines.append(f"Tecnologías en el grafo: {sum(1 for n in graph['nodes'] if n['type'] == 'technology')}")
        if funnel:
            lines.append(f"Publicadas: {funnel.get('subtitle')}")
    children = [n for n in graph["nodes"] if n.get("parent") == node_key]
    if children:
        lines.append("Hijos visibles al ampliar:")
        for child in children[:12]:
            lines.append(f"  - {child['label']} ({child['type']})")
    return "\n".join(lines)


def list_graphs(db: Session, cycle_id: int, user_email: str) -> list[StrategyGraph]:
    return (
        db.query(StrategyGraph)
        .filter(StrategyGraph.cycle_id == cycle_id, StrategyGraph.user_email == user_email)
        .order_by(StrategyGraph.updated_at.desc())
        .all()
    )


def save_graph(
    db: Session,
    *,
    cycle: Cycle,
    user_email: str,
    title: str,
    payload: dict,
    graph_id: int | None = None,
) -> StrategyGraph:
    title = (title or "").strip()[:400] or f"Grafo {cycle.code}"
    row = db.get(StrategyGraph, graph_id) if graph_id else None
    if row is None or row.user_email != user_email or row.cycle_id != cycle.id:
        row = StrategyGraph(cycle_id=cycle.id, user_email=user_email)
        db.add(row)
    row.title = title
    row.payload = payload or {}
    return row
