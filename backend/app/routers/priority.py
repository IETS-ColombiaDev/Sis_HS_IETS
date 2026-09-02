"""Motor oficial de priorizacion %P (fase 2). Bandejas por rol y calificacion
con permisos a nivel de campo."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import priority_engine, rbac
from ..database import get_db
from ..deps import get_current_user
from ..events import bump_state_version
from ..methodology import get_param
from ..models import Cycle, CycleTechnology, PriorityScore, Technology, User
from ..priority_engine import PriorityRuleError
from ..schemas import (
    PriorityCriterionOut,
    PriorityQueueItem,
    PriorityScoreOut,
    PriorityStateOut,
    RateCriterionIn,
)

router = APIRouter(prefix="/api/priority", tags=["priority"])

# Estados en los que una tecnologia esta sujeta a calificacion.
RATEABLE_STATUSES = ("filtrada_apta_priorizacion", "priorizada", "bajo_vigilancia", "no_priorizada")


@router.get("/criteria", response_model=list[PriorityCriterionOut])
def list_criteria(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Enunciados oficiales P1 a P6, versionados como dato."""
    return [PriorityCriterionOut.model_validate(c) for c in priority_engine.active_criteria(db)]


def _build_state(db: Session, cycle_id: int, technology_id: int, user: User) -> PriorityStateOut:
    tech = db.get(Technology, technology_id)
    if tech is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tecnologia no encontrada")
    entry = (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.technology_id == technology_id,
        )
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="La tecnologia no esta asignada a este ciclo.")

    state = priority_engine.evaluation_state(db, cycle_id, technology_id)
    criteria = priority_engine.active_criteria(db)
    stored = priority_engine.get_scores(db, cycle_id, technology_id)
    suggestions = priority_engine.suggest_values(db, tech)

    scores: list[PriorityScoreOut] = []
    for crit in criteria:
        row = stored.get(crit.code)
        suggestion = suggestions.get(crit.code) if crit.auto_prefill else None
        scores.append(
            PriorityScoreOut(
                criterion=crit.code,
                value=int(row.value) if row else None,
                justification=row.justification if row else "",
                rated_by_email=row.rated_by_email if row else "",
                rated_at=row.rated_at if row else None,
                auto_suggested=suggestion["value"] if suggestion else None,
                auto_reason=suggestion["reason"] if suggestion else "",
                can_rate=(not entry.frozen) and rbac.can_rate(user, crit.code),
            )
        )

    return PriorityStateOut(
        cycle_id=cycle_id,
        technology_id=technology_id,
        technology_name=tech.commercial_name or tech.inn_name or f"Tecnologia {tech.id}",
        frozen=entry.frozen,
        threshold_points=int(get_param(db, "priority.points_prioritized", 4) or 4),
        watch_points=int(get_param(db, "priority.points_watch", 3) or 3),
        threshold_pct_label=int(get_param(db, "priority.threshold_pct_label", 70) or 70),
        criteria=[PriorityCriterionOut.model_validate(c) for c in criteria],
        scores=scores,
        **state,
    )


# Las rutas con segmento literal se declaran antes que `/{cycle_id}/{technology_id}`
# para que "queue" y "stats" no se interpreten como identificadores.
@router.get("/{cycle_id}/queue", response_model=list[PriorityQueueItem])
def priority_queue(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    only_pending: bool = Query(False, description="Solo lo que este usuario puede calificar"),
    limit: int = Query(200, le=500),
):
    """Bandeja de calificacion del ciclo, filtrable por lo pendiente para el perfil."""
    cycle = db.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ciclo no encontrado")

    total = priority_engine.criteria_total(db)
    my_criteria = set(rbac.rateable_criteria(user))
    all_codes = [c.code for c in priority_engine.active_criteria(db)]

    rows = (
        db.query(Technology, CycleTechnology)
        .join(CycleTechnology, CycleTechnology.technology_id == Technology.id)
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.status.in_(RATEABLE_STATUSES),
        )
        .order_by(Technology.screening_score.desc())
        .limit(limit)
        .all()
    )

    rated_map: dict[int, set[str]] = {}
    for tech_id, criterion in (
        db.query(PriorityScore.technology_id, PriorityScore.criterion)
        .filter(PriorityScore.cycle_id == cycle_id)
        .all()
    ):
        rated_map.setdefault(tech_id, set()).add(criterion)

    items: list[PriorityQueueItem] = []
    for tech, entry in rows:
        rated = rated_map.get(tech.id, set())
        pending_for_me = bool(my_criteria - rated) and not entry.frozen
        if only_pending and not pending_for_me:
            continue
        items.append(
            PriorityQueueItem(
                technology_id=tech.id,
                cycle_id=cycle_id,
                name=tech.commercial_name or tech.inn_name or f"Tecnologia {tech.id}",
                cluster_name=tech.cluster.name if tech.cluster else "",
                tech_type_name=tech.tech_type.name if tech.tech_type else "",
                condition=tech.condition or "",
                status=entry.status,
                priority_pct=float(entry.priority_pct) if entry.priority_pct is not None else None,
                points=entry.priority_points,
                rated=len(rated & set(all_codes)),
                total_criteria=total,
                frozen=entry.frozen,
                pending_for_me=pending_for_me,
                screening_score=tech.screening_score or 0,
            )
        )
    return items


@router.get("/{cycle_id}/stats")
def priority_stats(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Contadores de la fase de priorizacion del ciclo."""
    rows = (
        db.query(CycleTechnology.status, func.count(CycleTechnology.id))
        .filter(CycleTechnology.cycle_id == cycle_id)
        .group_by(CycleTechnology.status)
        .all()
    )
    by_status = {s: c for s, c in rows}
    total_rateable = sum(by_status.get(s, 0) for s in RATEABLE_STATUSES)
    complete = (
        db.query(func.count(CycleTechnology.id))
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.priority_pct.isnot(None),
        )
        .scalar()
        or 0
    )
    return {
        "cycle_id": cycle_id,
        "by_status": by_status,
        "rateable": total_rateable,
        "complete": complete,
        "pending": max(0, total_rateable - complete),
        "prioritized": by_status.get("priorizada", 0),
        "watchlist": by_status.get("bajo_vigilancia", 0),
        "not_prioritized": by_status.get("no_priorizada", 0),
        "my_criteria": rbac.rateable_criteria(user),
    }


@router.get("/{cycle_id}/{technology_id}", response_model=PriorityStateOut)
def get_state(
    cycle_id: int,
    technology_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _build_state(db, cycle_id, technology_id, user)


@router.post("/{cycle_id}/{technology_id}/rate", response_model=PriorityStateOut)
def rate(
    cycle_id: int,
    technology_id: int,
    payload: RateCriterionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Califica un criterio. El %P solo se calcula con los seis criterios listos."""
    try:
        priority_engine.rate_criterion(
            db,
            cycle_id=cycle_id,
            technology_id=technology_id,
            criterion=payload.criterion,
            value=payload.value,
            user=user,
            justification=payload.justification,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except PriorityRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    bump_state_version(db)
    return _build_state(db, cycle_id, technology_id, user)
