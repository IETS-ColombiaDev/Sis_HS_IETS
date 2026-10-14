"""Copia de la base en el navegador del administrador (ver `browser_backup`)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from .. import browser_backup, firebase_db
from ..database import SessionLocal
from ..deps import require_permission
from ..models import User
from ..rbac import P_CONFIG_MANAGE
from ..security import create_session_token

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backup", tags=["backup"])


@router.get("/info")
def backup_info(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    data = browser_backup.info()
    data["firebase"] = firebase_db.status()
    return data


@router.get("/firebase")
def firebase_info(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    return firebase_db.status()


@router.post("/firebase/push")
def firebase_push(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    try:
        return firebase_db.push_now(force=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc


@router.post("/firebase/pull")
def firebase_pull(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    try:
        return firebase_db.pull_if_needed()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc


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
    try:
        firebase_db.push_now(force=True)
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo publicar en Firebase tras restaurar: %s", exc)
    return result
