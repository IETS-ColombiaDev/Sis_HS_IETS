"""Copia de la base en el navegador del administrador (ver `browser_backup`)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from .. import browser_backup
from ..database import SessionLocal
from ..deps import require_permission
from ..models import User
from ..rbac import P_CONFIG_MANAGE
from ..security import create_session_token

router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.get("/info")
def backup_info(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    return browser_backup.info()


@router.get("/export")
async def backup_export(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    try:
        payload, meta = await run_in_threadpool(browser_backup.export_snapshot)
    except browser_backup.RestoreRejected as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return Response(
        content=payload,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{browser_backup.snapshot_filename()}"',
            "X-Backup-Epoch": str(meta["epoch"]),
            "X-Backup-Fingerprint": str(meta["fingerprint"]),
            "X-Backup-Taken-At": str(meta["taken_at"]),
            "X-Backup-Raw-Size": str(meta["raw_size"]),
            "Access-Control-Expose-Headers": "X-Backup-Epoch, X-Backup-Fingerprint, X-Backup-Taken-At, X-Backup-Raw-Size",
        },
    )


@router.post("/restore")
async def backup_restore(
    request: Request,
    force: bool = Query(False),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    email = user.email
    data = await request.body()
    try:
        result = await run_in_threadpool(browser_backup.restore_snapshot, data, force=force)
    except browser_backup.RestoreRejected as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    # La base cambio por completo: la sesion se reemite contra la cuenta restaurada.
    db = SessionLocal()
    try:
        restored = db.query(User).filter(User.email == email).first()
        token = create_session_token(restored) if restored is not None and restored.is_active else None
    finally:
        db.close()
    result["access_token"] = token
    return result
