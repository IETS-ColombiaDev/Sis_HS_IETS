"""La base de trabajo vive en Firestore, en un espacio exclusivo de Horizonte.

Coleccion `hs_iets_db` (nunca `usuarios` de RRHH). Si el proyecto permite bases
nombradas se usa `hs-iets`; si no, esa coleccion en `(default)`. SQLite sigue
como motor local. La instantanea es el .db gzip, partida en < 700 KB.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import threading
import time
from datetime import datetime, timezone

import requests

from . import browser_backup, firebase_auth
from .config import settings
from .database import IS_SQLITE

log = logging.getLogger(__name__)

DATABASE_ID = "hs-iets"
COLLECTION = "hs_iets_db"
LOCATION = "nam5"
META_ID = "meta"
CHUNK_PREFIX = "c"
CHUNK_BYTES = 600_000
PUSH_DEBOUNCE_S = 8.0
_RESERVED_DEFAULT = {"(default)", "default"}
_RRHH_COLLECTIONS = {"usuarios", "users"}
_resolved_db: str | None = None

_autosync = False
_busy = False
_timer: threading.Timer | None = None
_lock = threading.Lock()
_last_sha = ""
_status: dict = {"configured": False, "synced": False}


def _in_pytest() -> bool:
    return bool(os.environ.get("PYTEST_CURRENT_TEST"))


def enabled() -> bool:
    if not getattr(settings, "firebase_db_enabled", True):
        return False
    if _in_pytest():
        return False
    if not IS_SQLITE or browser_backup.db_path() is None:
        return False
    return firebase_auth.configured()


def status() -> dict:
    return {
        "configured": enabled() or firebase_auth.configured(),
        "enabled": enabled(),
        "database": _active_database(),
        "collection": _collection(),
        "location": _location(),
        "project_id": firebase_auth.project_id() if firebase_auth.configured() else "",
        "isolated": _collection() not in _RRHH_COLLECTIONS,
        "named": _active_database() not in _RESERVED_DEFAULT,
        **{k: v for k, v in _status.items() if k not in {"configured", "enabled"}},
    }


def _database_id() -> str:
    name = (getattr(settings, "firebase_db_database", "") or DATABASE_ID).strip()
    return name or DATABASE_ID


def _location() -> str:
    name = (getattr(settings, "firebase_db_location", "") or LOCATION).strip()
    return name or LOCATION


def _collection() -> str:
    name = (getattr(settings, "firebase_db_collection", "") or COLLECTION).strip()
    return name or COLLECTION


def reset_resolved() -> None:
    global _resolved_db
    _resolved_db = None


def _active_database() -> str:
    return _resolved_db or _database_id()


def _assert_isolated() -> str:
    col = _collection()
    if col in _RRHH_COLLECTIONS:
        raise RuntimeError("La persistencia de Horizonte no puede usar la coleccion de RRHH.")
    return _active_database()


def _headers() -> dict:
    return {"Authorization": f"Bearer {firebase_auth.access_token()}"}


def _admin_base() -> str:
    return f"https://firestore.googleapis.com/v1/projects/{firebase_auth.project_id()}/databases"


def _base() -> str:
    project = firebase_auth.project_id()
    dbid = _assert_isolated()
    col = _collection()
    return f"https://firestore.googleapis.com/v1/projects/{project}/databases/{dbid}/documents/{col}"


def _sv(value: str) -> dict:
    return {"stringValue": value or ""}


def _iv(value: int) -> dict:
    return {"integerValue": str(int(value))}


def _bv(value: bytes) -> dict:
    return {"bytesValue": base64.b64encode(value).decode("ascii")}


def _read_s(fields: dict, key: str) -> str:
    return str((fields.get(key) or {}).get("stringValue") or "")


def _read_i(fields: dict, key: str) -> int:
    raw = (fields.get(key) or {}).get("integerValue")
    try:
        return int(raw or 0)
    except (TypeError, ValueError):
        return 0


def _read_b(fields: dict, key: str) -> bytes:
    raw = (fields.get(key) or {}).get("bytesValue") or ""
    if not raw:
        return b""
    return base64.b64decode(raw)


def _put_doc(doc_id: str, fields: dict) -> None:
    url = f"{_base()}/{doc_id}"
    body = {"fields": fields}
    resp = requests.patch(url, headers=_headers(), json=body, timeout=45)
    if resp.status_code == 404:
        create = f"{_base()}?documentId={doc_id}"
        resp = requests.post(create, headers=_headers(), json=body, timeout=45)
    if resp.status_code >= 400:
        raise RuntimeError(f"Firestore PUT {doc_id}: HTTP {resp.status_code} {resp.text[:240]}")


def _get_doc(doc_id: str) -> dict | None:
    url = f"{_base()}/{doc_id}"
    resp = requests.get(url, headers=_headers(), timeout=30)
    if resp.status_code == 404:
        return None
    if resp.status_code >= 400:
        raise RuntimeError(f"Firestore GET {doc_id}: HTTP {resp.status_code} {resp.text[:240]}")
    return resp.json().get("fields") or {}


def _delete_doc(doc_id: str) -> None:
    url = f"{_base()}/{doc_id}"
    resp = requests.delete(url, headers=_headers(), timeout=20)
    if resp.status_code not in (200, 404):
        log.warning("Firestore DELETE %s: HTTP %s", doc_id, resp.status_code)


def _list_ids() -> list[str]:
    url = _base()
    ids: list[str] = []
    page = ""
    for _ in range(40):
        params = {"pageSize": 300}
        if page:
            params["pageToken"] = page
        resp = requests.get(url, headers=_headers(), params=params, timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"Firestore LIST: HTTP {resp.status_code} {resp.text[:240]}")
        payload = resp.json()
        for doc in payload.get("documents") or []:
            name = str(doc.get("name") or "")
            ids.append(name.rsplit("/", 1)[-1])
        page = payload.get("nextPageToken") or ""
        if not page:
            break
    return ids


def _wait_operation(name: str) -> dict:
    url = f"https://firestore.googleapis.com/v1/{name.lstrip('/')}"
    for _ in range(40):
        resp = requests.get(url, headers=_headers(), timeout=20)
        if resp.status_code >= 400:
            raise RuntimeError(f"Firestore OPERATION: HTTP {resp.status_code} {resp.text[:240]}")
        payload = resp.json()
        if payload.get("done"):
            if payload.get("error"):
                raise RuntimeError(f"Firestore OPERATION: {payload['error']}")
            return payload
        time.sleep(2)
    raise RuntimeError("Firestore tardó demasiado en crear la base hs-iets.")


def _try_named_database(dbid: str) -> dict:
    url = f"{_admin_base()}/{dbid}"
    resp = requests.get(url, headers=_headers(), timeout=30)
    if resp.status_code == 200:
        return {"ok": True, "created": False}
    if resp.status_code not in (403, 404):
        raise RuntimeError(f"Firestore GET database {dbid}: HTTP {resp.status_code} {resp.text[:240]}")
    body = {"type": "FIRESTORE_NATIVE", "locationId": _location()}
    create = requests.post(
        f"{_admin_base()}?databaseId={dbid}",
        headers=_headers(),
        json=body,
        timeout=60,
    )
    if create.status_code in (200, 201):
        payload = create.json()
        if payload.get("name") and not payload.get("done", True):
            _wait_operation(payload["name"])
        log.info("Base Firestore nombrada %s creada en %s.", dbid, firebase_auth.project_id())
        return {"ok": True, "created": True}
    if create.status_code == 409:
        return {"ok": True, "created": False}
    return {"ok": False, "reason": f"HTTP {create.status_code}"}


def ensure_database() -> dict:
    """Prepara el espacio de Horizonte. Prefiere la base nombrada; si el
    proyecto no permite crearlas, usa la coleccion exclusiva `hs_iets_db`
    (nunca `usuarios`)."""
    global _resolved_db
    if _in_pytest():
        return {"ok": False, "reason": "pytest"}
    if not firebase_auth.configured():
        return {"ok": False, "reason": "sin_credenciales"}
    _assert_isolated()
    preferred = _database_id()
    named = False
    created = False
    if preferred not in _RESERVED_DEFAULT:
        tried = _try_named_database(preferred)
        if tried.get("ok"):
            _resolved_db = preferred
            named = True
            created = bool(tried.get("created"))
        else:
            log.warning(
                "No se pudo crear la base nombrada %s (%s). "
                "Se usa la coleccion exclusiva %s, aparte de RRHH.",
                preferred,
                tried.get("reason"),
                _collection(),
            )
            _resolved_db = "(default)"
    else:
        _resolved_db = "(default)"
    probe_result = probe()
    return {
        "ok": True,
        "created": created,
        "named": named,
        "database": _active_database(),
        "collection": _collection(),
        "project_id": firebase_auth.project_id(),
        "probed": probe_result.get("ok"),
    }


def probe() -> dict:
    """Escribe y borra un documento de prueba en el espacio de Horizonte."""
    _assert_isolated()
    stamp = datetime.now(timezone.utc).isoformat()
    _put_doc("_probe", {"kind": _sv("hs_iets"), "at": _sv(stamp)})
    fields = _get_doc("_probe") or {}
    _delete_doc("_probe")
    kind = _read_s(fields, "kind")
    if kind != "hs_iets":
        raise RuntimeError("La sonda no leyo la coleccion de Horizonte.")
    return {"ok": True, "database": _active_database(), "collection": _collection(), "kind": kind}


def fetch_meta() -> dict | None:
    fields = _get_doc(META_ID)
    if not fields:
        return None
    return {
        "epoch": _read_s(fields, "epoch"),
        "fingerprint": _read_s(fields, "fingerprint"),
        "taken_at": _read_s(fields, "taken_at"),
        "sha256": _read_s(fields, "sha256"),
        "raw_size": _read_i(fields, "raw_size"),
        "gzip_size": _read_i(fields, "gzip_size"),
        "chunk_count": _read_i(fields, "chunk_count"),
    }


def _fetch_payload(meta: dict) -> bytes:
    count = int(meta.get("chunk_count") or 0)
    if count <= 0:
        raise RuntimeError("La copia en Firestore no trae fragmentos.")
    parts: list[bytes] = []
    for i in range(count):
        fields = _get_doc(f"{CHUNK_PREFIX}{i:04d}")
        if not fields:
            raise RuntimeError(f"Falta el fragmento {i} de {count} en Firestore.")
        parts.append(_read_b(fields, "data"))
    payload = b"".join(parts)
    digest = hashlib.sha256(payload).hexdigest()
    expected = meta.get("sha256") or ""
    if expected and digest != expected:
        raise RuntimeError("La copia en Firestore no coincide con su huella SHA-256.")
    return payload


def push_now(*, force: bool = False) -> dict:
    global _last_sha, _status, _busy
    if not enabled():
        return {"ok": False, "reason": "disabled"}
    if not firebase_auth.configured():
        return {"ok": False, "reason": "sin_credenciales"}
    if _busy:
        return {"ok": False, "reason": "busy"}
    _busy = True
    try:
        payload, snap = browser_backup.export_snapshot()
    finally:
        _busy = False
    digest = hashlib.sha256(payload).hexdigest()
    if digest == _last_sha and not force:
        _status = {**_status, "synced": True, "skipped": True, "taken_at": snap.get("taken_at")}
        return {"ok": True, "skipped": True, "sha256": digest}

    chunks = [payload[i : i + CHUNK_BYTES] for i in range(0, len(payload), CHUNK_BYTES)] or [b""]
    for i, chunk in enumerate(chunks):
        _put_doc(f"{CHUNK_PREFIX}{i:04d}", {"n": _iv(i), "data": _bv(chunk)})
    _put_doc(
        META_ID,
        {
            "epoch": _sv(str(snap.get("epoch") or "")),
            "fingerprint": _sv(str(snap.get("fingerprint") or "")),
            "taken_at": _sv(str(snap.get("taken_at") or "")),
            "sha256": _sv(digest),
            "raw_size": _iv(int(snap.get("raw_size") or 0)),
            "gzip_size": _iv(len(payload)),
            "chunk_count": _iv(len(chunks)),
            "updated_at": _sv(datetime.now(timezone.utc).isoformat()),
        },
    )
    for doc_id in _list_ids():
        if doc_id.startswith(CHUNK_PREFIX) and doc_id[len(CHUNK_PREFIX) :].isdigit():
            n = int(doc_id[len(CHUNK_PREFIX) :])
            if n >= len(chunks):
                _delete_doc(doc_id)
    _last_sha = digest
    _status = {
        "configured": True,
        "synced": True,
        "taken_at": snap.get("taken_at"),
        "epoch": snap.get("epoch"),
        "gzip_size": len(payload),
        "raw_size": snap.get("raw_size"),
        "chunk_count": len(chunks),
        "sha256": digest,
        "error": "",
    }
    log.info(
        "Base copiada a Firestore (%s, %s bytes gzip, %s fragmentos).",
        snap.get("taken_at"),
        len(payload),
        len(chunks),
    )
    return {"ok": True, **_status}


def _cloud_should_win(cloud: dict, local: dict) -> bool:
    if not local.get("has_user_work"):
        return True
    cloud_taken = browser_backup._parse_iso(cloud.get("taken_at") or "")
    local_restored = browser_backup._parse_iso(local.get("restored_snapshot_taken_at") or "")
    if cloud_taken and local.get("untouched_since_restore") and local_restored and cloud_taken > local_restored:
        return True
    return False


def pull_if_needed() -> dict:
    """Restaura desde Firestore si el disco local esta vacio o atrasado."""
    global _last_sha, _status, _busy
    if not enabled():
        _status = {"configured": firebase_auth.configured(), "enabled": False}
        return {"ok": False, "reason": "disabled"}
    try:
        cloud = fetch_meta()
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo leer la base en Firestore: %s", exc)
        _status = {"configured": True, "error": str(exc)[:240]}
        return {"ok": False, "reason": "fetch_failed"}
    if not cloud or not cloud.get("chunk_count"):
        _status = {"configured": True, "synced": False, "empty": True}
        return {"ok": True, "restored": False, "empty": True}

    local = browser_backup.info()
    if not _cloud_should_win(cloud, local):
        _status = {"configured": True, "synced": True, "taken_at": cloud.get("taken_at"), "kept_local": True}
        _last_sha = cloud.get("sha256") or ""
        return {"ok": True, "restored": False, "kept_local": True}

    _busy = True
    try:
        payload = _fetch_payload(cloud)
        browser_backup.restore_snapshot(payload, force=True)
        _last_sha = cloud.get("sha256") or hashlib.sha256(payload).hexdigest()
        _status = {
            "configured": True,
            "synced": True,
            "restored": True,
            "taken_at": cloud.get("taken_at"),
            "epoch": cloud.get("epoch"),
            "gzip_size": cloud.get("gzip_size"),
            "raw_size": cloud.get("raw_size"),
            "chunk_count": cloud.get("chunk_count"),
            "sha256": _last_sha,
            "error": "",
        }
        log.info("Base restaurada desde Firestore (%s).", cloud.get("taken_at"))
        return {"ok": True, "restored": True, "taken_at": cloud.get("taken_at")}
    except Exception as exc:  # noqa: BLE001
        log.exception("Fallo al restaurar la base desde Firestore")
        _status = {"configured": True, "error": str(exc)[:240]}
        return {"ok": False, "reason": str(exc)[:240]}
    finally:
        _busy = False


def schedule_push() -> None:
    global _timer
    if not _autosync or _busy or not enabled():
        return
    with _lock:
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(PUSH_DEBOUNCE_S, _flush)
        _timer.daemon = True
        _timer.start()


def _flush() -> None:
    if _busy or not enabled():
        return
    try:
        push_now()
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo copiar la base a Firestore: %s", exc)
        _status["error"] = str(exc)[:240]
        _status["synced"] = False


def enable_autosync() -> None:
    global _autosync
    if not enabled():
        return
    _autosync = True
    from sqlalchemy import event
    from sqlalchemy.orm import Session

    if getattr(enable_autosync, "_hooked", False):
        return

    @event.listens_for(Session, "after_commit")
    def _after_commit(_session) -> None:  # noqa: ANN001
        schedule_push()

    enable_autosync._hooked = True  # type: ignore[attr-defined]


def disable_autosync() -> None:
    global _autosync, _timer
    _autosync = False
    with _lock:
        if _timer is not None:
            _timer.cancel()
            _timer = None


def flush_on_shutdown() -> None:
    disable_autosync()
    if enabled():
        try:
            push_now()
        except Exception as exc:  # noqa: BLE001
            log.warning("Copia final a Firestore omitida: %s", exc)
