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
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session

from .models import Finding, ScrapeLog, Source

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
    "(KHTML, like Gecko) IETS-HorizonScanner/1.0 Safari/537.36"
)

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
    r"^(emerging|transitional|imminent|near)?\s*horizon(s)?$|^(emerging|transitional|imminent) horizon$|^horizon scanning( facility| initiative)?$|^a world leading",
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
def fetch_url(url: str, timeout: float = 25.0) -> tuple[int, str, str, bytes]:
    """Devuelve (status_code, content_type, text, raw_bytes)."""
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "es,en;q=0.8"}
    with httpx.Client(follow_redirects=True, timeout=timeout, headers=headers) as client:
        resp = client.get(url)
        content_type = resp.headers.get("content-type", "").lower()
        raw = resp.content
        text = ""
        if "pdf" not in content_type and "octet-stream" not in content_type:
            try:
                text = resp.text
            except Exception:
                text = ""
        return resp.status_code, content_type, text, raw


# --------------------------------------------------------------------------- #
#  Extraccion
# --------------------------------------------------------------------------- #
def extract_candidates(source: Source, html: str) -> list[dict]:
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


# --------------------------------------------------------------------------- #
#  Orquestacion
# --------------------------------------------------------------------------- #
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

    try:
        status_code, content_type, text, raw = fetch_url(source.url)
        if status_code >= 400:
            log.status = "error"
            log.message = f"HTTP {status_code} al acceder a la fuente."
            log.finished_at = datetime.now(timezone.utc)
            source.last_scraped_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(log)
            return log

        is_pdf = "pdf" in content_type or source.url.lower().endswith(".pdf")
        if is_pdf or "octet-stream" in content_type or not text:
            # Documento (PDF / binario): extraer texto real con pypdf cuando sea posible.
            pdf_text = extract_pdf_text(raw) if raw else ""
            blob = f"{source.title} {source.description} {pdf_text}"
            summary = _summarize(pdf_text, 900) if pdf_text else source.description[:1000]
            findings_data = [
                {
                    "title": source.title[:590],
                    "url": source.url,
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
        else:
            findings_data = extract_candidates(source, text)

        new_count = 0
        for data in findings_data:
            content_hash = _hash(data["title"], data["url"])
            exists = (
                db.query(Finding)
                .filter(Finding.source_id == source.id, Finding.content_hash == content_hash)
                .first()
            )
            if exists:
                continue
            finding = Finding(
                source_id=source.id,
                content_hash=content_hash,
                status="nuevo",
                **data,
            )
            db.add(finding)
            new_count += 1

        log.items_found = len(findings_data)
        log.items_new = new_count
        log.status = "ok" if findings_data else "parcial"
        log.message = f"{len(findings_data)} items detectados, {new_count} nuevos."
        source.last_scraped_at = datetime.now(timezone.utc)
    except httpx.HTTPError as exc:
        log.status = "error"
        log.message = f"Error de red: {exc}"[:500]
        source.last_scraped_at = datetime.now(timezone.utc)
    except Exception as exc:  # noqa: BLE001 - se registra cualquier fallo de parseo
        log.status = "error"
        log.message = f"Error inesperado: {exc}"[:500]
        source.last_scraped_at = datetime.now(timezone.utc)

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
        "message": "",
    }
    if not url or not url.lower().startswith(("http://", "https://")):
        result["message"] = "URL invalida. Debe iniciar con http:// o https://"
        return result
    try:
        status_code, content_type, text, raw = fetch_url(url, timeout=25.0)
        result["content_type"] = content_type
        if status_code >= 400:
            result["message"] = f"El servidor respondio HTTP {status_code}."
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
                    message=f"PDF procesado ({len(raw)} bytes). Se creara 1 hallazgo con el resumen del documento.",
                )
            else:
                result["message"] = "Documento binario/PDF sin texto extraible."
            return result

        soup = BeautifulSoup(text, "lxml")
        title = _clean(soup.title.get_text()) if soup.title else ""
        main_text = extract_main_text(text, url)
        src = _PreviewSource(url)
        cands = extract_candidates(src, text)
        sample = [
            {
                "title": c["title"],
                "technology_type": c["technology_type"],
                "horizon": c["horizon"],
            }
            for c in cands[:12]
        ]
        result.update(
            ok=True,
            title=title,
            description=_summarize(main_text, 400) if main_text else "",
            main_text=main_text[:2500],
            candidates=sample,
            candidates_count=len(cands),
            message=f"Se detectaron {len(cands)} hallazgos potenciales en la pagina.",
        )
        return result
    except httpx.HTTPError as exc:
        result["message"] = f"Error de red: {exc}"[:300]
        return result
    except Exception as exc:  # noqa: BLE001
        result["message"] = f"Error al procesar: {exc}"[:300]
        return result
