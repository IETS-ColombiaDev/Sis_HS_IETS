"""Busqueda web impulsada por IA dentro del dominio de cada fuente.

Cuando el listado de una fuente no expone un documento (o el sitio exige
JavaScript), un buscador web suele tenerlo indexado. Para cada fuente:

1. la IA redacta consultas `site:<dominio> <termino>` con el contexto de la
   matriz EH (que consultar, tipos de tecnologia, terminos de la hoja
   "Criterios de busqueda"); sin IA se arman por reglas;
2. los motores se prueban en cascada (Yahoo, DuckDuckGo, DuckDuckGo Lite,
   Bing y, si se configuran, Brave API o un SearXNG propio). Un motor que
   responde con bloqueo o limite de cuota queda en enfriamiento N minutos;
3. solo se conservan resultados del dominio de la fuente (parametrizable) y
   el rastreador los visita como paginas "busqueda".

Nunca lanza: un buscador caido deja la traza y el escaneo continua.
"""
from __future__ import annotations

import base64
import json
import re
import threading
import time
from datetime import date
from urllib.parse import parse_qs, unquote, urlsplit

import httpx
from bs4 import BeautifulSoup

from . import source_profile

_cooldown: dict[str, float] = {}
_lock = threading.Lock()
MAX_QUERY_CHARS = 220


class EngineBlocked(Exception):
    """El motor respondio con bloqueo, desafio o limite de cuota."""


def _headers() -> dict:
    from .scraper import BROWSER_HEADERS

    return dict(BROWSER_HEADERS)


def host_of(url: str) -> str:
    return (urlsplit(url or "").hostname or "").lower().removeprefix("www.")


def in_domain(url: str, domain: str) -> bool:
    host = host_of(url)
    domain = (domain or "").lower().removeprefix("www.")
    return bool(host and domain and (host == domain or host.endswith("." + domain)))


def cooldown_status() -> dict[str, int]:
    """Segundos de enfriamiento restantes por motor."""
    now = time.time()
    with _lock:
        return {k: int(v - now) for k, v in _cooldown.items() if v > now}


def _cool(engine: str, minutes: int) -> None:
    with _lock:
        _cooldown[engine] = time.time() + max(1, minutes) * 60


def _is_cooling(engine: str) -> bool:
    with _lock:
        return _cooldown.get(engine, 0) > time.time()


def reset_cooldowns() -> None:
    with _lock:
        _cooldown.clear()


# --------------------------------------------------------------------------- #
#  Motores
# --------------------------------------------------------------------------- #
def _fetch(url: str, *, params: dict, timeout: float, method: str = "GET", headers: dict | None = None) -> httpx.Response:
    cfg = httpx.Timeout(timeout, connect=min(10.0, timeout))
    with httpx.Client(follow_redirects=True, timeout=cfg, headers=headers or _headers()) as client:
        if method == "POST":
            resp = client.post(url, data=params)
        else:
            resp = client.get(url, params=params)
    if resp.status_code in {202, 403, 429, 500, 502, 503} or resp.status_code >= 400:
        raise EngineBlocked(f"HTTP {resp.status_code}")
    return resp


