"""La base de trabajo vive en Firestore, en un espacio exclusivo de Horizonte.

Coleccion `hs_iets_db` (nunca `usuarios` de RRHH). Si el proyecto permite bases
nombradas se usa `hs-iets`; si no, esa coleccion en `(default)`. SQLite sigue
como motor local. La instantanea es el .db gzip, partida en < 700 KB.
"""
from __future__ import annotations

import base64
import hashlib
import json
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
PUSH_DEBOUNCE_S = 5.0
# Minimo entre copias. Cada copia exporta, compacta y comprime toda la base: con
# 0,1 CPU tarda casi un minuto. Durante una vigilancia hay commits a cada rato y,
# sin este minimo, el proceso pasaba el tiempo copiando en vez de rastrear.
PUSH_MIN_INTERVAL_S = 120.0
_last_push_at = 0.0
# Con una vigilancia en curso la copia espera mas: la CPU es para el rastreo.
PUSH_MIN_INTERVAL_SCANNING_S = 180.0
# Una copia local que pesa menos de esta fraccion de la que esta en la nube no se
# sube sola: casi siempre es una base recien sembrada tras un arranque en el que
# no se pudo leer Firestore, y subirla borraria el trabajo guardado.
SHRINK_GUARD_RATIO = 0.5
# Hasta leer Firestore con exito al arrancar no se sube nada: si la lectura fallo
# (red, cuota), la base local es la sembrada vacia y pisaria la buena.
_pull_ok = False
# Huella de la copia de la nube que este proceso conoce (la que leyo al arrancar o
# la ultima que subio). Si al subir la nube trae otra, la escribio otra instancia:
# esa copia se fija como punto de recuperacion en vez de perderse. None: aun no
# se ha leido la nube; "": se leyo y estaba vacia.
_known_cloud_sha: str | None = None

# --- Puntos de recuperacion ------------------------------------------------- #
# Ademas de la copia actual y la anterior, se conservan copias fijadas que las
# subidas siguientes no borran. Motivo -> cuantas se guardan (las mas recientes).
PIN_DEPLOY = "antes_despliegue"  # ultima copia hecha con la version anterior del codigo
PIN_DAILY = "diaria"  # ultima copia de cada dia
PIN_FOREIGN = "otra_instancia"  # la escribio otro proceso (dos instancias a la vez)
PIN_RESTORE = "antes_restauracion"  # estado previo a una restauracion manual
PIN_MANUAL = "manual"  # fijada a mano desde el panel
PIN_RETENTION = {PIN_DEPLOY: 5, PIN_DAILY: 7, PIN_FOREIGN: 3, PIN_RESTORE: 3, PIN_MANUAL: 3}
PIN_LABELS = {
    PIN_DEPLOY: "Antes de un despliegue",
    PIN_DAILY: "Cierre del día",
    PIN_FOREIGN: "Escrita por otra instancia",
    PIN_RESTORE: "Antes de una restauración",
    PIN_MANUAL: "Fijada a mano",
}
# Tablas cuyo conteo se guarda con cada copia. La bitacora es inmutable (solo
# crece): si la base local trae menos filas que la copia guardada, no desciende
# de ella y subirla borraria trabajo. Las demas no pueden caer a menos de la mitad.
GUARD_LINEAGE_TABLE = "audit_log"
GUARD_TABLES = ("findings", "technologies", "sources", "users", "submissions", "notes")
GUARD_MIN_ROWS = 20


def _min_interval() -> float:
    try:
        from .worker import draining

        return PUSH_MIN_INTERVAL_SCANNING_S if draining() else PUSH_MIN_INTERVAL_S
    except Exception:  # noqa: BLE001
        return PUSH_MIN_INTERVAL_S
_RESERVED_DEFAULT = {"(default)", "default"}
_RRHH_COLLECTIONS = {"usuarios", "users"}
_resolved_db: str | None = None

_autosync = False
_busy = False
_timer: threading.Timer | None = None
_lock = threading.Lock()
# Serializa exportar + subir (y restaurar): sin esto, la copia de arranque, la del
# temporizador y la del apagado corrian a la vez y una foto vieja que terminaba de
# subir despues pisaba a la nueva en Firestore.
_sync_lock = threading.RLock()
SYNC_WAIT_S = 180.0
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


