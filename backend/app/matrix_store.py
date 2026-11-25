"""La matriz que el equipo carga desde la interfaz no se pierde al reiniciar.

El JSON de la matriz vive junto al codigo (`app/data/`). En Render ese disco es
efimero: cada reinicio o despliegue vuelve al archivo de la imagen. Antes, una
matriz cargada desde (Cargar matriz) se aplicaba bien pero, tras el siguiente
reinicio, el arranque volvia a sincronizar el inventario con la matriz de la
imagen y lo revertia sin aviso.

Ahora la matriz cargada se guarda tambien en la base (que si se respalda en
Firestore) y el arranque la repone en disco antes de sincronizar. Reglas:

- El archivo en disco ya es la matriz guardada: no se hace nada.
- El archivo en disco es el mismo de la imagen sobre la que se cargo la matriz:
  se repone la matriz cargada (gana lo que subio el equipo).
- El archivo de la imagen cambio (un despliegue trajo una matriz nueva): gana la
  de la imagen y la guardada se descarta, con aviso en el registro.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session

from . import settings_store

log = logging.getLogger(__name__)

KEY_PREFIX = "matrix.uploaded."


def _key(name: str) -> str:
    return f"{KEY_PREFIX}{name}"


def file_sha(path: Path) -> str:
    """Huella del contenido (insensible a espacios y orden de llaves); '' si no existe."""
    try:
        raw = Path(path).read_text(encoding="utf-8")
    except OSError:
        return ""
    return _content_sha(raw)


def _content_sha(raw: str) -> str:
    try:
        canonical = json.dumps(json.loads(raw), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    except ValueError:
        canonical = raw
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _load(db: Session, name: str) -> dict:
    raw = settings_store.get_value(db, _key(name), "")
    if not raw:
        return {}
    try:
        record = json.loads(raw)
    except ValueError:
        return {}
    return record if isinstance(record, dict) and record.get("data") else {}


def base_sha(db: Session, name: str, path: Path) -> str:
    """Huella del archivo de la imagen sobre el que se va a cargar una matriz.

    Se llama antes de escribir el archivo. Si lo que hay en disco ya es una matriz
    cargada antes, la referencia sigue siendo la imagen original.
    """
    current = file_sha(path)
    stored = _load(db, name)
    if stored and stored.get("sha") == current:
        return str(stored.get("base_sha") or "")
    return current


def remember(db: Session, name: str, path: Path, base: str, *, actor: str = "", commit: bool = True) -> None:
    """Guarda en la base la matriz que se acaba de escribir en `path`."""
    try:
        raw = Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        log.warning("No se pudo leer %s para guardarla en la base: %s", path, exc)
        return
    record = {
        "sha": _content_sha(raw),
        "base_sha": base,
        "actor": actor,
        "data": base64.b64encode(gzip.compress(raw.encode("utf-8"), compresslevel=9)).decode("ascii"),
    }
    settings_store._upsert(db, _key(name), json.dumps(record))
    if commit:
        db.commit()
    else:
        db.flush()


def rehydrate(db: Session, name: str, path: Path) -> str:
    """Arranque: repone en disco la matriz cargada por el equipo si corresponde.

    Devuelve "sin_matriz_cargada", "vigente", "repuesta", "imagen_nueva" o "error".
    """
    stored = _load(db, name)
    if not stored:
        return "sin_matriz_cargada"
    current = file_sha(path)
    if current == stored.get("sha"):
        return "vigente"
    if current and current != (stored.get("base_sha") or ""):
        log.warning(
            "El despliegue trae una matriz nueva (%s): reemplaza a la que se había cargado desde la interfaz.",
            Path(path).name,
        )
        settings_store._upsert(db, _key(name), "")
        db.commit()
        return "imagen_nueva"
    try:
        raw = gzip.decompress(base64.b64decode(stored["data"])).decode("utf-8")
        if _content_sha(raw) != stored.get("sha"):
            raise ValueError("la matriz guardada no coincide con su huella")
        json.loads(raw)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(raw, encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        log.error("No se pudo reponer la matriz cargada (%s): %s", Path(path).name, exc)
        return "error"
    log.info("Matriz cargada desde la interfaz repuesta en disco (%s).", Path(path).name)
    return "repuesta"


def rehydrate_all(db: Session) -> dict[str, str]:
    """Repone las dos matrices (por enlace y por fuente) antes de sincronizar."""
    from . import link_matrix, source_matrix

    out = {
        "enlaces": rehydrate(db, "enlaces", link_matrix.DATA_FILE),
        "fuentes": rehydrate(db, "fuentes", Path(source_matrix.DATA_FILE)),
    }
    if "repuesta" in out.values():
        source_matrix._cache = None
        if hasattr(source_matrix, "_legacy_cache"):
            source_matrix._legacy_cache = None
    return out
