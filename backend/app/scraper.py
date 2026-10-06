"""Servicio de web scraping para el escaneo de horizonte.

Extrae de cada fuente los items candidatos (tecnologias / briefings / titulares)
relacionados con escaneo de horizonte, los clasifica heuristicamente por horizonte
y tipo de tecnologia, y los persiste como 'hallazgos' (Finding), evitando duplicados
mediante un hash de contenido.
"""
from __future__ import annotations

import hashlib
import io
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, urlunparse
import time

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from .models import Finding, ScrapeLog, Source
from .priority import compute_screening_score
from .technology_service import sync_technology_from_finding

try:  # extraccion robusta de contenido principal de paginas web
    import trafilatura

    _TRAFILATURA = True
except Exception:  # noqa: BLE001
    trafilatura = None  # type: ignore
    _TRAFILATURA = False

try:  # extraccion de texto de documentos PDF
    from pypdf import PdfReader

    _PYPDF = True
except Exception:  # noqa: BLE001
    PdfReader = None  # type: ignore
    _PYPDF = False

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
BROWSER_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7",
    "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
}
MAX_BODY_BYTES = 8_000_000
MAX_HTML_CHARS = 1_500_000
RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}

MAX_ITEMS_PER_SOURCE = 40

# --------------------------------------------------------------------------- #
#  Heuristicas de clasificacion
# --------------------------------------------------------------------------- #
_HORIZON_INMINENTE = re.compile(
    r"\b(launch|approv|marketing author[iz]ation|registro sanitario|aprobad|autorizad|pivotal|phase\s*iii|phase\s*3|fase\s*iii|regulatory|nice ta\b|chmp|positive opinion|fda approv|ema approv|recommend)\b",
    re.I,
)
_HORIZON_EMERGENTE = re.compile(
    r"\b(preclinic|pre-clinic|early[- ]stage|phase\s*i\b|phase\s*1\b|fase\s*i\b|phase\s*i/ii|discovery|first-in-human|pipeline|proof of concept)\b",
    re.I,
)
_HORIZON_TRANSICIONAL = re.compile(
    r"\b(phase\s*ii\b|phase\s*2\b|fase\s*ii\b|clinical trial|ensayo cl[ií]nico|in development|under (review|evaluation))\b",
    re.I,
)

# Sufijos tipicos de denominaciones comunes internacionales (INN) de medicamentos.
_DRUG_SUFFIX = re.compile(
    r"\b\w+(mab|nib|tinib|ciclib|gepant|zumab|ximab|parib|vir|stat|prazole|gliflozin|glutide|sertib|lisib|degib|denib|afenib|racetam|sen|tide|limus|ase|kinra|cel|gene)\b",
    re.I,
)
_TYPE_DISPOSITIVO = re.compile(
    r"\b(device|dispositiv|implant|wearable|sensor|equipo|medtech|instrument|catheter|cat[eé]ter|robot|imaging|imagen|scanner|prosthes|pr[oó]tesis|stent|pump|monitor|diagnostic kit)\b",
    re.I,
)
_TYPE_DIGITAL = re.compile(
    r"\b(digital|artificial intelligence|inteligencia artificial|\bai\b|\bia\b|software|algorithm|algoritmo|machine learning|deep learning|telemedic|telehealth|teleconsult|\bapp\b|mobile health|mhealth|plataforma digital|chatbot|dtx|digital therapeutic)\b",
    re.I,
)
_TYPE_MEDICAMENTO = re.compile(
    r"\b(drug|medicine|medicament|therap|terapia|treatment|tratamiento|vaccin|vacuna|antibod|anticuerp|inhibitor|inhibidor|biolog|farmac|monoclonal|cell therapy|terapia celular|gene therapy|terapia g[eé]nica|car-?t|oncolog|molecul)\b",
    re.I,
)

# Patron fuerte de "tecnologia": "<X> for/para <indicacion>", propio de briefings.
_TECH_PATTERN = re.compile(
    r"\b(for (the )?(treat|prevent|manag|treating|treatment|prevention)|para (el |la )?(tratamiento|prevenci[oó]n|manejo)|in (patients|adults|children)|en pacientes)\b",
    re.I,
)

_HS_RELEVANCE = re.compile(
    r"(horizon|escaneo|emerg|briefing|dashboard|technolog|tecnolog|innovat|innovac|medic|device|dispositiv|drug|therap|terapia|trial|ensayo|scan|watch|pipeline|alert|cancer|c[aá]ncer|disease|enfermedad|treatment|tratamiento)",
    re.I,
)

# Textos que son navegacion / secciones y NO tecnologias.
_JUNK = re.compile(
    r"^(home|inicio|in[ií]cio|menu|men[uú]|contact|contacto|contato|about|acerca|log ?in|iniciar|sign in|register|regist|search|buscar|pesquisar|cookie|privacy|privacid|privacidade|terms|t[eé]rminos|subscribe|suscri|inscreva|read more|leer m[aá]s|ver m[aá]s|veja mais|saiba mais|leia mais|acesse|find out more|learn more|next|previous|anterior|siguiente|pr[oó]xim|skip to|volver|voltar|share|compartir|compartilh|links de|redes sociais|follow us|s[ií]guenos|newsletter|bolet[ií]n|get in touch|fale conosco|our (team|mission|values|networks|work|stakeholders)|meet the team|who we are|what we do|latest|resources|events|news|not[ií]cias|explore|engage|mapa do site|ouvidoria|acessibilidade|p[aá]gina (inicial|principal))\b",
    re.I,
)
# Frases-etiqueta genericas de seccion de horizon scanning que no son un hallazgo.
_SECTION_LABEL = re.compile(
    r"^(emerging|transitional|imminent|near)?\s*horizon(s)?$|"
    r"^(emerging|transitional|imminent) horizon$|"
    r"^horizon scanning( facility| initiative)?$|"
    r"^what is horizon scanning\??$|"
    r"^a world leading",
    re.I,
)
# Paginas de error / desafio de bot / mensajes tecnicos que no son hallazgos.
_BLOCK = re.compile(
    r"(please try again|try again later|enable javascript|javascript is (disabled|required)|"
    r"habilit[ae] javascript|javascript (esta|está) (desactivad|deshabilitad)|"
    r"access denied|are you a (robot|human)|just a moment|un momento|aguarde um momento|"
    r"checking your browser|comprobando tu navegador|verificando (tu|su) navegador|verificando o navegador|"
    r"verifying you are human|verificando que eres humano|"
    r"403 forbidden|\b404\b|page not found|not found|cloudflare|captcha|recaptcha|"
    r"error occurred|ha ocurrido un error|ocorreu um erro|sin conexi|no se encontr|acceso denegado|"
    r"too many requests|rate limit|loading\.\.\.|cargando|redirecting|redireccionando)",
    re.I,
)

