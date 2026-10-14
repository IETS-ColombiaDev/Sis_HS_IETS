"""Directorio institucional de personas (Firestore RRHH), emparejado por correo."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import requests

from . import firebase_auth
from .config import settings

log = logging.getLogger(__name__)

_CACHE_TTL = 120
_PLACEHOLDERS = {
    "admin",
    "administrador",
    "administrador iets",
    "administrador iets superadmin",
    "suite de regresion",
    "usuario",
}

_cache: dict = {"at": 0.0, "by_email": {}}


@dataclass(frozen=True)
class DirectoryProfile:
    email: str
    nombres: str = ""
    apellidos: str = ""
    nombre: str = ""

    @property
    def display_name(self) -> str:
        full = " ".join(part for part in (self.nombres, self.apellidos) if part).strip()
        return full or self.nombre.strip()


def is_placeholder_name(name: str, email: str = "") -> bool:
    text = (name or "").strip().lower()
    if not text:
        return True
    local = (email or "").split("@")[0].lower()
    if text == local or text.replace(".", " ") == local.replace(".", " "):
        return True
    return text in _PLACEHOLDERS


def configured() -> bool:
    return firebase_auth.configured() or bool((settings.firebase_project_id or "").strip())


def _load_service_account():
    return firebase_auth.load_service_account()


def _project_id(info):
    return firebase_auth.project_id(info)


def _access_token(info):
    return firebase_auth.access_token(info)


def _field_text(fields: dict, *keys: str) -> str:
    for key in keys:
        node = fields.get(key) or {}
        value = node.get("stringValue")
        if value:
            return str(value).strip()
    return ""


def _profile_from_fields(fields: dict) -> DirectoryProfile | None:
    email = _field_text(fields, "emailLower", "email").lower()
    if not email or "@" not in email:
        return None
    nombres = _field_text(fields, "nombres")
    apellidos = _field_text(fields, "apellidos")
    nombre = _field_text(fields, "nombre")
    if not (nombres or apellidos or nombre):
        return None
    return DirectoryProfile(email=email, nombres=nombres, apellidos=apellidos, nombre=nombre)


def _fetch_all() -> dict[str, DirectoryProfile]:
    info = _load_service_account()
    project = _project_id(info)
    if not info or not project:
        return {}
    token = _access_token(info)
    url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/usuarios"
    found: dict[str, DirectoryProfile] = {}
    page = ""
    for _ in range(20):
        params = {"pageSize": 300}
        if page:
            params["pageToken"] = page
        resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, params=params, timeout=8)
        if resp.status_code >= 400:
            log.warning("Firestore usuarios: HTTP %s", resp.status_code)
            break
        payload = resp.json()
        for doc in payload.get("documents") or []:
            profile = _profile_from_fields(doc.get("fields") or {})
            if profile:
                found[profile.email] = profile
        page = payload.get("nextPageToken") or ""
        if not page:
            break
    return found


def directory_map() -> dict[str, DirectoryProfile]:
    # `user_out` lo consulta en cada peticion autenticada: el resultado se
    # guarda aunque venga vacio (directorio sin credenciales) o falle la red, de
    # modo que un directorio caido no convierta cada peticion en una espera.
    now = time.time()
    if _cache["at"] and now - _cache["at"] < _CACHE_TTL:
        return _cache["by_email"]
    try:
        by_email = _fetch_all()
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo leer el directorio Firestore: %s", exc)
        _cache["at"] = now
        return _cache["by_email"] or {}
    _cache["at"] = now
    _cache["by_email"] = by_email
    return by_email


def lookup(email: str) -> DirectoryProfile | None:
    email = (email or "").strip().lower()
    if not email:
        return None
    return directory_map().get(email)


def resolve_name(*, email: str, leftover: str = "", incoming: str = "") -> tuple[str, str, str]:
    """Nombre institucional por correo. Firestore gana siempre sobre la base local."""
    profile = lookup(email)
    if profile and profile.display_name:
        return profile.display_name, profile.nombres, profile.apellidos
    for candidate in (incoming, leftover):
        if candidate and not is_placeholder_name(candidate, email):
            return candidate.strip(), "", ""
    local = email.split("@")[0].replace(".", " ").strip()
    return local, "", ""
