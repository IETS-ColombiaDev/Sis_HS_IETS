"""Deteccion asistida de fuentes nuevas para el catalogo de escaneo de horizonte.

Flujo de una corrida (boton "Detectar fuentes con IA" del Catalogo de fuentes):

1. Consultas: la IA redacta hasta N consultas a partir del enfoque del usuario
   (tipo de tecnologia, tema libre, pais o region). Sin IA se arman por reglas
   (agencias HTA, regulatorias, registros de ensayos, pipelines, redes de EH).
2. Busqueda web con los motores en cascada de `web_search` (los mismos que usa
   el escaneo, con sus enfriamientos). Se descartan buscadores, redes sociales
   y enciclopedias, y se deja un resultado por sitio.
3. Filtro deterministico contra el inventario: dominio (host o subdominio de una
   fuente existente, URL principal, URLs de entrada o de referencia) y nombre o
   alias. La IA no decide que es duplicado: lo decide este modulo.
4. Clasificacion: la IA propone nombre, pais, bloque, tipos de tecnologia, nivel
   de acceso A-E, nivel de fuente y una justificacion. Puede sumar unas pocas
   fuentes de su propio conocimiento, que pasan por el mismo filtro. Sin IA se
   clasifica por reglas y la respuesta lo dice ("IA no disponible: resultados
   de busqueda sin clasificar").
5. Verificacion de alcance: cada candidata se consulta con un GET corto. Las que
   no responden se reportan como descartadas, no se proponen.

Topes de costo por corrida: `MAX_AI_CALLS` llamadas a la IA, las consultas web
que fije Parametros de fuentes > Busqueda web (`max_queries` + 2, maximo
`MAX_QUERIES`) y `MAX_CANDIDATES` verificaciones. Ademas, un limitador por
usuario (`discovery_limiter`). Nunca lanza por fallas de red o de IA.
"""
from __future__ import annotations

import re
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from . import source_profile
from .catalog import (
    CAT_ENSAYOS,
    CAT_FABRICANTE,
    CAT_HTA,
    CAT_LITERATURA,
    CAT_NOTICIAS,
    CAT_REGULATORIA,
    CATEGORIES,
    all_catalog_sources,
)
from .models import Source
from .ratelimit import SlidingWindowLimiter
from .source_matrix import fold

AI_MARK_TAG = "propuesta_ia"
AI_NOTE = "Propuesta por IA – pendiente de verificación"
MAX_AI_CALLS = 2
MAX_QUERIES = 6
MAX_CANDIDATES = 12
MAX_RESULTS_PER_QUERY = 10
REACH_TIMEOUT = 8.0
MAX_PAUSE_S = 1.5
TECH_CODES = ("MED", "DM", "BIOM", "IA", "SD", "MT")
SOURCE_LEVELS = ("primaria", "secundaria", "terciaria")
ACCESS = ("A", "B", "C", "D", "E")

# 6 corridas por usuario cada 10 minutos: cada una puede gastar hasta 2 llamadas
# a la IA y varias consultas a buscadores que bloquean por abuso.
discovery_limiter = SlidingWindowLimiter(max_events=6, window_seconds=600)

# Sitios que nunca son fuentes de EH aunque aparezcan en los buscadores.
BLOCKED_HOSTS = (
    "wikipedia.org", "wikimedia.org", "youtube.com", "facebook.com", "linkedin.com",
    "twitter.com", "x.com", "instagram.com", "tiktok.com", "reddit.com", "quora.com",
    "medium.com", "pinterest.com", "google.com", "bing.com", "yahoo.com", "duckduckgo.com",
    "amazon.com", "scribd.com", "slideshare.net", "researchgate.net", "academia.edu",
    "github.com", "msn.com",
)
# Hosts que alojan varias entidades: el duplicado se decide por la ruta.
SHARED_HOSTS = (
    "gov.uk", "europa.eu", "ec.europa.eu", "who.int", "canada.ca", "gob.mx", "argentina.gob.ar",
    "gov.br", "gob.cl", "gob.pe", "gov.co", "gob.es", "hhs.gov", "nih.gov", "gov.au", "paho.org",
    "sites.google.com",
)

