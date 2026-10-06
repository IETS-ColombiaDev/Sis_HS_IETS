"""Parametros de fuentes: listas desplegables, flujo por fuente y busqueda web.

Todo vive en AppMeta y se edita desde Configuracion > Parametros de fuentes:

- listas (nivel de fuente, prioridad, tipo de tecnologia, origen en la matriz),
  con etiqueta, descripcion y, para la prioridad, el orden en la cola;
- flujo por fuente (`Source.scan_profile`): que pasos corre el escaneo
  (descarga, recorrido, OCR, IA, busqueda web) y con que palabras guia;
- busqueda web impulsada por IA: motores en cascada, cupos, pausas y terminos
  por tipo de tecnologia (hoja "Criterios de busqueda" de la matriz EH).
"""
from __future__ import annotations

import copy
import json
import re

from sqlalchemy.orm import Session

from . import settings_store
from .source_matrix import fold, load_matrix

OPTIONS_KEY = "cfg.sources.options"
SEARCH_KEY = "cfg.sources.web_search"
BRAVE_KEY = "cfg.sources.brave_api_key"

OPTION_LISTS = ("source_level", "priority_level", "tech_type", "matrix_origin")

DEFAULT_OPTIONS: dict[str, list[dict]] = {
    "source_level": [
        {"value": "primaria", "label": "Primaria", "description": "Produce la tecnología o el dato original (fabricante, registro, agencia que aprueba)."},
        {"value": "secundaria", "label": "Secundaria", "description": "Reporta o analiza tecnologías de otros (agencias regulatorias, revistas, noticias)."},
        {"value": "terciaria", "label": "Terciaria", "description": "Sintetiza o evalúa (agencias HTA, redes de EH, buscadores de literatura)."},
        {"value": "por_definir", "label": "Por definir", "description": "La matriz pide revisar el nivel de la fuente."},
    ],
    "priority_level": [
        {"value": "alta", "label": "Alta", "rank": 1, "description": "Alta aplicabilidad para el proyecto de Escaneo de Horizonte."},
        {"value": "media", "label": "Media", "rank": 2, "description": "Aplicabilidad media: complementa, no gobierna."},
        {"value": "revisar", "label": "Revisar pertinencia", "rank": 3, "description": "La matriz pide verificar pertinencia, acceso o enlaces."},
        {"value": "baja", "label": "Baja", "rank": 4, "description": "Baja aplicabilidad para el EH."},
    ],
    "tech_type": [
        {"value": "MED", "label": "Medicamentos", "description": "Medicamentos, biológicos, terapias avanzadas y vacunas."},
        {"value": "DM", "label": "Dispositivos médicos", "description": "Dispositivos, equipos biomédicos e implantables."},
        {"value": "BIOM", "label": "Biomarcadores", "description": "Biomarcadores y diagnóstico in vitro."},
        {"value": "IA", "label": "Inteligencia artificial", "description": "IA clínica y algoritmos."},
        {"value": "SD", "label": "Salud digital", "description": "SaMD, telemedicina, mHealth y wearables."},
        {"value": "MT", "label": "Multitecnología", "description": "Cubre MED, DM y BIOM."},
    ],
    "matrix_origin": [
        {"value": "FVEH042025", "label": "Verificada manual EH 04-2025", "description": "Fuente verificada a mano en la matriz de abril de 2025."},
        {"value": "AGREGADA", "label": "Agregada a la matriz", "description": "Fuente añadida después de la verificación inicial."},
    ],
}
UNRANKED_PRIORITY = 3  # sin prioridad asignada: junto a "revisar"

DEFAULT_SCAN_PROFILE: dict = {
    "crawl": True,          # recorrer URLs de entrada y fichas internas
    "follow_links": True,   # seguir enlaces internos desde cada pagina de entrada
    "ocr": True,            # OCR de imagenes / PDF escaneados (si la IA tiene OCR activo)
    "ai": True,             # extraccion con IA (si la IA web esta activa)
    "web_search": True,     # busqueda web impulsada por IA dentro del dominio
    "max_pages": 0,         # 0 = usar el cupo global de Configuracion > IA
    "follow_keywords": [],  # palabras que priorizan enlaces (se suman a la ruta de acceso)
    "search_terms": [],     # terminos propios de la fuente para la busqueda web
    "search_domain": "",    # dominio de busqueda; vacio = el de la URL principal
}
PROFILE_BOOL_KEYS = ("crawl", "follow_links", "ocr", "ai", "web_search")
PROFILE_LIST_KEYS = ("follow_keywords", "search_terms")
MAX_PAGES_OVERRIDE = 20

