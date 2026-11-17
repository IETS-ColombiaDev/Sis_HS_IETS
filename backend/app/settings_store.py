"""Almacen de configuracion en tiempo de ejecucion (persistido en la tabla AppMeta).

Permite gestionar MiniMax, Gemini, OCR y llaves de fuentes desde el panel,
sin necesidad de reiniciar el backend ni editar el archivo .env.
Los valores de BD tienen prioridad sobre las variables de entorno.
"""
from __future__ import annotations

import json
import uuid

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
    _upsert(db, key, value)
    db.commit()


def set_values(db: Session, mapping: dict[str, str]) -> None:
    for key, value in mapping.items():
        _upsert(db, key, value)
    db.commit()


def _upsert(db: Session, key: str, value: str) -> None:
    row = db.get(AppMeta, key)
    if row is None:
        db.add(AppMeta(key=key, value=value or ""))
    else:
        row.value = value or ""


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

    # BD → variable de entorno MINIMAX_API_KEY. Sin llave: IA en modo degradado.
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


# --------------------------------------------------------------------------- #
#  Reglas de horizonte para paginas web (scraper.py)
# --------------------------------------------------------------------------- #
# Palabras o frases simples (no regex). scraper.py las convierte por dentro:
# texto escapado, palabra completa, sin distinguir mayusculas ni tildes, y un
# espacio entre palabras admite cualquier espacio en blanco. La prioridad es
# fija: inminente > transicional > emergente; si nada coincide, `default`.
# Cada guardado renueva un token de version: cada proceso (api, worker) compara
# la version de la BD con la suya y recompila al cambiar.
HORIZON_RULES = "cfg.horizon_rules"
HORIZON_RULES_VERSION = "cfg.horizon_rules_version"

HORIZON_LEVELS: tuple[str, ...] = ("inminente", "transicional", "emergente")
HORIZON_DEFAULT_CHOICES: tuple[str, ...] = ("", "emergente", "transicional", "inminente")
HORIZON_TERM_MAX_LEN = 80
HORIZON_TERMS_MAX = 200

# Equivalentes en terminos de los regex historicos de scraper.py:
#  - `phase\s*iii` -> "phase iii" + "phaseiii" (con y sin espacio).
#  - `author[iz]ation` -> "authorization" + "authorisation". Unica diferencia
#    intencional: el regex historico admitia UNA letra ("authoriation",
#    "authorzation") y nunca coincidio con las grafias reales.
#  - `cl[ií]nico` -> "clinico" (las tildes se ignoran al comparar).
#  - `early[- ]stage` -> "early-stage" + "early stage".
#  - Raices como "approv" se conservan tal cual: el regex exigia palabra
#    completa (\b al final), igual que la conversion actual.
DEFAULT_HORIZON_RULES: dict = {
    "inminente": [
        "launch", "approv", "marketing authorization", "marketing authorisation",
        "registro sanitario", "aprobad", "autorizad", "pivotal",
        "phase iii", "phaseiii", "phase 3", "phase3", "fase iii", "faseiii",
        "regulatory", "nice ta", "chmp", "positive opinion", "fda approv",
        "ema approv", "recommend",
    ],
    "transicional": [
        "phase ii", "phaseii", "phase 2", "phase2", "fase ii", "faseii",
        "clinical trial", "ensayo clinico", "in development",
        "under review", "under evaluation",
    ],
    "emergente": [
        "preclinic", "pre-clinic", "early-stage", "early stage",
        "phase i", "phasei", "phase 1", "phase1", "fase i", "fasei",
        "phase i/ii", "phasei/ii", "discovery", "first-in-human",
        "pipeline", "proof of concept",
    ],
    "default": "",
}


def _clean_term(raw) -> str:
    return " ".join(str(raw or "").split())


def normalize_horizon_rules(data: dict) -> dict:
    """Valida y limpia las reglas. Lanza ValueError con un mensaje legible.

    Cada lista debe tener al menos un termino; los terminos son palabras o
    frases simples que empiezan y terminan en letra o numero.
    """
    if not isinstance(data, dict):
        raise ValueError("Las reglas de horizonte deben ser un objeto.")
    out: dict = {}
    for level in HORIZON_LEVELS:
        terms = data.get(level)
        if not isinstance(terms, list):
            raise ValueError(f"Falta la lista de palabras clave de '{level}'.")
        seen: set[str] = set()
        clean: list[str] = []
        for raw in terms:
            term = _clean_term(raw)
            if not term:
                continue
            if len(term) > HORIZON_TERM_MAX_LEN:
                raise ValueError(f"'{term[:30]}…' supera {HORIZON_TERM_MAX_LEN} caracteres.")
            if not (term[0].isalnum() and term[-1].isalnum()):
                raise ValueError(f"'{term}' debe empezar y terminar en letra o número.")
            key = term.lower()
            if key not in seen:
                seen.add(key)
                clean.append(term)
        if not clean:
            raise ValueError(f"La lista de '{level}' no puede quedar vacía.")
        if len(clean) > HORIZON_TERMS_MAX:
            raise ValueError(f"La lista de '{level}' admite como máximo {HORIZON_TERMS_MAX} términos.")
        out[level] = clean
    default = str(data.get("default") or "")
    if default not in HORIZON_DEFAULT_CHOICES:
        raise ValueError("El horizonte por defecto debe ser vacío, emergente, transicional o inminente.")
    out["default"] = default
    return out


def default_horizon_rules() -> dict:
    return json.loads(json.dumps(DEFAULT_HORIZON_RULES))


def horizon_rules_version(db: Session) -> str:
    """Token de la ultima version guardada ("" = nunca se han guardado)."""
    return get_value(db, HORIZON_RULES_VERSION, "")


def load_horizon_rules(db: Session) -> dict:
    """Reglas vigentes; si no hay guardadas (o estan corruptas), las por defecto."""
    raw = get_value(db, HORIZON_RULES, "")
    if raw:
        try:
            return normalize_horizon_rules(json.loads(raw))
        except (ValueError, TypeError):
            pass
    return default_horizon_rules()


def save_horizon_rules(db: Session, data: dict) -> dict:
    """Valida, guarda y renueva el token de version (avisa a los demas procesos)."""
    rules = normalize_horizon_rules(data)
    set_values(
        db,
        {
            HORIZON_RULES: json.dumps(rules, ensure_ascii=False),
            HORIZON_RULES_VERSION: uuid.uuid4().hex,
        },
    )
    return rules