_DATE_RE = re.compile(
    r"\b(january|february|march|april|may|june|july|august|september|october|november|december|"
    r"enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}\b"
    r"|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b",
    re.I,
)


def _classify_horizon(text: str) -> str:
    if _HORIZON_INMINENTE.search(text):
        return "inminente"
    if _HORIZON_TRANSICIONAL.search(text):
        return "transicional"
    if _HORIZON_EMERGENTE.search(text):
        return "emergente"
    return ""


def _classify_type(text: str) -> str:
    if _TYPE_DIGITAL.search(text):
        return "digital"
    if _TYPE_DISPOSITIVO.search(text):
        return "dispositivo"
    if _TYPE_MEDICAMENTO.search(text) or _DRUG_SUFFIX.search(text):
        return "medicamento"
    # "<X> for treating/prevention of <indicacion>" sin dispositivo/digital => medicamento.
    if _TECH_PATTERN.search(text):
        return "medicamento"
    return "otro"


def _relevance_score(text: str) -> int:
    """Puntua que tan probable es que un texto sea una tecnologia/senal real."""
    if _JUNK.match(text) or _SECTION_LABEL.match(text) or _BLOCK.search(text):
        return -100
    words = text.split()
    if len(words) < 3 or len(words) > 45:
        return -100
    score = 0
    if _TECH_PATTERN.search(text):
        score += 5
    if _DRUG_SUFFIX.search(text):
        score += 4
    if _TYPE_MEDICAMENTO.search(text) or _TYPE_DISPOSITIVO.search(text) or _TYPE_DIGITAL.search(text):
        score += 2
    if _HORIZON_INMINENTE.search(text) or _HORIZON_TRANSICIONAL.search(text) or _HORIZON_EMERGENTE.search(text):
        score += 2
    if _HS_RELEVANCE.search(text):
        score += 1
    # Titulos capitalizados tipo nombre propio (probable tecnologia).
    if re.match(r"^[A-Z][a-z]+", text) and len(words) >= 4:
        score += 1
    return score


def _hash(*parts: str) -> str:
    norm = "|".join(re.sub(r"\s+", " ", (p or "").strip().lower()) for p in parts)
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()[:32]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


# --------------------------------------------------------------------------- #
#  Descarga
# --------------------------------------------------------------------------- #
def _decode_body(raw: bytes, content_type: str, declared: str = "") -> str:
    if not raw:
        return ""
    candidates = [declared, "utf-8", "latin-1", "cp1252"]
    if "charset=" in (content_type or ""):
        candidates.insert(0, content_type.split("charset=", 1)[-1].split(";")[0].strip(" \"'"))
    seen: set[str] = set()
    for enc in candidates:
        name = (enc or "").strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        try:
            return raw.decode(name)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def fetch_url(url: str, timeout: float | None = None) -> tuple[int, str, str, bytes]:
    """Descarga con reintentos. Nunca lanza: si falla, status 0 y cuerpo vacio."""
    from . import prompt_store

    timeout = float(timeout if timeout is not None else prompt_store.fetch_timeout())
    attempts = int(prompt_store.retries()) + 1
    last_status = 0
    last_type = ""
    last_raw = b""
    for attempt in range(attempts):
        try:
            cfg = httpx.Timeout(timeout, connect=min(10.0, timeout), read=timeout, write=min(15.0, timeout))
            with httpx.Client(follow_redirects=True, timeout=cfg, headers=BROWSER_HEADERS) as client:
                resp = client.get(url)
            raw = resp.content or b""
            if len(raw) > MAX_BODY_BYTES:
                raw = raw[:MAX_BODY_BYTES]
            content_type = (resp.headers.get("content-type") or "").lower()
            last_status, last_type, last_raw = resp.status_code, content_type, raw
            if resp.status_code in RETRYABLE_STATUS and attempt < attempts - 1:
                wait = min(8.0, 0.6 * (attempt + 1))
                retry_after = resp.headers.get("Retry-After")
                try:
                    wait = max(wait, min(8.0, float(retry_after)))
                except (TypeError, ValueError):
                    pass
                time.sleep(wait)
                continue
            text = ""
            if "pdf" not in content_type and "octet-stream" not in content_type:
                text = _decode_body(raw, content_type, getattr(resp, "encoding", "") or "")
                if len(text) > MAX_HTML_CHARS:
                    text = text[:MAX_HTML_CHARS]
            return resp.status_code, content_type, text, raw
        except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError, httpx.HTTPError):
            if attempt < attempts - 1:
                time.sleep(min(8.0, 0.7 * (attempt + 1)))
                continue
            return last_status or 0, last_type, "", last_raw
        except Exception:  # noqa: BLE001
            return last_status or 0, last_type, "", last_raw
    return last_status or 0, last_type, "", last_raw