DEV_SUFFIX = "_dev"


def _collection() -> str:
    """Coleccion de la copia. Fuera de produccion siempre lleva el sufijo `_dev`.

    El desarrollo local y las pruebas de navegador comparten la cuenta de servicio
    con Render: sin esta separacion, un servidor de pruebas restauraba la base de
    produccion al arrancar y la sobrescribia con usuarios y ciclos de prueba.
    El servidor desplegado usa la coleccion real aunque corra con
    ENVIRONMENT=development (Render define RENDER=true).
    FIREBASE_DB_SHARE_WITH_PRODUCTION=true lo permite a proposito (soporte).
    """
    name = (getattr(settings, "firebase_db_collection", "") or COLLECTION).strip() or COLLECTION
    deployed = settings.is_production or os.environ.get("RENDER", "").strip().lower() == "true"
    if deployed or getattr(settings, "firebase_db_share_with_production", False):
        return name
    return name if name.endswith(DEV_SUFFIX) else f"{name}{DEV_SUFFIX}"


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


def ensure_database(*, probe_write: bool = True) -> dict:
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
    if named and _data_lives_in_default():
        log.warning(
            "La base nombrada %s no tiene copia y (default)/%s sí: se usa (default) "
            "para no arrancar vacío ni dividir los datos.",
            preferred,
            _collection(),
        )
        _resolved_db = "(default)"
        named = False
        created = False
    probed = False
    if probe_write:
        probed = bool(probe().get("ok"))
    return {
        "ok": True,
        "created": created,
        "named": named,
        "database": _active_database(),
        "collection": _collection(),
        "project_id": firebase_auth.project_id(),
        "probed": probed,
    }


def _data_lives_in_default() -> bool:
    """La base resuelta no tiene copia pero `(default)` si la tiene."""
    global _resolved_db
    chosen = _resolved_db
    try:
        here = _get_doc(META_ID) or {}
        if _read_i(here, "chunk_count"):
            return False
        _resolved_db = "(default)"
        there = _get_doc(META_ID) or {}
        return bool(_read_i(there, "chunk_count"))
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo comparar la base nombrada con (default): %s", exc)
        return False
    finally:
        _resolved_db = chosen


def list_checkpoints() -> list[dict]:
    """Copias recuperables: la actual, la anterior y los puntos fijados."""
    cloud = fetch_meta() or {}
    out: list[dict] = []
    if cloud.get("chunk_count"):
        out.append({**_checkpoint_of(cloud, "actual"), "pinned_at": "", "current": True})
    pinned = [c for c in (cloud.get("checkpoints") or []) if isinstance(c, dict)]
    pinned_gens = {str(c.get("gen") or "") for c in pinned}
    prev = _previous_meta(cloud)
    # Si la copia anterior ya esta fijada, se muestra una sola vez, con su motivo.
    if prev and str(prev.get("gen") or "") not in pinned_gens:
        out.append({**prev, "reason": "anterior", "code": "", "counts": {}, "pinned_at": ""})
    seen = {str(item.get("gen") or "") for item in out}
    out.extend(c for c in pinned if str(c.get("gen") or "") not in seen)
    for item in out:
        item["label"] = {"actual": "Copia actual", "anterior": "Copia anterior"}.get(
            item.get("reason"), PIN_LABELS.get(item.get("reason"), item.get("reason"))
        )
    return out


def restore_checkpoint(gen: str) -> dict:
    """Restaura una copia recuperable. El estado actual queda fijado antes."""
    global _last_sha, _known_cloud_sha
    if not enabled():
        return {"ok": False, "reason": "disabled"}
    if not _sync_lock.acquire(timeout=SYNC_WAIT_S):
        return {"ok": False, "reason": "busy"}
    try:
        target = next((c for c in list_checkpoints() if str(c.get("gen") or "") == gen), None)
        if target is None:
            return {"ok": False, "reason": "not_found"}
        payload = _fetch_payload(target)
        # Primero se sube y se fija el estado actual: la restauracion se puede deshacer.
        saved = _push_locked(force=True) if _pull_ok else {"ok": False}
        browser_backup.restore_snapshot(payload, force=True)
        pushed = _push_locked(force=True, allow_shrink=True, pin=PIN_RESTORE)
        return {
            "ok": True,
            "restored": True,
            "taken_at": target.get("taken_at"),
            "saved_previous": bool(saved.get("ok")),
            "pushed": bool(pushed.get("ok")),
        }
    finally:
        _sync_lock.release()


