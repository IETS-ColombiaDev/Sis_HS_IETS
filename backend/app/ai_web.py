"""Visita real de sitios web y apoyo de IA / OCR.

1. Entra a la URL (HTML o PDF) y sigue enlaces internos hasta las fichas.
2. Si la IA web esta activa, MiniMax estructura senales de horizonte.
3. Si el OCR esta activo, MiniMax-M3 lee imagenes y PDF escaneados.
El fallo de IA nunca tumba el escaneo heuristicos.
"""
from __future__ import annotations

import base64
import io
import json
import re
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

from . import ai_service, product_details, prompt_store

MAX_AI_ITEMS = 18
MAX_IMAGES = 3
MAX_IMAGE_BYTES = 1_800_000
MAX_PAGE_CHARS = 9000

_IMG_SKIP = re.compile(r"logo|icon|sprite|avatar|pixel|tracking|badge|button", re.I)
_NCT_RE = re.compile(r"\bNCT\d{8}\b", re.I)
_FENCE = re.compile(r"```(?:json)?", re.I)
_SCHEMA_ECHO = re.compile(
    r"nombre concreto de la tecnolog|nombre corto \(INN|2-4 frases|solo del texto|indicacion si consta",
    re.I,
)


def _scraper():
    from . import scraper

    return scraper


def collect_page_images(html: str, page_url: str, limit: int = MAX_IMAGES) -> list[str]:
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    urls: list[str] = []
    seen: set[str] = set()

    def add(raw: str | None) -> None:
        if not raw:
            return
        href = urljoin(page_url, raw.strip())
        if not href.lower().startswith(("http://", "https://")):
            return
        if href in seen or _IMG_SKIP.search(href):
            return
        seen.add(href)
        urls.append(href)

    for attr in ("og:image", "twitter:image"):
        tag = soup.find("meta", attrs={"property": attr}) or soup.find("meta", attrs={"name": attr})
        if tag:
            add(tag.get("content"))

    for img in soup.find_all("img"):
        add(img.get("src") or img.get("data-src"))
        if len(urls) >= limit:
            break
    return urls[:limit]


def download_images(urls: list[str]) -> list[dict]:
    out: list[dict] = []
    headers = {**_scraper().BROWSER_HEADERS, "Accept": "image/*,*/*"}
    for href in urls:
        try:
            with httpx.Client(timeout=18.0, follow_redirects=True, headers=headers) as client:
                resp = client.get(href)
            if resp.status_code >= 400:
                continue
            raw = resp.content or b""
            if len(raw) < 1200 or len(raw) > MAX_IMAGE_BYTES:
                continue
            ctype = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
            if ctype not in {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}:
                if href.lower().endswith((".jpg", ".jpeg")):
                    ctype = "image/jpeg"
                elif href.lower().endswith(".png"):
                    ctype = "image/png"
                elif href.lower().endswith(".webp"):
                    ctype = "image/webp"
                else:
                    continue
            out.append(
                {
                    "mime": ctype,
                    "data": base64.b64encode(raw).decode("ascii"),
                    "url": href,
                    "ocr": True,
                }
            )
        except Exception:  # noqa: BLE001
            continue
        if len(out) >= MAX_IMAGES:
            break
    return out


def render_pdf_pages(raw: bytes, max_pages: int = 2) -> list[dict]:
    """Renderiza paginas de un PDF escaneado si pypdfium2 esta instalado."""
    if not raw:
        return []
    try:
        import pypdfium2 as pdfium
    except Exception:  # noqa: BLE001
        return []
    try:
        from PIL import Image  # type: ignore
    except Exception:  # noqa: BLE001
        Image = None  # type: ignore
    images: list[dict] = []
    try:
        doc = pdfium.PdfDocument(raw)
        for index in range(min(len(doc), max_pages)):
            page = doc[index]
            bitmap = page.render(scale=1.4)
            pil = bitmap.to_pil()
            buf = io.BytesIO()
            pil.convert("RGB").save(buf, format="JPEG", quality=72)
            data = buf.getvalue()
            if 1200 < len(data) < MAX_IMAGE_BYTES:
                images.append(
                    {
                        "mime": "image/jpeg",
                        "data": base64.b64encode(data).decode("ascii"),
                        "ocr": True,
                    }
                )
            if Image is None:
                pass
        return images
    except Exception:  # noqa: BLE001
        return []