ENGINES = ("yahoo", "duckduckgo", "duckduckgo_lite", "bing", "brave_api", "searxng")
ENGINE_LABELS = {
    "yahoo": "Yahoo (HTML, sin llave)",
    "duckduckgo": "DuckDuckGo (HTML, sin llave)",
    "duckduckgo_lite": "DuckDuckGo Lite (sin llave)",
    "bing": "Bing (HTML, sin llave; filtra por dominio)",
    "brave_api": "Brave Search API (requiere llave)",
    "searxng": "SearXNG propio (URL del servidor)",
}
DEFAULT_SEARCH: dict = {
    "enabled": True,
    "engines": ["yahoo", "duckduckgo", "duckduckgo_lite", "bing"],
    "ai_queries": True,
    "max_queries": 3,
    "max_results": 6,
    "fetch_results": 4,
    "same_domain_only": True,
    "prefer_documents": True,
    "timeout": 15,
    "pause_ms": 1500,
    "cooldown_minutes": 20,
    "generic_terms": ["horizon scanning", "emerging technology", "new approval", "innovation"],
    "terms_by_category": [],
    "searxng_url": "",
}
SEARCH_LIMITS = {
    "max_queries": (1, 8),
    "max_results": (1, 20),
    "fetch_results": (0, 10),
    "timeout": (5, 60),
    "pause_ms": (0, 10000),
    "cooldown_minutes": (1, 240),
}

_SLUG = re.compile(r"^[a-z0-9_]{2,40}$")
_TECH = re.compile(r"^[A-Z0-9_]{2,12}$")


# --------------------------------------------------------------------------- #
#  Listas desplegables
# --------------------------------------------------------------------------- #
def _read_json(db: Session, key: str) -> dict:
    raw = settings_store.get_value(db, key, "")
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def load_options(db: Session) -> dict[str, list[dict]]:
    stored = _read_json(db, OPTIONS_KEY)
    out = copy.deepcopy(DEFAULT_OPTIONS)
    for name in OPTION_LISTS:
        items = stored.get(name)
        if isinstance(items, list) and items:
            out[name] = items
    return out


def _clean_option(name: str, item: dict, index: int) -> dict:
    if not isinstance(item, dict):
        raise ValueError(f"Cada opción de '{name}' debe ser un objeto con valor y etiqueta.")
    value = str(item.get("value") or "").strip()
    label = str(item.get("label") or "").strip()
    if name == "tech_type":
        value = value.upper()
        if not _TECH.match(value):
            raise ValueError(f"El código '{value}' de tipo de tecnología debe tener de 2 a 12 letras o números en mayúscula.")
    elif name == "matrix_origin":
        value = value.upper()
        if not re.match(r"^[A-Z0-9_\-]{2,40}$", value):
            raise ValueError(f"El código de origen '{value}' solo admite letras, números, guion y guion bajo.")
    else:
        value = fold(value).replace(" ", "_")
        if not _SLUG.match(value):
            raise ValueError(f"El valor '{value}' de '{name}' debe tener de 2 a 40 letras minúsculas, números o '_'.")
    if not label:
        raise ValueError(f"La opción '{value}' necesita una etiqueta visible.")
    clean = {"value": value, "label": label[:80], "description": str(item.get("description") or "").strip()[:300]}
    if name == "priority_level":
        try:
            rank = int(item.get("rank") or index + 1)
        except (TypeError, ValueError):
            rank = index + 1
        clean["rank"] = max(1, min(99, rank))
    return clean


def save_options(db: Session, payload: dict) -> dict[str, list[dict]]:
    current = load_options(db)
    for name in OPTION_LISTS:
        if name not in payload or payload[name] is None:
            continue
        items = payload[name]
        if not isinstance(items, list) or not items:
            raise ValueError(f"La lista '{name}' debe tener al menos una opción.")
        cleaned = [_clean_option(name, item, idx) for idx, item in enumerate(items)]
        values = [c["value"] for c in cleaned]
        if len(values) != len(set(values)):
            raise ValueError(f"La lista '{name}' tiene valores repetidos.")
        current[name] = cleaned
    settings_store.set_value(db, OPTIONS_KEY, json.dumps(current, ensure_ascii=False))
    return current


def reset_options(db: Session) -> dict[str, list[dict]]:
    settings_store.set_value(db, OPTIONS_KEY, "")
    return copy.deepcopy(DEFAULT_OPTIONS)


