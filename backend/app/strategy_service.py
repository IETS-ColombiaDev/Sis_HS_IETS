"""Datamart estrategico, ficha publica, boletines y alertas (fase 6)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from html import escape

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import audit, ttm
from .methodology import get_param
from .models import (
    AlertEvent,
    AlertSubscription,
    Bulletin,
    Cluster,
    Cycle,
    CycleDatamart,
    CycleTechnology,
    EvaluationDoc,
    TechType,
    Technology,
    TimeToMarketSnapshot,
    User,
)

PUBLIC_HIDDEN_FIELDS = {
    "budget_year_1",
    "budget_year_2",
    "budget_year_3",
    "comparators_sgsss",
    "early_dialogue_notes",
    "confidential_note",
}

BULLETIN_STATUSES = ("borrador", "pendiente_aprobacion", "publicado")


class StrategyRuleError(ValueError):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _tech_name(tech: Technology | None) -> str:
    if tech is None:
        return "Tecnologia"
    return (tech.commercial_name or tech.inn_name or f"Tecnologia {tech.id}").strip()


def _parse_money(value) -> float:
    text = str(value or "").strip().replace(",", ".")
    digits = "".join(ch for ch in text if ch.isdigit() or ch == ".")
    if not digits:
        return 0.0
    try:
        return float(digits)
    except ValueError:
        return 0.0


def _looks_phase3(text: str) -> bool:
    low = (text or "").lower()
    return "iii" in low or "phase 3" in low or "fase 3" in low or "phase3" in low


def _mentions_colombia(db: Session, tech: Technology) -> bool:
    raw = get_param(db, "alerts.phase3_country_tokens", "colombia,colombiano,colombiana")
    tokens = [t.strip().lower() for t in str(raw or "").split(",") if t.strip()]
    haystack = " ".join(
        [
            tech.indication or "",
            tech.summary or "",
            tech.regulatory_status or "",
            tech.development_phase or "",
        ]
    ).lower()
    return any(tok in haystack for tok in tokens)


def compute_ttm_row(db: Session, tech: Technology) -> dict:
    result = ttm.compute_for(db, tech)
    result["technology_id"] = tech.id
    result["name"] = _tech_name(tech)
    return result


def snapshot_ttm(db: Session, cycle: Cycle) -> int:
    entries = db.query(CycleTechnology).filter(CycleTechnology.cycle_id == cycle.id).all()
    written = 0
    for entry in entries:
        tech = db.get(Technology, entry.technology_id)
        if tech is None:
            continue
        calc = ttm.compute_for(db, tech)
        row = (
            db.query(TimeToMarketSnapshot)
            .filter(
                TimeToMarketSnapshot.cycle_id == cycle.id,
                TimeToMarketSnapshot.technology_id == tech.id,
            )
            .first()
        )
        if row is None:
            row = TimeToMarketSnapshot(cycle_id=cycle.id, technology_id=tech.id)
            db.add(row)
        row.months = calc["months"]
        row.band = calc["band"]
        row.basis = calc["basis"]
        row.computed_at = _utcnow()
        written += 1
    return written


def build_payload(db: Session, cycle: Cycle) -> dict:
    entries = db.query(CycleTechnology).filter(CycleTechnology.cycle_id == cycle.id).all()
    tech_ids = [e.technology_id for e in entries]
    techs = (
        {t.id: t for t in db.query(Technology).filter(Technology.id.in_(tech_ids)).all()}
        if tech_ids
        else {}
    )
    docs = {
        d.technology_id: d
        for d in db.query(EvaluationDoc).filter(EvaluationDoc.cycle_id == cycle.id).all()
    }
    clusters = {c.id: c.name for c in db.query(Cluster).all()}
    types = {t.id: t.name for t in db.query(TechType).all()}

    funnel = {
        "captured": 0,
        "filtered": 0,
        "prioritized": 0,
        "evaluated": 0,
        "published": 0,
    }
    by_cluster: dict[str, int] = {}
    by_type: dict[str, int] = {}
    by_band: dict[str, int] = {}
    scatter: list[dict] = []
    heatmap: list[dict] = []

    for entry in entries:
        tech = techs.get(entry.technology_id) or db.get(Technology, entry.technology_id)
        if tech is None:
            continue
        funnel["captured"] += 1
        if entry.status in {
            "filtrada_apta_priorizacion",
            "priorizada",
            "bajo_vigilancia",
            "no_priorizada",
            "en_evaluacion",
            "publicada",
        }:
            funnel["filtered"] += 1
        if entry.status in {"priorizada", "en_evaluacion", "publicada"}:
            funnel["prioritized"] += 1
        if entry.status in {"en_evaluacion", "publicada"} or tech.status in {
            "en_evaluacion",
            "publicada",
        }:
            funnel["evaluated"] += 1
        if entry.status == "publicada" or tech.status == "publicada":
            funnel["published"] += 1

        cluster_name = clusters.get(tech.cluster_id, "Sin cluster")
        type_name = types.get(tech.tech_type_id, "Sin tipologia")
        by_cluster[cluster_name] = by_cluster.get(cluster_name, 0) + 1
        by_type[type_name] = by_type.get(type_name, 0) + 1

        calc = ttm.compute_for(db, tech)
        by_band[calc["band"]] = by_band.get(calc["band"], 0) + 1
        scatter.append(
            {
                "technology_id": tech.id,
                "name": _tech_name(tech),
                "months": calc["months"],
                "band": calc["band"],
                "points": int(entry.priority_points or 0),
                "cluster": cluster_name,
            }
        )

        doc = docs.get(tech.id)
        body = (doc.body or {}) if doc else {}
        heatmap.append(
            {
                "cluster": cluster_name,
                "year1": _parse_money(body.get("budget_year_1")),
                "year2": _parse_money(body.get("budget_year_2")),
                "year3": _parse_money(body.get("budget_year_3")),
                "points": int(entry.priority_points or 0),
                "technology_id": tech.id,
                "name": _tech_name(tech),
            }
        )

    heat_by_cluster: dict[str, dict] = {}
    for row in heatmap:
        bucket = heat_by_cluster.setdefault(
            row["cluster"], {"cluster": row["cluster"], "year1": 0.0, "year2": 0.0, "year3": 0.0, "n": 0}
        )
        bucket["year1"] += row["year1"]
        bucket["year2"] += row["year2"]
        bucket["year3"] += row["year3"]
        bucket["n"] += 1

    return {
        "cycle_id": cycle.id,
        "cycle_code": cycle.code,
        "funnel": funnel,
        "by_cluster": [{"label": k, "value": v} for k, v in sorted(by_cluster.items())],
        "by_type": [{"label": k, "value": v} for k, v in sorted(by_type.items())],
        "by_band": [{"label": ttm.TTM_BAND_LABELS.get(k, k), "code": k, "value": v} for k, v in by_band.items()],
        "ttm_scatter": scatter,
        "budget_heatmap": list(heat_by_cluster.values()),
        "budget_items": heatmap,
    }


def refresh_datamart(db: Session, cycle: Cycle) -> CycleDatamart:
    payload = build_payload(db, cycle)
    row = db.query(CycleDatamart).filter(CycleDatamart.cycle_id == cycle.id).first()
    if row is None:
        row = CycleDatamart(cycle_id=cycle.id, payload=payload)
        db.add(row)
    else:
        row.payload = payload
    row.refreshed_at = _utcnow()
    return row


def dashboard_for(
    db: Session,
    cycle: Cycle,
    *,
    include_restricted: bool,
    cluster_id: int | None = None,
    tech_type_id: int | None = None,
    band: str = "",
    status: str = "",
) -> dict:
    cached = db.query(CycleDatamart).filter(CycleDatamart.cycle_id == cycle.id).first()
    payload = dict(cached.payload or {}) if cached and not any([cluster_id, tech_type_id, band, status]) else build_payload(db, cycle)
    if cluster_id or tech_type_id or band or status:
        payload = _filter_live(db, cycle, cluster_id, tech_type_id, band, status)

    public = {
        "cycle_id": payload.get("cycle_id", cycle.id),
        "cycle_code": payload.get("cycle_code", cycle.code),
        "funnel": payload.get("funnel", {}),
        "by_cluster": payload.get("by_cluster", []),
        "by_type": payload.get("by_type", []),
        "by_band": payload.get("by_band", []),
        "ttm_scatter": payload.get("ttm_scatter", []),
        "restricted": include_restricted,
        "from_cache": bool(cached and not any([cluster_id, tech_type_id, band, status])),
    }
    if include_restricted:
        public["budget_heatmap"] = payload.get("budget_heatmap", [])
        public["budget_items"] = payload.get("budget_items", [])
        public["comparators"] = _comparators(db, cycle)
    return public


def _filter_live(
    db: Session,
    cycle: Cycle,
    cluster_id: int | None,
    tech_type_id: int | None,
    band: str,
    status: str,
) -> dict:
    payload = build_payload(db, cycle)
    if not any([cluster_id, tech_type_id, band, status]):
        return payload
    allowed = set()
    q = db.query(CycleTechnology, Technology).join(
        Technology, Technology.id == CycleTechnology.technology_id
    ).filter(CycleTechnology.cycle_id == cycle.id)
    if cluster_id:
        q = q.filter(Technology.cluster_id == cluster_id)
    if tech_type_id:
        q = q.filter(Technology.tech_type_id == tech_type_id)
    if status:
        q = q.filter(CycleTechnology.status == status)
    rows = q.all()
    allowed = {tech.id for _, tech in rows}
    if band:
        allowed = {
            tid
            for tid in allowed
            if (db.get(Technology, tid) and ttm.compute_for(db, db.get(Technology, tid))["band"] == band)
        }
    payload["ttm_scatter"] = [r for r in payload["ttm_scatter"] if r["technology_id"] in allowed]
    payload["budget_items"] = [r for r in payload["budget_items"] if r["technology_id"] in allowed]
    return payload


def _comparators(db: Session, cycle: Cycle) -> list[dict]:
    docs = db.query(EvaluationDoc).filter(EvaluationDoc.cycle_id == cycle.id).all()
    items = []
    for doc in docs:
        text = str((doc.body or {}).get("comparators_sgsss") or "").strip()
        if not text:
            continue
        tech = db.get(Technology, doc.technology_id)
        items.append({"technology_id": doc.technology_id, "name": _tech_name(tech), "comparators": text})
    return items


def public_stats(db: Session) -> dict:
    published = db.query(func.count(Technology.id)).filter(Technology.status == "publicada").scalar() or 0
    cycles = db.query(func.count(Cycle.id)).filter(Cycle.is_historic == False).scalar() or 0  # noqa: E712
    by_cluster = (
        db.query(Cluster.name, func.count(Technology.id))
        .join(Technology, Technology.cluster_id == Cluster.id)
        .filter(Technology.status == "publicada")
        .group_by(Cluster.name)
        .all()
    )
    return {
        "published": published,
        "cycles": cycles,
        "by_cluster": [{"label": name or "Sin cluster", "value": int(n)} for name, n in by_cluster],
    }


def sanitize_public_body(doc: EvaluationDoc) -> dict:
    hidden = set(PUBLIC_HIDDEN_FIELDS) | set(doc.confidential_fields or [])
    return {k: v for k, v in (doc.body or {}).items() if k not in hidden and str(v or "").strip()}


def list_public_fiches(
    db: Session, *, q: str = "", cluster_id: int | None = None, limit: int = 50
) -> list[dict]:
    query = (
        db.query(EvaluationDoc, Technology)
        .join(Technology, Technology.id == EvaluationDoc.technology_id)
        .filter(EvaluationDoc.status == "publicado", EvaluationDoc.confidential == False)  # noqa: E712
    )
    if cluster_id:
        query = query.filter(Technology.cluster_id == cluster_id)
    q = (q or "").strip()[:80]
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                Technology.commercial_name.ilike(like),
                Technology.inn_name.ilike(like),
                EvaluationDoc.title.ilike(like),
            )
        )
    items = []
    cap = max(1, min(int(limit or 50), 50))
    for doc, tech in query.order_by(EvaluationDoc.published_at.desc()).limit(cap).all():
        items.append(
            {
                "id": tech.id,
                "doc_id": doc.id,
                "title": doc.title or _tech_name(tech),
                "commercial_name": tech.commercial_name,
                "inn_name": tech.inn_name,
                "nct_ids": list(tech.nct_ids or []),
                "product_level": doc.product_level,
                "published_at": doc.published_at,
            }
        )
    return items


def render_public_fiche_html(data: dict) -> str:
    blocks = []
    from .evaluation import FIELD_LABELS

    for key, value in (data.get("body") or {}).items():
        label = FIELD_LABELS.get(key, key)
        blocks.append(
            f"<section class='block'><h2>{escape(label)}</h2><p>{escape(str(value)).replace(chr(10), '<br>')}</p></section>"
        )
    ncts = "".join(
        f"<li><a href='https://clinicaltrials.gov/study/{escape(n)}'>{escape(n)}</a></li>"
        for n in data.get("nct_ids") or []
    )
    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>{escape(data.get('title') or '')}</title>
<style>
@page {{ margin: 18mm; }}
body {{ font-family: "Segoe UI", Calibri, Arial, sans-serif; color: #0F172A; background: #fff; }}
header {{ border-bottom: 4px solid #6366F1; padding-bottom: 12px; }}
.kicker {{ letter-spacing: .12em; text-transform: uppercase; color: #6366F1; font-size: 11px; font-weight: 700; }}
.block {{ margin: 16px 0; }}
h2 {{ font-size: 14px; color: #312E81; }}
</style></head><body>
<header>
  <div class="kicker">Ficha publica — Escaneo de Horizonte IETS</div>
  <h1>{escape(data.get('title') or '')}</h1>
  <p>{escape(data.get('ttm_band_label') or '')} · {escape(data.get('cluster') or '')}</p>
</header>
{''.join(blocks)}
<h2>Ensayos clinicos asociados</h2>
<ul>{ncts or '<li>Sin identificadores NCT</li>'}</ul>
</body></html>"""


