"""Descarga del catalogo de fuentes en Excel (Modulo 0).

El CSV con punto y coma se abria en columnas, pero el equipo tecnico pidio un
formato mejor: un libro con encabezados claros, filtros, hipervinculos y una
hoja de resumen. El CSV se conserva para quien lo use en otros programas.

Hojas:
- Fuentes: una fila por fuente activa del inventario (sin las retiradas).
- Consulta manual (tipo E): las fuentes que consulta una persona y su estado
  de validacion.
- Resumen: conteos por nivel de acceso, nivel de fuente, tipo de tecnologia,
  adaptador y estado de la sonda.
- Retiradas: el inventario anterior, para trazabilidad.
- Informacion: fecha de generacion y significado de los niveles.
"""
from __future__ import annotations

from collections import Counter

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import manual_review, source_profile
from .models import Finding, Source
from .xlsx_report import Column, Sheet, build_workbook, stamp

ACCESS_LABELS = {
    "A": "A · API estable",
    "B": "B · Feed o descarga oficial",
    "C": "C · Página estructurada",
    "D": "D · Página que solo confirma",
    "E": "E · Curaduría humana (consulta manual)",
}
SOURCE_LEVEL_LABELS = {
    "primaria": "Primaria",
    "secundaria": "Secundaria",
    "terciaria": "Terciaria",
    "por_definir": "Por definir",
}
TECH_LABELS = {
    "MED": "Medicamentos",
    "DM": "Dispositivos médicos",
    "BIOM": "Biomarcadores",
    "IA": "Inteligencia artificial",
    "SD": "Salud digital",
    "MT": "Multitecnología",
}
HEALTH_LABELS = {
    "verde": "Verde",
    "ambar": "Ámbar",
    "rojo": "Rojo",
    "": "Sin sonda",
}
FLOW_LABELS = {
    "crawl": "recorrido",
    "follow_links": "enlaces internos",
    "ocr": "OCR",
    "ai": "IA",
    "web_search": "búsqueda web",
}

SOURCE_COLUMNS = [
    Column("Código", 12),
    Column("Fuente", 46, wrap=True),
    Column("URL de consulta", 50, kind="url"),
    Column("Bloque", 22),
    Column("Nivel de acceso", 26),
    Column("Nivel de fuente", 14),
    Column("Tipos de tecnología", 28, wrap=True),
    Column("Adaptador", 16),
    Column("Frecuencia", 12),
    Column("Vigilancia automática", 12),
    Column("Estado de la sonda", 12, kind="status"),
    Column("Mensaje de la sonda", 50, wrap=True),
    Column("Última sonda", 17, kind="date"),
    Column("Señales capturadas", 11, kind="number"),
    Column("País", 14),
    Column("Referencia en la matriz", 24),
    Column("URL de entrada de la matriz", 50, wrap=True),
    Column("Ruta de acceso", 40, wrap=True),
    Column("Qué consultar", 40, wrap=True),
    Column("Restricciones de uso", 40, wrap=True),
    Column("Flujo de escaneo", 26, wrap=True),
]


def _probe_message(source: Source) -> str:
    detail = source.last_probe_detail if isinstance(source.last_probe_detail, dict) else {}
    return str(detail.get("message") or "")


def _source_row(source: Source, findings: int) -> list:
    profile = source_profile.normalize_profile(source.scan_profile)
    level = (source.access_level or "").upper()
    return [
        source.catalog_code or "",
        source.title or "",
        source.url or "",
        source.category or "",
        ACCESS_LABELS.get(level, level),
        SOURCE_LEVEL_LABELS.get(source.source_level or "", source.source_level or ""),
        ", ".join(TECH_LABELS.get(t, t) for t in (source.tech_types or [])),
        source.connector or "",
        source.sync_frequency or "",
        "Sí" if source.scrape_enabled else "No",
        HEALTH_LABELS.get((source.health_status or "").lower(), source.health_status or ""),
        _probe_message(source),
        source.last_probe_at,
        findings,
        source.country or "",
        source.matrix_ref or "",
        "\n".join(u for u in (source.entry_urls or []) if isinstance(u, str)),
        source.access_path or "",
        source.consult_info or "",
        source.usage_restrictions or "",
        ", ".join(v for k, v in FLOW_LABELS.items() if profile.get(k)),
    ]


