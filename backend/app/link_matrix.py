"""Matriz de fuentes por enlace (MATRIZ_FUENTES_ESCANEO_EH, hoja "1 enlace-fila").

Desde el 17-11-2026 el inventario de fuentes es la primera hoja de este Excel:
una fila por enlace, con columnas ID, Tipo de Entidad, Nivel de Fuente, Fuente
verificada, Sitio / organizacion, Pais, Tipo de Tecnologia, Origen del enlace,
N° original, URL, Dominio, Tipo de material, Ruta de acceso, Informacion a
consultar, Observaciones, Estructura de publicacion, Formato, Frecuencia,
Idioma, Disponibilidad de Interfaz y Restricciones de uso.

Cada fila es una fuente propia (`catalog_code` = EH-<ID>). Asi el rastreo de
cada enlace lleva su propio contexto (que consultar, ruta de acceso, tipo de
material, restricciones) y la IA sabe que buscar en esa pagina concreta.

Reglas de construccion de cada fuente:

- Origen "Consulta activa (SI EAA)": se vigila. Origen "Informacion general /
  metodologica": queda en el catalogo como referencia, sin ingesta.
- Restricciones que impiden el rastreo automatico (validacion humana, login,
  prohibicion expresa) o sitios que el catalogo anterior ya tenia en consulta
  manual: conector `manual`, sin ingesta.
- Los registros con API oficial (ClinicalTrials.gov, ICTRP, CTIS, PubMed, PCORI,
  EMA, openFDA, Health Canada) heredan el adaptador del catalogo verificado D-06
  en la primera fila que corresponde: escanear la portada no trae datos
  estructurados. La URL de la matriz queda como referencia de la fuente.
- La URL repetida en dos filas se carga una sola vez y se informa.

Las fuentes que existian antes se retiran (no se borran) y se marcan `legacy`:
sus senales pendientes pasan a la bandeja "Legacy" de la Bandeja de entrada,
desde donde se pueden recuperar (ver routers/technologies).
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from .models import IngestJob, Source, Technology

FORMAT = "enlaces"
DATA_FILE = Path(__file__).resolve().parent / "data" / "matriz_enlaces_eh.json"
CODE_PREFIX = "EH-"
LINK_MARK = "matriz_enlaces_eh"
LEGACY_MARK = "legacy_matriz_anterior"
LEGACY_TAG = "legacy"
MODE_KEY = "cfg.sources.catalog_mode"
MODE_LINKS = "matriz_enlaces"

ORIGIN_ACTIVE = "consulta_activa"
ORIGIN_GENERAL = "informacion_general"
ORIGIN_LABELS = {
    ORIGIN_ACTIVE: "Consulta activa (SI EAA)",
    ORIGIN_GENERAL: "Información general / metodológica",
}

# Encabezado normalizado -> campo (la hoja trae los nombres literales).
HEADER_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("link_id", ("id",)),
    ("entity_label", ("tipo de entidad",)),
    ("source_level_raw", ("nivel de fuente",)),
    ("verified", ("fuente verificada", "verificada")),
    ("name", ("sitio / organizacion", "sitio/organizacion", "organizacion")),
    ("country", ("pais",)),
    ("tech_types_raw", ("tipo de tecnologia",)),
    ("link_origin_raw", ("origen del enlace",)),
    ("original_number", ("n° original", "no original", "n original", "numero original")),
    ("url", ("url",)),
    ("domain", ("dominio",)),
    ("material_type", ("tipo de material",)),
    ("access_path", ("ruta de acceso",)),
    ("consult_info", ("informacion a consultar",)),
    ("observations", ("observaciones",)),
    ("publication_structure", ("estructura de publicacion",)),
    ("format", ("formato",)),
    ("frequency_raw", ("frecuencia",)),
    ("language", ("idioma",)),
    ("interface", ("interfaz",)),
    ("restrictions", ("restricciones",)),
)
REQUIRED = ("link_id", "name", "url", "link_origin_raw")

# Restricciones que impiden rastrear de forma automatica.
_MANUAL_RESTRICTION = re.compile(
    r"(validaci[oó]n por humano|captcha|viola sus pol[ií]ticas|bloquear[aá]|requiere creaci[oó]n de usuario|"
    r"login|log in|contrase|suscripci|subscription|de pago|paid|solo miembros)",
    re.I,
)

# Registros con API oficial: la primera fila de consulta activa cuya URL empieza
# por el patron hereda el adaptador del catalogo D-06 (codigo).
API_RULES: tuple[tuple[str, str], ...] = (
    ("clinicaltrials.gov", "FP-CT-01"),
    # ICTRP (OMS) no tiene API publica estable: su enlace se rastrea como pagina web.
    ("euclinicaltrials.eu", "FP-CT-03"),
    ("pubmed.ncbi.nlm.nih.gov", "FP-LI-01"),
    ("horizonscandb.pcori.org", "FP-HT-01"),
    ("ema.europa.eu/en/medicines/download-medicine-data", "FP-RG-04"),
    ("accessdata.fda.gov/scripts/cder/daf", "FP-RG-01"),
    ("canada.ca/en/health-canada/services/drug-health-product-review-approval/submissions-under-review", "FP-RG-07"),
)
INHERITED_API_FIELDS = (
    "connector", "connector_config", "access_level", "rate_limit_rpm", "requires_api_key", "terms_url", "provides_fields",
)
# Paginas por enlace: una fuente es un solo enlace, el recorrido se queda cerca.
LINK_MAX_PAGES = 12


def fold(text) -> str:
    from .source_matrix import fold as _fold

    return _fold(text)


def _clean(value) -> str:
    from .source_matrix import clean_text

    return clean_text("" if value is None else str(value))


def _strip_numbering(text: str) -> str:
    lines = [re.sub(r"^\s*\d+(\.\d+)*\.?\s*", "", ln).strip() for ln in (text or "").splitlines()]
    return " ".join(ln for ln in lines if ln)


def _int_id(value) -> int | None:
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def _norm_url(url: str) -> str:
    from .signal_links import _norm

    return _norm(url)


def _url_key(url: str) -> str:
    parts = urlsplit(url or "")
    host = (parts.hostname or "").lower().removeprefix("www.")
    return f"{host}{parts.path}".lower() + (f"?{parts.query}".lower() if parts.query else "")


# --------------------------------------------------------------------------- #
#  Lectura
# --------------------------------------------------------------------------- #
def _map_headers(values) -> dict[int, str]:
    mapping: dict[int, str] = {}
    used: set[str] = set()
    for idx, value in enumerate(values):
        head = fold(value)
        if not head:
            continue
        for field, needles in HEADER_RULES:
            if field in used:
                continue
            if field == "link_id":
                hit = head == "id"
            elif field == "url":
                hit = head == "url"
            else:
                hit = any(n in head for n in needles)
            if hit:
                mapping[idx] = field
                used.add(field)
                break
    return mapping


def is_link_sheet(ws) -> bool:
    for r in range(1, min(ws.max_row, 8) + 1):
        mapping = _map_headers([c.value for c in ws[r]])
        if all(f in mapping.values() for f in REQUIRED):
            return True
    return False


def parse_link_sheet(ws) -> list[dict]:
    from .source_matrix import clean_url, parse_frequency, parse_source_level, parse_tech_types

    header_row = None
    mapping: dict[int, str] = {}
    for r in range(1, min(ws.max_row, 8) + 1):
        mapping = _map_headers([c.value for c in ws[r]])
        if all(f in mapping.values() for f in REQUIRED):
            header_row = r
            break
    if header_row is None:
        raise ValueError("La primera hoja no tiene los encabezados ID, Sitio / organización, Origen del enlace y URL.")
    rows: list[dict] = []
    for r in range(header_row + 1, ws.max_row + 1):
        cells = ws[r]
        raw: dict[str, str] = {}
        for idx, field in mapping.items():
            if idx < len(cells):
                raw[field] = "" if cells[idx].value is None else str(cells[idx].value)
        name = " / ".join(ln.strip() for ln in (raw.get("name") or "").splitlines() if ln.strip())
        url_text = (raw.get("url") or "").strip()
        if not name and not url_text:
            continue
        link_id = _int_id(raw.get("link_id"))
        origin_text = fold(raw.get("link_origin_raw"))
        origin = ORIGIN_GENERAL if ("general" in origin_text or "metodolog" in origin_text) else ORIGIN_ACTIVE
        url = clean_url(url_text)
        material = _strip_numbering(raw.get("material_type") or "")
        number = _clean(raw.get("original_number"))
        if number.endswith(".0") and number[:-2].isdigit():
            number = number[:-2]
        rows.append(
            {
                "excel_row": r,
                "link_id": link_id,
                "code": f"{CODE_PREFIX}{link_id:03d}" if link_id is not None else "",
                "name": name,
                "entity_label": _clean(raw.get("entity_label")),
                "source_level": parse_source_level(raw.get("source_level_raw", "")),
                "source_level_raw": _clean(raw.get("source_level_raw")),
                "verified": _clean(raw.get("verified")).upper(),
                "country": _clean(raw.get("country")),
                "tech_types": parse_tech_types(raw.get("tech_types_raw", "")),
                "tech_types_raw": _clean(raw.get("tech_types_raw")),
                "link_origin": origin,
                "link_origin_raw": _clean(raw.get("link_origin_raw")),
                "original_number": "" if number.lower() == "none" else number,
                "url": url,
                "url_raw": url_text,
                "domain": _clean(raw.get("domain")) or (urlsplit(url).hostname or "").removeprefix("www."),
                "material_type": material,
                "access_path": _clean(raw.get("access_path")),
                "consult_info": _clean(raw.get("consult_info")),
                "observations": _clean(raw.get("observations")),
                "publication_structure": _clean(raw.get("publication_structure")),
                "format": _clean(raw.get("format")),
                "frequency": parse_frequency(raw.get("frequency_raw", "")),
                "frequency_raw": _clean(raw.get("frequency_raw")),
                "language": _clean(raw.get("language")),
                "interface": _clean(raw.get("interface")),
                "restrictions": _clean(raw.get("restrictions")),
            }
        )
    _annotate_issues(rows)
    return rows


def _annotate_issues(rows: list[dict]) -> None:
    seen: dict[str, dict] = {}
    ids: dict[int, int] = {}
    for row in rows:
        issues: list[dict] = []
        if not row["url"]:
            issues.append({"kind": "url_invalida", "detail": f"La celda URL no trae una URL válida: {row['url_raw'][:120] or '(vacía)'}"})
        if row["link_id"] is None:
            issues.append({"kind": "sin_id", "detail": "La fila no tiene ID numérico."})
        elif row["link_id"] in ids:
            issues.append({"kind": "id_repetido", "detail": f"El ID {row['link_id']} ya está en la fila {ids[row['link_id']]}."})
        else:
            ids[row["link_id"]] = row["excel_row"]
        key = _norm_url(row["url"]) if row["url"] else ""
        if key and key in seen:
            first = seen[key]
            row["duplicate_of"] = first["code"]
            issues.append({
                "kind": "url_repetida",
                "detail": f"La URL ya está en el ID {first['link_id']} (fila {first['excel_row']}); se carga una sola vez.",
            })
        elif key:
            seen[key] = row
        if not row["tech_types"]:
            issues.append({"kind": "sin_tipo_tecnologia", "detail": f"Tipo de tecnología no reconocido: {row['tech_types_raw'] or '(vacío)'}"})
        row["issues"] = issues
        # Compatibilidad con el resto del sistema (procedencia de URL, catalogo).
        row["codes"] = [row["code"]] if row["code"] else []
        row["matrix_ref"] = f"MATRIZ_FUENTES_ESCANEO_EH ID {row['link_id']} (fila {row['excel_row']})"
        row["consult_urls"] = [row["url"]] if row["url"] and row["link_origin"] == ORIGIN_ACTIVE else []
        row["methodology_urls"] = [row["url"]] if row["url"] and row["link_origin"] == ORIGIN_GENERAL else []
        row["origin"] = row["verified"]


def parse_aux_sheets(wb) -> dict:
    """Hojas de apoyo: Criterios de busqueda y Fuentes sin buscador."""
    from .source_matrix import TERMS_SHEET_HINT, _parse_terms_sheet

    terms_ws = next((ws for ws in wb.worksheets if TERMS_SHEET_HINT in fold(ws.title)), None)
    no_search_ws = next((ws for ws in wb.worksheets if "sin buscador" in fold(ws.title)), None)
    no_search: list[dict] = []
    if no_search_ws is not None:
        for row in no_search_ws.iter_rows(values_only=True):
            if not row or len(row) < 2 or not row[1] or fold(row[1]).startswith("sitio"):
                continue
            no_search.append({"original_row": _clean(row[0]), "name": _clean(row[1]), "note": _clean(row[2] if len(row) > 2 else "")})
    return {
        "search_terms": _parse_terms_sheet(terms_ws) if terms_ws is not None else [],
        "sources_without_search": no_search,
    }


def parse_workbook(wb) -> dict:
    ws = wb.worksheets[0]
    rows = parse_link_sheet(ws)
    if not rows:
        raise ValueError("La primera hoja de la matriz no tiene filas con URL.")
    return {
        "format": FORMAT,
        "sheet": ws.title,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rows": rows,
        **parse_aux_sheets(wb),
    }


def validation_summary(parsed: dict) -> dict:
    rows = parsed.get("rows") or []
    issues = [
        {"excel_row": r.get("excel_row"), "link_id": r.get("link_id"), "name": r.get("name"), **i}
        for r in rows for i in (r.get("issues") or [])
    ]
    by_type: dict[str, int] = {}
    by_entity: dict[str, int] = {}
    for r in rows:
        for t in r.get("tech_types") or ["sin_tipo"]:
            by_type[t] = by_type.get(t, 0) + 1
        by_entity[r.get("entity_label") or "(sin tipo)"] = by_entity.get(r.get("entity_label") or "(sin tipo)", 0) + 1
    unique = {_norm_url(r["url"]) for r in rows if r.get("url")}
    active = [r for r in rows if r["link_origin"] == ORIGIN_ACTIVE]
    return {
        "format": FORMAT,
        "rows": len(rows),
        "organizations": len({fold(r["name"]) for r in rows}),
        "urls": len(unique),
        "sources": len([r for r in rows if r.get("url") and not r.get("duplicate_of")]),
        "active_links": len(active),
        "general_links": len(rows) - len(active),
        "urls_by_tech_type": by_type,
        "links_by_entity": by_entity,
        "issues": issues,
    }


# --------------------------------------------------------------------------- #
#  Fila -> fuente
# --------------------------------------------------------------------------- #
def _catalog_index() -> tuple[dict[str, dict], dict[str, dict]]:
    """Catalogo D-06 por codigo y entradas en consulta manual por host."""
    from .catalog import CATALOG_SOURCES

    by_code = {s["catalog_code"]: s for s in CATALOG_SOURCES}
    manual_hosts: dict[str, dict] = {}
    for s in CATALOG_SOURCES:
        if (s.get("connector") or "") == "manual":
            host = (urlsplit(s.get("url") or "").hostname or "").lower().removeprefix("www.")
            if host:
                manual_hosts[host] = s
    return by_code, manual_hosts


TITLE_DETAIL_CHARS = 60


def _short(text: str, limit: int = TITLE_DETAIL_CHARS) -> str:
    """Recorta en un limite de palabra: el nombre se lee entero en pantallas angostas."""
    text = re.sub(r"\s+", " ", text or "").strip(" .,;:-")
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(" .,;:-")
    return f"{cut}…"


def _title(row: dict, taken: set[str]) -> str:
    """Nombre de la fuente: organizacion y que es el enlace (tipo de material).

    Nunca usa la ruta de la URL: una cadena larga sin espacios desbordaba las
    tarjetas en pantallas de 390 px. Sin tipo de material, el dominio y el N°.
    """
    detail = _short(row.get("material_type") or "")
    if not detail:
        number = row.get("original_number") or ""
        detail = f"{row.get('domain') or ''}" + (f" (enlace {number})" if number else "")
    title = f"{row['name']} · {detail}" if detail else row["name"]
    if title.lower() in taken:
        title = f"{title} (ID {row['link_id']})"
    taken.add(title.lower())
    return title[:590]


def build_sources(parsed: dict) -> list[dict]:
    """Campos de `Source` para cada fila (sin tocar la base)."""
    from .catalog import FREQ_HOURS
    from .catalog_service import _category_for
    from . import source_profile

    by_code, manual_hosts = _catalog_index()
    api_taken: set[str] = set()
    titles: set[str] = set()
    out: list[dict] = []
    first_search_domain: set[str] = set()
    for row in parsed.get("rows") or []:
        if not row.get("url") or not row.get("code") or row.get("duplicate_of"):
            continue
        host = (urlsplit(row["url"]).hostname or "").lower().removeprefix("www.")
        category, entity_type = _category_for(row.get("entity_label") or "")
        active = row["link_origin"] == ORIGIN_ACTIVE
        freq = row.get("frequency") or "semanal"
        reasons: list[str] = []
        fields: dict = {
            "catalog_code": row["code"],
            "title": _title(row, titles),
            "url": row["url"][:1020],
            "category": category,
            "entity_type": entity_type,
            "description": (row.get("consult_info") or row.get("material_type") or row["name"])[:1000],
            "relation_iets": f"Matriz de escaneo EH, ID {row['link_id']} ({row['name']})"[:300],
            "language": (row.get("language") or "")[:60],
            "resource_type": row["link_origin"],
            "link_status": "Activo",
            "connector": "html",
            "connector_config": {},
            "access_level": "D",
            "country": (row.get("country") or "")[:80],
            "sync_frequency": freq,
            "scan_interval_hours": FREQ_HOURS.get(freq, 168),
            "aliases": [row["name"]],
            "verification_status": LINK_MARK,
            "tags": ", ".join(t for t in ("matriz EH por enlace", ORIGIN_LABELS[row["link_origin"]]) if t),
            "catalog_active": True,
            "retired": False,
            "is_contrast": False,
            "source_level": row.get("source_level") or "por_definir",
            "tech_types": list(row.get("tech_types") or []),
            "matrix_ref": row["matrix_ref"],
            "matrix_origin": row.get("verified") or "",
            "entry_urls": [row["url"]] if active else [],
            "reference_urls": [row["url"]] if not active else [],
            "material_type": row.get("material_type") or "",
            "access_path": row.get("access_path") or "",
            "consult_info": row.get("consult_info") or "",
            "observations": row.get("observations") or "",
            "usage_restrictions": row.get("restrictions") or "",
        }
        # API oficial: primera fila de consulta activa del registro.
        api_code = next(
            (code for prefix, code in API_RULES if _url_key(row["url"]).startswith(prefix) and code not in api_taken),
            None,
        ) if active else None
        if api_code and api_code in by_code:
            api_taken.add(api_code)
            d06 = by_code[api_code]
            for key in INHERITED_API_FIELDS:
                if d06.get(key) is not None:
                    fields[key] = json.loads(json.dumps(d06[key])) if isinstance(d06[key], (dict, list)) else d06[key]
            fields["url"] = (d06.get("url") or row["url"])[:1020]
            fields["reference_urls"] = [row["url"]]
            reasons.append(f"Se consulta por la API oficial del registro ({d06.get('title')}); la URL de la matriz queda como referencia.")
        manual = False
        if active and _MANUAL_RESTRICTION.search(row.get("restrictions") or "") and not api_code:
            manual = True
            reasons.append(f"Consulta manual: {row['restrictions'][:200]}")
        elif active and host in manual_hosts and not api_code:
            manual = True
            reasons.append(f"Consulta manual: el sitio no permite rastreo automático ({manual_hosts[host].get('catalog_note') or 'catálogo verificado'})"[:300])
        if manual:
            fields.update(connector="manual", access_level="E")
        scrape = active and not manual and fields["connector"] != "manual"
        fields["scrape_enabled"] = scrape
        if not active:
            reasons.append("Información general o metodológica: queda como referencia, sin ingesta.")
        # Flujo de escaneo de un solo enlace: recorrer poco y buscar en el dominio
        # solo desde el primer enlace activo de cada dominio (evita repetir la misma
        # busqueda en las varias filas de una organizacion).
        search = scrape and fields["connector"] in ("html", "pdf") and host not in first_search_domain
        if search:
            first_search_domain.add(host)
        fields["scan_profile"] = source_profile.normalize_profile(
            {"max_pages": LINK_MAX_PAGES, "web_search": search, "search_domain": host if search else ""}
        )
        fields["catalog_note"] = " ".join(
            [f"{ORIGIN_LABELS[row['link_origin']]}, N° original {row['original_number'] or 'sin número'} de {row['name']}."] + reasons
        )[:2000]
        out.append(fields)
    return out


# --------------------------------------------------------------------------- #
#  Aplicacion al inventario
# --------------------------------------------------------------------------- #
def current_mode(db: Session) -> str:
    from . import settings_store

    return settings_store.get_value(db, MODE_KEY, "")


def load_packaged() -> dict:
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_packaged(parsed: dict) -> Path:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(parsed, ensure_ascii=False, indent=1), encoding="utf-8")
    from . import source_matrix

    source_matrix._cache = None
    return DATA_FILE


def apply(
    db: Session,
    parsed: dict,
    *,
    actor: str = "sistema",
    overwrite: bool = False,
    only_codes: set[str] | None = None,
    retire_others: bool | None = None,
) -> dict:
    """Crea o actualiza las fuentes de la matriz por enlace y retira las demas como legacy.

    - Fuente con el mismo `catalog_code` (EH-<ID>): se actualiza respetando lo que el
      equipo edito (`edited_fields`) salvo `overwrite`.
    - Fuente nueva: se crea.
    - Fuente EH que ya no esta en la matriz: se retira (queda en el catalogo historico).
    - Cualquier otra fuente activa del inventario anterior (catalogo D-06, matriz
      anterior): se retira y se marca legacy; sus senales pendientes pasan a la
      bandeja Legacy. Las registradas a mano por el equipo se conservan.
    Nada se borra. Todo queda en bitacora.
    """
    from . import settings_store
    from .audit import record_action
    from .catalog_service import LOCAL_SOURCE_MARK, _apply_catalog_fields, human_edits

    built = build_sources(parsed)
    if only_codes is not None:
        built = [b for b in built if b["catalog_code"] in only_codes]
    codes = {b["catalog_code"] for b in build_sources(parsed)}
    edits = human_edits(db)
    existing = {s.catalog_code: s for s in db.query(Source).filter(Source.catalog_code.like(f"{CODE_PREFIX}%")).all()}
    created: list[str] = []
    updated: list[str] = []
    for fields in built:
        source = existing.get(fields["catalog_code"])
        if source is None:
            source = Source(**fields, edited_fields=[])
            db.add(source)
            created.append(fields["catalog_code"])
            continue
        before = {k: getattr(source, k, None) for k in fields}
        _apply_catalog_fields(source, fields, overwrite_admin=overwrite, edits=edits.get(source.id))
        source.retired = False
        source.catalog_active = True
        changed = [k for k in fields if before[k] != getattr(source, k, None)]
        if changed:
            updated.append(fields["catalog_code"])
            record_action(
                db, entity_type="sources", entity_id=str(source.id), action="matrix_update",
                old_value={k: before[k] for k in changed}, new_value={k: getattr(source, k, None) for k in changed},
            )
    db.flush()

    retired_eh: list[str] = []
    legacy_ids: list[int] = []
    if retire_others is None:
        retire_others = only_codes is None
    if retire_others:
        for source in db.query(Source).all():
            code = source.catalog_code or ""
            if code.startswith(CODE_PREFIX):
                if code not in codes and not source.retired:
                    _retire(source, "Ya no está en la matriz de escaneo por enlace.")
                    retired_eh.append(code)
                continue
            if (source.verification_status or "") == LOCAL_SOURCE_MARK:
                continue  # registrada a mano por el equipo: no pertenece a ninguna matriz
            if (source.verification_status or "") == LEGACY_MARK:
                continue  # ya es legacy: sus senales recuperadas no se vuelven a mover
            _retire(source, "Retirada al cargar la matriz de escaneo por enlace (17-11-2026). Sus señales se conservan en la bandeja Legacy.")
            source.verification_status = LEGACY_MARK
            if LEGACY_TAG not in (source.tags or ""):
                source.tags = ", ".join(t for t in ((source.tags or "").strip(", "), LEGACY_TAG) if t)
            legacy_ids.append(source.id)
    db.flush()
    moved = mark_legacy_technologies(db, legacy_ids)
    cancelled = 0
    if legacy_ids:
        for job in db.query(IngestJob).filter(IngestJob.status == "pendiente", IngestJob.source_id.in_(legacy_ids)).all():
            job.status = "cancelado"
            job.message = "Cancelado: la fuente quedó en el inventario legacy."
            job.finished_at = datetime.now(timezone.utc)
            cancelled += 1
    summary = {
        "format": FORMAT,
        "validation": validation_summary(parsed),
        "created": len(created),
        "updated": len(updated),
        "retired_eh": len(retired_eh),
        "legacy_sources": len(legacy_ids),
        "legacy_technologies": moved,
        "cancelled_jobs": cancelled,
        "total": len(codes),
        "overwrite": overwrite,
    }
    if retire_others:
        settings_store._upsert(db, MODE_KEY, MODE_LINKS)
    record_action(
        db, entity_type="sources", entity_id="matrix", action="matrix_links_apply",
        new_value={**{k: v for k, v in summary.items() if k != "validation"}, "ejecutado_por": actor,
                   "created_codes": created[:200], "updated_codes": updated[:200], "retired_codes": retired_eh[:200]},
    )
    db.commit()
    return summary


def _retire(source: Source, note: str) -> None:
    source.retired = True
    source.scrape_enabled = False
    source.catalog_active = False
    if note not in (source.catalog_note or ""):
        source.catalog_note = (f"{note} {source.catalog_note or ''}").strip()[:2000]


def mark_legacy_technologies(db: Session, source_ids: list[int]) -> int:
    """Las senales aun sin asignar de fuentes legacy pasan a la bandeja Legacy.

    Las que ya entraron a un ciclo, se fusionaron o se descartaron siguen donde
    estan: moverlas romperia el flujo metodologico.
    """
    from .audit import record_action

    if not source_ids:
        return 0
    techs = (
        db.query(Technology)
        .filter(
            Technology.source_id.in_(source_ids),
            Technology.status == "capturada_no_asignada",
            Technology.merged_into_id.is_(None),
            Technology.legacy.isnot(True),
            ~Technology.cycle_entries.any(),
        )
        .all()
    )
    for tech in techs:
        tech.legacy = True
    if techs:
        record_action(
            db, entity_type="technologies", entity_id="legacy", action="staging:legacy",
            new_value={"technology_ids": [t.id for t in techs][:2000], "total": len(techs),
                       "motivo": "Fuente retirada al cargar la matriz de escaneo por enlace"},
        )
    return len(techs)


def ensure_link_catalog(db: Session, *, actor: str = "arranque") -> dict | None:
    """Arranque: si hay matriz por enlace empaquetada, el inventario la sigue.

    La primera vez reemplaza el inventario anterior (retirandolo como legacy); las
    siguientes solo sincroniza, respetando lo editado por el equipo.
    """
    parsed = load_packaged()
    if not parsed.get("rows"):
        return None
    return apply(db, parsed, actor=actor, overwrite=False)


# --------------------------------------------------------------------------- #
#  Vista previa para (Cargar matriz)
# --------------------------------------------------------------------------- #
DIFF_FIELDS = {
    "title": "Nombre",
    "url": "URL",
    "connector": "Adaptador",
    "scrape_enabled": "Ingesta activa",
    "source_level": "Nivel de fuente",
    "tech_types": "Tipos de tecnología",
    "material_type": "Tipo de material",
    "access_path": "Ruta de acceso",
    "consult_info": "Información a consultar",
    "observations": "Observaciones",
    "usage_restrictions": "Restricciones",
    "sync_frequency": "Frecuencia",
    "resource_type": "Origen del enlace",
}


def _same_value(a, b) -> bool:
    if isinstance(a, list) or isinstance(b, list):
        return sorted(a or []) == sorted(b or [])
    return (a if a is not None else "") == (b if b is not None else "")


def compare(db: Session, parsed: dict, *, origin: str) -> dict:
    """Diferencias entre la matriz por enlace y el inventario. No escribe nada."""
    from .catalog_service import LOCAL_SOURCE_MARK, human_edits
    from .source_import import DETECTION_LABELS, _store

    built = build_sources(parsed)
    rows_by_code = {r["code"]: r for r in parsed.get("rows") or [] if r.get("code")}
    existing = {s.catalog_code: s for s in db.query(Source).filter(Source.catalog_code.like(f"{CODE_PREFIX}%")).all()}
    edits = human_edits(db)
    new: list[dict] = []
    changed: list[dict] = []
    same: list[dict] = []
    for fields in built:
        code = fields["catalog_code"]
        row = rows_by_code.get(code, {})
        base = {
            "key": code,
            "excel_row": row.get("excel_row") or 0,
            "name": fields["title"],
            "url": row.get("url") or fields["url"],
            "entity_label": row.get("entity_label") or "",
            "country": fields.get("country") or "",
            "tech_types": fields.get("tech_types") or [],
            "source_level": fields.get("source_level") or "",
            "frequency": fields.get("sync_frequency") or "",
            "codes": [code],
            "connector": fields["connector"],
            "scrape_enabled": fields["scrape_enabled"],
            "link_origin": ORIGIN_LABELS.get(row.get("link_origin"), ""),
            "note": fields.get("catalog_note") or "",
        }
        source = existing.get(code)
        if source is None:
            api = fields["connector"] not in ("html", "manual", "pdf")
            new.append({
                **base,
                "suggestion": {
                    "connector": fields["connector"],
                    "detection": "api" if api else ("manual" if fields["connector"] == "manual" else "html"),
                    "access_level": fields["access_level"],
                    "enable_ingest": fields["scrape_enabled"],
                    "frequency": fields["sync_frequency"],
                    "rationale": fields.get("catalog_note") or "",
                    "origin": "reglas",
                    "follow_keywords": [],
                    "search_terms": [],
                    "entry_urls": fields["entry_urls"],
                },
            })
            continue
        mine = set(source.edited_fields or []) | set(edits.get(source.id) or set())
        diffs = []
        for key, label in DIFF_FIELDS.items():
            incoming = fields.get(key)
            current = getattr(source, key, None)
            if not _same_value(incoming, current):
                diffs.append({"field": key, "label": label, "current": current, "incoming": incoming, "conflict": key in mine})
        entry = {**base, "source_id": source.id, "source_title": source.title, "match_reason": "codigo", "probable": False}
        if diffs:
            changed.append({**entry, "changes": diffs, "conflicts": sum(1 for d in diffs if d["conflict"])})
        else:
            same.append(entry)
    codes = {b["catalog_code"] for b in built}
    missing = [
        {"source_id": s.id, "title": s.title, "url": s.url, "matrix_ref": s.matrix_ref or ""}
        for code, s in existing.items() if code not in codes and not s.retired
    ]
    legacy = [
        {"source_id": s.id, "title": s.title, "url": s.url, "matrix_ref": s.catalog_code or ""}
        for s in db.query(Source).all()
        if not (s.catalog_code or "").startswith(CODE_PREFIX)
        and not s.retired
        and (s.verification_status or "") not in (LOCAL_SOURCE_MARK, LEGACY_MARK)
    ]
    token = _store(parsed, origin=origin)
    return {
        "token": token,
        "format": FORMAT,
        "origin": origin,
        "sheet": parsed.get("sheet") or "",
        "rows": len(parsed.get("rows") or []),
        "search_terms": len(parsed.get("search_terms") or []),
        "summary": {
            "nuevas": len(new),
            "cambios": len(changed),
            "sin_cambios": len(same),
            "ausentes": len(missing),
            "conflictos": sum(c["conflicts"] for c in changed),
            "legacy": len(legacy),
        },
        "validation": validation_summary(parsed),
        "new": new,
        "changed": changed,
        "unchanged": same,
        "missing": missing,
        "legacy": legacy,
        "ai_note": "Formato por enlace: cada fila es una fuente. El adaptador sale de reglas (API oficial del registro o consulta manual por restricciones), no de la IA.",
        "detection_labels": DETECTION_LABELS,
    }