def public_fiche(db: Session, technology_id: int) -> dict:
    doc = (
        db.query(EvaluationDoc)
        .filter(
            EvaluationDoc.technology_id == technology_id,
            EvaluationDoc.status == "publicado",
            EvaluationDoc.confidential == False,  # noqa: E712
        )
        .order_by(EvaluationDoc.published_at.desc())
        .first()
    )
    tech = db.get(Technology, technology_id)
    if doc is None or tech is None:
        raise StrategyRuleError("Ficha publica no disponible.")
    calc = ttm.compute_for(db, tech)
    cluster = db.get(Cluster, tech.cluster_id) if tech.cluster_id else None
    from .evaluation import FIELD_LABELS

    body = sanitize_public_body(doc)
    return {
        "id": tech.id,
        "doc_id": doc.id,
        "title": doc.title or _tech_name(tech),
        "commercial_name": tech.commercial_name,
        "inn_name": tech.inn_name,
        "manufacturer": tech.manufacturer,
        "nct_ids": list(tech.nct_ids or []),
        "cluster": cluster.name if cluster else "",
        "product_level": doc.product_level,
        "published_at": doc.published_at,
        "ttm_band": calc["band"],
        "ttm_band_label": calc["band_label"],
        "body": body,
        "field_labels": {k: FIELD_LABELS.get(k, k) for k in body},
    }