def _is_nav_title(title: str, source_title: str) -> bool:
    s = _scraper()
    t = (title or "").strip()
    if not t:
        return True
    if s._SECTION_LABEL.search(t) or s._BLOCK.search(t):
        return True
    if s._JUNK.match(t) and len(t.split()) <= 3:
        return True
    src = (source_title or "").strip().lower()
    return bool(src) and t.lower() == src


def _drop_invented_nct(item: dict, source_text: str) -> dict:
    """Quita NCT que el modelo invento y no estan en el texto visitado."""
    if not source_text:
        return item
    hay = source_text.upper()
    for field in ("title", "summary", "raw_content", "phase", "technology"):
        val = item.get(field) or ""
        found = _NCT_RE.findall(val)
        if not found:
            continue
        cleaned = val
        for nct in found:
            if nct.upper() not in hay:
                cleaned = re.sub(re.escape(nct), "", cleaned, flags=re.I)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,;.-")
        item[field] = cleaned
    return item


# Palabras que no distinguen una tecnologia (no sirven para comprobar que la
# senal esta en el texto visitado).
_STOP = {
    "with", "from", "that", "this", "for", "and", "the", "new", "para", "como", "con", "los", "las", "del",
    "una", "uno", "que", "por", "entre", "sobre", "study", "trial", "phase", "fase", "ensayo", "estudio",
    "treatment", "tratamiento", "patients", "pacientes", "therapy", "terapia", "device", "dispositivo",
    "drug", "medicamento", "approval", "aprobacion", "clinical", "clinico", "clinica", "health", "salud",
    "cancer", "disease", "enfermedad", "technology", "tecnologia", "results", "resultados", "data", "datos",
}
_TOKEN = re.compile(r"[a-z0-9][a-z0-9\-]{3,}")


def _tokens(text: str) -> list[str]:
    from .source_matrix import fold

    return [t for t in _TOKEN.findall(fold(text)) if t not in _STOP and not t.isdigit()]


EVIDENCE_INSTRUCTION = (
    "\n\nREGLA DE EVIDENCIA (obligatoria): agrega a cada senal el campo \"evidencia\" con una cita "
    "textual corta (de 5 a 30 palabras) copiada tal cual del CONTENIDO, en su idioma original, que "
    "respalde la senal. No la traduzcas ni la resumas. Si no puedes citar el contenido, no incluyas la senal."
)


def evidence_found(evidence: str, source_text: str) -> bool:
    """True si la cita de la IA esta en el texto visitado (tolera espacios, tildes y puntuacion)."""
    from .source_matrix import fold

    quote = re.sub(r"[^a-z0-9 ]+", " ", fold(evidence))
    quote = re.sub(r"\s+", " ", quote).strip()
    if len(quote) < 12:
        return False
    hay = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", fold(source_text)))
    if quote in hay:
        return True
    words = [w for w in quote.split() if len(w) >= 4]
    return bool(words) and sum(1 for w in words if w in hay) / len(words) >= 0.85


def is_grounded(item: dict, source_text: str, evidence: str = "") -> bool:
    """True si la senal de la IA se puede rastrear en el texto que el sistema visito.

    Basta con que aparezca el nombre de la tecnologia, un codigo/marca del titulo
    (p. ej. ELREXFIO, PF-07220060) o la mitad de las palabras distintivas del
    titulo. La IA puede traducir el titulo al espanol: por eso tambien cuenta el
    nombre de la tecnologia y el resumen, que suelen conservar el nombre propio.
    """
    from .source_matrix import fold

    if not source_text:
        return True  # solo OCR de imagenes: no hay texto con que comparar
    if evidence:
        # Con cita, la cita decide: una cita que no esta en el texto es inventada.
        return evidence_found(evidence, source_text)
    hay = fold(source_text)
    tech = _tokens(item.get("technology") or "")
    title = _tokens(item.get("title") or "")
    summary = _tokens(item.get("summary") or "")
    if tech and sum(1 for t in tech if t in hay) / len(tech) >= 0.5:
        return True
    if title and sum(1 for t in title if t in hay) / len(title) >= 0.5:
        return True
    distinctive = {t for t in tech + title + summary if len(t) >= 6 or any(ch.isdigit() for ch in t)}
    hits = sum(1 for t in distinctive if t in hay)
    return hits >= 2 or (hits >= 1 and len(distinctive) <= 2)