def pin_current() -> dict:
    """Sube el estado actual y fija la copia que habia como punto de recuperacion."""
    return push_now(force=True, pin=PIN_MANUAL)


def push_override() -> dict:
    """Sube la base local aunque tenga menos datos que la copia guardada.

    Decision expresa del superadministrador cuando una copia quedo bloqueada y la
    base local es la correcta. La copia que estaba en la nube queda fijada.
    """
    return push_now(force=True, allow_shrink=True, pin=PIN_MANUAL)


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
        "gen": _read_s(fields, "gen"),
        "prev_gen": _read_s(fields, "prev_gen"),
        "prev_sha256": _read_s(fields, "prev_sha256"),
        "prev_chunk_count": _read_i(fields, "prev_chunk_count"),
        "prev_taken_at": _read_s(fields, "prev_taken_at"),
        "prev_raw_size": _read_i(fields, "prev_raw_size"),
        "code": _read_s(fields, "code"),
        "counts": _load_json(_read_s(fields, "counts"), {}),
        "checkpoints": _load_json(_read_s(fields, "checkpoints"), []),
    }


def _load_json(raw: str, default):
    if not raw:
        return default
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return default
    return value if isinstance(value, type(default)) else default


def code_id() -> str:
    """Version del codigo que hace la copia: version + commit desplegado (Render)."""
    from . import __version__

    commit = (os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("GIT_COMMIT") or "").strip()[:12]
    return f"{__version__}+{commit}" if commit else str(__version__)


def _day(taken_at: str) -> str:
    return (taken_at or "")[:10]


def _guard_counts(local: dict, cloud: dict) -> str:
    """Motivo por el que la base local no debe pisar la copia guardada ('' si puede)."""
    if not local or not cloud:
        return ""
    try:
        mine = int(local.get(GUARD_LINEAGE_TABLE, -1))
        theirs = int(cloud.get(GUARD_LINEAGE_TABLE, -1))
    except (TypeError, ValueError):
        mine = theirs = -1
    if mine >= 0 and theirs >= 0 and mine < theirs:
        return (
            f"la bitácora local tiene {mine} registros y la copia guardada {theirs}: "
            "la base local no desciende de la copia guardada"
        )
    for table in GUARD_TABLES:
        try:
            mine = int(local.get(table, -1))
            theirs = int(cloud.get(table, -1))
        except (TypeError, ValueError):
            continue
        if mine >= 0 and theirs >= GUARD_MIN_ROWS and mine < theirs * SHRINK_GUARD_RATIO:
            return f"la tabla {table} pasaría de {theirs} a {mine} filas"
    return ""


def _checkpoint_of(cloud: dict, reason: str) -> dict:
    return {
        "gen": cloud.get("gen") or "",
        "sha256": cloud.get("sha256") or "",
        "chunk_count": int(cloud.get("chunk_count") or 0),
        "taken_at": cloud.get("taken_at") or "",
        "raw_size": int(cloud.get("raw_size") or 0),
        "code": cloud.get("code") or "",
        "counts": cloud.get("counts") or {},
        "reason": reason,
        "pinned_at": datetime.now(timezone.utc).isoformat(),
    }


def _trim_checkpoints(items: list[dict]) -> list[dict]:
    """Sin repetidos por generacion y con el cupo de cada motivo (las mas recientes)."""
    seen: set[str] = set()
    unique: list[dict] = []
    for item in sorted(items, key=lambda c: (str(c.get("pinned_at") or ""), str(c.get("taken_at") or "")), reverse=True):
        gen = str(item.get("gen") or "")
        if not item.get("chunk_count") or not item.get("sha256") or gen in seen:
            continue
        seen.add(gen)
        unique.append(item)
    kept: list[dict] = []
    used: dict[str, int] = {}
    for item in unique:
        reason = str(item.get("reason") or PIN_MANUAL)
        used[reason] = used.get(reason, 0) + 1
        if used[reason] <= PIN_RETENTION.get(reason, 3):
            kept.append(item)
    return sorted(kept, key=lambda c: str(c.get("taken_at") or ""), reverse=True)


