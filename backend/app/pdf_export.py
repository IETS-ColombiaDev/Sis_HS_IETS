"""PDF nativo de las plantillas institucionales (RF14, RF18, RF19).

Convierte el HTML de `report_html` en PDF con reportlab, sin navegador ni
librerias del sistema: funciona igual en Windows, en el contenedor y en Render.
Solo entiende los elementos que usan esas plantillas (encabezado, metadatos,
indicadores, capitulos, bloques, tablas y listas); no es un motor HTML general.
"""
from __future__ import annotations

import io
import os
from html import escape

from bs4 import BeautifulSoup, NavigableString, Tag

BRAND = "#1D4ED8"
BRAND_2 = "#0F766E"
INK = "#0F172A"
MUTED = "#64748B"
LINE = "#E2E8F0"
PAPER = "#F8FAFC"

_fonts_ready = False


def _register_fonts() -> tuple[str, str]:
    """Bitstream Vera (incluida en reportlab) cubre tildes, enie, rayas y comillas."""
    global _fonts_ready
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    if not _fonts_ready:
        import reportlab

        folder = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
        try:
            pdfmetrics.registerFont(TTFont("IETS", os.path.join(folder, "Vera.ttf")))
            pdfmetrics.registerFont(TTFont("IETS-Bold", os.path.join(folder, "VeraBd.ttf")))
            pdfmetrics.registerFont(TTFont("IETS-Italic", os.path.join(folder, "VeraIt.ttf")))
            pdfmetrics.registerFont(TTFont("IETS-BoldItalic", os.path.join(folder, "VeraBI.ttf")))
            from reportlab.pdfbase.pdfmetrics import registerFontFamily

            registerFontFamily("IETS", normal="IETS", bold="IETS-Bold", italic="IETS-Italic", boldItalic="IETS-BoldItalic")
        except Exception:  # noqa: BLE001
            return "Helvetica", "Helvetica-Bold"
        _fonts_ready = True
    return "IETS", "IETS-Bold"


def _styles():
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle

    regular, bold = _register_fonts()
    base = ParagraphStyle("base", fontName=regular, fontSize=9.5, leading=13.5, textColor=colors.HexColor(INK))
    return {
        "p": base,
        "kicker": ParagraphStyle("kicker", parent=base, fontName=bold, fontSize=7.5, leading=10, textColor=colors.HexColor(BRAND), spaceAfter=2),
        "sub": ParagraphStyle("sub", parent=base, fontSize=8.5, leading=11.5, textColor=colors.HexColor(MUTED)),
        "h1": ParagraphStyle("h1", parent=base, fontName=bold, fontSize=17, leading=21, spaceBefore=4, spaceAfter=4),
        "h2": ParagraphStyle("h2", parent=base, fontName=bold, fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=6, textColor=colors.HexColor("#134E4A")),
        "h3": ParagraphStyle("h3", parent=base, fontName=bold, fontSize=10, leading=13, spaceAfter=3, textColor=colors.HexColor("#1E3A8A")),
        "num": ParagraphStyle("num", parent=base, fontName=bold, fontSize=8, leading=10, textColor=colors.HexColor(BRAND_2)),
        "label": ParagraphStyle("label", parent=base, fontName=bold, fontSize=7, leading=9, textColor=colors.HexColor(MUTED)),
        "value": ParagraphStyle("value", parent=base, fontName=bold, fontSize=9.5, leading=12),
        "kpi": ParagraphStyle("kpi", parent=base, fontName=bold, fontSize=18, leading=22, textColor=colors.HexColor(BRAND)),
        "cell": ParagraphStyle("cell", parent=base, fontSize=9, leading=12),
        "th": ParagraphStyle("th", parent=base, fontName=bold, fontSize=7.5, leading=10, textColor=colors.HexColor(MUTED)),
        "stamp": ParagraphStyle("stamp", parent=base, fontName=bold, fontSize=7.5, leading=10, textColor=colors.HexColor("#92400E")),
        "footer": ParagraphStyle("footer", parent=base, fontSize=7.5, leading=10, textColor=colors.HexColor(MUTED)),
    }


def _safe(text: str) -> str:
    """Sustituye lo que la fuente no dibuja: 'β-amiloide' -> 'beta-amiloide'."""
    from reportlab.pdfbase import pdfmetrics

    try:
        glyphs = pdfmetrics.getFont(_register_fonts()[0]).face.charToGlyph
    except Exception:  # noqa: BLE001
        return text
    if all(ord(c) in glyphs or c in "\n\t" for c in text):
        return text
    import unicodedata

    out = []
    for c in text:
        if ord(c) in glyphs or c in "\n\t":
            out.append(c)
            continue
        name = unicodedata.name(c, "")
        if name.startswith("GREEK"):
            letter = name.split()[-1].lower()
            out.append(letter.capitalize() if "CAPITAL" in name else letter)
        else:
            plain = unicodedata.normalize("NFKD", c).encode("ascii", "ignore").decode()
            out.append(plain or "?")
    return "".join(out)


def _inline(node) -> str:
    """Texto con negrita, cursiva y enlaces en el marcado minimo de reportlab."""
    if isinstance(node, NavigableString):
        return escape(_safe(str(node)), quote=False)
    if not isinstance(node, Tag):
        return ""
    inner = "".join(_inline(c) for c in node.children)
    if node.name in {"b", "strong"}:
        return f"<b>{inner}</b>"
    if node.name in {"i", "em"}:
        return f"<i>{inner}</i>"
    if node.name == "a" and node.get("href"):
        return f'<link href="{escape(node["href"])}" color="{BRAND}">{inner}</link>'
    if node.name == "br":
        return "<br/>"
    return inner


