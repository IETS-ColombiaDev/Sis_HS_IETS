"""Indice local de registros sanitarios del INVIMA (RF11).

Prefijo `/api/invima`, previsto en la seccion 8 del plan de fases. Expone el
estado del indice, sus dos rutas de sincronizacion y la consulta directa.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from .. import invima as invima_module
from ..database import get_db
from ..deps import require_permission
from ..models import InvimaSync, User
from ..rbac import P_INVIMA_SYNC, P_READ
from ..schemas import InvimaIndexOut, InvimaMatchOut, InvimaSyncOut

router = APIRouter(prefix="/api/invima", tags=["invima"])

MAX_UPLOAD_BYTES = 40 * 1024 * 1024


@router.get("/status", response_model=InvimaIndexOut)
def index_status(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_READ)),
):
    return InvimaIndexOut(**invima_module.index_status(db))


@router.get("/syncs", response_model=list[InvimaSyncOut])
def list_syncs(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_READ)),
):
    return (
        db.query(InvimaSync).order_by(InvimaSync.started_at.desc()).limit(limit).all()
    )


@router.get("/search", response_model=list[InvimaMatchOut])
def search(
    q: str = Query(..., min_length=3),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_READ)),
):
    return [
        InvimaMatchOut(
            registro=hit["record"].registro,
            expediente=hit["record"].expediente,
            producto=hit["record"].producto,
            titular=hit["record"].titular,
            principio_activo=hit["record"].principio_activo,
            estado_registro=hit["record"].estado_registro,
            fecha_vencimiento=hit["record"].fecha_vencimiento,
            score=hit["score"],
            matched_field=hit["matched_field"],
            valid_registry=hit["valid_registry"],
        )
        for hit in invima_module.search(db, q, limit=limit)
    ]


@router.post("/sync", response_model=InvimaSyncOut)
def sync(
    limit: int = Query(5000, ge=100, le=50000),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_INVIMA_SYNC)),
):
    """Sincroniza desde el dato abierto de datos.gov.co.

    No devuelve error HTTP si la fuente no responde: la indisponibilidad es un
    escenario previsto y queda descrita en el registro de sincronizacion, para
    que el operador decida si usa la carga de archivo plano.
    """
    return invima_module.sync_from_socrata(db, limit=limit, triggered_by=user.email)


@router.post("/sync/file", response_model=InvimaSyncOut)
async def sync_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_INVIMA_SYNC)),
):
    """Ruta de contingencia prevista en el plan: carga del listado en CSV."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="El archivo esta vacio.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"El archivo supera el maximo de {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    return invima_module.sync_from_flat_file(
        db, content=content, filename=file.filename or "", triggered_by=user.email
    )