# --------------------------------------------------------------------------- #
#  Rastreo profundo (entra a listados y sigue hasta la ficha)
# --------------------------------------------------------------------------- #
_SKIP_EXT = (
    ".css", ".js", ".mjs", ".map", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    ".ico", ".woff", ".woff2", ".ttf", ".mp4", ".mp3", ".zip", ".rar", ".xml",
)
_SKIP_PATH = re.compile(
    r"/(login|signin|signup|register|cart|checkout|privacy|cookie|terms|contacto?|"
    r"javascript:|mailto:|#|account|perfil|share|twitter|facebook|linkedin)",
    re.I,
)
_ARTICLE_HINT = re.compile(
    r"/(news|noticia|brief|alert|report|informe|articl|publicat|press|pipeline|"
    r"horizon|technolog|tecnolog|drug|trial|ensayo|watch|bulletin|boletin|"
    r"update|novedad|document|ficha|evaluac|hta|guidance)/",
    re.I,
)
_PAGINATION_LABEL = re.compile(
    r"^(next|siguiente|pr[oó]xim[ao]|mais|ver m[aá]s|older|más recientes|page\s*\d+)$",
    re.I,
)


def _same_host(a: str, b: str) -> bool:
    ha = (urlparse(a).netloc or "").lower().removeprefix("www.")
    hb = (urlparse(b).netloc or "").lower().removeprefix("www.")
    return bool(ha and ha == hb)


def _normalize_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return urlunparse((parsed.scheme, parsed.netloc, path, "", parsed.query, ""))


