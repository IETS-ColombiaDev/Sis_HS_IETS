"""Rutas de acceso adicionales a una fuente publica.

El rastreador entra primero con su cliente HTTP normal (httpx). Dos rutas mas
cubren los casos en que eso no basta:

1. **Cliente compatible con navegador** (`curl_cffi`). Muchos sitios publicos
   (fabricantes, agencias, medios) responden 403, 406 o no responden a un
   cliente HTTP de servidor, pero atienden a un navegador corriente: la
   diferencia esta en el saludo TLS y en HTTP/2, no en el contenido. Esta ruta
   repite la descarga con ese saludo. Solo se usa en paginas publicas, respeta
   `robots.txt` y no resuelve retos interactivos (captcha) ni inicia sesion.
   Viene apagada: se enciende en Configuracion > Parametros de fuentes, y el
   servidor puede prohibirla del todo con `BROWSER_FETCH_ENABLED=false`.

2. **Indice oficial de la revista en PubMed** (E-utilities de NCBI). Las
   revistas cientificas con reto anti-robot (NEJM, The Lancet, BMJ, JAMA,
   Cochrane) publican sus articulos en PubMed, que ofrece una API hecha para
   consulta automatica. Con ella se arma un canal con titulo, resumen y enlace
   de lo publicado en los ultimos meses.

Ninguna funcion de este modulo lanza: si una ruta falla, devuelve estado 0 y el
rastreador sigue con la siguiente.
"""
from __future__ import annotations

import html as html_lib
import logging
import threading
import time
from urllib import robotparser
from urllib.parse import quote_plus, urlparse

from .config import settings

log = logging.getLogger(__name__)

try:  # dependencia opcional: sin ella el sistema sigue con el cliente normal
    from curl_cffi import requests as _curl

    _CURL = True
except Exception:  # noqa: BLE001
    _curl = None  # type: ignore
    _CURL = False

# Perfiles que se prueban, en orden. Con el primero basta casi siempre.
PROFILES = ("chrome", "safari")
# Respuestas del cliente normal que justifican probar la ruta de navegador.
ESCALATE_STATUS = {0, 401, 403, 406, 429, 503}
# Una pagina HTML asi de corta es un cascaron que se llena con JavaScript o un aviso de bloqueo.
THIN_HTML_CHARS = 2000
CHALLENGE_MARKERS = ("just a moment", "access denied", "attention required", "cf-chl", "captcha", "are you a robot")
MAX_BODY_BYTES = 8_000_000

_local = threading.local()
_lock = threading.Lock()
# Sitios que solo respondieron por la ruta de navegador: las paginas siguientes van directo por ella.
_browser_hosts: dict[str, float] = {}
BROWSER_HOST_TTL_S = 6 * 3600
_robots: dict[str, tuple[float, robotparser.RobotFileParser | None]] = {}
ROBOTS_TTL_S = 12 * 3600


# Interruptor de Configuracion > Parametros de fuentes. Lo fija `configure` al
# empezar cada fuente; de fabrica esta apagado.
_runtime_enabled = False


def configure(enabled: bool) -> None:
    """Aplica el interruptor guardado en la configuracion."""
    global _runtime_enabled
    _runtime_enabled = bool(enabled)


def configure_from_db(db) -> bool:
    """Lee el interruptor de la base. Nunca lanza."""
    try:
        from . import source_profile

        configure(bool(source_profile.load_search(db).get("browser_fetch")))
    except Exception:  # noqa: BLE001
        pass
    return available()


def available() -> bool:
    """True si la ruta de navegador esta instalada, permitida en el servidor y encendida."""
    return _CURL and bool(getattr(settings, "browser_fetch_enabled", True)) and _runtime_enabled


def status() -> dict:
    """Estado de las rutas para la pantalla de transparencia."""
    return {
        "browser_installed": _CURL,
        "browser_allowed": bool(getattr(settings, "browser_fetch_enabled", True)),
        "browser_enabled": available(),
        "browser_profiles": list(PROFILES),
        "browser_hosts": sorted(h for h, until in _browser_hosts.items() if until > time.monotonic()),
        "journal_index": sorted(JOURNAL_INDEX),
    }


def _host(url: str) -> str:
    return (urlparse(url or "").hostname or "").lower()


def set_via(value: str) -> None:
    _local.via = value


