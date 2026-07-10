"""CRUD de fuentes de informacion (inventario de escaneo de horizonte)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_role
from ..events import bump_state_version
from ..models import Finding, Source, User
from ..schemas import SourceCreate, SourceOut, SourceUpdate

router = APIRouter(prefix="/api/sources", tags=["sources"])


def _to_out(db: Session, source: Source) -> SourceOut:
    count = db.query(func.count(Finding.id)).filter(Finding.source_id == source.id).scalar() or 0
    out = SourceOut.model_validate(source)
    out.findings_count = int(count)
    return out


@router.get("", response_model=list[SourceOut])
def list_sources(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    category: str | None = Query(None),
    q: str | None = Query(None),
):
    query = db.query(Source)
    if category:
        query = query.filter(Source.category == category)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(Source.title).like(like) | func.lower(Source.description).like(like)
        )
    sources = query.order_by(Source.category, Source.title).all()
    return [_to_out(db, s) for s in sources]


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.query(Source.category).distinct().all()
    return sorted({r[0] for r in rows if r[0]})


@router.get("/{source_id}", response_model=SourceOut)
def get_source(source_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    return _to_out(db, source)


@router.post("", response_model=SourceOut, status_code=status.HTTP_201_CREATED)
def create_source(
    payload: SourceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    source = Source(**payload.model_dump())
    db.add(source)
    db.commit()
    db.refresh(source)
    bump_state_version(db)
    return _to_out(db, source)


@router.put("/{source_id}", response_model=SourceOut)
def update_source(
    source_id: int,
    payload: SourceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(source, key, value)
    db.commit()
    db.refresh(source)
    bump_state_version(db)
    return _to_out(db, source)


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    db.delete(source)
    db.commit()
    bump_state_version(db)
    return None
