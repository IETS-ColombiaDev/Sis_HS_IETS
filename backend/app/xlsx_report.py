"""Libros de Excel con formato para las descargas del sistema.

Una sola forma de entregar tablas en .xlsx: encabezado con la linea grafica,
filtros, primera fila y columna fijas, anchos legibles, texto ajustado,
hipervinculos en las columnas de URL y una hoja de informacion con la fecha de
generacion. Lo usan el catalogo de fuentes, el informe de sondas y el
diagnostico de enlaces (RF-001).

Las celdas que empiezan por `=`, `+`, `-` o `@` se escriben como texto para que
Excel no las interprete como formulas (inyeccion de formulas en CSV/XLSX).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
COLOMBIA_TZ = ZoneInfo("America/Bogota")

HEADER_FILL = "4F46E5"  # purpleDark de la linea grafica
HEADER_FONT = "FFFFFF"
BAND_FILL = "F8FAFC"
BORDER = "E2E8F0"
STATUS_FILLS = {
    "verde": "DCFCE7",
    "ambar": "FEF3C7",
    "rojo": "FEE2E2",
    "sin_sonda": "F1F5F9",
}
MAX_WIDTH = 60
MIN_WIDTH = 8


@dataclass
class Column:
    """Columna de una hoja: titulo visible, ancho sugerido y tipo de celda."""

    title: str
    width: int | None = None
    kind: str = "text"  # text | url | number | date | status
    wrap: bool = False


@dataclass
class Sheet:
    title: str
    columns: list[Column]
    rows: list[list] = field(default_factory=list)
    note: str = ""


def _safe(value):
    if isinstance(value, str):
        if value[:1] in ("=", "+", "-", "@"):
            return "'" + value
        # Excel no admite caracteres de control en las celdas.
        return "".join(ch for ch in value if ch in "\t\n" or ord(ch) >= 32)[:32000]
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(COLOMBIA_TZ).replace(tzinfo=None)
        return value
    return value


def build_workbook(sheets: list[Sheet], *, title: str, info: list[tuple[str, object]] | None = None) -> bytes:
    """Devuelve los bytes del .xlsx con las hojas en orden y una hoja de informacion al final."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)
    thin = Side(style="thin", color=BORDER)
    header_font = Font(bold=True, color=HEADER_FONT)
    header_fill = PatternFill("solid", fgColor=HEADER_FILL)
    band_fill = PatternFill("solid", fgColor=BAND_FILL)
    link_font = Font(color="2563EB", underline="single")

    for spec in sheets:
        ws = wb.create_sheet(spec.title[:31])
        start = 1
        if spec.note:
            ws.cell(row=1, column=1, value=_safe(spec.note)).font = Font(italic=True, color="64748B")
            ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(1, len(spec.columns)))
            start = 2
        for idx, col in enumerate(spec.columns, start=1):
            cell = ws.cell(row=start, column=idx, value=col.title)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            cell.border = Border(bottom=thin)
        ws.row_dimensions[start].height = 30
        widths = [len(c.title) for c in spec.columns]
        for r_off, row in enumerate(spec.rows, start=1):
            r = start + r_off
            for idx, col in enumerate(spec.columns, start=1):
                value = row[idx - 1] if idx - 1 < len(row) else ""
                cell = ws.cell(row=r, column=idx, value=_safe(value))
                if col.kind == "url" and isinstance(value, str) and value.lower().startswith(("http://", "https://")):
                    cell.hyperlink = value[:2000]
                    cell.font = link_font
                if col.kind == "status" and isinstance(value, str):
                    fill = STATUS_FILLS.get(value.strip().lower())
                    if fill:
                        cell.fill = PatternFill("solid", fgColor=fill)
                elif r_off % 2 == 0:
                    cell.fill = band_fill
                cell.alignment = Alignment(vertical="top", wrap_text=col.wrap)
                cell.border = Border(bottom=thin)
                if col.kind == "date" and isinstance(cell.value, datetime):
                    cell.number_format = "yyyy-mm-dd hh:mm"
                text = str(value) if value is not None else ""
                widths[idx - 1] = max(widths[idx - 1], min(len(text), MAX_WIDTH))
        for idx, col in enumerate(spec.columns, start=1):
            width = col.width or widths[idx - 1] + 2
            ws.column_dimensions[get_column_letter(idx)].width = max(MIN_WIDTH, min(MAX_WIDTH, width))
        last_col = get_column_letter(max(1, len(spec.columns)))
        ws.auto_filter.ref = f"A{start}:{last_col}{start + max(1, len(spec.rows))}"
        ws.freeze_panes = ws.cell(row=start + 1, column=2)
        ws.sheet_view.zoomScale = 100

    meta = wb.create_sheet("Información")
    meta.column_dimensions["A"].width = 28
    meta.column_dimensions["B"].width = 90
    meta.cell(row=1, column=1, value=title).font = Font(bold=True, size=14, color=HEADER_FILL)
    rows = [
        ("Sistema", "Sistema de Escaneo de Horizonte del IETS"),
        ("Generado", datetime.now(COLOMBIA_TZ).strftime("%Y-%m-%d %H:%M (hora de Colombia)")),
        *(info or []),
    ]
    for i, (label, value) in enumerate(rows, start=3):
        meta.cell(row=i, column=1, value=label).font = Font(bold=True)
        cell = meta.cell(row=i, column=2, value=_safe(value))
        cell.alignment = Alignment(wrap_text=True, vertical="top")

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def stamp() -> str:
    return datetime.now(COLOMBIA_TZ).strftime("%Y-%m-%d")
