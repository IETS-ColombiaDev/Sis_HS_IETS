"""Copia de la base en el navegador del administrador (ver `browser_backup`)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from .. import audit, browser_backup, firebase_db
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
def firebase_push(
    override: bool = Query(False, description="Subir aunque la base local tenga menos datos"),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    """Publica la base en Firestore. Con `override`, tambien si una guarda la bloqueo:
    la copia que estaba guardada queda fijada como punto de recuperacion."""
    try:
        out = firebase_db.push_override() if override else firebase_db.push_now(force=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc
    if override:
        _record(user.email, "backup:push_override", {"ok": bool(out.get("ok")), "reason": out.get("reason", "")})
    return out


@router.post("/firebase/pull")
def firebase_pull(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    try:
        return firebase_db.pull_if_needed()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc


@router.get("/firebase/checkpoints")
def firebase_checkpoints(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    """Copias recuperables en Firestore: actual, anterior y puntos fijados."""
    if not firebase_db.enabled():
        return {"enabled": False, "items": [], "retention": firebase_db.PIN_RETENTION}
    try:
        items = firebase_db.list_checkpoints()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc
    return {"enabled": True, "items": items, "retention": firebase_db.PIN_RETENTION}


@router.post("/firebase/checkpoints/pin")
def firebase_pin(user: User = Depends(require_permission(P_CONFIG_MANAGE))):
    """Sube el estado actual y fija la copia que habia como punto de recuperacion."""
    try:
        out = firebase_db.pin_current()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc
    _record(user.email, "backup:pin", {"ok": bool(out.get("ok")), "reason": out.get("reason", "")})
    return out


@router.post("/firebase/checkpoints/{gen}/restore")
async def firebase_restore_checkpoint(
    gen: str,
    confirm: str = Query("", description="Debe ser RESTAURAR"),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    """Vuelve a una copia recuperable. El estado actual queda fijado antes."""
    if confirm != "RESTAURAR":
        raise HTTPException(status_code=400, detail="Confirme la restauración escribiendo RESTAURAR.")
    email = user.email
    try:
        out = await run_in_threadpool(firebase_db.restore_checkpoint, gen)
    except browser_backup.RestoreRejected as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:300]) from exc
    if not out.get("ok"):
        status = {"not_found": 404, "busy": 409}.get(out.get("reason"), 400)
        raise HTTPException(status_code=status, detail=f"No se pudo restaurar: {out.get('reason')}")
    _record(email, "backup:restore_checkpoint", {"gen": gen, "taken_at": out.get("taken_at")}, restored=True)
    out["access_token"] = _reissue(email)
    return out


def _reissue(email: str) -> str | None:
    """La base cambio por completo: la sesion se reemite contra la cuenta restaurada."""
    db = SessionLocal()
    try:
        restored = db.query(User).filter(User.email == email).first()
        return create_session_token(restored) if restored is not None and restored.is_active else None
    finally:
        db.close()


class _Actor:
    def __init__(self, email: str) -> None:
        self.email = email
        self.id = None


def _record(email: str, action: str, detail: dict, *, restored: bool = False) -> None:
    """Deja la accion en la bitacora de la base que queda vigente.

    Con `restored`, el propio registro de la restauracion no cuenta como trabajo
    posterior a ella.
    """
    db = SessionLocal()
    try:
        audit.set_user_context(_Actor(email))
        audit.record_action(db, entity_type="backup", entity_id="base", action=action, new_value=detail)
        db.commit()
        if restored:
            browser_backup.mark_restore_point(db)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log.warning("No se pudo registrar %s en la bitácora: %s", action, exc)
    finally:
        db.close()


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
    # Antes de reemplazar la base, el estado actual se sube y queda fijado en
    # Firestore: una restauracion equivocada se puede deshacer.
    saved = False
    if force and firebase_db.enabled():
        try:
            pre = await run_in_threadpool(lambda: firebase_db.push_now(force=True))
            saved = bool(pre.get("ok"))
        except Exception as exc:  # noqa: BLE001
            log.warning("No se pudo guardar el estado previo a la restauración: %s", exc)
    try:
        result = await run_in_threadpool(browser_backup.restore_snapshot, data, force=force)
    except browser_backup.RestoreRejected as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    result["access_token"] = _reissue(email)
    result["saved_previous"] = saved
    _record(
        email,
        "backup:restore",
        {"force": force, "snapshot_taken_at": result.get("snapshot_taken_at"), "saved_previous": saved},
        restored=True,
    )
    try:
        # Restaurar una copia mas vieja es deliberado: se permite que pese menos y
        # la copia que estaba en la nube queda fijada como punto de recuperacion.
        firebase_db.push_now(force=True, allow_shrink=force, pin=firebase_db.PIN_RESTORE)
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo publicar en Firebase tras restaurar: %s", exc)
    return result
