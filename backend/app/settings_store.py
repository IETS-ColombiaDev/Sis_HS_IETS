"""Almacen de configuracion en tiempo de ejecucion (persistido en la tabla AppMeta).

Permite gestionar desde el panel de configuracion valores como la API key de Gemini
y el modelo preferido, sin necesidad de reiniciar el backend ni editar el archivo .env.
Los valores de BD tienen prioridad sobre las variables de entorno.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .models import AppMeta

# Prefijo para no colisionar con otras claves (p. ej. la version de estado).
GEMINI_API_KEY = "cfg.gemini_api_key"
GEMINI_MODEL = "cfg.gemini_model"


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
