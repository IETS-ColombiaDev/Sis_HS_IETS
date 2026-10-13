"""Copia de la base SQLite guardada en el navegador del administrador.

En Render (plan free) el disco es efimero: cada redeploy o reinicio arranca con
una base vacia. El navegador de cada administrador guarda en IndexedDB una copia
comprimida de la base y, cuando detecta que el servidor arranco con una base
nueva, la devuelve para restaurarla.

Identidad de la base: `db.epoch` (uuid) se crea una sola vez por base. Una base
restaurada conserva el epoch de la copia, de modo que los demas navegadores la
reconocen como la misma y no vuelven a restaurar.

Reglas para restaurar sin `force`:
  a) Epoch distinto y la base del servidor nacio despues de tomada la copia
     (el servidor se reinicio con disco vacio).
  b) Mismo epoch, el servidor no ha cambiado desde la ultima restauracion y la
     copia es mas reciente que la restaurada (otro navegador tenia datos mas
     nuevos).
"""
from __future__ import annotations

import gzip
import io
import logging
import sqlite3
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import settings
from .database import IS_SQLITE, SessionLocal
from .events import VERSION_KEY, bump_state_version
from .models import AppMeta

log = logging.getLogger(__name__)

EPOCH_KEY = "db.epoch"
EPOCH_CREATED_KEY = "db.epoch_created_at"
TAKEN_AT_KEY = "backup.taken_at"
RESTORED_AT_KEY = "restore.at"
RESTORED_TAKEN_AT_KEY = "restore.snapshot_taken_at"
RESTORED_VERSION_KEY = "restore.state_version"

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
MAX_DB_BYTES = 1024 * 1024 * 1024
REQUIRED_TABLES = {"users", "app_meta", "sources"}

_restore_lock = threading.Lock()


