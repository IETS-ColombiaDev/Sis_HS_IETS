"""Prompts y limites del escaneo activo, editables desde el panel de administracion.

La BD (AppMeta) pisa los valores por defecto. El worker lee el cache en memoria
para no abrir sesion en cada pagina visitada.
"""
from __future__ import annotations

import threading

from sqlalchemy.orm import Session

from . import settings_store

SCAN_SYSTEM = "cfg.prompt.scan_system"
SCAN_USER = "cfg.prompt.scan_user"
SCAN_MAX_TOKENS = "cfg.scan.max_tokens"
SCAN_MAX_PAGES = "cfg.scan.max_pages"
SCAN_MAX_CHARS = "cfg.scan.max_chars"
SCAN_FETCH_TIMEOUT = "cfg.scan.fetch_timeout"
SCAN_CHILD_TIMEOUT = "cfg.scan.child_timeout"
SCAN_AI_TIMEOUT = "cfg.scan.ai_timeout"
SCAN_RETRIES = "cfg.scan.retries"
SCAN_PAUSE_MS = "cfg.scan.pause_ms"

SCAN_SYSTEM_PROMPT = (
    "Eres el extractor de senales del escaneo de horizonte del IETS (Instituto de "
    "Evaluacion Tecnologica en Salud de Colombia). No redactas ensayos: extraes "
    "tecnologias sanitarias que YA aparecen en el texto visitado.\n"
    "Reglas inquebrantables:\n"
    "1. Solo hechos del contenido. Prohibido inventar nombres, marcas, fases, fechas, "
    "ensayos o identificadores NCT.\n"
    "2. Respondes UNICAMENTE un JSON array. Sin markdown, sin prefacio, sin comentarios.\n"
    "3. Espanol tecnico, preciso, util para un analista IETS.\n"
    "4. Si el texto es menu, cookie, error, login o la pagina institucional de la fuente "
    "sin tecnologias, devuelves [].\n"
    "5. Una senal = una tecnologia o producto nominado (INN, marca, plataforma o dispositivo), "
    "no un titular generico de seccion."
)

DEFAULT_USER_PROMPT = """Extrae senales de horizonte sanitario para el IETS Colombia.

Fuente: {source_title}
URL: {source_url}
Paginas visitadas (principal, URLs de entrada de la matriz, resultados de busqueda y fichas): {pages_visited}
{source_context}

Use el contexto de la matriz para priorizar: primero las tecnologias de los tipos indicados y
la informacion que la matriz pide consultar. Los resultados de busqueda web son pistas: extraiga
solo lo que el texto de la pagina o el fragmento afirme.

Texto real del sitio:
---
{content}
---
{ocr_note}

Devuelve SOLO un JSON array (maximo {max_items} items). Cada item:
{
  "title": "nombre concreto de la tecnologia + indicacion si consta",
  "technology": "nombre corto (INN o marca; no la fuente)",
  "summary": "que se anuncia, en que fase o tramite, y por que importa al SGSSS (2-4 frases, solo del texto)",
  "url": "URL de la ficha si aparece; si no, la URL de la fuente",
  "technology_type": "medicamento|dispositivo|digital|otro",
  "horizon": "emergente|transicional|inminente",
  "therapeutic_area": "oncologia|neurologia|cardiologia|enf. raras|endocrinologia|inmunologia|infectologia u otra del texto",
  "phase": "preclinica|I|II|III|IV|autorizada o vacio",
  "published_date": "fecha del texto o vacio"
}

Definiciones de horizonte (use la mas avanzada que el texto soporte):
- emergente: preclinica, fase I, descubrimiento, first-in-human, pipeline temprano.
- transicional: fase II, ensayo clinico en curso, en evaluacion o revision.
- inminente: fase III/pivotal, opinion CHMP, aprobacion FDA/EMA/INVIMA, lanzamiento, registro sanitario.

Incluya: medicamentos, biologicos, terapias avanzadas, vacunas, dispositivos, diagnosticos y salud digital nominados.
Excluya: navegacion, cookies, 'horizon scanning', el nombre de la agencia, eventos, empleos, boletines sin tecnologia.
No copie el esquema de ejemplo. No invente identificadores NCT ni tecnologias que no esten en el texto.
Si dos menciones son la misma tecnologia, unifique en un item.
Si no hay senales reales, []."""

DEFAULT_MAX_TOKENS = 2048
DEFAULT_MAX_PAGES = 8
DEFAULT_MAX_CHARS = 28000
DEFAULT_FETCH_TIMEOUT = 25
DEFAULT_CHILD_TIMEOUT = 15
DEFAULT_AI_TIMEOUT = 60
DEFAULT_RETRIES = 3
DEFAULT_PAUSE_MS = 350
MAX_TOKENS_MIN, MAX_TOKENS_MAX = 256, 8192
MAX_PAGES_MIN, MAX_PAGES_MAX = 1, 20
MAX_CHARS_MIN, MAX_CHARS_MAX = 4000, 80000
TIMEOUT_MIN, TIMEOUT_MAX = 5, 90
CHILD_TIMEOUT_MIN, CHILD_TIMEOUT_MAX = 5, 60
AI_TIMEOUT_MIN, AI_TIMEOUT_MAX = 15, 120
RETRIES_MIN, RETRIES_MAX = 0, 6
PAUSE_MIN, PAUSE_MAX = 0, 3000

