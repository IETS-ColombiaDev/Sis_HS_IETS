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


# --------------------------------------------------------------------------- #
#  Tareas programadas del worker (P0-4 y P1-4)
# --------------------------------------------------------------------------- #
SCHEDULE_SCAN_ENABLED = "cfg.schedule.scan_enabled"
SCHEDULE_SCAN_HOURS = "cfg.schedule.scan_interval_hours"
SCHEDULE_DEDUP_ENABLED = "cfg.schedule.dedup_enabled"
SCHEDULE_DEDUP_HOURS = "cfg.schedule.dedup_interval_hours"

# Valores por defecto: la vigilancia revisa cada 6 horas que fuentes vencieron
# segun su propia frecuencia; el barrido de duplicados corre una vez al dia.
SCHEDULE_DEFAULTS = {
    "scan_enabled": True,
    "scan_interval_hours": 6,
    "dedup_enabled": True,
    "dedup_interval_hours": 24,
}
SCHEDULE_HOURS_MIN = 1
SCHEDULE_HOURS_MAX = 24 * 30


def _int(db: Session, key: str, default: int) -> int:
    raw = get_value(db, key, "")
    try:
        value = int(float(raw)) if raw != "" else default
    except ValueError:
        value = default
    return max(SCHEDULE_HOURS_MIN, min(SCHEDULE_HOURS_MAX, value))


def load_schedule(db: Session) -> dict:
    """Configuracion vigente de las tareas programadas (BD o valores por defecto)."""
    d = SCHEDULE_DEFAULTS
    return {
        "scan_enabled": _flag(db, SCHEDULE_SCAN_ENABLED, d["scan_enabled"]),
        "scan_interval_hours": _int(db, SCHEDULE_SCAN_HOURS, d["scan_interval_hours"]),
        "dedup_enabled": _flag(db, SCHEDULE_DEDUP_ENABLED, d["dedup_enabled"]),
        "dedup_interval_hours": _int(db, SCHEDULE_DEDUP_HOURS, d["dedup_interval_hours"]),
    }


def save_schedule(db: Session, **changes) -> dict:
    """Guarda solo los campos presentes. Las horas deben estar en [1, 720]."""
    keys = {
        "scan_enabled": SCHEDULE_SCAN_ENABLED,
        "scan_interval_hours": SCHEDULE_SCAN_HOURS,
        "dedup_enabled": SCHEDULE_DEDUP_ENABLED,
        "dedup_interval_hours": SCHEDULE_DEDUP_HOURS,
    }
    for name, value in changes.items():
        if value is None or name not in keys:
            continue
        if name.endswith("_hours"):
            hours = int(value)
            if hours < SCHEDULE_HOURS_MIN or hours > SCHEDULE_HOURS_MAX:
                raise ValueError(
                    f"El intervalo debe estar entre {SCHEDULE_HOURS_MIN} y {SCHEDULE_HOURS_MAX} horas."
                )
            set_value(db, keys[name], str(hours))
        else:
            set_value(db, keys[name], "true" if value else "false")
    return load_schedule(db)
