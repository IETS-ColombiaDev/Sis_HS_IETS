"""Prioridad SUGERIDA de cada fuente segun la relevancia de sus senales (OBS-001).

La prioridad oficial (`Source.priority_level`) viene de la matriz EH
("Observaciones": aplicabilidad declarada). Esta sugerencia la contrasta con lo
que la fuente efectivamente produjo en la ventana de evaluacion (por defecto,
los ultimos 365 dias). Nunca sobrescribe la oficial: el equipo la aplica a mano.

Regla (transparente y en este orden):

- **Sin datos**: la fuente no produjo senales en la ventana. No se sugiere nada.
- **Alta**: al menos `ALTA_MIN_PRIORITIZED` tecnologia(s) de la fuente quedaron
  priorizadas (estado de ciclo priorizada / en evaluacion / publicada, o senal
  marcada "priorizado"), o al menos `ALTA_MIN_IN_CYCLE` tecnologias entraron a
  un ciclo, o al menos `ALTA_MIN_HIGH_SCORE` senales con puntaje de cribado
  >= `SCREENING_QUEUE_THRESHOLD` (70).
- **Media**: al menos una tecnologia en un ciclo, o al menos una senal con
  puntaje >= 70, o puntaje promedio >= `MEDIA_MIN_AVG_SCORE`.
- **Baja**: produjo senales, pero ninguna de las anteriores.

"En un ciclo" cuenta las entradas de ciclo no excluidas. La tecnologia se
atribuye a la fuente por `Technology.source_id` o, si falta, por la fuente de
su senal de origen (`Technology.finding_id`). Todo se calcula con consultas
agregadas (una por indicador), no una por fuente.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from .models import CycleTechnology, Finding, Source, Technology
from .priority import SCREENING_QUEUE_THRESHOLD

DEFAULT_WINDOW_DAYS = 365
ALTA_MIN_PRIORITIZED = 1
ALTA_MIN_IN_CYCLE = 2
ALTA_MIN_HIGH_SCORE = 5
MEDIA_MIN_AVG_SCORE = 40
PRIORITIZED_CYCLE_STATUSES = ("priorizada", "en_evaluacion", "publicada")
EXCLUDED_CYCLE_STATUSES = ("excluida",)
LABELS = {"alta": "Alta", "media": "Media", "baja": "Baja", "": "Sin datos"}

RULE_TEXT = (
    f"Sugerida según las señales de los últimos N días. Alta: ≥{ALTA_MIN_PRIORITIZED} tecnología priorizada, "
    f"≥{ALTA_MIN_IN_CYCLE} tecnologías en un ciclo o ≥{ALTA_MIN_HIGH_SCORE} señales con cribado "
    f"≥{SCREENING_QUEUE_THRESHOLD}. Media: alguna tecnología en un ciclo, alguna señal con cribado "
    f"≥{SCREENING_QUEUE_THRESHOLD} o cribado promedio ≥{MEDIA_MIN_AVG_SCORE}. Baja: produjo señales sin "
    "ninguna de las anteriores. Sin datos: no produjo señales. No reemplaza la prioridad oficial."
)


def classify(stats: dict) -> tuple[str, str]:
    """(nivel sugerido, motivo) a partir de los indicadores de una fuente."""
    signals = int(stats.get("signals") or 0)
    prioritized = int(stats.get("prioritized") or 0)
    in_cycle = int(stats.get("in_cycle") or 0)
    high = int(stats.get("high_score") or 0)
    avg = float(stats.get("avg_score") or 0)
    if signals <= 0 and in_cycle <= 0 and prioritized <= 0:
        return "", "Sin señales en la ventana de evaluación"
    if prioritized >= ALTA_MIN_PRIORITIZED:
        return "alta", f"{prioritized} tecnología(s) priorizada(s)"
    if in_cycle >= ALTA_MIN_IN_CYCLE:
        return "alta", f"{in_cycle} tecnologías llegaron a un ciclo"
    if high >= ALTA_MIN_HIGH_SCORE:
        return "alta", f"{high} señales con cribado ≥{SCREENING_QUEUE_THRESHOLD}"
    if in_cycle >= 1:
        return "media", "1 tecnología llegó a un ciclo"
    if high >= 1:
        return "media", f"{high} señal(es) con cribado ≥{SCREENING_QUEUE_THRESHOLD}"
    if avg >= MEDIA_MIN_AVG_SCORE:
        return "media", f"cribado promedio {avg:.0f}"
    return "baja", f"{signals} señal(es) sin relevancia destacada (cribado promedio {avg:.0f})"


def compute(db: Session, *, days: int = DEFAULT_WINDOW_DAYS, source_ids: list[int] | None = None) -> dict[int, dict]:
    """Indicadores y sugerencia por fuente: {source_id: {...}}."""
    since = datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))
    high_expr = case((Finding.screening_score >= SCREENING_QUEUE_THRESHOLD, 1), else_=0)
    prio_finding = case((Finding.status == "priorizado", 1), else_=0)
    fq = db.query(
        Finding.source_id,
        func.count(Finding.id),
        func.sum(high_expr),
        func.avg(Finding.screening_score),
        func.sum(prio_finding),
    ).filter(Finding.created_at >= since)
    if source_ids is not None:
        fq = fq.filter(Finding.source_id.in_(source_ids))
    stats: dict[int, dict] = {}
    for sid, n, high, avg, prio in fq.group_by(Finding.source_id).all():
        stats[sid] = {
            "signals": int(n or 0),
            "high_score": int(high or 0),
            "avg_score": round(float(avg or 0), 1),
            "prioritized_signals": int(prio or 0),
            "in_cycle": 0,
            "prioritized_techs": 0,
        }

    # Tecnologias en ciclo, atribuidas por source_id o por la senal de origen.
    owner = func.coalesce(Technology.source_id, Finding.source_id)
    in_cycle = func.count(func.distinct(case((~CycleTechnology.status.in_(EXCLUDED_CYCLE_STATUSES), Technology.id))))
    prioritized = func.count(
        func.distinct(case((CycleTechnology.status.in_(PRIORITIZED_CYCLE_STATUSES), Technology.id)))
    )
    tq = (
        db.query(owner, in_cycle, prioritized)
        .select_from(CycleTechnology)
        .join(Technology, Technology.id == CycleTechnology.technology_id)
        .outerjoin(Finding, Finding.id == Technology.finding_id)
        .filter(CycleTechnology.assigned_at >= since)
        .filter(owner.isnot(None))
    )
    if source_ids is not None:
        tq = tq.filter(owner.in_(source_ids))
    for sid, n_cycle, n_prio in tq.group_by(owner).all():
        row = stats.setdefault(
            sid,
            {"signals": 0, "high_score": 0, "avg_score": 0.0, "prioritized_signals": 0, "in_cycle": 0, "prioritized_techs": 0},
        )
        row["in_cycle"] = int(n_cycle or 0)
        row["prioritized_techs"] = int(n_prio or 0)

    q = db.query(Source.id, Source.priority_level)
    if source_ids is not None:
        q = q.filter(Source.id.in_(source_ids))
    out: dict[int, dict] = {}
    for sid, official in q.all():
        row = stats.get(sid) or {
            "signals": 0, "high_score": 0, "avg_score": 0.0, "prioritized_signals": 0, "in_cycle": 0, "prioritized_techs": 0,
        }
        row = dict(row)
        row["prioritized"] = max(row["prioritized_techs"], row["prioritized_signals"])
        level, reason = classify(row)
        out[sid] = {
            "source_id": sid,
            "official": official or "",
            "suggested": level,
            "label": LABELS[level],
            "reason": reason,
            "differs": bool(level) and level != (official or ""),
            "stats": row,
            "window_days": int(days),
        }
    return out