def _follow_skip(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").strip("[]").lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        return True
    path = (parsed.path or "").lower()
    if any(path.endswith(ext) for ext in _SKIP_EXT):
        return True
    if _SKIP_PATH.search(path):
        return True
    return False


def _fold(text: str) -> str:
    import unicodedata

    raw = unicodedata.normalize("NFKD", text or "")
    raw = "".join(ch for ch in raw if not unicodedata.combining(ch)).lower()
    return re.sub(r"[\s_\-/]+", " ", raw).strip()


def keyword_hits(href: str, text: str, keywords: list[str] | None) -> int:
    """Cuantas palabras guia (ruta de acceso de la matriz) aparecen en el enlace."""
    if not keywords:
        return 0
    hay = _fold(f"{urlparse(href).path} {text}")
    hits = 0
    for kw in keywords:
        words = [w for w in _fold(kw).split() if len(w) > 2]
        if words and all(w in hay for w in words):
            hits += 1
    return hits


def score_follow_urls(
    html: str,
    base_url: str,
    keywords: list[str] | None = None,
) -> list[tuple[int, str]]:
    """(puntaje, url) de los enlaces internos, de mayor a menor."""
    if not html or not base_url:
        return []
    soup = BeautifulSoup(html, "lxml")
    landing = _normalize_url(base_url)
    scored: list[tuple[int, str]] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = urljoin(base_url, a["href"].strip())
        if not href.lower().startswith(("http://", "https://")):
            continue
        if not _same_host(href, base_url) or _follow_skip(href):
            continue
        href = _normalize_url(href)
        if href == landing or href in seen:
            continue
        seen.add(href)
        text = _clean(a.get_text())
        score = 0
        if _ARTICLE_HINT.search(urlparse(href).path) or _ARTICLE_HINT.search(text):
            score += 6
        rel_score = _relevance_score(text) if text else 0
        if rel_score > 0:
            score += min(rel_score, 8)
        if len(urlparse(href).path) > 24:
            score += 2
        if a.find_parent(["article", "li"]):
            score += 1
        hits = keyword_hits(href, text, keywords)
        if hits:
            score += 7 + 2 * min(hits, 3)
        if score >= 2:
            scored.append((score, href))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored


def collect_follow_urls(
    html: str,
    base_url: str,
    limit: int = 16,
    keywords: list[str] | None = None,
) -> list[str]:
    """Enlaces internos de un listado que parecen fichas, noticias o informes."""
    out: list[str] = []
    for _score, href in score_follow_urls(html, base_url, keywords):
        if href not in out:
            out.append(href)
        if len(out) >= limit:
            break
    return out


def collect_pagination_urls(html: str, base_url: str, limit: int = 2) -> list[str]:
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    landing = _normalize_url(base_url)
    found: list[str] = []
    for a in soup.find_all("a", href=True):
        rel = " ".join(a.get("rel") or []).lower()
        label = _clean(a.get_text())
        if "next" not in rel and not _PAGINATION_LABEL.match(label):
            continue
        href = _normalize_url(urljoin(base_url, a["href"].strip()))
        if href == landing or not _same_host(href, base_url) or _follow_skip(href):
            continue
        if href not in found:
            found.append(href)
        if len(found) >= limit:
            break
    return found


def _page_payload(url: str, html: str = "", content_type: str = "", raw: bytes | None = None) -> dict:
    title = ""
    text = ""
    is_pdf = "pdf" in (content_type or "") or url.lower().endswith(".pdf")
    if is_pdf and raw:
        text = extract_pdf_text(raw)
        title = "Documento PDF"
    elif html:
        soup = BeautifulSoup(html, "lxml")
        title = _clean(soup.title.get_text()) if soup.title else ""
        text = extract_main_text(html, url)
        if not text:
            for tag in soup(["script", "style", "noscript", "nav", "header", "footer"]):
                tag.decompose()
            text = _clean(soup.get_text(" ", strip=True))
        if text and _BLOCK.search(text[:400]):
            text = ""
    return {"url": url, "title": title, "text": text, "html": html}


MAX_ENTRY_URLS = 12


def crawl_site(
    landing_url: str,
    html: str = "",
    *,
    max_pages: int | None = None,
    max_chars: int | None = None,
    entry_urls: list[str] | None = None,
    follow_keywords: list[str] | None = None,
    search_results: list[dict] | None = None,
    follow_links: bool = True,
    fetch_results: int | None = None,
) -> dict:
    """Entra a la URL y visita fichas internas hasta agotar el cupo de paginas.

    Orden del recorrido: pagina principal, URLs de entrada de la matriz EH,
    resultados de la busqueda web y, al final, los enlaces internos mejor
    puntuados (las palabras de la ruta de acceso suben su puntaje). El cupo
    `max_pages` limita los enlaces seguidos; las URLs de entrada y los
    resultados de busqueda tienen su propio tope.
    """
    from . import prompt_store

    max_pages = max(1, int(max_pages or prompt_store.max_pages()))
    max_chars = max(1000, int(max_chars or prompt_store.max_chars()))
    child_timeout = prompt_store.child_timeout()
    pause = prompt_store.pause_ms() / 1000.0
    pages: list[dict] = []
    visited: set[str] = set()
    steps: list[dict] = []
    landing = _normalize_url(landing_url)
    keywords = [k for k in (follow_keywords or []) if k and k.strip()]

    def note(action: str, url: str = "", status: str = "", ms: int = 0, detail: str = "") -> None:
        steps.append({"action": action, "url": url, "status": status, "ms": ms, "detail": detail})

    def add_page(
        url: str,
        page_html: str = "",
        content_type: str = "",
        raw: bytes | None = None,
        role: str = "",
    ) -> dict | None:
        key = _normalize_url(url)
        if key in visited:
            return None
        visited.add(key)
        payload = _page_payload(url, page_html, content_type, raw)
        payload["role"] = role
        pages.append(payload)
        return payload

    def visit_child(url: str, *, role: str) -> tuple[int, str, str]:
        started = time.perf_counter()
        try:
            status, ctype, text, raw = fetch_url(url, timeout=child_timeout)
        except Exception as exc:  # noqa: BLE001
            ms = int((time.perf_counter() - started) * 1000)
            note(role, url, "error", ms, str(exc)[:200])
            return 0, "", ""
        ms = int((time.perf_counter() - started) * 1000)
        if status == 0:
            note(role, url, "sin_conexion", ms, "El sitio no respondio tras los reintentos")
            return status, ctype, text
        if status >= 400:
            note(role, url, f"http_{status}", ms, "Pagina omitida; el rastreo continua")
            return status, ctype, text
        if _normalize_url(url) in visited:
            note(role, url, "repetida", ms, "La pagina ya estaba en el corpus")
            return status, ctype, text
        added = add_page(url, text, ctype, raw, role=role)
        chars = len((added or {}).get("text") or "")
        note(role, url, "ok", ms, f"{chars} caracteres extraidos")
        return status, ctype, text

    if html:
        add_page(landing_url, html, role="entrada")
        note("entrada", landing_url, "ok", 0, "HTML de entrada ya descargado")
    else:
        status, ctype, text, raw = visit_child(landing_url, role="entrada")
        html = text if status and status < 400 else ""

    # Paginas de las que se siguen enlaces: la principal y cada URL de entrada.
    sources_html: list[tuple[str, str]] = [(landing_url, html)] if html else []
    entries = [u for u in (entry_urls or []) if u and _normalize_url(u) != landing][:MAX_ENTRY_URLS]
    if entries:
        note("ruta", landing_url, "ok", 0, f"{len(entries)} URL(s) de entrada de la matriz EH")
    for url in entries:
        if pause:
            time.sleep(pause)
        status, ctype, text = visit_child(url, role="entrada_matriz")
        if status and status < 400 and text:
            sources_html.append((url, text))

    results = list(search_results or [])
    cap = len(results) if fetch_results is None else max(0, int(fetch_results))
    for row in results[:cap]:
        url = row.get("url") or ""
        if not url or _follow_skip(url):
            continue
        if pause:
            time.sleep(pause)
        visit_child(url, role="busqueda")

    budget = len(pages) + max_pages
    if follow_links and sources_html:
        scored: list[tuple[int, str]] = []
        for base, body in sources_html:
            scored.extend(score_follow_urls(body, base, keywords))
        best: dict[str, int] = {}
        for score, href in scored:
            best[href] = max(score, best.get(href, 0))
        follow = [h for h, _s in sorted(best.items(), key=lambda kv: kv[1], reverse=True)][: max(4, max_pages * 2)]
        guided = sum(1 for h in follow if keyword_hits(h, "", keywords))
        detail = f"{len(follow)} fichas internas candidatas"
        if keywords:
            detail += f"; {guided} coinciden con la ruta de acceso"
        note("enlaces", landing_url, "ok", 0, detail)
        if len(follow) < 3 and html:
            for next_url in collect_pagination_urls(html, landing_url, limit=1):
                if len(pages) >= budget:
                    break
                if pause:
                    time.sleep(pause)
                status, ctype, text = visit_child(next_url, role="paginacion")
                if status and status < 400 and text:
                    follow.extend(collect_follow_urls(text, next_url, limit=max_pages, keywords=keywords))

        seen_follow: set[str] = set()
        for href in follow:
            if len(pages) >= budget:
                break
            if href in seen_follow or _normalize_url(href) in visited:
                continue
            seen_follow.add(href)
            if pause:
                time.sleep(pause)
            visit_child(href, role="ficha")
    elif not follow_links:
        note("enlaces", landing_url, "omitido", 0, "Seguir enlaces internos esta apagado para esta fuente")

    snippets = ""
    if results:
        lines = [
            f"- {r.get('title') or r.get('url')} | {r.get('url')} | {(r.get('snippet') or '')[:240]}"
            for r in results
        ]
        snippets = "## Resultados de busqueda web en el dominio\n" + "\n".join(lines)
        snippets = snippets[: min(4000, max_chars // 4)]

    chunks: list[str] = []
    used = len(snippets)
    for page in pages:
        body = (page.get("text") or "").strip()
        if not body:
            continue
        header = f"## Pagina: {page['url']}\nTitulo: {page.get('title') or ''}\n"
        piece = header + body
        remain = max_chars - used
        if remain <= 200:
            break
        if len(piece) > remain:
            piece = piece[:remain]
        chunks.append(piece)
        used += len(piece)

    if snippets:
        chunks.append(snippets)
    combined = "\n\n".join(chunks)
    by_url = {_normalize_url(p["url"]): p for p in pages}
    roles: dict[str, int] = {}
    for p in pages:
        roles[p.get("role") or "entrada"] = roles.get(p.get("role") or "entrada", 0) + 1
    breakdown = ", ".join(f"{v} {k}" for k, v in roles.items())
    note("corpus", landing_url, "ok", 0, f"{len(pages)} pagina(s) ({breakdown or 'ninguna'}), {len(combined)} caracteres")
    return {
        "landing_url": landing_url,
        "pages": pages,
        "pages_visited": len(pages),
        "combined": combined,
        "by_url": by_url,
        "steps": steps,
        "search_results": results,
    }


def apply_crawled_text(findings: list[dict], crawl: dict | None) -> list[dict]:
    """Rellena resumen y crudo con el texto real de la ficha visitada."""
    if not findings or not crawl:
        return findings
    by_url = crawl.get("by_url") or {}
    landing = _normalize_url(crawl.get("landing_url") or "")
    for item in findings:
        href = _normalize_url(item.get("url") or "")
        page = by_url.get(href) if href and href != landing else None
        if not page:
            continue
        body = _clean(page.get("text") or "")
        if not body:
            continue
        if not (item.get("raw_content") or "").strip():
            item["raw_content"] = body[:5000]
        summary = (item.get("summary") or "").strip()
        if len(summary) < 80:
            item["summary"] = _summarize(body, 500)
    return findings


# --------------------------------------------------------------------------- #
#  Extraccion
# --------------------------------------------------------------------------- #
def extract_candidates(source: Source, html: str) -> list[dict]:
    if html and len(html) > MAX_HTML_CHARS:
        html = html[:MAX_HTML_CHARS]
    soup = BeautifulSoup(html, "lxml")

    for tag in soup(["script", "style", "noscript", "nav", "header", "footer"]):
        tag.decompose()

    page_title = _clean(soup.title.get_text()) if soup.title else source.title
    meta_desc = ""
    md = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    if md and md.get("content"):
        meta_desc = _clean(md["content"])

    # Contenido principal (article) extraido con trafilatura -> mejores resumenes.
    main_text = extract_main_text(html, source.url)
    if not meta_desc and main_text:
        meta_desc = _summarize(main_text, 500)

    seen: set[str] = set()
    scored: list[tuple[int, dict]] = []

    def consider(text: str, el):
        text = _clean(text)
        key = text.lower()
        if not text or key in seen or not re.search(r"[a-zA-Z]", text):
            return
        score = _relevance_score(text)
        if score < 2:
            return
        seen.add(key)
        # Enlace asociado
        link = ""
        a = None
        if el.name == "a" and el.get("href"):
            a = el
        else:
            a = el.find("a", href=True) or el.find_parent("a", href=True)
        if a and a.get("href"):
            link = urljoin(source.url, a["href"])
        # Contexto (fecha + resumen) del contenedor cercano.
        container = el.find_parent(["article", "li", "div", "section"]) or el
        ctx = _clean(container.get_text(" ", strip=True))
        date = ""
        dm = _DATE_RE.search(ctx)
        if dm:
            date = dm.group(0)
        summary = ""
        # tomar la porcion de contexto que no sea el titulo
        rest = ctx.replace(text, "").strip(" -|·,")
        if len(rest) > 40:
            summary = rest[:400]
        scored.append(
            (
                score,
                {
                    "title": text,
                    "url": link,
                    "summary": summary,
                    "published_date": date,
                },
            )
        )

    for el in soup.find_all(["h1", "h2", "h3", "h4", "a", "li"]):
        consider(el.get_text(), el)

    scored.sort(key=lambda x: x[0], reverse=True)

    findings: list[dict] = []
    for _score, c in scored[:MAX_ITEMS_PER_SOURCE]:
        title = c["title"]
        blob = f"{title} {c['summary']}"
        horizon = _classify_horizon(blob)
        ttype = _classify_type(blob)
        # Los briefings/registros de HS suelen ser tecnologias en desarrollo:
        if not horizon and ttype != "otro":
            horizon = "transicional"
        findings.append(
            {
                "title": title[:590],
                "url": (c["url"] or source.url)[:1020],
                "summary": (c["summary"] or meta_desc)[:1000],
                "raw_content": "",
                "technology": title[:390],
                "technology_type": ttype,
                "horizon": horizon,
                "phase": "",
                "therapeutic_area": _guess_area(blob),
                "published_date": c["published_date"],
            }
        )

    # Si no se hallaron candidatos, crear un hallazgo-resumen de la fuente.
    if not findings:
        blob = f"{page_title} {meta_desc} {source.description}"
        findings.append(
            {
                "title": (page_title or source.title)[:590],
                "url": source.url,
                "summary": (meta_desc or _first_paragraph(soup) or source.description)[:1000],
                "raw_content": "",
                "technology": (page_title or source.title)[:390],
                "technology_type": _classify_type(blob),
                "horizon": _classify_horizon(blob),
                "phase": "",
                "therapeutic_area": _guess_area(blob),
                "published_date": "",
            }
        )
    return findings


_AREAS = {
    "oncologia": r"cancer|c[aá]ncer|oncolog|tumor|carcinom|lymphom|linfom|leukem|leucem|myelom|mielom|melanom",
    "neurologia": r"migrain|migran|alzheim|parkinson|epilep|neurolog|sclerosis|esclerosis|stroke|ictus",
    "cardiologia": r"cardio|cardiac|heart|coraz[oó]n|atherosc|ateroscl|myocard|miocard|cholesterol|colesterol",
    "enf. raras": r"rare disease|enfermedad(es)? rara|orphan|hu[eé]rfan",
    "endocrinologia": r"diabet|obesity|obesidad|overweight|sobrepeso|thyroid|tiroid|glp-1",
    "inmunologia": r"immun|inmun|autoimmun|arthritis|artritis|psoria|lupus",
    "infectologia": r"infect|antibiot|vaccin|vacuna|hiv|vih|hepatit|tuberculos|sepsis",
}


def _guess_area(text: str) -> str:
    for area, pat in _AREAS.items():
        if re.search(pat, text, re.I):
            return area
    return ""


def _first_paragraph(soup: BeautifulSoup) -> str:
    for p in soup.find_all("p"):
        text = _clean(p.get_text())
        if len(text) > 60:
            return text
    return ""


# --------------------------------------------------------------------------- #
#  Extraccion robusta de contenido (trafilatura / pypdf)
# --------------------------------------------------------------------------- #
def extract_main_text(html: str, url: str = "") -> str:
    """Extrae el contenido principal (articulo) de una pagina con trafilatura."""
    if not html or not _TRAFILATURA:
        return ""
    try:
        txt = trafilatura.extract(
            html,
            url=url or None,
            include_comments=False,
            include_tables=False,
            favor_precision=True,
        )
        return _clean(txt or "")
    except Exception:  # noqa: BLE001
        return ""


def extract_pdf_text(raw: bytes, max_chars: int = 8000) -> str:
    """Extrae texto de un PDF en memoria con pypdf."""
    if not raw or not _PYPDF:
        return ""
    try:
        reader = PdfReader(io.BytesIO(raw))
        parts: list[str] = []
        for page in reader.pages[:15]:  # limitar a las primeras paginas
            try:
                parts.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001
                continue
            if sum(len(p) for p in parts) > max_chars:
                break
        return _clean(" ".join(parts))[:max_chars]
    except Exception:  # noqa: BLE001
        return ""


def _summarize(text: str, limit: int = 600) -> str:
    """Devuelve un resumen legible (primeras frases) del texto dado."""
    text = _clean(text)
    if len(text) <= limit:
        return text
    cut = text[:limit]
    last_dot = cut.rfind(". ")
    if last_dot > 200:
        return cut[: last_dot + 1]
    return cut + "..."


def _enrich_with_ai(
    findings_data: list[dict],
    *,
    source_title: str,
    source_url: str,
    html: str = "",
    pdf_bytes: bytes | None = None,
    pdf_text: str = "",
    crawl: dict | None = None,
    allow_ai: bool = True,
    allow_ocr: bool = True,
    source_context: str = "",
) -> list[dict]:
    """Si la IA web/OCR esta activa (global y en el flujo de la fuente), complementa hallazgos."""
    try:
        from . import ai_service, ai_web

        web_on = allow_ai and ai_service.web_assist_enabled()
        ocr_on = allow_ocr and ai_service.ocr_enabled()
        if not web_on and not ocr_on:
            if isinstance(crawl, dict) and not (allow_ai and allow_ocr):
                crawl.setdefault("steps", []).append(
                    {"action": "ia", "status": "omitido", "ms": 0, "detail": "IA y OCR apagados en el flujo de esta fuente"}
                )
            return findings_data
        t0 = time.perf_counter()
        extra = ai_web.extract_from_page(
            source_title=source_title,
            source_url=source_url,
            html=html,
            pdf_bytes=pdf_bytes,
            pdf_text=pdf_text,
            crawl=crawl,
            allow_ai=allow_ai,
            allow_ocr=allow_ocr,
            source_context=source_context,
        )
        if isinstance(crawl, dict):
            crawl.setdefault("steps", []).append(
                {
                    "action": "ia",
                    "status": "ok" if extra else "sin_senales",
                    "ms": int((time.perf_counter() - t0) * 1000),
                    "detail": f"{len(extra)} senales estructuradas" if extra else "sin senales nuevas",
                }
            )
        if extra:
            return ai_web.merge_findings(findings_data, extra)
    except Exception:  # noqa: BLE001
        return findings_data
    return findings_data


# --------------------------------------------------------------------------- #
#  Orquestacion
# --------------------------------------------------------------------------- #
def _crawl_with_profile(db: Session, source: Source, landing_url: str, html: str, profile: dict, context: str) -> dict:
    """Recorrido segun las casillas del flujo de la fuente (recorrer, seguir enlaces, busqueda web)."""
    from . import source_profile, web_search

    search = web_search.search_for_source(db, source, profile, context=context)
    cfg = source_profile.load_search(db)
    crawl_on = bool(profile.get("crawl"))
    entry = [u for u in profile.get("entry_urls") or [] if _normalize_url(u) != _normalize_url(landing_url)]
    crawl = crawl_site(
        landing_url,
        html=html,
        max_pages=(profile.get("max_pages") or None) if crawl_on else 1,
        entry_urls=entry if crawl_on else [],
        follow_keywords=profile.get("follow_keywords") or [],
        search_results=search["results"],
        follow_links=crawl_on and bool(profile.get("follow_links")),
        fetch_results=int(cfg.get("fetch_results") or 0),
    )
    if not crawl_on:
        crawl.setdefault("steps", []).insert(
            0, {"action": "recorrido", "url": landing_url, "status": "omitido", "ms": 0, "detail": "Recorrido apagado en el flujo de esta fuente: solo página principal"}
        )
    crawl["steps"] = search["steps"] + list(crawl.get("steps") or [])
    crawl["search_queries"] = search["queries"]
    crawl["search_origin"] = search["query_origin"]
    return crawl


def scrape_source(db: Session, source: Source, triggered_by: str = "sistema") -> ScrapeLog:
    """Ejecuta el escaneo de una fuente y persiste hallazgos nuevos."""
    log = ScrapeLog(
        source_id=source.id,
        status="ok",
        triggered_by=triggered_by,
        started_at=datetime.now(timezone.utc),
    )
    db.add(log)
    db.flush()
    started = time.perf_counter()
    crawl = None
    steps: list[dict] = []
    from . import source_profile

    profile = source_profile.effective_profile(source)
    options = source_profile.load_options(db)
    context = source_profile.source_context(source, options)

    def finish_trace(*, ok: bool, items_found: int = 0, items_new: int = 0) -> None:
        from . import ai_service, scan_trace

        elapsed = int((time.perf_counter() - started) * 1000)
        extra = steps + list((crawl or {}).get("steps") or [])
        scan_trace.record(
            {
                "at": datetime.now(timezone.utc).isoformat(),
                "kind": "scan",
                "source": source.title,
                "url": source.url,
                "ok": ok,
                "status": log.status,
                "elapsed_ms": elapsed,
                "pages_visited": int((crawl or {}).get("pages_visited") or (1 if ok else 0)),
                "items_found": items_found,
                "items_new": items_new,
                "ai": ai_service.web_assist_enabled() and profile["ai"],
                "ocr": ai_service.ocr_enabled() and profile["ocr"],
                "web_search": bool((crawl or {}).get("search_results")),
                "priority": source.priority_level or "",
                "source_level": source.source_level or "",
                "message": log.message,
                "steps": extra,
            }
        )

    def download(url: str, action: str) -> tuple[int, str, str, bytes]:
        t0 = time.perf_counter()
        result = fetch_url(url)
        code, ctype = result[0], result[1]
        steps.append(
            {
                "action": action,
                "url": url,
                "status": "ok" if 0 < code < 400 else (f"http_{code}" if code else "sin_conexion"),
                "ms": int((time.perf_counter() - t0) * 1000),
                "detail": ctype or "",
            }
        )
        return result

    try:
        landing_url = source.url
        status_code, content_type, text, raw = download(source.url, "descarga")
        if not (0 < status_code < 400):
            # La URL principal fallo: se prueba la ruta de la matriz EH antes de rendirse.
            for alt in [u for u in profile["entry_urls"] if _normalize_url(u) != _normalize_url(source.url)][:3]:
                alt_result = download(alt, "respaldo")
                if 0 < alt_result[0] < 400:
                    landing_url = alt
                    status_code, content_type, text, raw = alt_result
                    break
        if status_code == 0:
            log.status = "error"
            log.message = "No se pudo conectar con la fuente tras los reintentos."
            log.finished_at = datetime.now(timezone.utc)
            source.last_scraped_at = datetime.now(timezone.utc)
            finish_trace(ok=False)
            db.commit()
            db.refresh(log)
            return log
        if status_code >= 400:
            log.status = "error"
            log.message = f"HTTP {status_code} al acceder a la fuente."
            log.finished_at = datetime.now(timezone.utc)
            source.last_scraped_at = datetime.now(timezone.utc)
            finish_trace(ok=False)
            db.commit()
            db.refresh(log)
            return log

        is_pdf = "pdf" in content_type or landing_url.lower().endswith(".pdf")
        crawl = None
        if is_pdf or "octet-stream" in content_type or not text:
            # Documento (PDF / binario): extraer texto real con pypdf cuando sea posible.
            pdf_text = extract_pdf_text(raw) if raw else ""
            blob = f"{source.title} {source.description} {pdf_text}"
            summary = _summarize(pdf_text, 900) if pdf_text else source.description[:1000]
            findings_data = [
                {
                    "title": source.title[:590],
                    "url": landing_url,
                    "summary": summary[:1000],
                    "raw_content": (pdf_text or f"Documento {content_type or 'binario'} ({len(raw)} bytes).")[:5000],
                    "technology": source.title[:390],
                    "technology_type": _classify_type(blob),
                    "horizon": _classify_horizon(blob),
                    "phase": "",
                    "therapeutic_area": _guess_area(blob),
                    "published_date": "",
                }
            ]
            findings_data = _enrich_with_ai(
                findings_data,
                source_title=source.title,
                source_url=landing_url,
                html="",
                pdf_bytes=raw if raw else None,
                pdf_text=pdf_text,
                allow_ai=profile["ai"],
                allow_ocr=profile["ocr"],
                source_context=context,
            )
        else:
            from .ingest.pipeline_rows import is_pipeline_source

            target = source
            if landing_url != source.url:
                target = _PreviewSource(landing_url)
                target.title, target.description = source.title, source.description
            findings_data = extract_candidates(target, text)
            crawl = None
            if not is_pipeline_source(source):
                crawl = _crawl_with_profile(db, source, landing_url, text, profile, context)
                findings_data = apply_crawled_text(findings_data, crawl)
            findings_data = _enrich_with_ai(
                findings_data,
                source_title=source.title,
                source_url=landing_url,
                html=text,
                crawl=crawl,
                allow_ai=profile["ai"],
                allow_ocr=profile["ocr"],
                source_context=context,
            )

        new_count = 0
        new_findings: list[Finding] = []
        pipeline_parts: dict[int, tuple[str, dict]] = {}
        from .ingest.pipeline_rows import (
            ROW_PREFIX,
            compact_title,
            is_pipeline_source,
            parse_row,
            structured_summary,
        )

        pipeline = is_pipeline_source(source)
        for data in findings_data:
            row = data["title"]
            # La huella se calcula sobre la fila original: estable entre corridas
            # aunque el titulo visible ahora sea el nombre del producto.
            content_hash = _hash(row, data["url"])
            exists = (
                db.query(Finding)
                .filter(Finding.source_id == source.id, Finding.content_hash == content_hash)
                .first()
            )
            if exists:
                continue
            parsed = parse_row(row) if pipeline else None
            if parsed:
                # Fila de tabla de pipeline: cada celda a su campo; la fila queda en el crudo.
                data = {
                    **data,
                    "title": compact_title(parsed),
                    "technology": parsed["name"][:390],
                    "phase": parsed.get("phase", "")[:110],
                    "therapeutic_area": (parsed.get("indication") or data.get("therapeutic_area") or "")[:290],
                    "summary": structured_summary(parsed, source.title)[:1000],
                    "raw_content": (ROW_PREFIX + row + chr(10) + (data.get("raw_content") or ""))[:5000],
                }
            finding = Finding(
                source_id=source.id,
                content_hash=content_hash,
                status="nuevo",
                **data,
            )
            finding.screening_score = compute_screening_score(
                horizon=finding.horizon,
                technology_type=finding.technology_type,
                phase=finding.phase,
                therapeutic_area=finding.therapeutic_area,
                summary=finding.summary,
                technology=finding.technology,
                title=finding.title,
            )
            db.add(finding)
            new_findings.append(finding)
            if parsed:
                pipeline_parts[id(finding)] = (row, parsed)
            new_count += 1

        # Cada senal capturada se proyecta al staging metodologico (RF03/RF04).
        if new_findings:
            db.flush()
            from .ingest.pipeline_rows import apply_pipeline_fields

            for finding in new_findings:
                tech = sync_technology_from_finding(db, finding, captured_by=triggered_by or "scraper")
                if id(finding) in pipeline_parts:
                    row, parsed = pipeline_parts[id(finding)]
                    apply_pipeline_fields(finding, tech, row, parsed, source.title)

        log.items_found = len(findings_data)
        log.items_new = new_count
        log.status = "ok" if findings_data else "parcial"
        visited = f" {crawl.get('pages_visited', 1)} página(s) visitadas." if crawl else ""
        elapsed = int((time.perf_counter() - started) * 1000)
        log.message = f"{len(findings_data)} items detectados, {new_count} nuevos.{visited} {elapsed} ms."
        source.last_scraped_at = datetime.now(timezone.utc)
        finish_trace(ok=bool(findings_data), items_found=len(findings_data), items_new=new_count)
    except httpx.HTTPError as exc:
        log.status = "error"
        log.message = f"Error de red: {exc}"[:500]
        source.last_scraped_at = datetime.now(timezone.utc)
        finish_trace(ok=False)
    except Exception as exc:  # noqa: BLE001 - se registra cualquier fallo de parseo
        log.status = "error"
        log.message = f"Error inesperado: {exc}"[:500]
        source.last_scraped_at = datetime.now(timezone.utc)
        finish_trace(ok=False)

    log.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(log)
    return log


class _PreviewSource:
    """Objeto ligero compatible con extract_candidates para previsualizaciones."""

    def __init__(self, url: str):
        self.url = url
        self.title = ""
        self.description = ""


def is_internal_url(url: str) -> bool:
    """True si el host resuelve a una red interna (loopback, privada o enlace local).

    La vista previa hace que el servidor visite la URL que escribe el usuario: sin
    este control serviria para sondear la red interna del instituto (SSRF).
    """
    import ipaddress
    import socket
    from urllib.parse import urlsplit

    host = (urlsplit(url).hostname or "").strip("[]")
    if not host:
        return True
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return True
    return False


def preview_url(url: str) -> dict:
    """Previsualiza que informacion se extraeria de un enlace, sin persistir nada."""
    result: dict = {
        "ok": False,
        "url": url,
        "content_type": "",
        "title": "",
        "description": "",
        "main_text": "",
        "candidates": [],
        "candidates_count": 0,
        "pages_visited": 0,
        "message": "",
    }
    started = time.perf_counter()
    if not url or not url.lower().startswith(("http://", "https://")):
        result["message"] = "URL inválida. Debe iniciar con http:// o https://"
        return result
    from .config import settings

    if getattr(settings, "is_production", False) and is_internal_url(url):
        result["message"] = "Por seguridad no se previsualizan direcciones de la red interna."
        return result
    try:
        status_code, content_type, text, raw = fetch_url(url)
        result["content_type"] = content_type
        if status_code == 0:
            result["message"] = "No se pudo conectar con el enlace tras los reintentos."
            return result
        if status_code >= 400:
            result["message"] = f"El servidor respondió HTTP {status_code}."
            return result

        is_pdf = "pdf" in content_type or url.lower().endswith(".pdf")
        if is_pdf or "octet-stream" in content_type or not text:
            pdf_text = extract_pdf_text(raw) if raw else ""
            if pdf_text:
                result.update(
                    ok=True,
                    title="Documento PDF",
                    description=_summarize(pdf_text, 400),
                    main_text=pdf_text[:2500],
                    candidates_count=1,
                    pages_visited=1,
                    message=f"PDF procesado ({len(raw)} bytes). Se creará 1 hallazgo con el resumen del documento.",
                )
            else:
                result["message"] = "Documento binario/PDF sin texto extraíble."
            return result

        soup = BeautifulSoup(text, "lxml")
        title = _clean(soup.title.get_text()) if soup.title else ""
        main_text = extract_main_text(text, url)
        src = _PreviewSource(url)
        cands = extract_candidates(src, text)
        crawl = crawl_site(url, html=text)
        cands = apply_crawled_text(cands, crawl)
        cands = _enrich_with_ai(cands, source_title=title or url, source_url=url, html=text, crawl=crawl)
        sample = [
            {
                "title": c["title"],
                "technology_type": c["technology_type"],
                "horizon": c["horizon"],
            }
            for c in cands[:12]
        ]
        visited = crawl.get("pages_visited") or 1
        result.update(
            ok=True,
            title=title,
            description=_summarize(main_text, 400) if main_text else "",
            main_text=(crawl.get("combined") or main_text or "")[:2500],
            candidates=sample,
            candidates_count=len(cands),
            pages_visited=visited,
            message=(
                f"Se visitaron {visited} página(s) y se detectaron {len(cands)} hallazgos potenciales."
            ),
        )
        try:
            from . import ai_service, scan_trace

            scan_trace.record(
                {
                    "kind": "preview",
                    "source": title or url,
                    "url": url,
                    "ok": True,
                    "status": "ok",
                    "elapsed_ms": int((time.perf_counter() - started) * 1000),
                    "pages_visited": visited,
                    "items_found": len(cands),
                    "ai": ai_service.web_assist_enabled(),
                    "ocr": ai_service.ocr_enabled(),
                    "message": result["message"],
                    "steps": crawl.get("steps") or [],
                }
            )
        except Exception:  # noqa: BLE001
            pass
        return result
    except httpx.HTTPError as exc:
        result["message"] = f"Error de red: {exc}"[:300]
        return result
    except Exception as exc:  # noqa: BLE001
        result["message"] = f"Error al procesar: {exc}"[:300]
        return result
