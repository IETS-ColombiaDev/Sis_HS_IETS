"""Consulta de la bitacora inmutable (fase 0). Solo lectura, por definicion."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_permission
from ..models import AuditLog, User
from ..rbac import P_AUDIT_READ
from ..schemas import AuditLogOut, AuditPage

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=AuditPage)
def list_audit(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
    entity_type: str | None = Query(None),
    entity_id: str | None = Query(None),
    action: str | None = Query(None),
    user_email: str | None = Query(None),
    since: datetime | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
):
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == str(entity_id))
    if action:
        query = query.filter(AuditLog.action == action)
    if user_email:
        query = query.filter(func.lower(AuditLog.user_email).like(f"%{user_email.lower()}%"))
    if since:
        query = query.filter(AuditLog.occurred_at >= since)

    total = query.with_entities(func.count(AuditLog.id)).scalar() or 0
    rows = query.order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit).all()
    return AuditPage(
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/entity/{entity_type}/{entity_id}", response_model=list[AuditLogOut])
def entity_trail(
    entity_type: str,
    entity_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
):
    """Vida completa de una entidad, de su creacion a su ultimo cambio."""
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == entity_type, AuditLog.entity_id == str(entity_id))
        .order_by(AuditLog.occurred_at.asc(), AuditLog.id.asc())
        .all()
    )
    return [AuditLogOut.model_validate(r) for r in rows]


@router.get("/actions", response_model=list[str])
def distinct_actions(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
):
    rows = db.query(AuditLog.action).distinct().order_by(AuditLog.action).all()
    return [r[0] for r in rows if r[0]]