def _is_foreign(cloud: dict) -> bool:
    """La copia de la nube no es la que este proceso leyo ni la ultima que subio."""
    if _known_cloud_sha is None or not cloud.get("chunk_count"):
        return False
    return (cloud.get("sha256") or "") != _known_cloud_sha


def _pin_reason(cloud: dict, new_taken_at: str, forced: str) -> str:
    """Por que la copia que hoy esta en la nube debe quedar fijada ('' si no)."""
    if not cloud.get("chunk_count"):
        return ""
    if forced:
        return forced
    if _is_foreign(cloud):
        return PIN_FOREIGN
    if (cloud.get("code") or "") != code_id():
        return PIN_DEPLOY
    if _day(cloud.get("taken_at") or "") and _day(cloud.get("taken_at") or "") != _day(new_taken_at):
        return PIN_DAILY
    return ""


def _chunk_id(gen: str, i: int) -> str:
    """Id del fragmento i. Cada copia escribe en su propia generacion: la anterior
    sigue intacta hasta que el meta apunta a la nueva, asi un corte a mitad de la
    subida nunca deja la nube con fragmentos mezclados."""
    return f"g{gen}{CHUNK_PREFIX}{i:04d}" if gen else f"{CHUNK_PREFIX}{i:04d}"


def _chunk_owner(doc_id: str) -> tuple[str, int] | None:
    """(generacion, indice) de un documento de fragmento; None si no lo es."""
    if doc_id.startswith("g") and CHUNK_PREFIX in doc_id[1:]:
        gen, _, idx = doc_id[1:].rpartition(CHUNK_PREFIX)
        if gen and idx.isdigit():
            return gen, int(idx)
    if doc_id.startswith(CHUNK_PREFIX) and doc_id[len(CHUNK_PREFIX):].isdigit():
        return "", int(doc_id[len(CHUNK_PREFIX):])
    return None


def _previous_meta(meta: dict) -> dict | None:
    """La copia anterior que se conserva como respaldo (si la hay)."""
    if not meta.get("prev_chunk_count"):
        return None
    return {
        "gen": meta.get("prev_gen") or "",
        "sha256": meta.get("prev_sha256") or "",
        "chunk_count": meta.get("prev_chunk_count") or 0,
        "taken_at": meta.get("prev_taken_at") or "",
        "raw_size": meta.get("prev_raw_size") or 0,
    }


def _fetch_payload(meta: dict) -> bytes:
    count = int(meta.get("chunk_count") or 0)
    if count <= 0:
        raise RuntimeError("La copia en Firestore no trae fragmentos.")
    gen = meta.get("gen") or ""
    parts: list[bytes] = []
    for i in range(count):
        fields = _get_doc(_chunk_id(gen, i))
        if not fields:
            raise RuntimeError(f"Falta el fragmento {i} de {count} en Firestore.")
        parts.append(_read_b(fields, "data"))
    payload = b"".join(parts)
    digest = hashlib.sha256(payload).hexdigest()
    expected = meta.get("sha256") or ""
    if expected and digest != expected:
        raise RuntimeError("La copia en Firestore no coincide con su huella SHA-256.")
    return payload


def push_now(*, force: bool = False, allow_shrink: bool = False, pin: str = "") -> dict:
    """Copia la base a Firestore.

    `allow_shrink` salta las guardas de tamano y de conteos (restauracion manual
    deliberada). `pin` fija la copia que hoy esta en la nube con ese motivo antes
    de reemplazarla.
    """
    if not enabled():
        return {"ok": False, "reason": "disabled"}
    if not firebase_auth.configured():
        return {"ok": False, "reason": "sin_credenciales"}
    if not _sync_lock.acquire(timeout=SYNC_WAIT_S):
        return {"ok": False, "reason": "busy"}
    try:
        if not _pull_ok:
            # Nunca se sube sin antes haber leido la nube: se reintenta la lectura.
            _pull_locked()
            if not _pull_ok:
                _status["error"] = "Copia en pausa: aún no se pudo leer Firestore; se reintenta sola."
                _status["synced"] = False
                return {"ok": False, "reason": "pull_pending"}
        return _push_locked(force=force, allow_shrink=allow_shrink, pin=pin)
    finally:
        _sync_lock.release()