def _text(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el is not None else ""


def _unwrap_yahoo(href: str) -> str:
    match = re.search(r"/RU=([^/]+)/R[KS]=", href or "")
    return unquote(match.group(1)) if match else href


def _unwrap_ddg(href: str) -> str:
    if not href:
        return ""
    if href.startswith("//"):
        href = "https:" + href
    parts = urlsplit(href)
    if "duckduckgo.com" in (parts.netloc or "") and parts.path.startswith("/l/"):
        target = parse_qs(parts.query).get("uddg", [""])[0]
        return unquote(target) if target else ""
    return href


def _unwrap_bing(href: str) -> str:
    parts = urlsplit(href or "")
    if "bing.com" not in (parts.netloc or "") or not parts.path.startswith("/ck/"):
        return href
    token = parse_qs(parts.query).get("u", [""])[0]
    if token.startswith("a1"):
        token = token[2:]
        try:
            return base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode("utf-8", "replace")
        except (ValueError, UnicodeDecodeError):
            return ""
    return ""


def _yahoo_title(anchor) -> str:
    """El h3 de Yahoo mezcla la miga (dominio > ruta) con el titulo: se quita la miga."""
    if anchor is None:
        return ""
    if anchor.get("aria-label"):
        return anchor["aria-label"].strip()
    clone = BeautifulSoup(str(anchor), "html.parser")
    for el in clone.find_all(["span", "div"]):
        txt = el.get_text(" ", strip=True)
        if "›" in txt or txt.startswith(("http://", "https://")) or re.fullmatch(r"[\w.-]+\.[a-z]{2,}", txt or ""):
            el.decompose()
    return _text(clone) or _text(anchor)


def parse_yahoo(html: str) -> list[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    out: list[dict] = []
    for block in soup.select("div.algo"):
        anchor = block.select_one("h3 a") or block.select_one("a[href]")
        if anchor is None:
            continue
        url = _unwrap_yahoo(anchor.get("href", ""))
        snippet = _text(block.select_one(".compText") or block.select_one("p"))
        out.append({"url": url, "title": _yahoo_title(anchor), "snippet": snippet})
    return out


def parse_ddg(html: str) -> list[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    if soup.select_one(".anomaly-modal__modal") or "anomaly-modal" in (html or "")[:20000]:
        raise EngineBlocked("desafio anti-bot")
    out: list[dict] = []
    for block in soup.select("div.result"):
        anchor = block.select_one("a.result__a")
        if anchor is None:
            continue
        out.append(
            {
                "url": _unwrap_ddg(anchor.get("href", "")),
                "title": _text(anchor),
                "snippet": _text(block.select_one(".result__snippet")),
            }
        )
    return out


def parse_ddg_lite(html: str) -> list[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    if "anomaly-modal" in (html or "")[:20000]:
        raise EngineBlocked("desafio anti-bot")
    links = soup.select("a.result-link")
    snippets = soup.select("td.result-snippet")
    out: list[dict] = []
    for idx, anchor in enumerate(links):
        out.append(
            {
                "url": _unwrap_ddg(anchor.get("href", "")),
                "title": _text(anchor),
                "snippet": _text(snippets[idx]) if idx < len(snippets) else "",
            }
        )
    return out


def parse_bing(html: str) -> list[dict]:
    soup = BeautifulSoup(html or "", "html.parser")
    out: list[dict] = []
    for block in soup.select("li.b_algo"):
        anchor = block.select_one("h2 a")
        if anchor is None:
            continue
        out.append(
            {
                "url": _unwrap_bing(anchor.get("href", "")),
                "title": _text(anchor),
                "snippet": _text(block.select_one(".b_caption p") or block.select_one("p")),
            }
        )
    return out


def _engine_call(engine: str, query: str, *, cfg: dict, brave_key: str) -> list[dict]:
    timeout = float(cfg.get("timeout") or 15)
    count = int(cfg.get("max_results") or 6)
    if engine == "yahoo":
        return parse_yahoo(_fetch("https://search.yahoo.com/search", params={"p": query}, timeout=timeout).text)
    if engine == "duckduckgo":
        return parse_ddg(_fetch("https://html.duckduckgo.com/html/", params={"q": query}, timeout=timeout).text)
    if engine == "duckduckgo_lite":
        return parse_ddg_lite(
            _fetch("https://lite.duckduckgo.com/lite/", params={"q": query}, timeout=timeout, method="POST").text
        )
    if engine == "bing":
        return parse_bing(_fetch("https://www.bing.com/search", params={"q": query}, timeout=timeout).text)
    if engine == "brave_api":
        if not brave_key:
            raise EngineBlocked("sin llave configurada")
        resp = _fetch(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": min(20, count)},
            timeout=timeout,
            headers={"Accept": "application/json", "X-Subscription-Token": brave_key},
        )
        rows = ((resp.json() or {}).get("web") or {}).get("results") or []
        return [{"url": r.get("url", ""), "title": r.get("title", ""), "snippet": r.get("description", "")} for r in rows]
    if engine == "searxng":
        base = (cfg.get("searxng_url") or "").rstrip("/")
        if not base:
            raise EngineBlocked("sin URL configurada")
        resp = _fetch(f"{base}/search", params={"q": query, "format": "json"}, timeout=timeout)
        rows = (resp.json() or {}).get("results") or []
        return [{"url": r.get("url", ""), "title": r.get("title", ""), "snippet": r.get("content", "")} for r in rows]
    raise EngineBlocked("motor desconocido")


def search(query: str, *, cfg: dict, brave_key: str = "") -> dict:
    """Ejecuta una consulta probando los motores en cascada. Nunca lanza."""
    attempts: list[dict] = []
    for engine in cfg.get("engines") or source_profile.DEFAULT_SEARCH["engines"]:
        if _is_cooling(engine):
            attempts.append({"engine": engine, "status": "enfriamiento", "ms": 0, "detail": "motor en pausa tras un bloqueo"})
            continue
        started = time.perf_counter()
        try:
            rows = _engine_call(engine, query, cfg=cfg, brave_key=brave_key)
        except EngineBlocked as exc:
            if engine not in {"brave_api", "searxng"} or "HTTP" in str(exc):
                _cool(engine, int(cfg.get("cooldown_minutes") or 20))
            attempts.append({"engine": engine, "status": "bloqueado", "ms": _ms(started), "detail": str(exc)[:120]})
            continue
        except (httpx.HTTPError, ValueError) as exc:
            attempts.append({"engine": engine, "status": "error", "ms": _ms(started), "detail": type(exc).__name__})
            continue
        except Exception as exc:  # noqa: BLE001
            attempts.append({"engine": engine, "status": "error", "ms": _ms(started), "detail": str(exc)[:120]})
            continue
        clean = [r for r in rows if (r.get("url") or "").lower().startswith(("http://", "https://"))]
        attempts.append({"engine": engine, "status": "ok", "ms": _ms(started), "detail": f"{len(clean)} resultado(s)"})
        if clean:
            return {"engine": engine, "results": clean, "attempts": attempts}
    return {"engine": "", "results": [], "attempts": attempts}


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


# --------------------------------------------------------------------------- #
#  Consultas
# --------------------------------------------------------------------------- #
def search_domain(source, profile: dict) -> str:
    return (profile.get("search_domain") or host_of(getattr(source, "url", "") or "")).strip()


def term_pool(source, profile: dict, cfg: dict) -> list[str]:
    """Terminos candidatos: propios de la fuente, por tipo de tecnologia y genericos."""
    techs = {t.upper() for t in (getattr(source, "tech_types", None) or [])}
    if "MT" in techs or not techs:
        techs |= {"MED", "DM", "BIOM", "IA", "SD", "MT"}
    pool: list[str] = list(profile.get("search_terms") or [])
    for cat in cfg.get("terms_by_category") or []:
        if (cat.get("tech_type") or "MT").upper() in techs:
            pool.extend(cat.get("terms") or [])
    pool.extend(cfg.get("generic_terms") or [])
    seen: set[str] = set()
    out: list[str] = []
    for term in pool:
        key = term.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(term.strip())
    return out


def rule_queries(source, profile: dict, cfg: dict, *, today: date | None = None) -> list[str]:
    """Consultas sin IA. Los terminos rotan por dia para cubrir el abanico entre corridas."""
    domain = search_domain(source, profile)
    if not domain:
        return []
    n = int(cfg.get("max_queries") or 3)
    own = list(profile.get("search_terms") or [])
    pool = term_pool(source, profile, cfg)
    rest = [t for t in pool if t not in own]
    if rest:
        offset = (today or date.today()).toordinal() % len(rest)
        rest = rest[offset:] + rest[:offset]
    terms = (own + rest)[:n] or ["horizon scanning"]
    queries = [f"site:{domain} {t}" for t in terms]
    if cfg.get("prefer_documents") and queries:
        queries[-1] = f"site:{domain} {terms[0]} filetype:pdf"
    return list(dict.fromkeys(queries))


def _sanitize_query(text: str, domain: str) -> str:
    q = re.sub(r"\s+", " ", str(text or "")).strip().strip('"')
    q = re.sub(r"\bsite:\S+", "", q).strip()
    if not q:
        return ""
    return f"site:{domain} {q}"[:MAX_QUERY_CHARS]


def ai_queries(source, profile: dict, cfg: dict, context: str = "") -> list[str]:
    """La IA propone consultas dentro del dominio. Lista vacia si no hay IA o falla."""
    from . import ai_service

    if not cfg.get("ai_queries") or not ai_service.web_assist_enabled():
        return []
    domain = search_domain(source, profile)
    if not domain:
        return []
    n = int(cfg.get("max_queries") or 3)
    terms = term_pool(source, profile, cfg)[:24]
    prompt = (
        f"Fuente de escaneo de horizonte: {getattr(source, 'title', '')}\n"
        f"Dominio: {domain}\n"
        f"{context}\n"
        f"Terminos sugeridos por el IETS: {', '.join(terms)}\n\n"
        f"Redacta hasta {n} consultas para un buscador web que encuentren, DENTRO de {domain}, "
        "paginas o documentos (PDF, informes, fichas, listados de aprobacion, ensayos) sobre "
        "tecnologias sanitarias nuevas o emergentes. Usa el idioma del sitio. "
        f"Cada consulta empieza con site:{domain}. Puedes usar filetype:pdf. "
        "Responde SOLO un JSON array de strings."
    )
    try:
        text, _model = ai_service.generate(
            prompt,
            system="Eres un documentalista experto en busqueda web avanzada para vigilancia tecnologica en salud.",
            temperature=0.3,
            max_tokens=400,
            timeout=40,
        )
    except Exception:  # noqa: BLE001
        return []
    match = re.search(r"\[[\s\S]*?\]", text or "")
    if not match:
        return []
    try:
        items = json.loads(match.group(0))
    except ValueError:
        return []
    out: list[str] = []
    for item in items if isinstance(items, list) else []:
        q = _sanitize_query(item, domain)
        if q and q not in out:
            out.append(q)
        if len(out) >= n:
            break
    return out


def search_for_source(db, source, profile: dict | None = None, *, context: str = "") -> dict:
    """Busqueda web completa de una fuente: consultas, resultados filtrados y traza."""
    cfg = source_profile.load_search(db)
    profile = profile or source_profile.effective_profile(source)
    out = {"enabled": False, "domain": "", "queries": [], "query_origin": "", "results": [], "steps": []}
    if not cfg.get("enabled"):
        out["steps"].append({"action": "busqueda", "url": "", "status": "omitido", "ms": 0, "detail": "Búsqueda web apagada en Parámetros de fuentes"})
        return out
    if not profile.get("web_search"):
        out["steps"].append({"action": "busqueda", "url": "", "status": "omitido", "ms": 0, "detail": "Búsqueda web apagada en el flujo de esta fuente"})
        return out
    domain = search_domain(source, profile)
    out.update({"enabled": True, "domain": domain})
    if not domain:
        out["steps"].append({"action": "busqueda", "url": "", "status": "omitido", "ms": 0, "detail": "La fuente no tiene dominio"})
        return out
    started = time.perf_counter()
    queries = ai_queries(source, profile, cfg, context=context)
    origin = "ia" if queries else "reglas"
    if not queries:
        queries = rule_queries(source, profile, cfg)
    out["queries"], out["query_origin"] = queries, origin
    out["steps"].append(
        {"action": "busqueda", "url": domain, "status": "ok", "ms": _ms(started), "detail": f"{len(queries)} consulta(s) redactadas por {'la IA' if origin == 'ia' else 'reglas'}"}
    )
    brave_key = source_profile.brave_api_key(db)
    limit = int(cfg.get("max_results") or 6)
    known = {(getattr(source, "url", "") or "").rstrip("/")} | {u.rstrip("/") for u in profile.get("entry_urls") or []}
    seen: set[str] = set()
    pause = int(cfg.get("pause_ms") or 0) / 1000.0
    for idx, query in enumerate(queries):
        if len(out["results"]) >= limit:
            break
        if idx and pause:
            time.sleep(pause)
        t0 = time.perf_counter()
        res = search(query, cfg=cfg, brave_key=brave_key)
        kept = 0
        for row in res["results"]:
            url = (row.get("url") or "").split("#")[0]
            key = url.rstrip("/")
            if not url or key in seen or key in known:
                continue
            if cfg.get("same_domain_only") and not in_domain(url, domain):
                continue
            seen.add(key)
            out["results"].append(
                {
                    "url": url,
                    "title": (row.get("title") or "")[:300],
                    "snippet": (row.get("snippet") or "")[:500],
                    "query": query,
                    "engine": res["engine"],
                }
            )
            kept += 1
            if len(out["results"]) >= limit:
                break
        tried = ", ".join(f"{a['engine']}:{a['status']}" for a in res["attempts"]) or "sin motores"
        out["steps"].append(
            {
                "action": "busqueda",
                "url": query,
                "status": "ok" if kept else ("sin_resultados" if res["engine"] else "sin_motor"),
                "ms": _ms(t0),
                "detail": f"{kept} resultado(s) del dominio · {tried}",
            }
        )
    if cfg.get("prefer_documents"):
        out["results"].sort(key=lambda r: 0 if is_document_url(r["url"]) else 1)
    return out


_DOC_RE = re.compile(r"\.(pdf|docx?|xlsx?|pptx?)(\?|$)|/(pdf|download|publication|report|document)s?/", re.I)


def is_document_url(url: str) -> bool:
    return bool(_DOC_RE.search(url or ""))