TECH_TERMS = {
    "MED": "new medicines drugs",
    "DM": "medical devices",
    "BIOM": "biomarkers in vitro diagnostics",
    "IA": "artificial intelligence in health",
    "SD": "digital health",
    "MT": "health technologies",
}
TLD_COUNTRY = {
    "co": "Colombia", "br": "Brasil", "mx": "México", "ar": "Argentina", "cl": "Chile", "pe": "Perú",
    "uy": "Uruguay", "ec": "Ecuador", "es": "España", "uk": "Reino Unido", "ca": "Canadá",
    "au": "Australia", "nz": "Nueva Zelanda", "de": "Alemania", "fr": "Francia", "it": "Italia",
    "nl": "Países Bajos", "be": "Bélgica", "se": "Suecia", "no": "Noruega", "dk": "Dinamarca",
    "fi": "Finlandia", "ie": "Irlanda", "at": "Austria", "ch": "Suiza", "pt": "Portugal",
    "jp": "Japón", "kr": "Corea del Sur", "cn": "China", "in": "India", "sg": "Singapur",
    "za": "Sudáfrica", "gov": "EE. UU.", "eu": "Unión Europea", "int": "Internacional",
}
_CATEGORY_RULES = (
    (CAT_ENSAYOS, ("clinical trial", "trials registry", "trial registry", "ensayos clinicos", "ensayo clinico", "ictrp", "registro de ensayos")),
    (CAT_HTA, ("health technology assessment", "horizon scanning", "evaluacion de tecnologias", "hta", "inahta", "euroscan", "i-hts", "escaneo de horizonte", "redets")),
    (CAT_REGULATORIA, ("regulatory", "medicines agency", "drug administration", "agencia regulatoria", "regulador", "approval", "aprobacion", "autoridad sanitaria", "vigilancia sanitaria")),
    (CAT_FABRICANTE, ("pipeline", "therapeutics", "pharmaceuticals", "biotech", "our medicines", "laboratorio farmaceutico")),
    (CAT_NOTICIAS, ("news", "noticias", "journal", "magazine", "revista", "portal")),
)
_LEVEL_BY_CATEGORY = {
    CAT_ENSAYOS: "primaria",
    CAT_FABRICANTE: "primaria",
    CAT_REGULATORIA: "secundaria",
    CAT_NOTICIAS: "secundaria",
    CAT_HTA: "terciaria",
    CAT_LITERATURA: "terciaria",
}
_ACCESS_BY_CATEGORY = {CAT_ENSAYOS: "B", CAT_REGULATORIA: "C"}


class DiscoverRequest(BaseModel):
    tech_types: list[str] = Field(default_factory=list)
    focus: str = Field("", max_length=200)
    region: str = Field("", max_length=120)


class DiscoveredSourceIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=590)
    url: str = Field(..., min_length=8, max_length=1020)
    country: str = Field("", max_length=80)
    category: str = ""
    tech_types: list[str] = Field(default_factory=list)
    access_level: str = "D"
    source_level: str = ""
    justification: str = Field("", max_length=1000)
    entry_url: str = Field("", max_length=1020)
    enable_ingest: bool = False


# --------------------------------------------------------------------------- #
#  Indice del inventario y comparacion deterministica
# --------------------------------------------------------------------------- #
def host_of(url: str) -> str:
    return (urlsplit((url or "").strip()).hostname or "").lower().removeprefix("www.")


def _path_of(url: str) -> str:
    return (urlsplit((url or "").strip()).path or "/").rstrip("/").lower()


_SECOND_LEVEL = {"co", "com", "gov", "gob", "org", "ac", "edu", "net", "go", "nic", "or", "ne", "gv"}