def _push_locked(*, force: bool, allow_shrink: bool = False, pin: str = "") -> dict:
    global _last_sha, _status, _busy, _last_push_at, _known_cloud_sha
    _last_push_at = time.monotonic()
    _busy = True
    try:
        payload, snap = browser_backup.export_snapshot()
    finally:
        _busy = False
    digest = hashlib.sha256(payload).hexdigest()
    if digest == _last_sha and not force:
        _status = {**_status, "synced": True, "skipped": True, "taken_at": snap.get("taken_at")}
        return {"ok": True, "skipped": True, "sha256": digest}

    cloud = fetch_meta() or {}
    raw_size = int(snap.get("raw_size") or 0)
    cloud_raw = int(cloud.get("raw_size") or 0)
    if not allow_shrink and cloud_raw and raw_size < cloud_raw * SHRINK_GUARD_RATIO:
        msg = (
            f"Copia bloqueada: la base local ({raw_size} bytes) es mucho menor que la guardada "
            f"en Firestore ({cloud_raw} bytes). Se conserva la de la nube para no perder información."
        )
        log.error(msg)
        _status = {**_status, "synced": False, "error": msg, "blocked_shrink": True}
        return {"ok": False, "reason": "shrink_guard", "local_raw_size": raw_size, "cloud_raw_size": cloud_raw}
    counts = snap.get("counts") or {}
    # Si la copia de la nube la escribio otra instancia (redespliegue con dos
    # procesos a la vez), su bitacora puede ir por delante de la local sin que la
    # local haya perdido nada. Bloquear dejaria a esta instancia sin poder guardar
    # nunca: se sube, y la copia ajena queda fijada como punto de recuperacion.
    lost = "" if allow_shrink or _is_foreign(cloud) else _guard_counts(counts, cloud.get("counts") or {})
    if lost:
        msg = (
            f"Copia bloqueada: {lost}. Se conserva la copia de Firestore para no perder información."
        )
        log.error(msg)
        _status = {**_status, "synced": False, "error": msg, "blocked_shrink": True}
        return {"ok": False, "reason": "count_guard", "detail": lost}

    gen = digest[:12]
    chunks = [payload[i : i + CHUNK_BYTES] for i in range(0, len(payload), CHUNK_BYTES)] or [b""]
    for i, chunk in enumerate(chunks):
        _put_doc(_chunk_id(gen, i), {"n": _iv(i), "data": _bv(chunk)})
    meta_fields = {
        "epoch": _sv(str(snap.get("epoch") or "")),
        "fingerprint": _sv(str(snap.get("fingerprint") or "")),
        "taken_at": _sv(str(snap.get("taken_at") or "")),
        "sha256": _sv(digest),
        "raw_size": _iv(raw_size),
        "gzip_size": _iv(len(payload)),
        "chunk_count": _iv(len(chunks)),
        "gen": _sv(gen),
        "updated_at": _sv(datetime.now(timezone.utc).isoformat()),
        "code": _sv(code_id()),
        "counts": _sv(json.dumps(counts, sort_keys=True)),
    }
    # Puntos de recuperacion: la copia que se va a reemplazar queda fijada si es la
    # ultima de la version anterior del codigo, la ultima del dia, la de otra
    # instancia o el estado previo a una restauracion.
    checkpoints = [c for c in (cloud.get("checkpoints") or []) if isinstance(c, dict)]
    reason = _pin_reason(cloud, str(snap.get("taken_at") or ""), pin)
    if reason and (cloud.get("gen") or "") != gen:
        checkpoints.append(_checkpoint_of(cloud, reason))
        log.info("Punto de recuperación fijado (%s): copia del %s.", reason, cloud.get("taken_at"))
    checkpoints = [c for c in _trim_checkpoints(checkpoints) if str(c.get("gen") or "") != gen]
    meta_fields["checkpoints"] = _sv(json.dumps(checkpoints, sort_keys=True))
    # La copia anterior queda de respaldo: si la nueva no se puede leer, se restaura esa.
    if cloud.get("chunk_count") and (cloud.get("gen") or "") != gen:
        prev = {
            "gen": cloud.get("gen") or "",
            "sha256": cloud.get("sha256") or "",
            "chunk_count": int(cloud.get("chunk_count") or 0),
            "taken_at": cloud.get("taken_at") or "",
            "raw_size": cloud_raw,
        }
    else:
        prev = _previous_meta(cloud)
    if prev:
        meta_fields.update(
            {
                "prev_gen": _sv(prev["gen"]),
                "prev_sha256": _sv(prev["sha256"]),
                "prev_chunk_count": _iv(int(prev["chunk_count"] or 0)),
                "prev_taken_at": _sv(prev["taken_at"]),
                "prev_raw_size": _iv(int(prev["raw_size"] or 0)),
            }
        )
    # El meta se escribe al final: hasta aqui la nube sigue apuntando a la copia anterior completa.
    _put_doc(META_ID, meta_fields)
    keep = {gen: len(chunks)}
    if prev and prev["gen"] != gen:
        keep[prev["gen"]] = int(prev["chunk_count"] or 0)
    for item in checkpoints:
        keep.setdefault(str(item.get("gen") or ""), int(item.get("chunk_count") or 0))
    for doc_id in _list_ids():
        owner = _chunk_owner(doc_id)
        if owner is None:
            continue
        doc_gen, idx = owner
        if doc_gen not in keep or idx >= keep[doc_gen]:
            _delete_doc(doc_id)
    _last_sha = digest
    _known_cloud_sha = digest
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
        "checkpoints": len(checkpoints),
        "pushed_at": datetime.now(timezone.utc).isoformat(),
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
    with _sync_lock:
        return _pull_locked()


