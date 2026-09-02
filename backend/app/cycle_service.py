"""Ciclo operativo de escaneo: validaciones, maquina de estados y cierre.

Implementa las reglas de integridad de la seccion 7 del plan:

1. Un ciclo no cierra con tecnologias `en_evaluacion` sin informe final ni
   justificacion de cierre.
2. Al cerrar, los puntajes quedan congelados y las tecnologias `bajo_vigilancia`
   se proponen automaticamente para el ciclo siguiente.
3. Ninguna transicion ocurre sin registro en la bitacora.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import audit
from .methodology import CYCLE_TRANSITIONS, get_param
from .models import Cycle, CycleTechnology, EvaluationDoc, Recommendation, Technology


class CycleRuleError(ValueError):
    """Violacion de una regla metodologica del ciclo."""


def _weeks_between(start: date, end: date) -> float:
    return (end - start).days / 7.0


def validate_window(db: Session, opened_on: date, closing_on: date) -> None:
    if closing_on <= opened_on:
        raise CycleRuleError("La fecha de cierre debe ser posterior a la de apertura.")
    weeks = _weeks_between(opened_on, closing_on)
    wmin = get_param(db, "cycle.window_weeks_min", 10)
    wmax = get_param(db, "cycle.window_weeks_max", 16)
    if weeks < wmin or weeks > wmax:
        raise CycleRuleError(
            f"La ventana del ciclo es de {weeks:.1f} semanas y debe estar entre "
            f"{wmin} y {wmax} semanas (parametro metodologico)."
        )


def validate_year_quota(db: Session, year: int, *, exclude_id: int | None = None) -> None:
    query = db.query(func.count(Cycle.id)).filter(
        Cycle.year == year, Cycle.is_historic == False  # noqa: E712
    )
    if exclude_id:
        query = query.filter(Cycle.id != exclude_id)
    existing = query.scalar() or 0
    limit = get_param(db, "cycle.max_per_year", 3)
    if existing >= limit:
        raise CycleRuleError(
            f"El ano {year} ya tiene {existing} ciclos formales y el maximo metodologico "
            f"es {limit}. Cierre o reprograme un ciclo antes de crear otro."
        )


def can_transition(current: str, target: str) -> bool:
    return target in CYCLE_TRANSITIONS.get(current, ())


def transition(db: Session, cycle: Cycle, target: str, *, actor: str = "") -> Cycle:
    if cycle.status == target:
        return cycle
    if not can_transition(cycle.status, target):
        allowed = ", ".join(CYCLE_TRANSITIONS.get(cycle.status, ())) or "ninguna"
        raise CycleRuleError(
            f"Transicion no permitida de '{cycle.status}' a '{target}'. "
            f"Transiciones validas: {allowed}."
        )
    if target == "cerrado_consolidado":
        return close_cycle(db, cycle, actor=actor)

    previous = cycle.status
    cycle.status = target
    audit.record_action(
        db,
        entity_type="cycles",
        entity_id=cycle.id,
        action="cycle:transition",
        old_value={"status": previous},
        new_value={"status": target},
    )
    db.commit()
    db.refresh(cycle)
    return cycle


def blocking_entries(db: Session, cycle: Cycle) -> list[CycleTechnology]:
    """Tecnologias en evaluacion sin informe final ni justificacion de cierre."""
    entries = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle.id,
            CycleTechnology.status == "en_evaluacion",
        )
        .all()
    )
    blocking: list[CycleTechnology] = []
    for entry in entries:
        tech = db.get(Technology, entry.technology_id)
        has_report = (
            db.query(func.count(EvaluationDoc.id))
            .filter(
                EvaluationDoc.cycle_id == cycle.id,
                EvaluationDoc.technology_id == entry.technology_id,
                EvaluationDoc.status == "publicado",
            )
            .scalar()
            or 0
        ) > 0
        if not has_report and tech and tech.finding_id:
            has_report = (
                db.query(func.count(Recommendation.id))
                .filter(Recommendation.finding_id == tech.finding_id)
                .scalar()
                or 0
            ) > 0
        if not has_report and not (entry.exclusion_note or "").strip():
            blocking.append(entry)
    return blocking


def close_cycle(db: Session, cycle: Cycle, *, actor: str = "", force_note: str = "") -> Cycle:
    """Cierra el ciclo: valida, congela puntajes y arrastra el monitoreo activo."""
    if cycle.status == "cerrado_consolidado":
        raise CycleRuleError("El ciclo ya esta cerrado.")

    blocking = blocking_entries(db, cycle)
    if blocking and not force_note.strip():
        raise CycleRuleError(
            f"No se puede cerrar: {len(blocking)} tecnologia(s) siguen en evaluacion sin "
            "informe final. Publique el informe o registre una justificacion de cierre."
        )
    if blocking and force_note.strip():
        for entry in blocking:
            entry.exclusion_note = force_note.strip()

    frozen = 0
    for entry in db.query(CycleTechnology).filter(CycleTechnology.cycle_id == cycle.id):
        if not entry.frozen:
            entry.frozen = True
            frozen += 1

    now = datetime.now(timezone.utc)
    previous_status = cycle.status
    cycle.status = "cerrado_consolidado"
    cycle.closed_at = now

    from . import strategy_service

    strategy_service.on_cycle_closed(db, cycle, actor=actor)

    audit.record_action(
        db,
        entity_type="cycles",
        entity_id=cycle.id,
        action="cycle:close",
        old_value={"status": previous_status},
        new_value={
            "status": "cerrado_consolidado",
            "frozen_entries": frozen,
            "forced": bool(blocking and force_note.strip()),
            "justification": force_note.strip(),
            "closed_by": actor,
        },
    )
    db.commit()
    db.refresh(cycle)
    return cycle


def carry_over_watchlist(db: Session, source_cycle: Cycle, target_cycle: Cycle, *, actor: str = "") -> int:
    """Propone en el ciclo destino las tecnologias que quedaron bajo vigilancia.

    La calificacion previa viaja como referencia visible, sin sobrescribir nada:
    una reevaluacion crea registros nuevos, nunca modifica los congelados.
    """
    if target_cycle.status == "cerrado_consolidado":
        raise CycleRuleError("El ciclo destino esta cerrado.")

    watch = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == source_cycle.id,
            CycleTechnology.status == "bajo_vigilancia",
        )
        .all()
    )
    existing = {
        row[0]
        for row in db.query(CycleTechnology.technology_id)
        .filter(CycleTechnology.cycle_id == target_cycle.id)
        .all()
    }

    carried = 0
    for entry in watch:
        if entry.technology_id in existing:
            continue
        db.add(
            CycleTechnology(
                cycle_id=target_cycle.id,
                technology_id=entry.technology_id,
                status="filtrada_apta_priorizacion",
                carried_from_cycle_id=source_cycle.id,
                previous_priority_pct=entry.priority_pct,
                assigned_by=actor or "sistema",
            )
        )
        carried += 1

    if carried:
        audit.record_action(
            db,
            entity_type="cycles",
            entity_id=target_cycle.id,
            action="cycle:carry_over",
            new_value={
                "from_cycle_id": source_cycle.id,
                "carried": carried,
            },
        )
        db.commit()
    return carried


def get_active_cycle(db: Session) -> Cycle | None:
    """Ciclo formal abierto mas reciente. El historico nunca es activo."""
    return (
        db.query(Cycle)
        .filter(
            Cycle.is_historic == False,  # noqa: E712
            Cycle.status != "cerrado_consolidado",
        )
        .order_by(Cycle.opened_on.desc())
        .first()
    )


def cycle_summary(db: Session, cycle: Cycle) -> dict:
    """Embudo de conversion del ciclo: capturadas, filtradas, priorizadas, evaluadas."""
    rows = (
        db.query(CycleTechnology.status, func.count(CycleTechnology.id))
        .filter(CycleTechnology.cycle_id == cycle.id)
        .group_by(CycleTechnology.status)
        .all()
    )
    by_status = {status: count for status, count in rows}
    total = sum(by_status.values())
    return {
        "total": total,
        "by_status": by_status,
        "assigned": by_status.get("asignada_a_ciclo", 0),
        "filtered": by_status.get("filtrada_apta_priorizacion", 0),
        "excluded": by_status.get("excluida", 0),
        "prioritized": by_status.get("priorizada", 0),
        "watchlist": by_status.get("bajo_vigilancia", 0),
        "not_prioritized": by_status.get("no_priorizada", 0),
        "in_evaluation": by_status.get("en_evaluacion", 0),
        "published": by_status.get("publicada", 0),
    }