def registrable_domain(host: str) -> str:
    """Dominio registrable aproximado: 'news.medtronic.com' -> 'medtronic.com',
    'www.anvisa.gov.br' -> 'anvisa.gov.br'. Sin lista publica de sufijos."""
    host = (host or "").lower().removeprefix("www.")
    labels = [p for p in host.split(".") if p]
    if len(labels) >= 3 and len(labels[-1]) == 2 and labels[-2] in _SECOND_LEVEL:
        base = ".".join(labels[-3:])
    else:
        base = ".".join(labels[-2:])
    # Paraguas que alojan entidades distintas (europa.eu, nih.gov, who.int...):
    # cada subdominio cuenta como un sitio propio.
    return host if base in SHARED_HOSTS else base


def _is_shared(host: str) -> bool:
    """Host que aloja varias entidades en rutas distintas (www.gov.uk/..., who.int/...)."""
    return host in SHARED_HOSTS


def is_blocked_host(host: str) -> bool:
    return any(host == h or host.endswith("." + h) for h in BLOCKED_HOSTS) or host.startswith("google.")


def _name_keys(name: str) -> set[str]:
    """Nombre completo, nombre antes de un guion largo o parentesis y siglas entre parentesis."""
    text = fold(name)
    keys = {text} if text else set()
    head = re.split(r"\s[—–-]\s|\(", text)[0].strip()
    if head:
        keys.add(head)
    for inner in re.findall(r"\(([^)]{2,20})\)", text):
        keys.add(inner.strip())
    return {k for k in keys if len(k) >= 3}


def build_index(db: Session) -> dict:
    """Hosts, rutas y nombres de todas las fuentes registradas y del catalogo empaquetado."""
    urls: list[tuple[str, str, int | None, str]] = []  # (host, path, source_id, title)
    names: dict[str, tuple[int | None, str]] = {}

    def add(source_id, title, url_list, aliases):
        for u in url_list:
            host = host_of(u)
            if host:
                urls.append((host, _path_of(u), source_id, title))
        for name in [title, *(aliases or [])]:
            for key in _name_keys(str(name or "")):
                names.setdefault(key, (source_id, title))

    for s in db.query(Source).all():
        add(s.id, s.title, [s.url, *(s.entry_urls or []), *(s.reference_urls or [])], s.aliases)
    for row in all_catalog_sources():
        add(None, row.get("title") or "", [row.get("url") or "", *(row.get("entry_urls") or [])], row.get("aliases"))
    return {"urls": urls, "names": names}


def match_existing(index: dict, url: str, name: str = "") -> dict | None:
    """Fuente existente que cubre esta URL o este nombre; None si es nueva.

    Regla de dominio: mismo dominio registrable (el sitio o cualquiera de sus
    subdominios: news.medtronic.com cubre medtronic.com). En hosts
    compartidos (gov.uk, europa.eu, who.int...) se exige ademas que una ruta
    sea prefijo de la otra, porque alojan entidades distintas.
    """
    host = host_of(url)
    path = _path_of(url)
    if host:
        for known_host, known_path, sid, title in index["urls"]:
            if _is_shared(known_host):
                if host != known_host:
                    continue
                if known_path in ("", "/") or path in ("", "/"):
                    continue
                if path.startswith(known_path) or known_path.startswith(path):
                    return {"source_id": sid, "title": title, "reason": "dominio"}
                continue
            if host == known_host or registrable_domain(host) == registrable_domain(known_host):
                return {"source_id": sid, "title": title, "reason": "dominio"}
    for key in _name_keys(name):
        hit = index["names"].get(key)
        if hit:
            return {"source_id": hit[0], "title": hit[1], "reason": "nombre"}
    return None


