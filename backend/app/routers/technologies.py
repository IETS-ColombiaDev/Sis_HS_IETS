"""Tecnologias y staging: bandeja de entrada, clasificacion y asignacion al ciclo.

Cubre RF03 (staging con `raw_payload`), RF04 (buzon de entrada con filtros),
RF06 y RF07 (clasificacion obligatoria) y RF08 (asignacion al ciclo activo).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import audit, cycle_service, evaluation_service, screening_service
from ..classification import suggest_cluster, suggest_tech_type
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..methodology import CONDITIONS, EXCLUSION_REASONS, TECHNOLOGY_STATUS_LABELS
from ..models import (
    Cluster,
    Cycle,
    CycleTechnology,
    PriorityScore,
    Source,
    TechType,
    Technology,
    User,
)
from ..rbac import P_SCREENING_WRITE, P_STAGING_ASSIGN, P_TECHNOLOGY_WRITE
from ..schemas import (
    AssignToCycleIn,
    AssignToCycleOut,
    CountItem,
    ExclusionIn,
    StagingStats,
    TechnologyOut,
    TechnologyUpdate,
)

router = APIRouter(prefix="/api/technologies", tags=["technologies"])


def _to_out(db: Session, tech: Technology, entry: CycleTechnology | None = None) -> TechnologyOut:
    out = TechnologyOut.model_validate(tech)
    out.nct_ids = list(tech.nct_ids or [])
    out.icd10_codes = list(tech.icd10_codes or [])
    out.status_label = TECHNOLOGY_STATUS_LABELS.get(tech.status, tech.status)
    if tech.cluster:
        out.cluster_name = tech.cluster.name
    if tech.tech_type:
        out.tech_type_name = tech.tech_type.name
    if tech.suggested_cluster_id:
        suggested = db.get(Cluster, tech.suggested_cluster_id)
        out.suggested_cluster_name = suggested.name if suggested else ""
    if tech.source_id:
        source = db.get(Source, tech.source_id)
        out.source_title = source.title if source else ""
    payload = tech.raw_payload if isinstance(tech.raw_payload, dict) else {}
    out.has_raw = bool(payload)
    out.raw_origin = str(payload.get("origin") or "")

    if entry is not None:
        out.cycle_id = entry.cycle_id
        out.cycle_status = entry.status
        out.cycle_status_label = TECHNOLOGY_STATUS_LABELS.get(entry.status, entry.status)
        out.priority_pct = float(entry.priority_pct) if entry.priority_pct is not None else None
        out.priority_points = entry.priority_points
        out.frozen = entry.frozen
        out.previous_priority_pct = (
            float(entry.previous_priority_pct) if entry.previous_priority_pct is not None else None
        )
        out.carried_from_cycle_id = entry.carried_from_cycle_id
        out.criteria_rated = (
            db.query(func.count(PriorityScore.id))
            .filter(
                PriorityScore.cycle_id == entry.cycle_id,
                PriorityScore.technology_id == tech.id,
            )
            .scalar()
            or 0
        )
    return out


def _get(db: Session, technology_id: int) -> Technology:
    tech = db.get(Technology, technology_id)
    if not tech:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tecnologia no encontrada")
    return tech


def _entry_for(db: Session, cycle_id: int, technology_id: int) -> CycleTechnology | None:
    return (
        db.query(CycleTechnology)
        .filter(
            CycleTechnology.cycle_id == cycle_id,
            CycleTechnology.technology_id == technology_id,
        )
        .first()
    )


# --------------------------------------------------------------------------- #
#  Staging: bandeja de entrada (RF04)
# --------------------------------------------------------------------------- #
@router.get("/staging", response_model=list[TechnologyOut])
def list_staging(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    q: str | None = Query(None),
    source_id: int | None = Query(None),
    channel: str | None = Query(None),
    since: datetime | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    """Senales capturadas aun no asignadas a ningun ciclo."""
    query = db.query(Technology).filter(Technology.status == "capturada_no_asignada")
    if source_id:
        query = query.filter(Technology.source_id == source_id)
    if channel:
        query = query.filter(Technology.source_channel == channel)
    if since:
        query = query.filter(Technology.captured_at >= since)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(Technology.commercial_name).like(like),
                func.lower(Technology.inn_name).like(like),
                func.lower(Technology.summary).like(like),
            )
        )
    rows = (
        query.order_by(Technology.screening_score.desc(), Technology.captured_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_to_out(db, t) for t in rows]


@router.get("/staging/stats", response_model=StagingStats)
def staging_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    base = db.query(Technology).filter(Technology.status == "capturada_no_asignada")
    unassigned = base.with_entities(func.count(Technology.id)).scalar() or 0
    total = db.query(func.count(Technology.id)).scalar() or 0

    by_channel = [
        CountItem(label=row[0] or "sin canal", value=row[1])
        for row in base.with_entities(Technology.source_channel, func.count(Technology.id))
        .group_by(Technology.source_channel)
        .all()
    ]
    by_source = [
        CountItem(label=row[0] or "Sin fuente", value=row[1])
        for row in (
            base.join(Source, Source.id == Technology.source_id, isouter=True)
            .with_entities(Source.title, func.count(Technology.id))
            .group_by(Source.title)
            .order_by(func.count(Technology.id).desc())
            .limit(10)
            .all()
        )
    ]
    without_cluster = base.filter(Technology.cluster_id.is_(None)).with_entities(
        func.count(Technology.id)
    ).scalar() or 0
    without_type = base.filter(Technology.tech_type_id.is_(None)).with_entities(
        func.count(Technology.id)
    ).scalar() or 0

    return StagingStats(
        total=total,
        unassigned=unassigned,
        by_channel=by_channel,
        by_source=by_source,
        without_cluster=without_cluster,
        without_tech_type=without_type,
    )


@router.post("/assign-to-cycle", response_model=AssignToCycleOut)
def assign_to_cycle(
    payload: AssignToCycleIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_STAGING_ASSIGN)),
):
    """Arrastre por lotes del staging al ciclo (RF08).

    Regla de la fase 1: toda tecnologia asignada debe tener cluster y tipologia.
    """
    cycle = (
        db.get(Cycle, payload.cycle_id)
        if payload.cycle_id
        else cycle_service.get_active_cycle(db)
    )
    if cycle is None:
        raise HTTPException(
            status_code=409,
            detail="No hay un ciclo activo. Cree un ciclo antes de asignar senales.",
        )
    if cycle.status == "cerrado_consolidado":
        raise HTTPException(status_code=409, detail="El ciclo esta cerrado y no admite asignaciones.")
    if cycle.is_historic:
        raise HTTPException(status_code=409, detail="El ciclo historico no admite asignaciones.")

    assigned = 0
    skipped = 0
    rejected: list[str] = []

    for tech_id in payload.technology_ids:
        tech = db.get(Technology, tech_id)
        if tech is None:
            rejected.append(f"Tecnologia {tech_id}: no existe.")
            continue
        if _entry_for(db, cycle.id, tech_id) is not None:
            skipped += 1
            continue
        if tech.cluster_id is None or tech.tech_type_id is None:
            name = tech.commercial_name or tech.inn_name or f"ID {tech_id}"
            rejected.append(f"{name}: requiere cluster y tipologia antes de asignarse.")
            continue

        db.add(
            CycleTechnology(
                cycle_id=cycle.id,
                technology_id=tech.id,
                status="asignada_a_ciclo",
                assigned_by=user.email,
            )
        )
        tech.status = "asignada_a_ciclo"
        assigned += 1

    if assigned:
        audit.record_action(
            db,
            entity_type="cycles",
            entity_id=cycle.id,
            action="staging:assign_batch",
            new_value={"assigned": assigned, "actor": user.email},
        )
    db.commit()
    bump_state_version(db)
    return AssignToCycleOut(
        cycle_id=cycle.id,
        cycle_code=cycle.code,
        assigned=assigned,
        skipped=skipped,
        rejected=rejected,
    )


# --------------------------------------------------------------------------- #
#  Consulta de tecnologias
# --------------------------------------------------------------------------- #
@router.get("", response_model=list[TechnologyOut])
def list_technologies(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    cycle_id: int | None = Query(None),
    cycle_status: str | None = Query(None),
    cluster_id: int | None = Query(None),
    tech_type_id: int | None = Query(None),
    condition: str | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
):
    if cycle_id:
        query = (
            db.query(Technology, CycleTechnology)
            .join(CycleTechnology, CycleTechnology.technology_id == Technology.id)
            .filter(CycleTechnology.cycle_id == cycle_id)
        )
        if cycle_status:
            query = query.filter(CycleTechnology.status == cycle_status)
    else:
        query = db.query(Technology)

    if cluster_id:
        query = query.filter(Technology.cluster_id == cluster_id)
    if tech_type_id:
        query = query.filter(Technology.tech_type_id == tech_type_id)
    if condition:
        query = query.filter(Technology.condition == condition)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            or_(
                func.lower(Technology.commercial_name).like(like),
                func.lower(Technology.inn_name).like(like),
                func.lower(Technology.indication).like(like),
            )
        )

    rows = query.order_by(Technology.screening_score.desc(), Technology.captured_at.desc()).offset(offset).limit(limit).all()

    if cycle_id:
        return [_to_out(db, tech, entry) for tech, entry in rows]
    return [_to_out(db, tech) for tech in rows]


@router.get("/{technology_id}", response_model=TechnologyOut)
def get_technology(
    technology_id: int,
    cycle_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tech = _get(db, technology_id)
    entry = _entry_for(db, cycle_id, technology_id) if cycle_id else None
    return _to_out(db, tech, entry)


@router.put("/{technology_id}", response_model=TechnologyOut)
def update_technology(
    technology_id: int,
    payload: TechnologyUpdate,
    cycle_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_TECHNOLOGY_WRITE)),
):
    tech = _get(db, technology_id)
    data = payload.model_dump(exclude_unset=True)

    if "condition" in data and data["condition"] and data["condition"] not in CONDITIONS:
        raise HTTPException(status_code=422, detail="Condicion invalida: use 'emergente' o 'nueva'.")
    if data.get("cluster_id") and not db.get(Cluster, data["cluster_id"]):
        raise HTTPException(status_code=422, detail="Cluster inexistente.")
    if data.get("tech_type_id") and not db.get(TechType, data["tech_type_id"]):
        raise HTTPException(status_code=422, detail="Tipologia inexistente.")

    for key, value in data.items():
        setattr(tech, key, value)
    db.commit()
    db.refresh(tech)
    bump_state_version(db)
    entry = _entry_for(db, cycle_id, technology_id) if cycle_id else None
    return _to_out(db, tech, entry)


@router.post("/{technology_id}/suggest-classification")
def suggest_classification(
    technology_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_TECHNOLOGY_WRITE)),
):
    """Propuesta de cluster y tipologia. El evaluador siempre confirma."""
    tech = _get(db, technology_id)
    cluster_id, cluster_reason = suggest_cluster(
        db,
        indication=tech.indication,
        summary=tech.summary,
        title=tech.commercial_name,
        icd10_codes=tech.icd10_codes,
        mesh_terms=tech.mesh_terms,
    )
    type_id, type_reason = suggest_tech_type(
        db,
        title=tech.commercial_name,
        summary=tech.summary,
        technology=tech.inn_name,
    )
    cluster = db.get(Cluster, cluster_id) if cluster_id else None
    tech_type = db.get(TechType, type_id) if type_id else None
    return {
        "cluster_id": cluster_id,
        "cluster_name": cluster.name if cluster else "",
        "cluster_reason": cluster_reason,
        "tech_type_id": type_id,
        "tech_type_name": tech_type.name if tech_type else "",
        "tech_type_reason": type_reason,
    }


# --------------------------------------------------------------------------- #
#  Filtrado dentro del ciclo
# --------------------------------------------------------------------------- #
@router.post("/{technology_id}/cycles/{cycle_id}/qualify", response_model=TechnologyOut)
def qualify_for_prioritization(
    technology_id: int,
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCREENING_WRITE)),
):
    """Marca la tecnologia como apta para priorizacion tras el filtrado.

    Desde la fase 3 el paso esta condicionado al criterio de novedad: una
    tecnologia con registro sanitario vigente en Colombia no avanza sin
    justificacion explicita de nueva indicacion, nueva forma farmaceutica o
    combinacion (RF10 y RF11).
    """
    entry = _entry_for(db, cycle_id, technology_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="La tecnologia no esta asignada a este ciclo.")
    if entry.frozen:
        raise HTTPException(status_code=409, detail="El ciclo esta congelado.")

    allowed, reason = screening_service.novelty_gate(db, cycle_id, technology_id)
    if not allowed:
        raise HTTPException(status_code=409, detail=reason)

    entry.status = "filtrada_apta_priorizacion"
    tech = _get(db, technology_id)
    tech.status = "filtrada_apta_priorizacion"
    db.commit()
    bump_state_version(db)
    return _to_out(db, tech, entry)


@router.post("/{technology_id}/cycles/{cycle_id}/exclude", response_model=TechnologyOut)
def exclude_from_cycle(
    technology_id: int,
    cycle_id: int,
    payload: ExclusionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCREENING_WRITE)),
):
    """Excluye con causa tipificada obligatoria e inmutable (RF12)."""
    if payload.reason_code not in EXCLUSION_REASONS:
        raise HTTPException(
            status_code=422,
            detail=f"Motivo invalido. Opciones: {', '.join(EXCLUSION_REASONS)}",
        )
    entry = _entry_for(db, cycle_id, technology_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="La tecnologia no esta asignada a este ciclo.")
    if entry.frozen:
        raise HTTPException(status_code=409, detail="El ciclo esta congelado.")
    if entry.exclusion_reason_code:
        raise HTTPException(
            status_code=409,
            detail="La causa de exclusion ya fue registrada y no es editable.",
        )

    entry.status = "excluida"
    entry.exclusion_reason_code = payload.reason_code
    entry.exclusion_note = payload.note
    entry.excluded_at = datetime.now(timezone.utc)
    entry.excluded_by = user.email
    tech = _get(db, technology_id)
    tech.status = "excluida"
    db.commit()
    bump_state_version(db)
    return _to_out(db, tech, entry)


@router.post("/{technology_id}/cycles/{cycle_id}/to-evaluation", response_model=TechnologyOut)
def send_to_evaluation(
    technology_id: int,
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_TECHNOLOGY_WRITE)),
):
    """Pasa una tecnologia priorizada a evaluacion temprana (fase 5 del plan)."""
    entry = _entry_for(db, cycle_id, technology_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="La tecnologia no esta asignada a este ciclo.")
    if entry.status != "priorizada":
        raise HTTPException(
            status_code=409,
            detail="Solo las tecnologias priorizadas pasan a evaluacion temprana.",
        )
    entry.status = "en_evaluacion"
    tech = _get(db, technology_id)
    tech.status = "en_evaluacion"
    evaluation_service.ensure_document(
        db, cycle_id, technology_id, actor=user.email
    )
    db.commit()
    bump_state_version(db)
    return _to_out(db, tech, entry)
