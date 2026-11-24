"""Fuentes de consulta manual (nivel de acceso E) por validar (Modulo 0).

Las fuentes E (bases con licencia, portales con usuario o captcha) no entran a
la vigilancia automatica: una persona del equipo tecnico las consulta en su
navegador. El pendiente era que esa tarea se perdia de vista. Aqui:

- `overview` lista las fuentes E activas y dice cuales estan por validar: las
  que nunca se han validado o cuya fecha de proxima revision (`next_review_due`)
  ya llego. La frecuencia sale de la fuente (`sync_frequency`, semanal por
  defecto en la matriz).
- `record` registra que una persona la consulto: resultado, nota y cuantas
  senales registro. Fija la proxima revision y deja la constancia en la
  bitacora (accion `manual_review`), que es el historial de validaciones.

No se crea ninguna tabla: la fecha vive en `sources.next_review_due` y el
historial en la bitacora, que es de solo anexar.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from .audit import record_action
from .catalog import FREQ_HOURS
from .events import bump_state_version
from .models import AuditLog, Source

ACTION = "manual_review"
DEFAULT_HOURS = FREQ_HOURS["semanal"]
OUTCOMES = ("con_senales", "sin_novedades", "no_accesible")
OUTCOME_LABELS = {
    "con_senales": "Consultada, con señales registradas",
    "sin_novedades": "Consultada, sin novedades",
    "no_accesible": "No se pudo consultar",
}
# Una fuente que no se pudo consultar vuelve a quedar pendiente en un dia, no en una semana.
RETRY_HOURS = 24


class ManualReviewError(ValueError):
    """Dato invalido al registrar la validacion."""


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def is_manual(source: Source) -> bool:
    return (source.access_level or "").upper() == "E" or (source.connector or "") == "manual"


def manual_sources(db: Session) -> list[Source]:
    return (
        db.query(Source)
        .filter(
            Source.retired.is_(False),
            Source.catalog_active.isnot(False),
            or_(Source.access_level == "E", Source.connector == "manual"),
        )
        .order_by(Source.title)
        .all()
    )


def interval_hours(source: Source) -> int:
    freq = (source.sync_frequency or "").strip().lower()
    if freq in FREQ_HOURS:
        return FREQ_HOURS[freq]
    return int(source.scan_interval_hours or DEFAULT_HOURS) or DEFAULT_HOURS


def _last_reviews(db: Session, ids: list[int]) -> dict[int, dict]:
    if not ids:
        return {}
    rows = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "sources",
            AuditLog.action == ACTION,
            AuditLog.entity_id.in_([str(i) for i in ids]),
        )
        .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
        .all()
    )
    out: dict[int, dict] = {}
    for row in rows:
        sid = int(row.entity_id)
        if sid in out:
            continue
        value = row.new_value if isinstance(row.new_value, dict) else {}
        out[sid] = {
            "at": _utc(row.occurred_at),
            "by": row.user_email or value.get("by") or "",
            "outcome": value.get("outcome") or "",
            "outcome_label": OUTCOME_LABELS.get(value.get("outcome") or "", ""),
            "note": value.get("note") or "",
            "signals": int(value.get("signals") or 0),
        }
    return out


def overview(db: Session, *, now: datetime | None = None) -> dict:
    """Fuentes E activas con su estado; las por validar primero (las mas vencidas arriba)."""
    now = now or datetime.now(timezone.utc)
    sources = manual_sources(db)
    last = _last_reviews(db, [s.id for s in sources])
    items = []
    for s in sources:
        due_at = _utc(s.next_review_due)
        due = due_at is None or due_at <= now
        overdue_days = 0
        if due_at is not None and due_at < now:
            overdue_days = (now - due_at).days
        items.append(
            {
                "id": s.id,
                "title": s.title or "",
                "url": s.url or "",
                "catalog_code": s.catalog_code or "",
                "matrix_ref": s.matrix_ref or "",
                "access_path": s.access_path or "",
                "consult_info": s.consult_info or "",
                "usage_restrictions": s.usage_restrictions or "",
                "catalog_note": s.catalog_note or "",
                "frequency": s.sync_frequency or "",
                "interval_hours": interval_hours(s),
                "next_review_due": due_at,
                "due": due,
                "never_reviewed": s.id not in last,
                "overdue_days": overdue_days,
                "last_review": last.get(s.id),
            }
        )
    items.sort(key=lambda i: (not i["due"], not i["never_reviewed"], -i["overdue_days"], i["title"].lower()))
    due_count = sum(1 for i in items if i["due"])
    return {
        "total": len(items),
        "due": due_count,
        "up_to_date": len(items) - due_count,
        "items": items,
        "outcomes": OUTCOME_LABELS,
    }


def record(
    db: Session,
    source: Source,
    *,
    outcome: str,
    note: str = "",
    signals: int = 0,
    actor: str = "",
    now: datetime | None = None,
) -> dict:
    """Registra la validacion manual de una fuente E y fija su proxima revision."""
    if not is_manual(source):
        raise ManualReviewError("Solo las fuentes de consulta manual (nivel E) se validan aquí.")
    if outcome not in OUTCOMES:
        raise ManualReviewError("Indique el resultado de la consulta.")
    note = (note or "").strip()
    if outcome == "no_accesible" and len(note) < 5:
        raise ManualReviewError("Si no se pudo consultar, escriba el motivo en la nota.")
    signals = max(0, int(signals or 0))
    if outcome == "con_senales" and signals < 1:
        raise ManualReviewError("Indique cuántas señales registró, o elija «Consultada, sin novedades».")
    now = now or datetime.now(timezone.utc)
    hours = RETRY_HOURS if outcome == "no_accesible" else interval_hours(source)
    previous = _utc(source.next_review_due)
    source.next_review_due = now + timedelta(hours=hours)
    record_action(
        db,
        entity_type="sources",
        entity_id=str(source.id),
        action=ACTION,
        old_value={"next_review_due": previous.isoformat() if previous else None},
        new_value={
            "outcome": outcome,
            "note": note[:1000],
            "signals": signals,
            "by": actor,
            "next_review_due": source.next_review_due.isoformat(),
            "title": source.title,
        },
    )
    db.commit()
    db.refresh(source)
    bump_state_version(db)
    return {
        "id": source.id,
        "outcome": outcome,
        "outcome_label": OUTCOME_LABELS[outcome],
        "next_review_due": _utc(source.next_review_due),
    }


def history(db: Session, source_id: int, limit: int = 20) -> list[dict]:
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "sources", AuditLog.action == ACTION, AuditLog.entity_id == str(source_id))
        .order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .all()
    )
    out = []
    for row in rows:
        value = row.new_value if isinstance(row.new_value, dict) else {}
        out.append(
            {
                "at": _utc(row.occurred_at),
                "by": row.user_email or value.get("by") or "",
                "outcome": value.get("outcome") or "",
                "outcome_label": OUTCOME_LABELS.get(value.get("outcome") or "", ""),
                "note": value.get("note") or "",
                "signals": int(value.get("signals") or 0),
            }
        )
    return out
