"""Vista de conjunto de la priorizacion de un ciclo: indicadores, recorrido y exporte.

El motor (`priority_engine`) decide y escribe; este modulo solo lee. El recorrido
sale de la bitacora de auditoria, que ya registra cada alta y cambio de
`priority_scores` y de `cycle_technologies`: no hay tabla nueva que mantener.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import priority_engine, rbac
from .methodology import EXCLUSION_REASONS
from .models import AuditLog, CycleTechnology, PriorityScore, Technology
from .priority_engine import RATEABLE_STATUSES

STATUS_LABELS = {
    "asignada_a_ciclo": "Asignada al ciclo",
    "filtrada_apta_priorizacion": "Filtrada / apta para priorización",
    "excluida": "Excluida",
    "priorizada": "Priorizada",
    "bajo_vigilancia": "Bajo vigilancia",
    "no_priorizada": "No priorizada",
    "en_evaluacion": "En evaluación",
    "publicada": "Publicada",
}

QUEUE_ORDERS = ("cribado", "pct", "avance", "nombre", "recientes")
PROGRESS_FILTERS = ("completas", "incompletas")


def score_rows(db: Session, cycle_id: int) -> dict[int, dict[str, PriorityScore]]:
    """Calificaciones del ciclo agrupadas por tecnologia y criterio."""
    out: dict[int, dict[str, PriorityScore]] = {}
    for row in db.query(PriorityScore).filter(PriorityScore.cycle_id == cycle_id).all():
        out.setdefault(row.technology_id, {})[row.criterion] = row
    return out


def stats(db: Session, cycle_id: int, user) -> dict:
    """Avance de la matriz en el ciclo: por criterio, por franja y para el perfil."""
    criteria = priority_engine.active_criteria(db)
    codes = [c.code for c in criteria]
    mine = set(rbac.rateable_criteria(user))
    entries = (
        db.query(CycleTechnology)
        .filter(CycleTechnology.cycle_id == cycle_id, CycleTechnology.status.in_(RATEABLE_STATUSES))
        .all()
    )
    scores = score_rows(db, cycle_id)

    per = {code: {"rated": 0, "yes": 0} for code in codes}
    points_distribution = {str(n): 0 for n in range(len(codes) + 1)}
    pending_for_me = 0
    complete = 0
    pcts: list[float] = []
    for entry in entries:
        rated = scores.get(entry.technology_id, {})
        for code in codes:
            row = rated.get(code)
            if row is not None:
                per[code]["rated"] += 1
                per[code]["yes"] += int(row.value)
        if all(code in rated for code in codes) and codes:
            complete += 1
            points = sum(int(rated[code].value) for code in codes)
            points_distribution[str(points)] = points_distribution.get(str(points), 0) + 1
            pcts.append(priority_engine.compute_percentage(points, priority_engine.criteria_total(db)))
        if not entry.frozen and any(code in mine and code not in rated for code in codes):
            pending_for_me += 1

    total = len(entries)
    return {
        "progress_pct": round(complete * 100 / total) if total else 0,
        "pending_for_me": pending_for_me,
        "avg_pct": round(sum(pcts) / len(pcts), 1) if pcts else None,
        "points_distribution": points_distribution,
        "criteria": [
            {
                "code": c.code,
                "short_label": c.short_label or "",
                "role_scope": c.role_scope or "",
                "rated": per[c.code]["rated"],
                "yes": per[c.code]["yes"],
                "total": total,
                "mine": c.code in mine,
            }
            for c in criteria
        ],
    }


def _yes_no(value) -> str:
    return "Sí" if int(value) == 1 else "No"


def history(db: Session, entry: CycleTechnology) -> list[dict]:
    """Recorrido de una tecnologia en la matriz del ciclo, del mas antiguo al mas reciente."""
    score_ids = {
        str(row.id): row.criterion
        for row in db.query(PriorityScore).filter(
            PriorityScore.cycle_id == entry.cycle_id,
            PriorityScore.technology_id == entry.technology_id,
        )
    }
    events: list[dict] = []

    def add(ev: AuditLog, kind: str, label: str, detail: str = "") -> None:
        events.append(
            {
                "kind": kind,
                "label": label,
                "detail": (detail or "").strip()[:600],
                "at": ev.occurred_at.isoformat() if ev.occurred_at else "",
                "by": ev.user_email or "",
                "_order": (ev.occurred_at, ev.id),
            }
        )

    if score_ids:
        rows = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "priority_scores", AuditLog.entity_id.in_(list(score_ids)))
            .all()
        )
        for ev in rows:
            code = score_ids.get(ev.entity_id, "")
            new = ev.new_value if isinstance(ev.new_value, dict) else {}
            old = ev.old_value if isinstance(ev.old_value, dict) else {}
            if ev.action == "create" and new.get("value") is not None:
                add(ev, "rated", f"{code} calificado: {_yes_no(new['value'])}", new.get("justification") or "")
            elif ev.action == "update" and new.get("value") is not None and old.get("value") is not None:
                add(
                    ev,
                    "changed",
                    f"{code} cambió de {_yes_no(old['value'])} a {_yes_no(new['value'])}",
                    new.get("justification") or "",
                )

    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "cycle_technologies", AuditLog.entity_id == str(entry.id))
        .all()
    )
    for ev in rows:
        new = ev.new_value if isinstance(ev.new_value, dict) else {}
        if ev.action == "create":
            add(ev, "assigned", "Asignada al ciclo")
        elif ev.action == "priority:classify":
            label = STATUS_LABELS.get(new.get("status") or "", new.get("status") or "")
            add(ev, "classified", f"Matriz completa: {label}", f"{new.get('points')} puntos · %P {new.get('priority_pct')}")
        elif ev.action == "update" and new.get("status"):
            status = new["status"]
            if status == "filtrada_apta_priorizacion":
                add(ev, "apt", "Apta para priorización")
            elif status == "excluida":
                reason = EXCLUSION_REASONS.get(new.get("exclusion_reason_code") or entry.exclusion_reason_code, "")
                note = new.get("exclusion_note") or ""
                add(ev, "excluded", "Excluida del ciclo", " · ".join(p for p in (reason, note) if p))
            elif status == "en_evaluacion":
                add(ev, "evaluation", "Pasó a evaluación temprana")
            elif status == "publicada":
                add(ev, "published", "Publicada")
            # priorizada / bajo_vigilancia / no_priorizada ya quedan en "priority:classify".

    events.sort(key=lambda e: e["_order"])
    for e in events:
        e.pop("_order")
    return events


def export_rows(db: Session, cycle_id: int) -> tuple[list[str], list[list]]:
    """Matriz completa del ciclo para el exporte: una fila por tecnologia."""
    criteria = priority_engine.active_criteria(db)
    codes = [c.code for c in criteria]
    header = ["ID", "Tecnología", "DCI", "Clúster", "Tipología", "Condición", "Estado", "Puntaje de cribado"]
    header += codes + ["Calificados", "Puntos", "%P"]
    for code in codes:
        header += [f"{code} calificó", f"{code} fecha", f"{code} justificación"]

    scores = score_rows(db, cycle_id)
    rows = (
        db.query(Technology, CycleTechnology)
        .join(CycleTechnology, CycleTechnology.technology_id == Technology.id)
        .filter(CycleTechnology.cycle_id == cycle_id, CycleTechnology.status.in_(RATEABLE_STATUSES))
        .order_by(CycleTechnology.priority_pct.desc().nullslast(), Technology.screening_score.desc(), Technology.id)
        .all()
    )
    out: list[list] = []
    for tech, entry in rows:
        rated = scores.get(tech.id, {})
        line: list = [
            tech.id,
            tech.commercial_name or tech.inn_name or f"Tecnología {tech.id}",
            tech.inn_name or "",
            tech.cluster.name if tech.cluster else "",
            tech.tech_type.name if tech.tech_type else "",
            tech.condition or "",
            STATUS_LABELS.get(entry.status, entry.status),
            tech.screening_score or 0,
        ]
        line += [_yes_no(rated[code].value) if code in rated else "" for code in codes]
        line += [
            sum(1 for code in codes if code in rated),
            entry.priority_points if entry.priority_points is not None else "",
            float(entry.priority_pct) if entry.priority_pct is not None else "",
        ]
        for code in codes:
            row = rated.get(code)
            line += [
                row.rated_by_email if row else "",
                row.rated_at.isoformat() if row and row.rated_at else "",
                row.justification if row else "",
            ]
        out.append(line)
    return header, out