def last_via() -> str:
    """Ruta de la ultima descarga de este hilo: `directo` o `navegador`."""
    return getattr(_local, "via", "directo")


def prefers_browser(url: str) -> bool:
    return available() and _browser_hosts.get(_host(url), 0.0) > time.monotonic()


def _remember(url: str) -> None:
    host = _host(url)
    if host:
        with _lock:
            _browser_hosts[host] = time.monotonic() + BROWSER_HOST_TTL_S


def forget_hosts() -> None:
    with _lock:
        _browser_hosts.clear()
        _robots.clear()


def looks_blocked(status_code: int, content_type: str, text: str) -> bool:
    """True si la respuesta es un bloqueo, un reto o un cascaron sin contenido."""
    if status_code in ESCALATE_STATUS:
        return True
    if not (0 < status_code < 400):
        return False
    if "html" not in (content_type or ""):
        return False
    body = (text or "").strip()
    if len(body) < THIN_HTML_CHARS:
        return True
    head = body[:3000].lower()
    return len(body) < 8000 and any(marker in head for marker in CHALLENGE_MARKERS)


def robots_allows(url: str) -> bool:
    """Consulta robots.txt del sitio (agente `*`). Si no se puede leer, se permite."""
    parts = urlparse(url or "")
    host = (parts.hostname or "").lower()
    if not host:
        return True
    now = time.monotonic()
    cached = _robots.get(host)
    if cached is None or cached[0] < now:
        parser: robotparser.RobotFileParser | None = None
        try:
            resp = _curl.get(  # type: ignore[union-attr]
                f"{parts.scheme or 'https'}://{parts.netloc}/robots.txt", impersonate=PROFILES[0], timeout=10
            )
            body = resp.text if resp.status_code == 200 else ""
            if body and "<html" not in body[:400].lower():
                parser = robotparser.RobotFileParser()
                parser.parse(body.splitlines())
        except Exception:  # noqa: BLE001 - sin robots.txt legible no hay restriccion declarada
            parser = None
        with _lock:
            _robots[host] = (now + ROBOTS_TTL_S, parser)
        cached = _robots[host]
    parser = cached[1]
    if parser is None:
        return True
    try:
        return parser.can_fetch("*", url)
    except Exception:  # noqa: BLE001
        return True


def browser_get(url: str, timeout: float = 25.0, *, quick: bool = False) -> tuple[int, str, str, bytes]:
    """Descarga con saludo de navegador. (estado, tipo, texto, bytes); estado 0 si no entro.

    `quick` prueba un solo perfil con menos espera: se usa cuando el cliente
    normal ni siquiera obtuvo respuesta, para no duplicar la espera de un sitio caido.
    """
    if not available():
        return 0, "", "", b""
    if not robots_allows(url):
        log.info("robots.txt no permite %s: no se usa la ruta de navegador", url[:160])
        return 0, "robots", "", b""
    best: tuple[int, str, str, bytes] = (0, "", "", b"")
    profiles = PROFILES[:1] if quick else PROFILES
    wait = min(float(timeout), 15.0) if quick else float(timeout)
    for profile in profiles:
        try:
            resp = _curl.get(  # type: ignore[union-attr]
                url,
                impersonate=profile,
                timeout=wait,
                allow_redirects=True,
                headers={"Accept-Language": "es-CO,es;q=0.9,en;q=0.8"},
            )
        except Exception as exc:  # noqa: BLE001
            log.debug("Ruta de navegador (%s) sin respuesta en %s: %s", profile, url[:120], type(exc).__name__)
            if quick:
                break
            continue
        raw = (resp.content or b"")[:MAX_BODY_BYTES]
        content_type = (resp.headers.get("content-type") or "").lower()
        text = ""
        if "pdf" not in content_type and "octet-stream" not in content_type:
            try:
                text = resp.text or ""
            except Exception:  # noqa: BLE001
                text = raw.decode("utf-8", errors="replace")
        result = (int(resp.status_code), content_type, text, raw)
        if 0 < result[0] < 400 and not _is_challenge(result[0], content_type, text):
            _remember(url)
            return result
        if best[0] == 0:
            best = result
    return best


def _is_challenge(status_code: int, content_type: str, text: str) -> bool:
    if "html" not in (content_type or ""):
        return False
    head = (text or "")[:3000].lower()
    return len(text or "") < 8000 and any(marker in head for marker in CHALLENGE_MARKERS)