_lock = threading.Lock()
_runtime: dict = {
    "system": SCAN_SYSTEM_PROMPT,
    "user": DEFAULT_USER_PROMPT,
    "max_tokens": DEFAULT_MAX_TOKENS,
    "max_pages": DEFAULT_MAX_PAGES,
    "max_chars": DEFAULT_MAX_CHARS,
    "fetch_timeout": DEFAULT_FETCH_TIMEOUT,
    "child_timeout": DEFAULT_CHILD_TIMEOUT,
    "ai_timeout": DEFAULT_AI_TIMEOUT,
    "retries": DEFAULT_RETRIES,
    "pause_ms": DEFAULT_PAUSE_MS,
}


def _clamp(value: int, lo: int, hi: int, default: int) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def configure_runtime(
    system: str | None = None,
    user: str | None = None,
    max_tokens: int | None = None,
    max_pages: int | None = None,
    max_chars: int | None = None,
    fetch_timeout: int | None = None,
    child_timeout: int | None = None,
    ai_timeout: int | None = None,
    retries: int | None = None,
    pause_ms: int | None = None,
) -> dict:
    with _lock:
        if system is not None:
            _runtime["system"] = (system or "").strip() or SCAN_SYSTEM_PROMPT
        if user is not None:
            _runtime["user"] = (user or "").strip() or DEFAULT_USER_PROMPT
        if max_tokens is not None:
            _runtime["max_tokens"] = _clamp(max_tokens, MAX_TOKENS_MIN, MAX_TOKENS_MAX, DEFAULT_MAX_TOKENS)
        if max_pages is not None:
            _runtime["max_pages"] = _clamp(max_pages, MAX_PAGES_MIN, MAX_PAGES_MAX, DEFAULT_MAX_PAGES)
        if max_chars is not None:
            _runtime["max_chars"] = _clamp(max_chars, MAX_CHARS_MIN, MAX_CHARS_MAX, DEFAULT_MAX_CHARS)
        if fetch_timeout is not None:
            _runtime["fetch_timeout"] = _clamp(fetch_timeout, TIMEOUT_MIN, TIMEOUT_MAX, DEFAULT_FETCH_TIMEOUT)
        if child_timeout is not None:
            _runtime["child_timeout"] = _clamp(child_timeout, CHILD_TIMEOUT_MIN, CHILD_TIMEOUT_MAX, DEFAULT_CHILD_TIMEOUT)
        if ai_timeout is not None:
            _runtime["ai_timeout"] = _clamp(ai_timeout, AI_TIMEOUT_MIN, AI_TIMEOUT_MAX, DEFAULT_AI_TIMEOUT)
        if retries is not None:
            _runtime["retries"] = _clamp(retries, RETRIES_MIN, RETRIES_MAX, DEFAULT_RETRIES)
        if pause_ms is not None:
            _runtime["pause_ms"] = _clamp(pause_ms, PAUSE_MIN, PAUSE_MAX, DEFAULT_PAUSE_MS)
        return dict(_runtime)


def current() -> dict:
    with _lock:
        return dict(_runtime)


def system_prompt() -> str:
    return current()["system"]


def user_prompt() -> str:
    return current()["user"]


def max_tokens() -> int:
    return int(current()["max_tokens"])


def max_pages() -> int:
    return int(current()["max_pages"])


def max_chars() -> int:
    return int(current()["max_chars"])


def fetch_timeout() -> float:
    return float(current()["fetch_timeout"])


def child_timeout() -> float:
    return float(current()["child_timeout"])


def ai_timeout() -> float:
    return float(current()["ai_timeout"])


def retries() -> int:
    return int(current()["retries"])


def pause_ms() -> int:
    return int(current()["pause_ms"])


def render_user_prompt(**values) -> str:
    """Sustituye {clave} sin interpretar llaves JSON del resto de la plantilla."""
    text = user_prompt()
    for key, value in values.items():
        text = text.replace("{" + key + "}", str(value if value is not None else ""))
    return text


def _read_int(db: Session, key: str, default: int) -> int:
    raw = settings_store.get_value(db, key, "")
    if raw == "":
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


def load_from_db(db: Session) -> dict:
    return configure_runtime(
        system=settings_store.get_value(db, SCAN_SYSTEM, "") or SCAN_SYSTEM_PROMPT,
        user=settings_store.get_value(db, SCAN_USER, "") or DEFAULT_USER_PROMPT,
        max_tokens=_read_int(db, SCAN_MAX_TOKENS, DEFAULT_MAX_TOKENS),
        max_pages=_read_int(db, SCAN_MAX_PAGES, DEFAULT_MAX_PAGES),
        max_chars=_read_int(db, SCAN_MAX_CHARS, DEFAULT_MAX_CHARS),
        fetch_timeout=_read_int(db, SCAN_FETCH_TIMEOUT, DEFAULT_FETCH_TIMEOUT),
        child_timeout=_read_int(db, SCAN_CHILD_TIMEOUT, DEFAULT_CHILD_TIMEOUT),
        ai_timeout=_read_int(db, SCAN_AI_TIMEOUT, DEFAULT_AI_TIMEOUT),
        retries=_read_int(db, SCAN_RETRIES, DEFAULT_RETRIES),
        pause_ms=_read_int(db, SCAN_PAUSE_MS, DEFAULT_PAUSE_MS),
    )