def _real_url(url: str, source_url: str, source_text: str) -> str:
    """La URL que da la IA solo se conserva si estaba en el texto visitado o es del mismo sitio."""
    from urllib.parse import urlsplit

    if not url or url == source_url:
        return source_url
    if source_text and url in source_text:
        return url
    host = (urlsplit(url).hostname or "").removeprefix("www.")
    base = (urlsplit(source_url).hostname or "").removeprefix("www.")
    if host and base and (host == base or host.endswith("." + base) or base.endswith("." + host)):
        return url
    return source_url


def _normalize_item(item: dict, source_url: str, source_title: str, source_text: str = "") -> dict | None:
    s = _scraper()
    title = s._clean(str(item.get("title") or item.get("technology") or ""))
    if not title or len(title) < 8 or _is_nav_title(title, source_title):
        return None
    summary = s._clean(str(item.get("summary") or item.get("description") or ""))
    if _SCHEMA_ECHO.search(title) or _SCHEMA_ECHO.search(summary):
        return None
    blob = f"{title} {summary}"
    ttype = str(item.get("technology_type") or "")
    if ttype not in {"medicamento", "dispositivo", "digital", "otro"}:
        ttype = s._classify_type(blob)
    horizon = str(item.get("horizon") or "")
    if horizon not in {"emergente", "transicional", "inminente"}:
        horizon = s._classify_horizon(blob) or "transicional"
    url = str(item.get("url") or source_url).strip()[:1020]
    if not url.lower().startswith(("http://", "https://")):
        url = source_url
    url = _real_url(url, source_url, source_text)
    out = {
        "title": title[:590],
        "url": url,
        "summary": summary[:1000],
        "raw_content": s._clean(str(item.get("raw_content") or summary))[:5000],
        "technology": s._clean(str(item.get("technology") or title))[:390],
        "technology_type": ttype,
        "horizon": horizon,
        "phase": s._clean(str(item.get("phase") or ""))[:190],
        "therapeutic_area": s._clean(str(item.get("therapeutic_area") or s._guess_area(blob)))[:190],
        "published_date": s._clean(str(item.get("published_date") or ""))[:80],
    }
    # RF-003: datos de producto que el modelo leyo en el texto (forma, marca, modelo...).
    details = product_details.clean({key: item.get(key) for key in product_details.FIELDS})
    if details:
        out["details"] = details
    return _drop_invented_nct(out, source_text)


def _decode_payload(text: str) -> list | None:
    """Lista de items del modelo; None si no hay JSON legible.

    Si la respuesta se corto por max_tokens (arreglo sin cerrar), rescata todos
    los objetos completos de primer nivel en lugar de solo el primero.
    """
    blob = _FENCE.sub("", text).replace("```", "")
    decoder = json.JSONDecoder()
    arrays: list = []
    objects: list = []
    covered_until = -1
    for i, ch in enumerate(blob):
        if ch not in "[{" or i < covered_until:
            continue
        piece = blob[i:]
        variants = [piece]
        stripped = re.sub(r",\s*([}\]])", r"\1", piece)
        if stripped != piece:
            variants.append(stripped)
        decoded = None
        end = 0
        for candidate in variants:
            try:
                decoded, end = decoder.raw_decode(candidate)
                break
            except json.JSONDecodeError:
                continue
        if isinstance(decoded, list):
            arrays.append(decoded)
            if decoded:
                break
        elif isinstance(decoded, dict):
            objects.append(decoded)
            if candidate is piece:
                # Los objetos anidados de este item ya quedaron dentro de el.
                covered_until = i + end
    for data in arrays:
        if data:
            return data
    if arrays:
        return arrays[0]
    for data in objects:
        rows = data.get("findings") or data.get("items")
        if isinstance(rows, list):
            return rows
    if objects:
        return objects
    return None


def _loads_payload(text: str) -> list:
    return _decode_payload(text) or []


