"""Visita real de sitios web y apoyo de IA / OCR.

1. Entra a la URL (HTML o PDF) y extrae texto e imagenes.
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

from . import ai_service

MAX_AI_ITEMS = 18
MAX_IMAGES = 3
MAX_IMAGE_BYTES = 1_800_000
MAX_PAGE_CHARS = 9000

_IMG_SKIP = re.compile(r"logo|icon|sprite|avatar|pixel|tracking|badge|button", re.I)


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
    headers = {"User-Agent": _scraper().USER_AGENT, "Accept": "image/*,*/*"}
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


def _normalize_item(item: dict, source_url: str, source_title: str) -> dict | None:
    s = _scraper()
    title = s._clean(str(item.get("title") or item.get("technology") or ""))
    if not title or len(title) < 8:
        return None
    summary = s._clean(str(item.get("summary") or item.get("description") or ""))
    blob = f"{title} {summary}"
    ttype = str(item.get("technology_type") or "")
    if ttype not in {"medicamento", "dispositivo", "digital", "otro"}:
        ttype = s._classify_type(blob)
    horizon = str(item.get("horizon") or "")
    if horizon not in {"emergente", "transicional", "inminente"}:
        horizon = s._classify_horizon(blob) or "transicional"
    url = str(item.get("url") or source_url)[:1020]
    return {
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


def _parse_items(text: str, source_url: str, source_title: str) -> list[dict]:
    if not text or text.startswith("[Error"):
        return []
    match = re.search(r"\[[\s\S]*\]", text)
    if not match:
        obj = re.search(r"\{[\s\S]*\}", text)
        if not obj:
            return []
        try:
            data = json.loads(obj.group(0))
        except json.JSONDecodeError:
            return []
        rows = data.get("findings") if isinstance(data, dict) else [data]
    else:
        try:
            rows = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = _normalize_item(row, source_url, source_title)
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
) -> list[dict]:
    """Pide a la IA que entre al contenido real de la pagina y extraiga senales."""
    if not ai_service.web_assist_enabled() and not ai_service.ocr_enabled():
        return []

    s = _scraper()
    main_text = ""
    images: list[dict] = []
    if pdf_bytes:
        main_text = pdf_text or s.extract_pdf_text(pdf_bytes, max_chars=MAX_PAGE_CHARS)
        if ai_service.ocr_enabled() and len(main_text) < 280:
            images = render_pdf_pages(pdf_bytes)
    else:
        main_text = s.extract_main_text(html, source_url)
        if not main_text and html:
            soup = BeautifulSoup(html, "lxml")
            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()
            main_text = s._clean(soup.get_text(" ", strip=True))
        if ai_service.ocr_enabled():
            images = download_images(collect_page_images(html, source_url))

    if not main_text and not images:
        return []

    ocr_note = ""
    if images:
        ocr_note = (
            f"\nHay {len(images)} imagen(es) adjunta(s) de la pagina o del PDF. "
            "Lee el texto visible (OCR) y extrae tecnologias, pipelines, ensayos o decisiones."
        )

    prompt = f"""Visita analitica de una fuente de escaneo de horizonte sanitario.

Fuente: {source_title}
URL: {source_url}

Contenido extraido del sitio (puede estar incompleto):
---
{(main_text or '(sin texto extraible; use las imagenes)')[:MAX_PAGE_CHARS]}
---
{ocr_note}

Devuelve SOLO un JSON array (sin markdown) de hallazgos reales de tecnologias sanitarias.
Cada item:
{{
  "title": "titulo concreto de la tecnologia o senal",
  "technology": "nombre corto",
  "summary": "que se anuncia y por que importa",
  "url": "enlace si aparece, si no la URL de la fuente",
  "technology_type": "medicamento|dispositivo|digital|otro",
  "horizon": "emergente|transicional|inminente",
  "therapeutic_area": "area o vacio",
  "phase": "fase o vacio",
  "published_date": "fecha si aparece"
}}
No inventes tecnologias que no esten en el contenido. Maximo {MAX_AI_ITEMS} items.
Si no hay senales, devuelve []."""

    text, _model = ai_service.generate(
        prompt,
        system=ai_service.SYSTEM_ANALYST,
        temperature=0.3,
        images=images or None,
    )
    return _parse_items(text, source_url, source_title)


def merge_findings(base: list[dict], extra: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for item in list(base) + list(extra):
        key = (item.get("title") or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= 40:
            break
    return out
