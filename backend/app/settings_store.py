"""Almacen de configuracion en tiempo de ejecucion (persistido en la tabla AppMeta).

Permite gestionar MiniMax, Gemini, OCR y llaves de fuentes desde el panel,
sin necesidad de reiniciar el backend ni editar el archivo .env.
Los valores de BD tienen prioridad sobre las variables de entorno.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .models import AppMeta

# Prefijo para no colisionar con otras claves (p. ej. la version de estado).
GEMINI_API_KEY = "cfg.gemini_api_key"
GEMINI_MODEL = "cfg.gemini_model"
MINIMAX_API_KEY = "cfg.minimax_api_key"
MINIMAX_MODEL = "cfg.minimax_model"
AI_PROVIDER = "cfg.ai_provider"
AI_OCR_ENABLED = "cfg.ai_ocr_enabled"
AI_WEB_ENABLED = "cfg.ai_web_enabled"
OPENFDA_API_KEY = "cfg.openfda_api_key"
NCBI_API_KEY = "cfg.ncbi_api_key"
NCBI_EMAIL = "cfg.ncbi_email"


def get_value(db: Session, key: str, default: str = "") -> str:
    row = db.get(AppMeta, key)
    return row.value if row and row.value is not None else default


def set_value(db: Session, key: str, value: str) -> None:
    row = db.get(AppMeta, key)
    if row is None:
        row = AppMeta(key=key, value=value or "")
        db.add(row)
    else:
        row.value = value or ""
    db.commit()


def load_gemini_config(db: Session) -> tuple[str, str]:
    """Devuelve (api_key, model) desde la BD (cadena vacia si no hay)."""
    return get_value(db, GEMINI_API_KEY, ""), get_value(db, GEMINI_MODEL, "")


def _flag(db: Session, key: str, default: bool) -> bool:
    raw = get_value(db, key, "")
    if raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "si"}


def load_ai_config(db: Session) -> dict[str, str | bool]:
    """Config de MiniMax / proveedor / OCR. La BD pisa al .env si hay valor."""
    from .config import settings

    minimax_key = get_value(db, MINIMAX_API_KEY, "") or (settings.minimax_api_key or "")
    minimax_model = get_value(db, MINIMAX_MODEL, "") or (settings.minimax_model or "")
    provider = get_value(db, AI_PROVIDER, "") or (settings.ai_provider or "auto")
    return {
        "minimax_api_key": minimax_key,
        "minimax_model": minimax_model,
        "gemini_api_key": get_value(db, GEMINI_API_KEY, "") or (settings.gemini_api_key or ""),
        "gemini_model": get_value(db, GEMINI_MODEL, "") or (settings.gemini_model or ""),
        "provider": (provider or "auto").strip().lower(),
        "ocr_enabled": _flag(db, AI_OCR_ENABLED, bool(settings.ai_ocr_enabled)),
        "web_enabled": _flag(db, AI_WEB_ENABLED, bool(settings.ai_web_enabled)),
    }


def load_ingest_keys(db: Session) -> dict[str, str]:
    return {
        "openfda_api_key": get_value(db, OPENFDA_API_KEY, ""),
        "ncbi_api_key": get_value(db, NCBI_API_KEY, ""),
        "ncbi_email": get_value(db, NCBI_EMAIL, ""),
    }