def compile_bulletin(db: Session, cycle: Cycle, *, actor: str = "") -> Bulletin:
    payload = build_payload(db, cycle)
    row = (
        db.query(Bulletin)
        .filter(Bulletin.cycle_id == cycle.id, Bulletin.status != "publicado")
        .order_by(Bulletin.id.desc())
        .first()
    )
    if row is None:
        row = Bulletin(cycle_id=cycle.id)
        db.add(row)
    row.title = f"Boletin epidemiologico y financiero — {cycle.code}"
    row.status = "pendiente_aprobacion"
    row.body = {
        "cycle_code": cycle.code,
        "funnel": payload["funnel"],
        "by_cluster": payload["by_cluster"],
        "by_band": payload["by_band"],
        "prioritized": payload["funnel"].get("prioritized", 0),
        "published": payload["funnel"].get("published", 0),
        "compiled_on": date.today().isoformat(),
    }
    row.compiled_by = actor
    db.flush()
    audit.record_action(
        db,
        entity_type="bulletins",
        entity_id=row.id,
        action="bulletin:compile",
        new_value={"cycle_id": cycle.id, "status": row.status},
    )
    return row


def approve_bulletin(db: Session, bulletin: Bulletin, *, actor: str, publish: bool = False) -> Bulletin:
    if bulletin.status == "publicado":
        raise StrategyRuleError("El boletin ya esta publicado.")
    bulletin.approved_by = actor
    if publish:
        bulletin.status = "publicado"
        bulletin.published_at = _utcnow()
    else:
        bulletin.status = "pendiente_aprobacion"
    audit.record_action(
        db,
        entity_type="bulletins",
        entity_id=bulletin.id,
        action="bulletin:approve" if not publish else "bulletin:publish",
        new_value={"status": bulletin.status, "approved_by": actor},
    )
    if publish and not bulletin.approved_by:
        raise StrategyRuleError("El boletin requiere aprobacion del lider antes de publicarse.")
    return bulletin


