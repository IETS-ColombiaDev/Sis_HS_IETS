"""Ubica una senal en el corpus que leyo el sistema y arma el enlace preciso.

El corpus que recibe la IA junta varias paginas (`## Pagina: URL`), items de un
canal (`## Canal: URL`, una linea `- titulo | url` por item) y fragmentos de
la busqueda web (`- titulo | url | fragmento`). Con la cita textual de la IA se
encuentra el bloque exacto donde esta y, con el, la URL de esa pagina o item:
asi «Abrir fuente original» lleva a la ficha de la senal, no a la portada.

`text_fragment` arma el sufijo `#:~:text=` (Text Fragments): Chrome, Edge,
Safari y Firefox abren la pagina desplazada a la cita y la resaltan. Si el
texto ya no coincide, el navegador simplemente abre la pagina.
"""
from __future__ import annotations

import re
import unicodedata
from urllib.parse import quote

_ITEM_URL = re.compile(r"\|\s*(https?://[^\s|]+)")
_HEADER = re.compile(r"^## (Pagina|Canal): (\S+)")
_SEARCH_HEADER = "## Resultados de busqueda web"
# Enlaces que no conservan el fragmento: redirecciones y visores.
_NO_FRAGMENT_HOSTS = ("news.google.com",)
MIN_QUOTE_CHARS = 12
FRAGMENT_WORDS = 5


def _norm_with_map(text: str) -> tuple[str, list[int]]:
    """Texto plegado (minusculas, sin tildes ni puntuacion) y el indice original de cada caracter."""
    out: list[str] = []
    idx: list[int] = []
    prev_space = True
    for i, ch in enumerate(text or ""):
        base = unicodedata.normalize("NFKD", ch)
        base = "".join(c for c in base if not unicodedata.combining(c)).lower()
        for c in base or " ":
            if c.isalnum():
                out.append(c)
                idx.append(i)
                prev_space = False
            elif not prev_space:
                out.append(" ")
                idx.append(i)
                prev_space = True
    while out and out[-1] == " ":
        out.pop()
        idx.pop()
    return "".join(out), idx


def norm(text: str) -> str:
    return _norm_with_map(text)[0]


def segments(corpus: str, default_url: str) -> list[dict]:
    """Bloques del corpus con la URL a la que pertenecen (pagina, item de canal o resultado)."""
    segs: list[dict] = []
    current: dict | None = None
    section = "pagina"
    section_url = default_url

    def start(url: str, kind: str) -> dict:
        seg = {"url": url, "kind": kind, "lines": []}
        segs.append(seg)
        return seg

    current = start(default_url, "pagina")
    for line in (corpus or "").splitlines():
        head = _HEADER.match(line)
        if head:
            section = "pagina" if head.group(1) == "Pagina" else "canal"
            section_url = head.group(2)
            current = start(section_url, section)
            continue
        if line.startswith(_SEARCH_HEADER):
            section, section_url = "busqueda", default_url
            current = start(section_url, section)
            continue
        if section in ("canal", "busqueda") and line.startswith("- "):
            m = _ITEM_URL.search(line)
            current = start(m.group(1) if m else section_url, section)
        current["lines"].append(line)
    out = []
    for seg in segs:
        text = "\n".join(seg.pop("lines")).strip()
        if text:
            seg["text"] = text
            out.append(seg)
    return out


def _exact_slice(needle_norm: str, seg_text: str) -> str:
    """El tramo original del segmento que coincide con la cita normalizada, o ''."""
    hay, idx = _norm_with_map(seg_text)
    pos = hay.find(needle_norm)
    if pos < 0:
        return ""
    end = pos + len(needle_norm) - 1
    return seg_text[idx[pos] : idx[end] + 1].strip()


def _word_score(needle_norm: str, seg_norm: str) -> float:
    words = [w for w in needle_norm.split() if len(w) >= 4]
    if not words:
        return 0.0
    have = set(seg_norm.split())
    return sum(1 for w in words if w in have) / len(words)