def _parse_items(
    text: str, source_url: str, source_title: str, source_text: str = "", report: dict | None = None
) -> list[dict]:
    if not text or text.startswith("[Error"):
        return []
    rows = _loads_payload(text)
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    dropped: list[str] = []
    cited = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = _normalize_item(row, source_url, source_title, source_text)
        evidence = re.sub(r"\s+", " ", str(row.get("evidencia") or row.get("evidence") or "")).strip()[:400]
        if item and not is_grounded(item, source_text, evidence):
            # La IA devolvio algo que no esta en lo que el sistema leyo: no se inventa.
            dropped.append(item["title"][:120])
            continue
        if item:
            if evidence:
                cited += 1
                # La cita queda en el crudo de la senal: el equipo ve de donde salio.
                item["raw_content"] = f"Cita de la fuente: «{evidence}»\n{item['raw_content']}"[:5000]
            out.append(item)
        if len(out) >= MAX_AI_ITEMS:
            break
    if report is not None:
        report["returned"] = sum(1 for r in rows if isinstance(r, dict))
        report["kept"] = len(out)
        report["ungrounded"] = dropped[:10]
        report["with_evidence"] = cited
    return out


def extract_from_page(
    source_title: str,
    source_url: str,
    html: str = "",
    pdf_bytes: bytes | None = None,
    pdf_text: str = "",
    crawl: dict | None = None,
    allow_ai: bool = True,
    allow_ocr: bool = True,
    source_context: str = "",
    report: dict | None = None,
) -> list[dict]:
    """Pide a la IA que entre al contenido real del sitio (listado + fichas).

    Si se pasa `report`, queda report["answered"] = True cuando el modelo
    devolvio JSON legible (aunque sea []): su veredicto sobre la pagina.

    `allow_ai` / `allow_ocr` son las casillas del flujo de la fuente: se suman
    a los interruptores globales, nunca los encienden.
    """
    web_on = allow_ai and ai_service.web_assist_enabled()
    ocr_on = allow_ocr and ai_service.ocr_enabled()
    if not web_on and not ocr_on:
        return []

    s = _scraper()
    images: list[dict] = []
    pages_visited = 1
    main_text = ""

    if pdf_bytes:
        cap = prompt_store.max_chars()
        main_text = pdf_text or s.extract_pdf_text(pdf_bytes, max_chars=cap)
        if ocr_on and len(main_text) < 280:
            images = render_pdf_pages(pdf_bytes)
    else:
        if crawl is None:
            crawl = s.crawl_site(source_url, html=html)
        main_text = (crawl or {}).get("combined") or ""
        pages_visited = int((crawl or {}).get("pages_visited") or 1)
        if not main_text:
            main_text = s.extract_main_text(html, source_url)
            if not main_text and html:
                soup = BeautifulSoup(html, "lxml")
                for tag in soup(["script", "style", "noscript"]):
                    tag.decompose()
                main_text = s._clean(soup.get_text(" ", strip=True))
        if ocr_on:
            images = download_images(collect_page_images(html, source_url))

    if not main_text and not images:
        return []
    if not web_on:
        # Solo OCR: la IA lee las imagenes; el texto se limita a lo minimo de contexto.
        main_text = main_text[:1500]
        if not images:
            return []

    ocr_note = ""
    if images:
        ocr_note = (
            f"Hay {len(images)} imagen(es) adjunta(s) de la pagina o del PDF. "
            "Lee el texto visible (OCR) y extrae tecnologias, pipelines, ensayos o decisiones."
        )

    cap = prompt_store.max_chars()
    content = (main_text or "(sin texto extraible; use las imagenes)")[:cap]
    context = (source_context or "").strip()
    if context and "{source_context}" not in prompt_store.user_prompt():
        # Plantillas guardadas antes del marcador: el contexto va antes del texto.
        content = f"{context}\n\n{content}"
    prompt = prompt_store.render_user_prompt(
        source_title=source_title,
        source_url=source_url,
        pages_visited=pages_visited,
        source_context=context,
        content=content,
        ocr_note=ocr_note,
        max_items=MAX_AI_ITEMS,
    )
    if main_text:
        prompt += EVIDENCE_INSTRUCTION

    try:
        text, _model = ai_service.generate(
            prompt,
            system=prompt_store.system_prompt(),
            temperature=0.2,
            images=images or None,
            max_tokens=prompt_store.max_tokens(),
            timeout=prompt_store.ai_timeout(),
        )
    except Exception:  # noqa: BLE001
        return []
    if report is not None and text and not text.startswith("[Error"):
        report["answered"] = _decode_payload(text) is not None
    return _parse_items(text, source_url, source_title, source_text=main_text, report=report)


def merge_findings(base: list[dict], extra: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for item in list(extra) + list(base):
        key = (item.get("title") or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= 40:
            break
    return out