def save_to_db(
    db: Session,
    *,
    system: str | None = None,
    user: str | None = None,
    max_tokens: int | None = None,
    max_pages: int | None = None,
    max_chars: int | None = None,
    fetch_timeout: int | None = None,
    child_timeout: int | None = None,
    ai_timeout: int | None = None,
    retries: int | None = None,
    pause_ms: int | None = None,
) -> dict:
    if system is not None:
        settings_store.set_value(db, SCAN_SYSTEM, (system or "").strip())
    if user is not None:
        settings_store.set_value(db, SCAN_USER, (user or "").strip())
    pairs = (
        (max_tokens, SCAN_MAX_TOKENS, MAX_TOKENS_MIN, MAX_TOKENS_MAX, DEFAULT_MAX_TOKENS),
        (max_pages, SCAN_MAX_PAGES, MAX_PAGES_MIN, MAX_PAGES_MAX, DEFAULT_MAX_PAGES),
        (max_chars, SCAN_MAX_CHARS, MAX_CHARS_MIN, MAX_CHARS_MAX, DEFAULT_MAX_CHARS),
        (fetch_timeout, SCAN_FETCH_TIMEOUT, TIMEOUT_MIN, TIMEOUT_MAX, DEFAULT_FETCH_TIMEOUT),
        (child_timeout, SCAN_CHILD_TIMEOUT, CHILD_TIMEOUT_MIN, CHILD_TIMEOUT_MAX, DEFAULT_CHILD_TIMEOUT),
        (ai_timeout, SCAN_AI_TIMEOUT, AI_TIMEOUT_MIN, AI_TIMEOUT_MAX, DEFAULT_AI_TIMEOUT),
        (retries, SCAN_RETRIES, RETRIES_MIN, RETRIES_MAX, DEFAULT_RETRIES),
        (pause_ms, SCAN_PAUSE_MS, PAUSE_MIN, PAUSE_MAX, DEFAULT_PAUSE_MS),
    )
    for value, key, lo, hi, default in pairs:
        if value is None:
            continue
        settings_store.set_value(db, key, str(_clamp(value, lo, hi, default)))
    return load_from_db(db)


def reset_to_defaults(db: Session) -> dict:
    settings_store.set_value(db, SCAN_SYSTEM, "")
    settings_store.set_value(db, SCAN_USER, "")
    settings_store.set_value(db, SCAN_MAX_TOKENS, str(DEFAULT_MAX_TOKENS))
    settings_store.set_value(db, SCAN_MAX_PAGES, str(DEFAULT_MAX_PAGES))
    settings_store.set_value(db, SCAN_MAX_CHARS, str(DEFAULT_MAX_CHARS))
    settings_store.set_value(db, SCAN_FETCH_TIMEOUT, str(DEFAULT_FETCH_TIMEOUT))
    settings_store.set_value(db, SCAN_CHILD_TIMEOUT, str(DEFAULT_CHILD_TIMEOUT))
    settings_store.set_value(db, SCAN_AI_TIMEOUT, str(DEFAULT_AI_TIMEOUT))
    settings_store.set_value(db, SCAN_RETRIES, str(DEFAULT_RETRIES))
    settings_store.set_value(db, SCAN_PAUSE_MS, str(DEFAULT_PAUSE_MS))
    return configure_runtime(
        system=SCAN_SYSTEM_PROMPT,
        user=DEFAULT_USER_PROMPT,
        max_tokens=DEFAULT_MAX_TOKENS,
        max_pages=DEFAULT_MAX_PAGES,
        max_chars=DEFAULT_MAX_CHARS,
        fetch_timeout=DEFAULT_FETCH_TIMEOUT,
        child_timeout=DEFAULT_CHILD_TIMEOUT,
        ai_timeout=DEFAULT_AI_TIMEOUT,
        retries=DEFAULT_RETRIES,
        pause_ms=DEFAULT_PAUSE_MS,
    )


def defaults() -> dict:
    return {
        "system": SCAN_SYSTEM_PROMPT,
        "user": DEFAULT_USER_PROMPT,
        "max_tokens": DEFAULT_MAX_TOKENS,
        "max_pages": DEFAULT_MAX_PAGES,
        "max_chars": DEFAULT_MAX_CHARS,
        "fetch_timeout": DEFAULT_FETCH_TIMEOUT,
        "child_timeout": DEFAULT_CHILD_TIMEOUT,
        "ai_timeout": DEFAULT_AI_TIMEOUT,
        "retries": DEFAULT_RETRIES,
        "pause_ms": DEFAULT_PAUSE_MS,
    }
