"""Busqueda dentro del dominio de una fuente usando su mapa del sitio.

Casi todos los sitios publican `sitemap.xml` (o lo declaran en `robots.txt`) con
la lista de sus paginas y la fecha de ultima modificacion. Leerlo es una consulta
directa a la fuente, no a un buscador: funciona igual desde la nube, no requiere
llave y nadie la bloquea por volumen. Es el respaldo de la busqueda web cuando
Yahoo, Bing y DuckDuckGo responden con bloqueo.

Se puntua cada URL por las palabras de la consulta que aparecen en su ruta (las
propias de la fuente pesan mas que el vocabulario general de horizonte) y por lo
reciente de su ultima modificacion. Nunca lanza: un sitio sin mapa devuelve una
lista vacia y la traza de lo que se intento.

El mapa se lee por partes y solo se conservan las mejores URLs: un sitio con
decenas de miles de paginas no ocupa memoria (Render gratuito tiene 512 MB).
"""
from __future__ import annotations

import gzip
import re
import time
import unicodedata
from datetime import date
from urllib.parse import unquote, urlsplit

import httpx

MAX_BYTES = 4_000_000
MAX_CHILD_MAPS = 6
MAX_URLS_SCANNED = 60_000
TIME_BUDGET_S = 25.0

# Vocabulario general de horizonte (peso 1). Las palabras de la fuente pesan 3.
HORIZON_WORDS = (
    "horizon", "scanning", "emerging", "pipeline", "approval", "approvals", "approved", "novel", "innovation",
    "innovative", "assessment", "technology", "technologies", "breakthrough", "orphan", "authorisation",
    "authorization", "designation", "briefing", "medtech", "horizonte", "emergente", "emergentes", "innovacion",
    "aprobacion", "aprobaciones", "autorizacion", "evaluacion", "tecnologia", "tecnologias", "nuevos", "nuevas",
)
_SKIP_PATH = re.compile(
    r"/(tag|tags|author|autor|login|signin|cart|carrito|search|buscar|feed|wp-json|wp-content|cdn-cgi|"
    r"privacy|cookies?|terms|legal|contact|contacto|careers?|empleo|jobs?)(/|$)",
    re.I,
)
_SKIP_EXT = re.compile(r"\.(jpe?g|png|gif|svg|webp|ico|css|js|mp4|mp3|zip|xml|json|woff2?)(\?|$)", re.I)
_LOC = re.compile(r"<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)", re.I)
_ENTRY = re.compile(r"<(url|sitemap)\b[^>]*>(.*?)</\1>", re.I | re.S)
_LASTMOD = re.compile(r"<lastmod>\s*(\d{4})-(\d{2})-(\d{2})", re.I)


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in text if not unicodedata.combining(ch)).lower()


def query_words(queries: list[str], extra: list[str] | None = None) -> list[str]:
    """Palabras utiles de las consultas (sin operadores) y de la ruta de acceso de la fuente."""
    words: list[str] = []
    for text in list(queries or []) + list(extra or []):
        text = re.sub(r"\b(site|filetype|inurl|intitle):\S+", " ", str(text or ""), flags=re.I)
        for word in re.split(r"[^a-z0-9]+", _norm(text)):
            if len(word) >= 4 and word not in words and word not in {"with", "from", "para", "como", "that", "this"}:
                words.append(word)
    return words[:40]


def _get(client: httpx.Client, url: str) -> str:
    """Texto del recurso (descomprime .gz), con tope de tamano. '' si falla."""
    try:
        with client.stream("GET", url) as resp:
            if resp.status_code >= 400:
                return ""
            chunks: list[bytes] = []
            size = 0
            for chunk in resp.iter_bytes():
                chunks.append(chunk)
                size += len(chunk)
                if size >= MAX_BYTES:
                    break
            raw = b"".join(chunks)
    except (httpx.HTTPError, OSError, ValueError):
        return ""
    if raw[:2] == b"\x1f\x8b":
        try:
            raw = gzip.decompress(raw)[: MAX_BYTES * 4]
        except (OSError, EOFError):
            # Archivo cortado por el tope: se lee lo que alcance a descomprimir.
            try:
                import zlib

                raw = zlib.decompressobj(47).decompress(raw, MAX_BYTES * 4)
            except Exception:  # noqa: BLE001
                return ""
    return raw.decode("utf-8", "replace")


def _score(url: str, own: list[str], lastmod: date | None, today: date) -> int:
    path = _norm(unquote(urlsplit(url).path))
    if not path or path == "/" or _SKIP_EXT.search(path) or _SKIP_PATH.search(path):
        return 0
    tokens = set(re.split(r"[^a-z0-9]+", path))
    score = 3 * sum(1 for w in own if w in tokens or (len(w) >= 6 and w in path))
    score += sum(1 for w in HORIZON_WORDS if w in tokens)
    if score <= 0:
        return 0
    if lastmod is not None:
        age = (today - lastmod).days
        if age <= 400:
            score += 2
        elif age > 1100:
            score -= 2
    return score