def option_values(options: dict, name: str) -> set[str]:
    return {o["value"] for o in options.get(name) or []}


def option_label(options: dict, name: str, value: str) -> str:
    for o in options.get(name) or []:
        if o["value"] == value:
            return o["label"]
    return value or ""


def priority_rank(level: str, options: dict | None = None) -> int:
    for o in (options or DEFAULT_OPTIONS).get("priority_level") or []:
        if o["value"] == (level or ""):
            return int(o.get("rank") or UNRANKED_PRIORITY)
    return UNRANKED_PRIORITY


# --------------------------------------------------------------------------- #
#  Flujo por fuente
# --------------------------------------------------------------------------- #
def _str_list(value, limit: int = 40, size: int = 120) -> list[str]:
    if isinstance(value, str):
        value = re.split(r"[,;\n]", value)
    if not isinstance(value, (list, tuple)):
        return []
    out: list[str] = []
    for item in value:
        text = re.sub(r"\s+", " ", str(item or "")).strip()[:size]
        if text and text.lower() not in {x.lower() for x in out}:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def normalize_profile(raw: dict | None) -> dict:
    """Perfil completo con valores por defecto y tipos saneados."""
    data = raw if isinstance(raw, dict) else {}
    out = copy.deepcopy(DEFAULT_SCAN_PROFILE)
    for key in PROFILE_BOOL_KEYS:
        if key in data and data[key] is not None:
            out[key] = bool(data[key])
    try:
        out["max_pages"] = max(0, min(MAX_PAGES_OVERRIDE, int(data.get("max_pages") or 0)))
    except (TypeError, ValueError):
        out["max_pages"] = 0
    for key in PROFILE_LIST_KEYS:
        if key in data:
            out[key] = _str_list(data.get(key))
    domain = str(data.get("search_domain") or "").strip().lower()
    domain = re.sub(r"^https?://", "", domain).split("/")[0].removeprefix("www.")
    out["search_domain"] = domain[:120]
    return out


def clean_url_list(value, limit: int = 20) -> list[str]:
    urls = _str_list(value, limit=limit, size=1000)
    bad = [u for u in urls if not u.lower().startswith(("http://", "https://"))]
    if bad:
        raise ValueError(f"Las URLs deben iniciar con http:// o https:// (revise: {bad[0][:80]}).")
    return urls


# Pasos de navegacion que no distinguen un enlace de otro (buscadores, "acerca de"...).
_PATH_NOISE = re.compile(
    r"(termino o tecnologia de interes|en el link|link de acceso|accesos? directos?|los links|"
    r"verificar|requiere|aplicacion de filtros|filtros|search|sin acceso|acceso con suscripcion|"
    r"^about( us)?$|^acerca|what we do|^area$|validacion|referencias|revision y extraccion|"
    r"disponibilidad de texto|fecha de publicacion|select report type|portal$)",
)


def access_path_keywords(access_path: str, limit: int = 12, domain: str = "") -> list[str]:
    """Palabras guia de la 'Ruta de acceso' (p. ej. 'medscape -> news & perspective -> *cardiology')."""
    parts = re.split(r"[→>*•|\n;]|\s-\s|\(|\)|,", access_path or "")
    site = re.sub(r"[^a-z0-9]", "", (domain or "").lower())
    out: list[str] = []
    for part in parts:
        text = fold(part)
        text = re.sub(r"^\d+(\.\d+)*\.?\s*", "", text).strip(" .:-/")
        if len(text) < 4 or len(text) > 60:
            continue
        if "." in text or re.search(r"\b(com|org|gov|gob|net)\b", text):
            continue
        if _PATH_NOISE.search(text):
            continue
        compact = re.sub(r"[^a-z0-9]", "", text)
        if " " not in text and site and compact and compact in site:
            continue  # el nombre del sitio no guia dentro del propio sitio
        if text not in out:
            out.append(text)
        if len(out) >= limit:
            break
    return out


def effective_profile(source) -> dict:
    """Perfil del escaneo con las palabras guia derivadas de la matriz."""
    profile = normalize_profile(getattr(source, "scan_profile", None))
    from urllib.parse import urlsplit

    host = (urlsplit(getattr(source, "url", "") or "").hostname or "").removeprefix("www.")
    derived = access_path_keywords(getattr(source, "access_path", "") or "", domain=host)
    keywords = list(profile["follow_keywords"])
    for word in derived:
        if word.lower() not in {k.lower() for k in keywords}:
            keywords.append(word)
    profile["follow_keywords"] = keywords[:24]
    profile["entry_urls"] = [u for u in (getattr(source, "entry_urls", None) or []) if isinstance(u, str) and u.strip()]
    return profile


