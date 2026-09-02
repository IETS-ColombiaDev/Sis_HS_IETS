"""CRUD y consulta de hallazgos (tecnologias/senales detectadas en el escaneo)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import gemini_service
from ..database import get_db
from ..deps import get_current_user, require_role
from ..events import bump_state_version
from ..models import Finding, Note, Recommendation, Source, Technology, User
from ..priority import compute_screening_score
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
            func.lower(Finding.title).like(like) | func.lower(Finding.summary).like(like)
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
    user: User = Depends(require_role("editor")),
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
    user: User = Depends(require_role("editor")),
):
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
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
    user: User = Depends(require_role("editor")),
):
    """Enriquece resumen y clasificacion de un hallazgo con Gemini."""
    if not gemini_service.is_enabled():
        raise HTTPException(status_code=400, detail="IA no configurada. Configure el token de Gemini en Configuracion.")
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    updates, _model = gemini_service.enrich_finding(finding, finding.source)
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
    user: User = Depends(require_role("editor")),
):
    finding = db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hallazgo no encontrado")
    db.delete(finding)
    db.commit()
    bump_state_version(db)
    return None
