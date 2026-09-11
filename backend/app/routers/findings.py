"""CRUD y consulta de hallazgos (tecnologias/senales detectadas en el escaneo)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import ai_service
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..models import CycleTechnology, Finding, Note, RawRecord, Recommendation, Source, Technology, User
from ..priority import SCREENING_QUEUE_THRESHOLD, compute_screening_score
from ..rbac import P_TECHNOLOGY_WRITE
from ..schemas import FindingCreate, FindingOut, FindingUpdate
from ..technology_service import sync_technology_from_finding

router = APIRouter(prefix="/api/findings", tags=["findings"])


def _apply_screening(finding: Finding) -> None:
    finding.screening_score = compute_screening_score(
        horizon=finding.horizon,
        technology_type=finding.technology_type,
        phase=finding.phase,
        therapeutic_area=finding.therapeutic_area,
        summary=finding.summary,
        technology=finding.technology,
        title=finding.title,
    )


FINDING_STATUSES = {"nuevo", "revisado", "priorizado", "descartado"}
FINDING_TYPES = {"medicamento", "dispositivo", "digital", "otro", ""}
FINDING_HORIZONS = {"emergente", "transicional", "inminente", ""}


def _check_choices(data: dict) -> None:
    """Rechaza valores fuera de los catalogos que la interfaz ofrece."""
    if data.get("status") is not None and data["status"] not in FINDING_STATUSES:
        raise HTTPException(status_code=422, detail="Estado de señal inválido.")
    if data.get("technology_type") is not None and data["technology_type"] not in FINDING_TYPES:
        raise HTTPException(status_code=422, detail="Tipo de tecnología inválido.")
    if data.get("horizon") is not None and data["horizon"] not in FINDING_HORIZONS:
        raise HTTPException(status_code=422, detail="Horizonte inválido.")


def _to_out(db: Session, finding: Finding) -> FindingOut:
    out = FindingOut.model_validate(finding)
    out.source_title = finding.source.title if finding.source else ""
    out.source_category = finding.source.category if finding.source else ""
    out.source_url = finding.source.url if finding.source else ""
    tech_id = (
        db.query(Technology.id).filter(Technology.finding_id == finding.id).scalar()
    )
    out.technology_id = tech_id
    out.recommendations_count = (
        db.query(func.count(Recommendation.id))
        .filter(Recommendation.finding_id == finding.id)
        .scalar()
        or 0
    )
    out.notes_count = (
        db.query(func.count(Note.id))
        .filter(Note.entity_type == "finding", Note.entity_id == finding.id)
        .scalar()
        or 0
    )
    return out


def _filtered(db: Session, *, source_id=None, horizon=None, technology_type=None, status_filter=None, q=None):
    query = db.query(Finding)
    if source_id:
        query = query.filter(Finding.source_id == source_id)
    if horizon:
        query = query.filter(Finding.horizon == horizon)
    if technology_type:
        query = query.filter(Finding.technology_type == technology_type)
    if status_filter:
        query = query.filter(Finding.status == status_filter)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(Finding.title).like(like)
            | func.lower(Finding.summary).like(like)
            | func.lower(Finding.technology).like(like)
        )
    return query


@router.get("/stats")
def findings_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    source_id: int | None = Query(None),
    horizon: str | None = Query(None),
    technology_type: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = Query(None),
):
    """Conteos sobre el total filtrado, no sobre la pagina que se ve en pantalla."""
    base = _filtered(
        db, source_id=source_id, horizon=horizon, technology_type=technology_type,
        status_filter=status_filter, q=q,
    )
    by_status = dict(
        base.with_entities(Finding.status, func.count(Finding.id)).group_by(Finding.status).all()
    )
    return {
        "total": sum(by_status.values()),
        "by_status": {k or "sin_estado": v for k, v in by_status.items()},
        "high_priority": base.filter(Finding.screening_score >= SCREENING_QUEUE_THRESHOLD)
        .with_entities(func.count(Finding.id))
        .scalar()
        or 0,
        "threshold": SCREENING_QUEUE_THRESHOLD,
    }


@router.get("", response_model=list[FindingOut])
def list_findings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    source_id: int | None = Query(None),
    horizon: str | None = Query(None),
    technology_type: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = Query(None),
    limit: int = Query(200, le=1000),
    offset: int = Query(0, ge=0),
):
    query = _filtered(
        db, source_id=source_id, horizon=horizon, technology_type=technology_type,
        status_filter=status_filter, q=q,
    )
    findings = query.order_by(Finding.created_at.desc()).offset(offset).limit(limit).all()
    return [_to_out(db, f) for f in findings]


@router.get("/{finding_id}", response_model=FindingOut)
def get_finding(finding_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    return _to_out(db, finding)


@router.post("", response_model=FindingOut, status_code=status.HTTP_201_CREATED)
def create_finding(
    payload: FindingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_TECHNOLOGY_WRITE)),
):
    source = db.get(Source, payload.source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    from ..scraper import _hash

    data = payload.model_dump()
    content_hash = _hash(data["title"], data.get("url", ""))
    finding = Finding(content_hash=content_hash, **data)
    _apply_screening(finding)
    db.add(finding)
    db.commit()
    db.refresh(finding)
    sync_technology_from_finding(db, finding, captured_by=user.email, commit=True)
    bump_state_version(db)
    return _to_out(db, finding)


@router.put("/{finding_id}", response_model=FindingOut)
def update_finding(
    finding_id: int,
    payload: FindingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_TECHNOLOGY_WRITE)),
):
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    data = payload.model_dump(exclude_unset=True)
    _check_choices(data)
    if "title" in data and not (data["title"] or "").strip():
        raise HTTPException(status_code=422, detail="El título de la señal no puede quedar vacío.")
    for key, value in data.items():
        setattr(finding, key, value)
    _apply_screening(finding)
    db.commit()
    db.refresh(finding)
    sync_technology_from_finding(db, finding, captured_by=user.email, commit=True)
    bump_state_version(db)
    return _to_out(db, finding)


@router.post("/{finding_id}/enhance-ai", response_model=FindingOut)
def enhance_finding_ai(
    finding_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_TECHNOLOGY_WRITE)),
):
    """Enriquece resumen y clasificacion de un hallazgo con MiniMax / Gemini."""
    if not ai_service.is_enabled():
        raise HTTPException(status_code=400, detail="IA no configurada. Configure MiniMax en Configuración.")
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    updates, _model = ai_service.enrich_finding(finding, finding.source)
    if not updates:
        raise HTTPException(status_code=502, detail="La IA no pudo enriquecer el hallazgo. Intente de nuevo.")
    for key in ("summary", "technology", "technology_type", "horizon", "therapeutic_area", "phase"):
        val = updates.get(key)
        if val is not None and str(val).strip():
            setattr(finding, key, str(val)[:1000] if key == "summary" else str(val)[:390])
    _apply_screening(finding)
    db.commit()
    db.refresh(finding)
    sync_technology_from_finding(db, finding, captured_by=user.email, commit=True)
    bump_state_version(db)
    return _to_out(db, finding)


@router.delete("/{finding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_finding(
    finding_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_TECHNOLOGY_WRITE)),
):
    """Elimina una senal capturada por error (ruido, pagina no pertinente).

    Solo mientras su tecnologia siga en la bandeja sin asignar: una vez que entro
    a un ciclo es parte del expediente metodologico y se descarta con el estado
    `descartado`, no se borra. La tecnologia huerfana se elimina con ella para que
    no quede en la bandeja de entrada una ficha sin captura de origen.
    """
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    tech = db.query(Technology).filter(Technology.finding_id == finding.id).first()
    if tech is not None:
        in_cycle = (
            db.query(func.count(CycleTechnology.id))
            .filter(CycleTechnology.technology_id == tech.id)
            .scalar()
            or 0
        )
        if in_cycle or tech.status != "capturada_no_asignada" or tech.merged_into_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "La señal ya originó una tecnología asignada a un ciclo: forma parte del "
                    "expediente y no se elimina. Márquela como descartada."
                ),
            )
        absorbed = db.query(func.count(Technology.id)).filter(Technology.merged_into_id == tech.id).scalar() or 0
        if absorbed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Otra tecnología se fusionó en esta; no se puede eliminar. Márquela como descartada.",
            )
    db.query(RawRecord).filter(RawRecord.finding_id == finding.id).update(
        {RawRecord.finding_id: None, RawRecord.technology_id: None}, synchronize_session=False
    )
    db.query(Note).filter(Note.entity_type == "finding", Note.entity_id == finding.id).delete(
        synchronize_session=False
    )
    if tech is not None:
        from ..models import MergeProposal

        db.query(MergeProposal).filter(
            (MergeProposal.technology_a_id == tech.id) | (MergeProposal.technology_b_id == tech.id)
        ).delete(synchronize_session=False)
        db.delete(tech)
    db.delete(finding)
    db.commit()
    bump_state_version(db)
    return None