def source_context(source, options: dict | None = None) -> str:
    """Bloque de contexto de la matriz EH para el prompt de extraccion."""
    opts = options or DEFAULT_OPTIONS
    lines: list[str] = []
    level = getattr(source, "source_level", "") or ""
    priority = getattr(source, "priority_level", "") or ""
    techs = [t for t in (getattr(source, "tech_types", None) or []) if t]
    meta = []
    if level:
        meta.append(f"Nivel de fuente: {option_label(opts, 'source_level', level)}")
    if priority:
        meta.append(f"Prioridad EH: {option_label(opts, 'priority_level', priority)}")
    if techs:
        meta.append("Tipos de tecnologia: " + ", ".join(option_label(opts, "tech_type", t) for t in techs))
    if meta:
        lines.append("- " + " | ".join(meta))
    for label, attr, size in (
        ("Que consultar", "consult_info", 500),
        ("Ruta de acceso", "access_path", 300),
        ("Tipo de material", "material_type", 200),
        ("Restricciones", "usage_restrictions", 200),
    ):
        value = re.sub(r"\s+", " ", getattr(source, attr, "") or "").strip()
        if value:
            lines.append(f"- {label}: {value[:size]}")
    if not lines:
        return ""
    return "Contexto de la fuente (matriz EH del IETS):\n" + "\n".join(lines)


# --------------------------------------------------------------------------- #
#  Busqueda web
# --------------------------------------------------------------------------- #
def default_terms_by_category() -> list[dict]:
    return copy.deepcopy(load_matrix().get("search_terms") or [])


def load_search(db: Session) -> dict:
    stored = _read_json(db, SEARCH_KEY)
    out = copy.deepcopy(DEFAULT_SEARCH)
    out["terms_by_category"] = default_terms_by_category()
    for key, value in stored.items():
        if key in out and value is not None:
            out[key] = value
    out["brave_api_key_set"] = bool(settings_store.get_value(db, BRAVE_KEY, ""))
    return out


def brave_api_key(db: Session) -> str:
    return settings_store.get_value(db, BRAVE_KEY, "")


def _clean_terms_by_category(value) -> list[dict]:
    if not isinstance(value, list):
        raise ValueError("Los términos por categoría deben ser una lista.")
    out: list[dict] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        category = str(item.get("category") or "").strip()[:80]
        if not category:
            continue
        tech = str(item.get("tech_type") or "MT").strip().upper()[:12] or "MT"
        out.append({"category": category, "tech_type": tech, "terms": _str_list(item.get("terms"), limit=30)})
    return out


def save_search(db: Session, payload: dict) -> dict:
    current = _read_json(db, SEARCH_KEY)
    for key in ("enabled", "ai_queries", "same_domain_only", "prefer_documents"):
        if key in payload and payload[key] is not None:
            current[key] = bool(payload[key])
    for key, (lo, hi) in SEARCH_LIMITS.items():
        if key in payload and payload[key] is not None:
            try:
                value = int(payload[key])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"'{key}' debe ser un número entero.") from exc
            if value < lo or value > hi:
                raise ValueError(f"'{key}' debe estar entre {lo} y {hi}.")
            current[key] = value
    if payload.get("engines") is not None:
        engines = [e for e in payload["engines"] if e in ENGINES]
        if not engines:
            raise ValueError("Elija al menos un motor de búsqueda.")
        current["engines"] = list(dict.fromkeys(engines))
    if payload.get("generic_terms") is not None:
        current["generic_terms"] = _str_list(payload["generic_terms"], limit=30)
    if payload.get("terms_by_category") is not None:
        current["terms_by_category"] = _clean_terms_by_category(payload["terms_by_category"])
    if payload.get("searxng_url") is not None:
        url = str(payload["searxng_url"] or "").strip()
        if url and not url.lower().startswith(("http://", "https://")):
            raise ValueError("La URL de SearXNG debe iniciar con http:// o https://")
        current["searxng_url"] = url[:300]
    settings_store.set_value(db, SEARCH_KEY, json.dumps(current, ensure_ascii=False))
    if payload.get("brave_api_key") is not None:
        settings_store.set_value(db, BRAVE_KEY, str(payload["brave_api_key"] or "").strip())
    return load_search(db)


def reset_search(db: Session) -> dict:
    settings_store.set_value(db, SEARCH_KEY, "")
    return load_search(db)