def _text(node) -> str:
    return _safe(" ".join(node.get_text(" ", strip=True).split()))


def _classes(node: Tag) -> set[str]:
    return set(node.get("class") or [])


def _grid(node: Tag, st, *, kpi: bool):
    """`.meta` y `.kpis`: celdas con rotulo y valor en una fila."""
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    cells = []
    for child in node.find_all(["div"], recursive=False):
        label = child.find("span" if kpi else "b")
        value = child.find("b" if kpi else "span")
        cells.append(
            [
                Paragraph(_inline(value) if value else "", st["kpi" if kpi else "value"]),
                Paragraph(escape((_text(label) if label else "").upper()), st["label"]),
            ]
            if kpi
            else [
                Paragraph(escape((_text(label) if label else "").upper()), st["label"]),
                Paragraph(_inline(value) if value else "", st["value"]),
            ]
        )
    if not cells:
        return []
    table = Table([cells], colWidths=None)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(PAPER)),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(LINE)),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, colors.HexColor(LINE)),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return [table, _space(10)]


def _space(h: float):
    from reportlab.platypus import Spacer

    return Spacer(1, h)


def _table(node: Tag, st):
    from reportlab.lib import colors
    from reportlab.platypus import Paragraph, Table, TableStyle

    rows = []
    for tr in node.find_all("tr"):
        cells = tr.find_all(["th", "td"])
        rows.append([Paragraph(_inline(c), st["th" if c.name == "th" else "cell"]) for c in cells])
    if not rows:
        return []
    width = max(len(r) for r in rows)
    rows = [r + [""] * (width - len(r)) for r in rows]
    table = Table(rows, repeatRows=1 if node.find("th") else 0, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor(LINE)),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return [table, _space(8)]


def _block(node: Tag, st, width: float):
    """`article.block`: recuadro con filete de color a la izquierda."""
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    inner = _flow(node, st, width - 16)
    if not inner:
        return []
    table = Table([[inner]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(LINE)),
                ("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor(BRAND)),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return [table, _space(7)]


def _flow(root: Tag, st, width: float) -> list:
    from reportlab.platypus import HRFlowable, ListFlowable, ListItem, Paragraph

    out: list = []
    for node in root.children:
        if isinstance(node, NavigableString):
            if str(node).strip():
                out.append(Paragraph(escape(_safe(str(node).strip()), quote=False), st["p"]))
            continue
        if not isinstance(node, Tag) or node.name in {"style", "script", "title", "meta"}:
            continue
        cls = _classes(node)
        name = node.name
        if "brand-mark" in cls:
            continue
        if name == "h1":
            out.append(Paragraph(_inline(node), st["h1"]))
        elif name == "h2":
            out.append(Paragraph(_inline(node), st["h2"]))
        elif name == "h3":
            out.append(Paragraph(_inline(node), st["h3"]))
        elif "kicker" in cls:
            out.append(Paragraph(escape(_text(node).upper()), st["kicker"]))
        elif "chapter-num" in cls:
            out.append(Paragraph(escape(_text(node)), st["num"]))
        elif "sub" in cls:
            out.append(Paragraph(_inline(node), st["sub"]))
        elif "stamps" in cls:
            stamps = "  ·  ".join(_text(s) for s in node.find_all("div"))
            if stamps:
                out.append(Paragraph(escape(stamps), st["stamp"]))
        elif "meta" in cls:
            out.extend(_grid(node, st, kpi=False))
        elif "kpis" in cls:
            out.extend(_grid(node, st, kpi=True))
        elif name == "article" or "block" in cls:
            out.extend(_block(node, st, width))
        elif name == "table":
            out.extend(_table(node, st))
        elif name in {"ul", "ol"}:
            items = [ListItem(Paragraph(_inline(li), st["p"]), leftIndent=12) for li in node.find_all("li", recursive=False)]
            if items:
                out.append(ListFlowable(items, bulletType="bullet", start="•", leftIndent=12))
                out.append(_space(6))
        elif name == "p":
            out.append(Paragraph(_inline(node), st["p"]))
            out.append(_space(3))
        elif name == "footer":
            from reportlab.lib import colors

            out.append(_space(10))
            out.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor(LINE)))
            out.append(_space(4))
            out.append(Paragraph(_inline(node), st["footer"]))
        elif name == "header":
            out.extend(_flow(node, st, width))
            out.append(HRFlowable(width="100%", thickness=2, color=colors_brand()))
            out.append(_space(10))
        else:
            out.extend(_flow(node, st, width))
    return out


def colors_brand():
    from reportlab.lib import colors

    return colors.HexColor(BRAND)


def html_to_pdf(html: str, title: str = "IETS") -> bytes:
    """PDF A4 con numeracion de pagina a partir de una plantilla de `report_html`."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate

    soup = BeautifulSoup(html or "", "lxml")
    root = soup.select_one(".sheet") or soup.body or soup
    st = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=title,
        author="IETS · Escaneo de horizonte",
    )
    story = _flow(root, st, doc.width) or [_space(1)]
    regular, _bold = _register_fonts()

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont(regular, 7.5)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.drawString(16 * mm, 9 * mm, "IETS · Sistema de Escaneo de Horizonte")
        canvas.drawRightString(A4[0] - 16 * mm, 9 * mm, f"Página {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def pdf_response(html: str, filename: str, title: str):
    from fastapi import Response

    return Response(
        content=html_to_pdf(html, title=title),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