def locate(corpus: str, default_url: str, evidence: str = "", hints: tuple[str, ...] = ()) -> dict:
    """Donde esta la senal: {"url", "quote", "kind", "how"}; url vacia si no se encontro.

    Prioridad: la cita exacta; luego la cita aproximada (>=85 % de palabras);
    luego el nombre de la tecnologia o el titulo tal cual. Entre varios bloques
    que coinciden gana el mas especifico (una ficha antes que la portada).
    """
    segs = segments(corpus, default_url)
    if not segs:
        return {"url": "", "quote": "", "kind": "", "how": ""}
    landing = (default_url or "").rstrip("/")

    def rank(seg: dict) -> int:
        # Ficha o item especifico (0) antes que la pagina de entrada (1).
        return 1 if seg["url"].rstrip("/") == landing else 0

    ordered = sorted(segs, key=rank)
    needle = norm(evidence)
    if len(needle) >= MIN_QUOTE_CHARS:
        for seg in ordered:
            exact = _exact_slice(needle, seg["text"])
            if exact:
                return {"url": seg["url"], "quote": exact, "kind": seg["kind"], "how": "cita"}
        best, best_score = None, 0.0
        for seg in ordered:
            score = _word_score(needle, norm(seg["text"]))
            if score > best_score:
                best, best_score = seg, score
        if best is not None and best_score >= 0.85:
            return {"url": best["url"], "quote": "", "kind": best["kind"], "how": "cita_aproximada"}
    for hint in hints:
        h = norm(hint)
        if len(h) < 6:
            continue
        for seg in ordered:
            exact = _exact_slice(h, seg["text"])
            if exact:
                return {"url": seg["url"], "quote": exact, "kind": seg["kind"], "how": "nombre"}
    return {"url": "", "quote": "", "kind": "", "how": ""}


def _enc(text: str) -> str:
    # En Text Fragments la coma, el guion y el ampersand son sintaxis: van codificados.
    return quote(text, safe="").replace("-", "%2D")


def text_fragment(quote_text: str) -> str:
    """Sufijo `#:~:text=` para abrir la pagina sobre la cita ('' si no aplica)."""
    words = re.sub(r"\s+", " ", (quote_text or "")).strip().split(" ")
    words = [w for w in words if w]
    if not words or len(" ".join(words)) < 4 or any(w in {"...", "…"} for w in words):
        return ""
    if len(words) <= FRAGMENT_WORDS * 2:
        return "#:~:text=" + _enc(" ".join(words))
    start = " ".join(words[:FRAGMENT_WORDS])
    end = " ".join(words[-FRAGMENT_WORDS:])
    return f"#:~:text={_enc(start)},{_enc(end)}"


def with_fragment(url: str, quote_text: str) -> str:
    """La URL con el fragmento de la cita, salvo PDF, redirecciones o si ya trae fragmento."""
    if not url or not quote_text or "#" in url:
        return url
    low = url.lower()
    if any(h in low for h in _NO_FRAGMENT_HOSTS) or low.split("?")[0].endswith(".pdf"):
        return url
    return url + text_fragment(quote_text)


_CITE = re.compile(r"Cita de la fuente: \u00ab([^\u00bb]{4,600})\u00bb")
_ROW_PREFIX = "Fila original del pipeline: "  # = ingest.pipeline_rows.ROW_PREFIX


def quote_from_raw(raw_content: str, name: str = "") -> str:
    """Texto de la senal tal como esta en la pagina: la cita de la IA o, en un pipeline, el producto."""
    raw = raw_content or ""
    m = _CITE.search(raw)
    if m:
        return m.group(1).strip()
    if raw.startswith(_ROW_PREFIX):
        name = (name or "").strip()
        return name if len(name) >= 4 else ""
    return ""


def signal_link(url: str, raw_content: str = "", name: str = "") -> str:
    """URL precisa de la senal con el resaltado de su cita (si la hay)."""
    return with_fragment(url, quote_from_raw(raw_content, name)) if url else ""