def candidate_url(url: str) -> str:
    """URL de la fuente propuesta: la portada del sitio, o la seccion en hosts compartidos."""
    parts = urlsplit((url or "").strip())
    if not parts.scheme or not parts.hostname:
        return ""
    base = f"{parts.scheme.lower()}://{parts.netloc.lower()}"
    host = host_of(url)
    if _is_shared(host):
        segs = [s for s in (parts.path or "").split("/") if s][:3]
        if segs and "." in segs[-1]:
            segs = segs[:-1]
        return base + ("/" + "/".join(segs) if segs else "/")
    return base + "/"


# --------------------------------------------------------------------------- #
#  Clasificacion por reglas (sin IA)
# --------------------------------------------------------------------------- #
def guess_category(text: str) -> str:
    blob = fold(text)
    for category, words in _CATEGORY_RULES:
        if any(re.search(rf"\b{re.escape(w)}\b", blob) for w in words):
            return category
    return CAT_LITERATURA


def guess_country(url: str, region: str = "") -> str:
    tld = host_of(url).rsplit(".", 1)[-1] if host_of(url) else ""
    return TLD_COUNTRY.get(tld, "") or ("Internacional" if tld in {"org", "com", "net", "int"} else region)


def _clean_tech(values, default: list[str]) -> list[str]:
    out: list[str] = []
    for v in values or []:
        code = str(v or "").strip().upper()
        if code in TECH_CODES and code not in out:
            out.append(code)
    return out or list(default)


def normalize_candidate(raw: dict, *, focus_tech: list[str], region: str) -> dict:
    """Ajusta los campos propuestos (por la IA o por reglas) a las listas del sistema."""
    url = str(raw.get("url") or "").strip()
    text = " ".join(str(raw.get(k) or "") for k in ("name", "title", "snippet", "justification"))
    category = str(raw.get("category") or "").strip()
    if category not in CATEGORIES:
        folded = {fold(c): c for c in CATEGORIES}
        category = folded.get(fold(category)) or guess_category(text + " " + url)
    access = str(raw.get("access_level") or "").strip().upper()[:1]
    if access not in ACCESS:
        access = _ACCESS_BY_CATEGORY.get(category, "D")
    level = fold(raw.get("source_level") or "")
    if level not in SOURCE_LEVELS:
        level = _LEVEL_BY_CATEGORY.get(category, "secundaria")
    name = re.sub(r"\s+", " ", str(raw.get("name") or raw.get("title") or host_of(url))).strip()[:200]
    return {
        "name": name,
        "url": url,
        "entry_url": str(raw.get("entry_url") or "").strip(),
        "country": str(raw.get("country") or "").strip()[:80] or guess_country(url, region),
        "category": category,
        "tech_types": _clean_tech(raw.get("tech_types"), focus_tech or ["MT"]),
        "access_level": access,
        "source_level": level,
        "justification": re.sub(r"\s+", " ", str(raw.get("justification") or "")).strip()[:400],
        "origin": raw.get("origin") or "busqueda",
        "query": str(raw.get("query") or "")[:200],
    }


# --------------------------------------------------------------------------- #
#  Consultas
# --------------------------------------------------------------------------- #
def _topic(req: DiscoverRequest) -> str:
    parts = [TECH_TERMS[c] for c in req.tech_types if c in TECH_TERMS]
    if req.focus.strip():
        parts.insert(0, req.focus.strip())
    return " ".join(parts[:3]) or "health technologies"


def rule_queries(req: DiscoverRequest, limit: int) -> list[str]:
    topic = _topic(req)
    region = req.region.strip()
    templates = [
        f"horizon scanning {topic} {region}",
        f"health technology assessment agency {topic} {region}",
        f"regulatory agency new approvals {topic} {region}",
        f"clinical trials registry {topic} {region}",
        f"{topic} pipeline emerging technologies news",
        f"escaneo de horizonte evaluación de tecnologías sanitarias {req.focus.strip()} {region}",
    ]
    out: list[str] = []
    for q in templates:
        q = re.sub(r"\s+", " ", q).strip()
        if q and q not in out:
            out.append(q)
    return out[:limit]