# --------------------------------------------------------------------------- #
#  Indice oficial de revistas (PubMed / NCBI E-utilities)
# --------------------------------------------------------------------------- #
# Dominio de la revista -> filtro de PubMed. Los mas especificos van primero.
JOURNAL_INDEX: dict[str, str] = {
    "innovations.bmj.com": '"BMJ Innov"[jour]',
    "nejm.org": '"N Engl J Med"[jour]',
    "thelancet.com": '"Lancet"[jour]',
    "bmj.com": '"BMJ"[jour]',
    "jamanetwork.com": '"JAMA"[jour]',
    "cochranelibrary.com": '"Cochrane Database Syst Rev"[jour]',
}
PUBMED_SEARCH = "https://pubmed.ncbi.nlm.nih.gov/"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
JOURNAL_DAYS = 120
JOURNAL_MAX = 40
TOOL = "iets-horizon-scanning"


def journal_term(url: str) -> str:
    host = _host(url).removeprefix("www.")
    for domain, term in JOURNAL_INDEX.items():
        if host == domain or host.endswith("." + domain):
            return term
    return ""


def journal_index_url(url: str) -> str:
    """Direccion (legible por una persona) del indice de la revista en PubMed. '' si no aplica."""
    term = journal_term(url)
    return f"{PUBMED_SEARCH}?term={quote_plus(term)}&sort=date&filter=dates.{JOURNAL_DAYS}d" if term else ""


def is_journal_index(url: str) -> bool:
    return (url or "").startswith(PUBMED_SEARCH + "?term=") and "%5Bjour%5D" in (url or "")


def _term_of(index_url: str) -> str:
    from urllib.parse import parse_qs

    return (parse_qs(urlparse(index_url).query).get("term") or [""])[0]


def fetch_journal_index(index_url: str, timeout: float = 25.0) -> tuple[int, str, str, bytes]:
    """Canal RSS armado con lo publicado por la revista en PubMed (titulo, resumen, enlace)."""
    import httpx
    from bs4 import BeautifulSoup

    term = _term_of(index_url)
    if not term:
        return 0, "", "", b""
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True, headers={"User-Agent": TOOL}) as client:
            found = client.get(
                f"{EUTILS}/esearch.fcgi",
                params={
                    "db": "pubmed", "term": term, "retmax": JOURNAL_MAX, "sort": "pub_date",
                    "retmode": "json", "datetype": "edat", "reldate": JOURNAL_DAYS, "tool": TOOL,
                },
            )
            if found.status_code != 200:
                return found.status_code, "", "", b""
            ids = (found.json().get("esearchresult") or {}).get("idlist") or []
            if not ids:
                return 200, "application/rss+xml", _rss(term, index_url, []), b""
            detail = client.get(
                f"{EUTILS}/efetch.fcgi",
                params={"db": "pubmed", "id": ",".join(ids), "retmode": "xml", "tool": TOOL},
            )
            if detail.status_code != 200:
                return detail.status_code, "", "", b""
        soup = BeautifulSoup(detail.text, "xml")
        items = []
        for article in soup.find_all("PubmedArticle"):
            pmid = article.find("PMID")
            title = article.find("ArticleTitle")
            if pmid is None or title is None:
                continue
            abstract = " ".join(node.get_text(" ", strip=True) for node in article.find_all("AbstractText"))
            date = article.find("PubDate")
            when = " ".join(part.get_text(strip=True) for part in date.find_all(["Year", "Month", "Day"])) if date else ""
            items.append(
                {
                    "title": title.get_text(" ", strip=True),
                    "link": f"{PUBMED_SEARCH}{pmid.get_text(strip=True)}/",
                    "summary": abstract[:1500],
                    "date": when,
                }
            )
        return 200, "application/rss+xml", _rss(term, index_url, items), b""
    except Exception as exc:  # noqa: BLE001
        log.info("Indice de PubMed sin respuesta para %s: %s", term, type(exc).__name__)
        return 0, "", "", b""


def _rss(term: str, link: str, items: list[dict]) -> str:
    esc = html_lib.escape
    body = "".join(
        f"<item><title>{esc(i['title'])}</title><link>{esc(i['link'])}</link>"
        f"<description>{esc(i['summary'])}</description><pubDate>{esc(i['date'])}</pubDate></item>"
        for i in items
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
        f"<title>PubMed: {esc(term)}</title><link>{esc(link)}</link>{body}</channel></rss>"
    )
