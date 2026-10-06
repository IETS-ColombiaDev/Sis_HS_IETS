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

from . import ai_service, prompt_store

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
    return _drop_invented_nct(out, source_text)


def _loads_payload(text: str) -> list:
    blob = _FENCE.sub("", text).replace("```", "")
    decoder = json.JSONDecoder()
    arrays: list = []
    objects: list = []
    for i, ch in enumerate(blob):
        if ch not in "[{":
            continue
        piece = blob[i:]
        variants = [piece]
        stripped = re.sub(r",\s*([}\]])", r"\1", piece)
        if stripped != piece:
            variants.append(stripped)
        decoded = None
        for candidate in variants:
            try:
                decoded, _end = decoder.raw_decode(candidate)
                break
            except json.JSONDecodeError:
                continue
        if isinstance(decoded, list):
            arrays.append(decoded)
            if decoded:
                break
        elif isinstance(decoded, dict):
            objects.append(decoded)
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
        return [objects[0]]
    return []


def _parse_items(text: str, source_url: str, source_title: str, source_text: str = "") -> list[dict]:
    if not text or text.startswith("[Error"):
        return []
    rows = _loads_payload(text)
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = _normalize_item(row, source_url, source_title, source_text)
        if item:
            out.append(item)
        if len(out) >= MAX_AI_ITEMS:
            break
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
) -> list[dict]:
    """Pide a la IA que entre al contenido real del sitio (listado + fichas).

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
    return _parse_items(text, source_url, source_title, source_text=main_text)


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