class RestoreRejected(Exception):
    """La copia no se aplica (no es valida o no es mas reciente)."""

    def __init__(self, message: str, *, status: int = 409) -> None:
        super().__init__(message)
        self.status = status


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(value: str) -> datetime | None:
    try:
        dt = datetime.fromisoformat((value or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def db_path() -> Path | None:
    if not IS_SQLITE:
        return None
    raw = settings.database_url.split("///", 1)[-1]
    if not raw or raw.startswith(":memory:"):
        return None
    return Path(raw).expanduser().resolve()


def supported() -> bool:
    path = db_path()
    return path is not None


def _meta(db, key: str) -> str:
    row = db.get(AppMeta, key)
    return row.value if row and row.value is not None else ""


def _set_meta(db, key: str, value: str) -> None:
    row = db.get(AppMeta, key)
    if row is None:
        db.add(AppMeta(key=key, value=value))
    else:
        row.value = value


def ensure_epoch() -> None:
    """Marca la base con su identidad la primera vez que arranca."""
    db = SessionLocal()
    try:
        if _meta(db, EPOCH_KEY):
            return
        _set_meta(db, EPOCH_KEY, uuid.uuid4().hex)
        _set_meta(db, EPOCH_CREATED_KEY, _now_iso())
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log.warning("No se pudo marcar el epoch de la base: %s", exc)
    finally:
        db.close()


def _fingerprint(state_version: str) -> str:
    """Cambia con cada escritura (mtime/tamano de la base y su WAL)."""
    path = db_path()
    parts = [state_version or "0"]
    if path is not None:
        for p in (path, path.with_name(path.name + "-wal")):
            try:
                st = p.stat()
                parts.append(f"{st.st_mtime_ns}:{st.st_size}")
            except OSError:
                parts.append("-")
    return "|".join(parts)


def _has_user_work(db) -> bool:
    """Hay acciones de personas fuera del alta de cuentas (escaneos, ediciones...)."""
    from sqlalchemy import and_, not_

    from .models import AuditLog

    row = (
        db.query(AuditLog.id)
        .filter(
            and_(
                AuditLog.user_email != "sistema",
                AuditLog.user_email != "",
                not_(AuditLog.user_email.like("anonimo:%")),
                AuditLog.entity_type.notin_(("users", "auth", "app_meta")),
            )
        )
        .first()
    )
    return row is not None


def info() -> dict:
    if not supported():
        return {"supported": False}
    db = SessionLocal()
    try:
        version = _meta(db, VERSION_KEY) or "0"
        return {
            "supported": True,
            "epoch": _meta(db, EPOCH_KEY),
            "epoch_created_at": _meta(db, EPOCH_CREATED_KEY),
            "state_version": int(version) if version.isdigit() else 0,
            "fingerprint": _fingerprint(version),
            "has_user_work": _has_user_work(db),
            "restored_at": _meta(db, RESTORED_AT_KEY),
            "restored_snapshot_taken_at": _meta(db, RESTORED_TAKEN_AT_KEY),
            "untouched_since_restore": bool(_meta(db, RESTORED_VERSION_KEY))
            and _meta(db, RESTORED_VERSION_KEY) == version,
        }
    finally:
        db.close()


def export_snapshot() -> tuple[bytes, dict]:
    """Copia consistente (API de respaldo de SQLite) comprimida con gzip."""
    path = db_path()
    if path is None:
        raise RestoreRejected("La copia en el navegador solo aplica a SQLite.", status=400)
    meta = info()
    taken_at = _now_iso()
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / "snapshot.db"
        src = sqlite3.connect(str(path), timeout=30)
        dst = sqlite3.connect(str(copy))
        try:
            src.backup(dst)
            dst.execute(
                "INSERT OR REPLACE INTO app_meta(key, value, updated_at) VALUES (?, ?, ?)",
                (TAKEN_AT_KEY, taken_at, taken_at),
            )
            dst.commit()
            dst.execute("PRAGMA journal_mode=DELETE")
            dst.execute("VACUUM")
        finally:
            dst.close()
            src.close()
        raw = copy.read_bytes()
    payload = gzip.compress(raw, compresslevel=6)
    return payload, {
        "epoch": meta.get("epoch", ""),
        "fingerprint": meta.get("fingerprint", ""),
        "state_version": meta.get("state_version", 0),
        "taken_at": taken_at,
        "raw_size": len(raw),
    }


def _read_snapshot(data: bytes, folder: Path) -> tuple[Path, dict]:
    if not data:
        raise RestoreRejected("La copia llego vacia.", status=400)
    if len(data) > MAX_UPLOAD_BYTES:
        raise RestoreRejected("La copia supera el tamano permitido.", status=413)
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as gz:
            raw = gz.read(MAX_DB_BYTES + 1)
    except OSError:
        raw = data  # se acepta tambien el .db sin comprimir
    if len(raw) > MAX_DB_BYTES:
        raise RestoreRejected("La base descomprimida es demasiado grande.", status=413)
    if not raw.startswith(b"SQLite format 3\x00"):
        raise RestoreRejected("El archivo no es una base SQLite valida.", status=400)
    path = folder / "incoming.db"
    path.write_bytes(raw)
    conn = sqlite3.connect(str(path))
    try:
        check = conn.execute("PRAGMA quick_check").fetchone()
        if not check or check[0] != "ok":
            raise RestoreRejected("La copia esta corrupta (quick_check).", status=400)
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not REQUIRED_TABLES <= tables:
            raise RestoreRejected("La copia no corresponde a este sistema.", status=400)
        meta = dict(
            conn.execute(
                "SELECT key, value FROM app_meta WHERE key IN (?, ?, ?)",
                (EPOCH_KEY, TAKEN_AT_KEY, VERSION_KEY),
            ).fetchall()
        )
    finally:
        conn.close()
    return path, meta


def _decide(current: dict, snap: dict) -> None:
    snap_epoch = snap.get(EPOCH_KEY, "")
    snap_taken = _parse_iso(snap.get(TAKEN_AT_KEY, ""))
    if not snap_epoch or snap_taken is None:
        raise RestoreRejected("La copia no trae su identidad; use la restauracion forzada.")
    if snap_epoch != current.get("epoch"):
        created = _parse_iso(current.get("epoch_created_at", ""))
        if created is None or created <= snap_taken:
            raise RestoreRejected("El servidor tiene una base distinta y posterior a la copia.")
        if current.get("has_user_work"):
            raise RestoreRejected(
                "El servidor ya tiene trabajo registrado en su base actual; la copia "
                "del navegador solo se aplica con restauración forzada."
            )
        return
    restored_taken = _parse_iso(current.get("restored_snapshot_taken_at", ""))
    if (
        current.get("untouched_since_restore")
        and restored_taken is not None
        and snap_taken > restored_taken
    ):
        return
    raise RestoreRejected("El servidor ya tiene estos datos o unos mas recientes.")


def restore_snapshot(data: bytes, *, force: bool = False) -> dict:
    path = db_path()
    if path is None:
        raise RestoreRejected("La restauracion desde el navegador solo aplica a SQLite.", status=400)
    if not _restore_lock.acquire(blocking=False):
        raise RestoreRejected("Ya hay una restauracion en curso.", status=409)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            incoming, snap = _read_snapshot(data, Path(tmp))
            if not force:
                _decide(info(), snap)
            src = sqlite3.connect(str(incoming))
            dst = sqlite3.connect(str(path), timeout=60)
            try:
                src.backup(dst)
                dst.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                dst.commit()
            finally:
                dst.close()
                src.close()
        from .database import engine

        engine.dispose()
        _after_restore(snap)
        return {
            "restored": True,
            "snapshot_taken_at": snap.get(TAKEN_AT_KEY, ""),
            "epoch": snap.get(EPOCH_KEY, ""),
        }
    finally:
        _restore_lock.release()


def _after_restore(snap: dict) -> None:
    """Lleva la base restaurada al esquema actual y recarga la configuracion."""
    from .database import harden_audit_log, run_schema_migrations
    from .migrations import upgrade_database

    upgrade_database()
    run_schema_migrations()
    harden_audit_log()
    ensure_epoch()

    db = SessionLocal()
    try:
        db.query(AppMeta).filter(AppMeta.key == TAKEN_AT_KEY).delete()
        _set_meta(db, RESTORED_AT_KEY, _now_iso())
        _set_meta(db, RESTORED_TAKEN_AT_KEY, snap.get(TAKEN_AT_KEY, ""))
        db.commit()
        version = bump_state_version(db)
        _set_meta(db, RESTORED_VERSION_KEY, str(version))
        db.commit()
    finally:
        db.close()

    from .main import load_runtime_config

    load_runtime_config()
    _reload_ingest_keys()
    log.info("Base restaurada desde la copia del navegador (%s).", snap.get(TAKEN_AT_KEY, ""))


def _reload_ingest_keys() -> None:
    from .settings_store import load_ingest_keys

    db = SessionLocal()
    try:
        keys = load_ingest_keys(db)
    finally:
        db.close()
    if keys.get("openfda_api_key"):
        settings.openfda_api_key = keys["openfda_api_key"]
    if keys.get("ncbi_api_key"):
        settings.ncbi_api_key = keys["ncbi_api_key"]
    if keys.get("ncbi_email"):
        settings.ncbi_email = keys["ncbi_email"]


def snapshot_filename() -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return f"iets_horizonte-{stamp}.db.gz"


__all__ = [
    "RestoreRejected",
    "ensure_epoch",
    "export_snapshot",
    "info",
    "restore_snapshot",
    "snapshot_filename",
    "supported",
]