def _title(url: str) -> str:
    path = unquote(urlsplit(url).path).rstrip("/")
    slug = re.sub(r"\.(html?|php|aspx?|pdf)$", "", path.rsplit("/", 1)[-1], flags=re.I)
    text = re.sub(r"[-_+]+", " ", slug).strip()
    return (text[:1].upper() + text[1:])[:300] if text else url


def discover(domain: str, words: list[str], *, limit: int = 8, timeout: float = 15.0, base_url: str = "") -> dict:
    """Mejores paginas del mapa del sitio para esas palabras.

    Devuelve `{"results": [{url, title, snippet}], "detail": str, "ms": int}`.
    """
    from .scraper import BROWSER_HEADERS

    started = time.perf_counter()
    domain = (domain or "").lower().removeprefix("www.")
    out = {"results": [], "detail": "", "ms": 0}
    if not domain or not words:
        out["detail"] = "sin dominio o sin palabras de consulta"
        return out
    today = date.today()
    scheme_host = ""
    if base_url:
        parts = urlsplit(base_url)
        if parts.scheme and parts.netloc:
            scheme_host = f"{parts.scheme}://{parts.netloc}"
    roots = [r for r in dict.fromkeys([scheme_host, f"https://{domain}", f"https://www.{domain}"]) if r]
    best: dict[str, tuple[int, date | None]] = {}
    maps_read = scanned = 0

    def deadline() -> bool:
        return time.perf_counter() - started > TIME_BUDGET_S

    def take(xml: str) -> list[str]:
        """Puntua las URLs del mapa; devuelve los mapas hijos si es un indice."""
        nonlocal scanned
        children: list[tuple[int, str]] = []
        for kind, body in _ENTRY.findall(xml):
            loc = _LOC.search(body)
            if not loc:
                continue
            url = loc.group(1).strip().replace("&amp;", "&")
            mod = _LASTMOD.search(body)
            lastmod = None
            if mod:
                try:
                    lastmod = date(int(mod.group(1)), int(mod.group(2)), int(mod.group(3)))
                except ValueError:
                    lastmod = None
            if kind.lower() == "sitemap":
                name = _norm(url)
                rank = 2 * sum(1 for w in words if w in name) + sum(1 for w in HORIZON_WORDS if w in name)
                if lastmod is not None and (today - lastmod).days <= 400:
                    rank += 1
                children.append((rank, url))
                continue
            scanned += 1
            if scanned > MAX_URLS_SCANNED:
                break
            score = _score(url, words, lastmod, today)
            if score > 0 and score >= best.get(url, (0, None))[0]:
                best[url] = (score, lastmod)
                if len(best) > 400:
                    for key, _v in sorted(best.items(), key=lambda kv: kv[1][0])[:200]:
                        best.pop(key, None)
        children.sort(key=lambda item: -item[0])
        return [url for _rank, url in children]

    try:
        from .ingest.base import shared_ssl_context

        verify = shared_ssl_context()
    except Exception:  # noqa: BLE001
        verify = True
    cfg = httpx.Timeout(timeout, connect=min(10.0, timeout))
    try:
        with httpx.Client(follow_redirects=True, timeout=cfg, headers=dict(BROWSER_HEADERS), verify=verify) as client:
            candidates: list[str] = []
            for root in roots:
                robots = _get(client, f"{root}/robots.txt")
                candidates += re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots)
                if candidates or deadline():
                    break
            for root in roots:
                candidates += [f"{root}/sitemap.xml", f"{root}/sitemap_index.xml"]
            queue = list(dict.fromkeys(candidates))
            seen: set[str] = set()
            while queue and maps_read < MAX_CHILD_MAPS + 2 and not deadline() and scanned <= MAX_URLS_SCANNED:
                url = queue.pop(0)
                if url in seen:
                    continue
                seen.add(url)
                xml = _get(client, url)
                if not xml or "<loc" not in xml.lower():
                    continue
                maps_read += 1
                children = take(xml)
                # Los mapas hijos mas prometedores van primero.
                queue = [c for c in children[:MAX_CHILD_MAPS] if c not in seen] + queue
    except Exception as exc:  # noqa: BLE001 - nunca tumba el escaneo
        out["detail"] = f"{type(exc).__name__}"
    ranked = sorted(best.items(), key=lambda kv: (-kv[1][0], -(kv[1][1].toordinal() if kv[1][1] else 0), kv[0]))
    for url, (score, lastmod) in ranked[: max(1, limit)]:
        out["results"].append(
            {
                "url": url,
                "title": _title(url),
                "snippet": f"Mapa del sitio{f' · modificada el {lastmod.isoformat()}' if lastmod else ''}",
            }
        )
    out["ms"] = int((time.perf_counter() - started) * 1000)
    if not out["detail"]:
        out["detail"] = (
            f"{maps_read} mapa(s) leídos, {scanned} URL revisadas, {len(out['results'])} elegidas"
            if maps_read
            else "el sitio no publica mapa del sitio"
        )
    return out