def _pull_locked() -> dict:
    global _pull_ok
    result = _pull_inner()
    if result.get("ok"):
        _pull_ok = True
    return result


def _pull_inner() -> dict:
    global _last_sha, _status, _busy, _known_cloud_sha
    if not enabled():
        _status = {"configured": firebase_auth.configured(), "enabled": False}
        return {"ok": False, "reason": "disabled"}
    try:
        if _resolved_db is None:
            # Sin saber en que base vive la copia no se lee ni se sube: una base
            # inexistente responde "sin datos" y el sistema arrancaria vacio.
            ensure_database(probe_write=False)
        if _resolved_db is None:
            raise RuntimeError("no se pudo determinar la base de Firestore")
        cloud = fetch_meta()
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo leer la base en Firestore: %s", exc)
        _status = {"configured": True, "error": str(exc)[:240]}
        return {"ok": False, "reason": "fetch_failed"}
    if not cloud or not cloud.get("chunk_count"):
        _status = {"configured": True, "synced": False, "empty": True}
        _known_cloud_sha = ""
        return {"ok": True, "restored": False, "empty": True}

    _known_cloud_sha = cloud.get("sha256") or ""
    local = browser_backup.info()
    if not _cloud_should_win(cloud, local):
        _status = {"configured": True, "synced": True, "taken_at": cloud.get("taken_at"), "kept_local": True}
        _last_sha = cloud.get("sha256") or ""
        return {"ok": True, "restored": False, "kept_local": True}

    _busy = True
    try:
        try:
            payload = _fetch_payload(cloud)
        except Exception as exc:  # noqa: BLE001
            prev = _previous_meta(cloud)
            if prev is None:
                raise
            log.warning("Copia actual ilegible (%s); se restaura la anterior (%s).", exc, prev.get("taken_at"))
            payload = _fetch_payload(prev)
            cloud = {**cloud, **prev}
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
    # No se descarta aunque haya una copia en curso: el temporizador espera el
    # candado y sube el estado mas reciente.
    if not _autosync or not enabled():
        return
    delay = max(PUSH_DEBOUNCE_S, _last_push_at + _min_interval() - time.monotonic())
    with _lock:
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(delay, _flush)
        _timer.daemon = True
        _timer.start()


def push_soon() -> None:
    """Copia pronto (sin el minimo entre copias): al terminar una vigilancia."""
    global _timer
    if not _autosync or not enabled():
        return
    with _lock:
        if _timer is not None:
            _timer.cancel()
        _timer = threading.Timer(PUSH_DEBOUNCE_S, _flush)
        _timer.daemon = True
        _timer.start()


def _flush() -> None:
    if not enabled():
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