def _strip_think(text: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>", "", text or "", flags=re.I)


def _ai_list(prompt: str, *, max_tokens: int) -> list | None:
    """Llama a la IA y devuelve el arreglo JSON de la respuesta; None si fallo."""
    from . import ai_service
    from .ai_web import _loads_payload

    try:
        text, _model = ai_service.generate(
            prompt,
            system=ai_service.SYSTEM_ANALYST,
            temperature=0.3,
            max_tokens=max_tokens,
            timeout=60,
        )
    except Exception:  # noqa: BLE001
        return None
    if not text or text.startswith("[Error"):
        return None
    try:
        return _loads_payload(_strip_think(text))
    except Exception:  # noqa: BLE001
        return None


def ai_queries(req: DiscoverRequest, limit: int) -> list[str] | None:
    prompt = (
        "Necesito encontrar en la web FUENTES DE INFORMACION para escaneo de horizonte de tecnologias "
        "sanitarias (agencias regulatorias, agencias de evaluacion de tecnologias sanitarias, redes de "
        "escaneo de horizonte como EuroScan o i-HTS, registros de ensayos clinicos, pipelines de "
        "fabricantes, portales de noticias especializados).\n"
        f"Enfoque: {_topic(req)}. Pais o region: {req.region.strip() or 'cualquiera'}.\n"
        f"Redacta hasta {limit} consultas cortas para un buscador web (mezcla ingles y espanol). "
        "No uses site:. Responde SOLO un JSON array de strings."
    )
    items = _ai_list(prompt, max_tokens=400)
    if not items:
        return None
    out: list[str] = []
    for item in items:
        q = re.sub(r"\s+", " ", str(item or "")).strip().strip('"')[:200]
        if q and q not in out and not isinstance(item, (dict, list)):
            out.append(q)
    return out[:limit] or None


def ai_classify(req: DiscoverRequest, results: list[dict], index: dict, extra: int) -> list[dict] | None:
    known = sorted({title for _h, _p, _sid, title in index["urls"] if title})[:140]
    listing = "\n".join(
        f"{i + 1}. {r['url']} | {r['title'][:120]} | {r['snippet'][:200]}" for i, r in enumerate(results)
    )
    prompt = (
        "Eres curador del catalogo de fuentes de escaneo de horizonte del IETS (Colombia).\n"
        f"Enfoque pedido: {_topic(req)}. Pais o region: {req.region.strip() or 'cualquiera'}.\n"
        f"Fuentes que YA estan en el catalogo (no las propongas): {'; '.join(known)}\n\n"
        f"Resultados de busqueda web:\n{listing or '(sin resultados)'}\n\n"
        "Selecciona de los resultados los sitios que sirven como FUENTE recurrente de senales de "
        "tecnologias sanitarias nuevas o emergentes (no articulos sueltos). Puedes agregar hasta "
        f"{extra} fuentes reconocidas que conozcas y falten en el catalogo (origin='ia').\n"
        "Responde SOLO un JSON array de objetos con: name, url (portada oficial), country (en espanol), "
        f"category (exactamente uno de: {' | '.join(CATEGORIES)}), tech_types (subconjunto de "
        f"{', '.join(TECH_CODES)}), access_level (A=API estable, B=feed o descarga oficial, C=pagina "
        "estructurada, D=pagina que confirma, E=curaduria humana), source_level (primaria|secundaria|"
        "terciaria), justification (una linea en espanol: por que sirve para escaneo de horizonte), "
        "origin ('busqueda' o 'ia')."
    )
    items = _ai_list(prompt, max_tokens=2500)
    if items is None:
        return None
    return [i for i in items if isinstance(i, dict)]


# --------------------------------------------------------------------------- #
#  Verificacion de alcance
# --------------------------------------------------------------------------- #
def check_reachable(url: str) -> dict:
    """GET unico y corto. 401/403/429 cuentan como alcanzables (el sitio existe)."""
    from .config import settings
    from .scraper import BROWSER_HEADERS, is_internal_url

    if not url.lower().startswith(("http://", "https://")):
        return {"ok": False, "status": 0, "detail": "URL inválida"}
    if getattr(settings, "is_production", False) and is_internal_url(url):
        return {"ok": False, "status": 0, "detail": "Dirección de red interna"}
    try:
        import httpx

        from .ingest.base import tls_get

        resp = tls_get(
            url,
            timeout=httpx.Timeout(REACH_TIMEOUT, connect=min(5.0, REACH_TIMEOUT)),
            headers=BROWSER_HEADERS,
        )
        code = int(resp.status_code)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "status": 0, "detail": f"Sin conexión ({type(exc).__name__})"}
    if code < 400:
        return {"ok": True, "status": code, "detail": f"HTTP {code}"}
    if code in (401, 403, 405, 429):
        return {"ok": True, "status": code, "detail": f"HTTP {code}: responde con acceso restringido"}
    return {"ok": False, "status": code, "detail": f"HTTP {code}"}