def publish_bulletin(db: Session, bulletin: Bulletin, *, actor: str) -> Bulletin:
    if not (bulletin.approved_by or "").strip():
        raise StrategyRuleError("El boletin requiere aprobacion del lider antes de publicarse.")
    bulletin.status = "publicado"
    bulletin.published_at = _utcnow()
    audit.record_action(
        db,
        entity_type="bulletins",
        entity_id=bulletin.id,
        action="bulletin:publish",
        new_value={"approved_by": bulletin.approved_by},
    )
    return bulletin


def render_bulletin_html(bulletin: Bulletin) -> str:
    body = bulletin.body or {}
    funnel = body.get("funnel") or {}
    clusters = "".join(
        f"<li>{escape(str(i.get('label')))}: {int(i.get('value') or 0)}</li>"
        for i in body.get("by_cluster") or []
    )
    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>{escape(bulletin.title)}</title>
<style>
@page {{ margin: 18mm; }}
body {{ font-family: "Segoe UI", Calibri, Arial, sans-serif; color: #0F172A; }}
header {{ border-bottom: 4px solid #6366F1; padding-bottom: 12px; }}
.kicker {{ letter-spacing: .12em; text-transform: uppercase; color: #6366F1; font-size: 11px; font-weight: 700; }}
.kpi {{ display: inline-block; margin: 12px 16px 12px 0; }}
.kpi b {{ font-size: 22px; }}
</style></head><body>
<header>
  <div class="kicker">Instituto de Evaluacion Tecnologica en Salud</div>
  <h1>{escape(bulletin.title)}</h1>
  <p>Estado: {escape(bulletin.status)} · Compilado: {escape(str(body.get('compiled_on') or ''))}</p>
</header>
<section>
  <div class="kpi"><b>{funnel.get('captured', 0)}</b><br/>Capturadas</div>
  <div class="kpi"><b>{funnel.get('filtered', 0)}</b><br/>Filtradas</div>
  <div class="kpi"><b>{funnel.get('prioritized', 0)}</b><br/>Priorizadas</div>
  <div class="kpi"><b>{funnel.get('evaluated', 0)}</b><br/>Evaluadas</div>
</section>
<h2>Distribucion por cluster</h2>
<ul>{clusters or '<li>Sin datos</li>'}</ul>
<footer>Boletin generado por la plataforma de escaneo de horizonte. Requiere aprobacion del lider para su difusion formal.</footer>
</body></html>"""


def on_cycle_closed(db: Session, cycle: Cycle, *, actor: str = "") -> None:
    snapshot_ttm(db, cycle)
    refresh_datamart(db, cycle)
    compile_bulletin(db, cycle, actor=actor)


def _subscribers(db: Session, cluster_id: int | None) -> list[AlertSubscription]:
    rows = db.query(AlertSubscription).filter(AlertSubscription.enabled == True).all()  # noqa: E712
    return [s for s in rows if s.cluster_id is None or s.cluster_id == cluster_id]


def _notify(db: Session, *, kind: str, title: str, body: str, tech: Technology) -> int:
    sent = 0
    for sub in _subscribers(db, tech.cluster_id):
        exists = (
            db.query(AlertEvent)
            .filter(
                AlertEvent.user_id == sub.user_id,
                AlertEvent.kind == kind,
                AlertEvent.technology_id == tech.id,
                AlertEvent.read_at.is_(None),
            )
            .first()
        )
        if exists:
            continue
        db.add(
            AlertEvent(
                user_id=sub.user_id,
                kind=kind,
                title=title,
                body=body,
                technology_id=tech.id,
                cluster_id=tech.cluster_id,
            )
        )
        sent += 1
    return sent


def watch_technology(db: Session, tech: Technology, *, previous_phase: str = "", previous_status: str = "") -> None:
    """Dispara alertas de fase III en pais y de cambio en alto riesgo presupuestal."""
    threshold = int(get_param(db, "alerts.high_budget_points", 5) or 5)
    points = 0
    latest = (
        db.query(CycleTechnology)
        .filter(CycleTechnology.technology_id == tech.id)
        .order_by(CycleTechnology.id.desc())
        .first()
    )
    if latest and latest.priority_points is not None:
        points = int(latest.priority_points)

    now_phase = tech.development_phase or ""
    if _looks_phase3(now_phase) and not _looks_phase3(previous_phase) and _mentions_colombia(db, tech):
        _notify(
            db,
            kind="new_phase3_colombia",
            title=f"Nuevo ensayo fase III en el pais: {_tech_name(tech)}",
            body="Se detecto una senal de ensayo fase III asociada a Colombia.",
            tech=tech,
        )

    if points >= threshold and previous_status and previous_status != tech.status:
        _notify(
            db,
            kind="phase_change_high_budget",
            title=f"Cambio de fase en tecnologia de alto riesgo: {_tech_name(tech)}",
            body=f"Paso de {previous_status} a {tech.status} con {points} puntos de priorizacion.",
            tech=tech,
        )


def subscribe(db: Session, user: User, cluster_id: int | None) -> AlertSubscription:
    row = (
        db.query(AlertSubscription)
        .filter(
            AlertSubscription.user_id == user.id,
            AlertSubscription.cluster_id == cluster_id
            if cluster_id is not None
            else AlertSubscription.cluster_id.is_(None),
        )
        .first()
    )
    if row:
        row.enabled = True
        return row
    row = AlertSubscription(user_id=user.id, cluster_id=cluster_id, enabled=True)
    db.add(row)
    db.flush()
    return row
