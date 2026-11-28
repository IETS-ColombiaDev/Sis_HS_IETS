"""Consulta de la bitacora inmutable (fase 0). Solo lectura, por definicion."""
from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from .. import audit_view
from ..audit import record_action
from ..database import get_db
from ..deps import require_permission
from ..models import AuditLog, User
from ..rbac import P_AUDIT_READ
from ..schemas import AuditLogOut, AuditPage

router = APIRouter(prefix="/api/audit", tags=["audit"])


def _out(row: AuditLog) -> AuditLogOut:
    item = AuditLogOut.model_validate(row)
    item.action_label = audit_view.action_label(row.action)
    item.entity_label = audit_view.entity_label(row.entity_type)
    return item


def _filters(
    entity_type: str | None = Query(None),
    entity_id: str | None = Query(None),
    action: str | None = Query(None),
    user_email: str | None = Query(None),
    since: datetime | None = Query(None),
    until: datetime | None = Query(None),
    request_id: str | None = Query(None),
    ip: str | None = Query(None),
    q: str | None = Query(None),
) -> dict:
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "user_email": user_email,
        "since": since,
        "until": until,
        "request_id": request_id,
        "ip": ip,
        "q": q,
    }


@router.get("", response_model=AuditPage)
def list_audit(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
    filters: dict = Depends(_filters),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    query = audit_view.filtered(db, **filters)
    total = query.count()
    rows = query.order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit).all()
    return AuditPage(items=[_out(r) for r in rows], total=total, limit=limit, offset=offset)


@router.get("/summary")
def audit_summary(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
    filters: dict = Depends(_filters),
):
    """Totales del filtro: por acción, persona, entidad y día."""
    return audit_view.summary(audit_view.filtered(db, **filters))


@router.get("/catalog")
def audit_catalog(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
):
    """Acciones y entidades con registros, con su nombre en español."""
    return audit_view.catalog(db)


@router.get("/integrity")
def audit_integrity(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
):
    """Si el motor impide modificar o borrar la bitácora, verificado en la base en uso."""
    return audit_view.integrity(db)


@router.get("/export")
def export_audit(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
    filters: dict = Depends(_filters),
):
    """Los registros del filtro en CSV (hasta 10.000). La descarga queda en la propia bitácora."""
    query = audit_view.filtered(db, **filters)
    total = query.count()
    rows = (
        query.order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc()).limit(audit_view.EXPORT_MAX).all()
    )

    def safe(value):
        if not isinstance(value, str):
            return value
        # Una celda que empieza por =, +, - o @ se ejecutaria como formula al abrir el archivo.
        return "'" + value if value[:1] in ("=", "+", "-", "@") else value

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";", lineterminator="\n")
    writer.writerow(audit_view.EXPORT_HEADER)
    for row in audit_view.export_rows(rows):
        writer.writerow([safe(v) for v in row])
    record_action(
        db,
        entity_type="audit_log",
        entity_id="listado",
        action="audit:export",
        new_value={
            "rows": len(rows),
            "total": total,
            "truncated": total > len(rows),
            "filters": {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in filters.items() if v},
        },
    )
    db.commit()
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="bitacora_auditoria.csv"',
            "X-Total-Count": str(total),
            "Access-Control-Expose-Headers": "X-Total-Count",
        },
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
    return [_out(r) for r in rows]


@router.get("/actions", response_model=list[str])
def distinct_actions(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
):
    rows = db.query(AuditLog.action).distinct().order_by(AuditLog.action).all()
    return [r[0] for r in rows if r[0]]


@router.get("/entities", response_model=list[str])
def distinct_entities(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_AUDIT_READ)),
):
    """Tipos de entidad con al menos un registro, para el filtro de la pantalla."""
    rows = db.query(AuditLog.entity_type).distinct().order_by(AuditLog.entity_type).all()
    return [r[0] for r in rows if r[0]]
