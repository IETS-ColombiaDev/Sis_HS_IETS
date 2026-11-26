"""Identidad institucional: el logo que se carga desde Configuración.

Se guarda como data URL en AppMeta (viaja con la copia de la base, así sobrevive
a los reinicios de Render). Solo imágenes de mapa de bits reconocidas por su
firma: un SVG puede traer código y no hace falta para un logo.
"""
from __future__ import annotations

import base64
import hashlib

from sqlalchemy.orm import Session

from . import settings_store

LOGO_KEY = "brand.logo"
MAX_LOGO_BYTES = 400 * 1024

_SIGNATURES = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)


class LogoError(ValueError):
    """El archivo no sirve como logo; el mensaje se muestra tal cual."""


def detect_type(content: bytes) -> str:
    for signature, mime in _SIGNATURES:
        if content.startswith(signature):
            return mime
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return ""


def get_logo(db: Session) -> dict:
    """Logo vigente: `logo` es una data URL o cadena vacía; `version` cambia al reemplazarlo."""
    value = settings_store.get_value(db, LOGO_KEY, "")
    version = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16] if value else ""
    return {"logo": value, "version": version}


def save_logo(db: Session, content: bytes) -> dict:
    if not content:
        raise LogoError("El archivo está vacío.")
    if len(content) > MAX_LOGO_BYTES:
        raise LogoError(f"El logo supera el máximo de {MAX_LOGO_BYTES // 1024} KB. Reduzca la imagen e intente de nuevo.")
    mime = detect_type(content)
    if not mime:
        raise LogoError("Formato no admitido. Use una imagen PNG, JPG o WebP.")
    data_url = f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"
    settings_store.set_value(db, LOGO_KEY, data_url)
    return get_logo(db)


def remove_logo(db: Session) -> dict:
    settings_store.set_value(db, LOGO_KEY, "")
    return get_logo(db)