# --------------------------------------------------------------------------- #
#  Corrida completa
# --------------------------------------------------------------------------- #
def discover(db: Session, req: DiscoverRequest) -> dict:
    from . import ai_service, web_search

    started = time.perf_counter()
    req.tech_types = [c for c in (str(t).strip().upper() for t in req.tech_types) if c in TECH_CODES]
    cfg = source_profile.load_search(db)
    ai_on = ai_service.is_enabled()
    ai_calls = 0
    max_queries = max(1, min(MAX_QUERIES, int(cfg.get("max_queries") or 3) + 2))
    index = build_index(db)
    trace: list[str] = []

    # 1. Consultas
    queries: list[str] = []
    origin = "reglas"
    if ai_on and ai_calls < MAX_AI_CALLS:
        ai_calls += 1
        queries = ai_queries(req, max_queries) or []
        if queries:
            origin = "ia"
    if not queries:
        queries = rule_queries(req, max_queries)

    # 2. Busqueda web (un resultado por sitio)
    results: list[dict] = []
    seen_hosts: set[str] = set()
    existing: dict[str, dict] = {}
    web_enabled = bool(cfg.get("enabled"))
    if not web_enabled:
        trace.append("Búsqueda web apagada en Parámetros de fuentes.")
    else:
        brave_key = source_profile.brave_api_key(db)
        search_cfg = {**cfg, "max_results": MAX_RESULTS_PER_QUERY}
        pause = min(MAX_PAUSE_S, int(cfg.get("pause_ms") or 0) / 1000.0)
        for idx, query in enumerate(queries):
            if idx and pause:
                time.sleep(pause)
            res = web_search.search(query, cfg=search_cfg, brave_key=brave_key)
            tried = ", ".join(f"{a['engine']}:{a['status']}" for a in res.get("attempts") or []) or "sin motores"
            trace.append(f"«{query}»: {len(res.get('results') or [])} resultado(s) · {tried}")
            for row in res.get("results") or []:
                url = (row.get("url") or "").split("#")[0]
                host = host_of(url)
                if not host or host in seen_hosts or is_blocked_host(host):
                    continue
                seen_hosts.add(host)
                title = (row.get("title") or "")[:300]
                hit = match_existing(index, url, "")
                if hit:
                    existing.setdefault(host, {"name": title or host, "url": url, **_existing_out(hit)})
                    continue
                results.append({"url": url, "title": title, "snippet": (row.get("snippet") or "")[:500], "query": query})

    # 3. Clasificacion
    classified = False
    raw: list[dict] = []
    pool = results[: MAX_CANDIDATES * 2]
    if ai_on and ai_calls < MAX_AI_CALLS:
        ai_calls += 1
        items = ai_classify(req, pool, index, extra=4 if pool else 8)
        if items is not None:
            classified = True
            for item in items:
                url = str(item.get("url") or "").strip()
                if not url.lower().startswith(("http://", "https://")):
                    continue
                item = dict(item)
                item["entry_url"] = url
                item["origin"] = "ia" if fold(item.get("origin") or "") == "ia" else "busqueda"
                raw.append(item)
    if not classified:
        for r in pool:
            raw.append(
                {
                    "name": _site_name(r["title"], r["url"]),
                    "url": r["url"],
                    "entry_url": r["url"],
                    "snippet": r["snippet"],
                    "title": r["title"],
                    "justification": (r["snippet"][:240] or r["title"][:240]).strip(),
                    "query": r["query"],
                    "origin": "busqueda",
                }
            )

    # 4. Filtro deterministico (tambien sobre lo que propone la IA)
    candidates: list[dict] = []
    taken: set[str] = set()
    for item in raw:
        cand = normalize_candidate(item, focus_tech=req.tech_types, region=req.region.strip())
        home = candidate_url(cand["url"])
        host = host_of(home)
        if not home or not host or host in taken or is_blocked_host(host):
            continue
        hit = match_existing(index, cand["url"], cand["name"]) or match_existing(index, home, "")
        if hit:
            existing.setdefault(host, {"name": cand["name"], "url": home, **_existing_out(hit)})
            continue
        taken.add(host)
        entry = cand["entry_url"] if cand["entry_url"] and cand["entry_url"].rstrip("/") != home.rstrip("/") else ""
        cand.update(url=home, entry_url=entry if not web_search.is_document_url(entry) else "")
        candidates.append(cand)
        if len(candidates) >= MAX_CANDIDATES:
            break

    # 5. Alcance
    discarded: list[dict] = []
    if candidates:
        with ThreadPoolExecutor(max_workers=6) as pool_exec:
            checks = list(pool_exec.map(lambda c: check_reachable(c["url"]), candidates))
        kept: list[dict] = []
        for cand, check in zip(candidates, checks):
            cand["reachable"] = check
            (kept if check["ok"] else discarded).append(cand)
        candidates = kept

    if not ai_on:
        message = "IA no disponible: resultados de búsqueda sin clasificar (bloque, país y tipos sugeridos por reglas)."
    elif not classified:
        message = "La IA no respondió a tiempo: resultados de búsqueda clasificados por reglas."
    else:
        message = ""
    if not web_enabled and not candidates and not ai_on:
        message = "No hay IA configurada y la búsqueda web está apagada en Parámetros de fuentes: no hay cómo detectar fuentes."
    return {
        "candidates": candidates,
        "already_in_catalog": list(existing.values()),
        "discarded": [{"name": c["name"], "url": c["url"], "detail": c["reachable"]["detail"]} for c in discarded],
        "ai_used": classified,
        "ai_available": ai_on,
        "ai_calls": ai_calls,
        "queries": queries,
        "query_origin": origin,
        "web_search_enabled": web_enabled,
        "trace": trace,
        "message": message,
        "limits": {"max_queries": max_queries, "max_ai_calls": MAX_AI_CALLS, "max_candidates": MAX_CANDIDATES},
        "ms": int((time.perf_counter() - started) * 1000),
    }


def _existing_out(hit: dict) -> dict:
    return {"source_id": hit["source_id"], "source_title": hit["title"], "match": hit["reason"]}


def _site_name(title: str, url: str) -> str:
    """Nombre del sitio a partir del titulo del resultado ("Inicio | Agencia X" -> "Agencia X")."""
    generic = {"home", "inicio", "homepage", "welcome", "bienvenido", "bienvenidos", "pagina principal"}
    parts = [p.strip() for p in re.split(r"\s[|·–—-]\s", title or "") if p.strip() and fold(p) not in generic]
    if not parts:
        return host_of(url)
    # Con varias partes, el nombre del sitio suele ir al final.
    return parts[-1][:200]