def build_catalog_xlsx(db: Session) -> tuple[bytes, str]:
    """(bytes del libro, nombre del archivo)."""
    counts = dict(db.query(Finding.source_id, func.count(Finding.id)).group_by(Finding.source_id).all())
    sources = db.query(Source).order_by(Source.category, Source.title).all()
    active = [s for s in sources if not s.retired and s.catalog_active is not False]
    retired = [s for s in sources if s not in active]

    fuentes = Sheet(
        "Fuentes",
        SOURCE_COLUMNS,
        [_source_row(s, counts.get(s.id, 0)) for s in active],
        note=f"{len(active)} fuentes activas del inventario. Filtre con las flechas del encabezado.",
    )

    pending = manual_review.overview(db)
    manual = Sheet(
        "Consulta manual (tipo E)",
        [
            Column("Fuente", 46, wrap=True),
            Column("URL", 50, kind="url"),
            Column("Estado", 14),
            Column("Vence", 17, kind="date"),
            Column("Última validación", 17, kind="date"),
            Column("Validó", 28),
            Column("Resultado", 22),
            Column("Nota", 40, wrap=True),
            Column("Qué consultar", 40, wrap=True),
            Column("Restricciones de uso", 40, wrap=True),
        ],
        [
            [
                item["title"],
                item["url"],
                "Por validar" if item["due"] else "Al día",
                item["next_review_due"],
                item["last_review"]["at"] if item.get("last_review") else None,
                (item.get("last_review") or {}).get("by", ""),
                manual_review.OUTCOME_LABELS.get((item.get("last_review") or {}).get("outcome", ""), ""),
                (item.get("last_review") or {}).get("note", ""),
                item["consult_info"],
                item["usage_restrictions"],
            ]
            for item in pending["items"]
        ],
        note=(
            f"{pending['due']} de {pending['total']} fuentes de consulta manual están por validar. "
            "Se validan en la Bandeja de entrada › Fuentes de consulta manual."
        ),
    )

    summary_rows: list[list] = []

    def block(title: str, counter: Counter, labels: dict | None = None) -> None:
        summary_rows.append([title, ""])
        for key, n in sorted(counter.items(), key=lambda kv: (-kv[1], str(kv[0]))):
            summary_rows.append([f"   {(labels or {}).get(key, key) or 'Sin dato'}", n])
        summary_rows.append(["", ""])

    block("Nivel de acceso", Counter((s.access_level or "").upper() for s in active), ACCESS_LABELS)
    block("Nivel de fuente", Counter(s.source_level or "" for s in active), SOURCE_LEVEL_LABELS)
    block("Tipo de tecnología", Counter(t for s in active for t in (s.tech_types or [])), TECH_LABELS)
    block("Adaptador", Counter(s.connector or "" for s in active))
    block("Estado de la sonda", Counter((s.health_status or "").lower() for s in active), HEALTH_LABELS)
    block("Vigilancia automática", Counter("Sí" if s.scrape_enabled else "No" for s in active))
    resumen = Sheet("Resumen", [Column("Concepto", 46), Column("Fuentes", 12, kind="number")], summary_rows)

    retiradas = Sheet(
        "Retiradas",
        SOURCE_COLUMNS,
        [_source_row(s, counts.get(s.id, 0)) for s in retired],
        note="Inventario anterior o fuentes retiradas: se conservan para trazabilidad, no se vigilan.",
    )

    info = [
        ("Fuentes activas", len(active)),
        ("Fuentes retiradas", len(retired)),
        ("Nivel de acceso", "Cómo obtiene el sistema la información, no su importancia: " + "; ".join(ACCESS_LABELS.values()) + "."),
        ("Estado de la sonda", "Verde: responde. Ámbar: responde con cambios o la URL debe corregirse. Rojo: no responde o bloquea. Sin sonda: aún no se ha probado."),
        ("Consulta manual (tipo E)", "Las consulta una persona; la hoja «Consulta manual (tipo E)» muestra cuáles están por validar."),
    ]
    data = build_workbook([fuentes, manual, resumen, retiradas], title="Catálogo de fuentes del IETS", info=info)
    return data, f"catalogo_fuentes_iets_{stamp()}.xlsx"
