"""Sincroniza el inventario operativo con el catalogo verificado (D-06).

No borra fuentes con senales: las retira del ciclo de ingesta. Empata por
codigo de catalogo, URL normalizada, titulo o alias para no duplicar.
"""
from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.orm import Session

from .audit import record_action
from .catalog import CATALOG_SOURCES, CATALOG_VERSION, catalog_stats
from .models import Source

TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "mc_cid",
    "mc_eid",
}

# Marca de las fuentes registradas a mano desde /fuentes (alta rapida o avanzada).
LOCAL_SOURCE_MARK = "agregada_localmente"

SOURCE_FIELDS = (
    "title",
    "url",
    "category",
    "authors",
    "year",
    "description",
    "relation_iets",
    "language",
    "resource_type",
    "link_status",
    "scrape_enabled",
    "tags",
    "connector",
    "connector_config",
    "scan_interval_hours",
    "catalog_code",
    "entity_type",
    "access_level",
    "country",
    "sync_frequency",
    "rate_limit_rpm",
    "requires_api_key",
    "terms_url",
    "provides_fields",
    "aliases",
    "verification_status",
    "catalog_note",
    "is_contrast",
    "catalog_active",
    "retired",
) + (
    "source_level",
    "priority_level",
    "tech_types",
    "matrix_ref",
    "matrix_origin",
    "entry_urls",
    "reference_urls",
    "material_type",
    "access_path",
    "consult_info",
    "observations",
    "usage_restrictions",
    "scan_profile",
)

# Campos que el equipo ajusta desde el panel (listas desplegables y casillas del
# flujo). La recarga del catalogo solo los completa si estan vacios; para pisarlos
# con la matriz hay que reimportarla de forma explicita (import_matrix).
ADMIN_FIELDS = (
    "source_level",
    "priority_level",
    "tech_types",
    "matrix_ref",
    "matrix_origin",
    "entry_urls",
    "reference_urls",
    "material_type",
    "access_path",
    "consult_info",
    "observations",
    "usage_restrictions",
    "scan_profile",
)
MATRIX_IMPORT_MARK = "matriz_importada"


def normalize_url(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    parts = urlsplit(raw)
    query = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if k.lower() not in TRACKING_PARAMS
    ]
    cleaned = urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/") or "/", urlencode(query), "")
    )
    return cleaned.rstrip("/")


def sync_catalog(db: Session, *, triggered_by: str = "sistema") -> dict:
    """Upsert del catalogo D-06 + matriz EH y retiro de lo que ya no esta."""
    created = 0
    updated = 0
    retired = 0
    codes = {row["catalog_code"] for row in CATALOG_SOURCES}

    for data in CATALOG_SOURCES:
        payload = {k: data.get(k) for k in SOURCE_FIELDS if k in data}
        payload["url"] = normalize_url(payload.get("url") or data.get("url") or "")
        existing = _find_match(db, payload)
        if existing is None:
            row = Source(**payload)
            db.add(row)
            created += 1
            continue
        _apply_catalog_fields(existing, payload)
        existing.retired = False
        updated += 1

    for source in db.query(Source).all():
        code = (source.catalog_code or "").strip()
        if code and code in codes:
            continue
        if source.retired:
            continue
        # Las fuentes que el equipo registro a mano no pertenecen al inventario
        # anterior: retirarlas en cada arranque las borraba de la vigilancia.
        if (source.verification_status or "").strip() in {LOCAL_SOURCE_MARK, MATRIX_IMPORT_MARK}:
            continue
        source.retired = True
        source.scrape_enabled = False
        source.catalog_active = False
        if not source.catalog_note:
            source.catalog_note = (
                "Retirada al cargar el catálogo verificado D-06. "
                "Se conserva porque puede tener señales asociadas."
            )
        retired += 1

    record_action(
        db,
        entity_type="sources",
        entity_id="catalog",
        action="catalog_import",
        new_value={
            "version": CATALOG_VERSION,
            "created": created,
            "updated": updated,
            "retired": retired,
            "total": len(CATALOG_SOURCES),
        },
    )
    db.commit()
    return {
        "version": CATALOG_VERSION,
        "created": created,
        "updated": updated,
        "retired": retired,
        "total": len(CATALOG_SOURCES),
        "stats": catalog_stats(),
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "triggered_by": triggered_by,
    }


def _category_for(entity_label: str) -> tuple[str, str]:
    from . import catalog
    from .source_matrix import fold

    text = fold(entity_label)
    if "fabricante" in text:
        return catalog.CAT_FABRICANTE, "fabricante"
    if "regulator" in text:
        return catalog.CAT_REGULATORIA, "agencia_regulatoria"
    if "ensayo" in text:
        return catalog.CAT_ENSAYOS, "registro_ensayos"
    if any(k in text for k in ("hta", "evaluacion", "iniciativa", "organismo")):
        return catalog.CAT_HTA, "organismo_hta"
    if any(k in text for k in ("revista", "portal", "noticia")):
        return catalog.CAT_NOTICIAS, "revista_noticias"
    return catalog.CAT_LITERATURA, "literatura"


def import_matrix(
    db: Session,
    parsed: dict,
    *,
    overwrite: bool = True,
    persist: bool = True,
    triggered_by: str = "sistema",
) -> dict:
    """Aplica una matriz EH (Excel ya leido) al inventario.

    - Filas con codigo: actualiza nivel, prioridad, tipos, URLs de entrada, ruta
      de acceso, que consultar y restricciones. Con `overwrite=False` solo
      completa lo vacio (respeta lo editado en el panel).
    - Filas sin codigo: crea la fuente (rastreo HTML, nivel D) marcada como
      importada de la matriz, para que la recarga del catalogo no la retire.
    - `persist`: guarda la matriz como la empaquetada (la usa el catalogo en el
      proximo arranque y los terminos de busqueda por defecto).
    """
    from . import source_matrix
    from .catalog import FREQ_HOURS

    rows = parsed.get("rows") or []
    updated = created = 0
    touched: list[str] = []
    unmatched: list[str] = []
    for row in rows:
        codes = row.get("codes") or []
        if codes:
            for idx, code in enumerate(codes):
                source = db.query(Source).filter(Source.catalog_code == code).first()
                if source is None:
                    continue
                fields = source_matrix.profile_fields(row, primary=idx == 0)
                _apply_catalog_fields(source, fields, overwrite_admin=overwrite)
                updated += 1
                touched.append(code)
            continue
        urls = source_matrix.entry_urls_for(row)
        main = urls[0] if urls else ""
        norm = normalize_url(main)
        existing = None
        for source in db.query(Source).all():
            if (norm and normalize_url(source.url) == norm) or (source.title or "").strip() == row["name"]:
                existing = source
                break
        fields = source_matrix.profile_fields(row, primary=True)
        if existing is not None:
            _apply_catalog_fields(existing, fields, overwrite_admin=overwrite)
            updated += 1
            continue
        if not main:
            unmatched.append(row["name"])
            continue
        category, entity_type = _category_for(row.get("entity_label") or "")
        freq = row.get("frequency") or "semanal"
        db.add(
            Source(
                title=row["name"][:590],
                url=norm[:1020],
                category=category,
                entity_type=entity_type,
                description=(row.get("consult_info") or row["name"])[:1000],
                relation_iets=f"Matriz EH ({row.get('matrix_ref', '')})"[:300],
                language=(row.get("language") or "Ingles")[:60],
                connector="html",
                access_level="D",
                sync_frequency=freq,
                scan_interval_hours=FREQ_HOURS.get(freq, 168),
                scrape_enabled=True,
                link_status="Activo",
                country=(row.get("country") or "")[:80],
                verification_status=MATRIX_IMPORT_MARK,
                catalog_note="Creada al importar la matriz EH: asigne bloque, nivel y adaptador si hace falta.",
                tags="matriz EH",
                **fields,
            )
        )
        created += 1
    if persist:
        prev = source_matrix.DATA_FILE.with_suffix(".prev.json")
        if source_matrix.DATA_FILE.exists():
            prev.write_text(source_matrix.DATA_FILE.read_text(encoding="utf-8"), encoding="utf-8")
        source_matrix.write_data_file(parsed)
    summary = {
        "rows": len(rows),
        "updated": updated,
        "created": created,
        "unmatched": unmatched,
        "search_terms": len(parsed.get("search_terms") or []),
        "overwrite": overwrite,
        "persisted": persist,
        "sheet": parsed.get("sheet", ""),
    }
    record_action(db, entity_type="sources", entity_id="matrix", action="matrix_import", new_value=summary)
    db.commit()
    return summary


def accept_terms(db: Session, source: Source) -> Source:
    source.terms_accepted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(source)
    return source


def _find_match(db: Session, payload: dict) -> Source | None:
    code = (payload.get("catalog_code") or "").strip()
    if code:
        hit = db.query(Source).filter(Source.catalog_code == code).first()
        if hit:
            return hit
    url = normalize_url(payload.get("url") or "")
    title = (payload.get("title") or "").strip()
    aliases = [a.lower() for a in (payload.get("aliases") or []) if a]
    for source in db.query(Source).all():
        if url and normalize_url(source.url) == url:
            return source
        if title and (source.title or "").strip() == title:
            return source
        src_title = (source.title or "").lower()
        if aliases and any(alias in src_title for alias in aliases):
            return source
    return None


def _is_empty(value) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _apply_catalog_fields(source: Source, payload: dict, *, overwrite_admin: bool = False) -> None:
    """Actualiza metadatos del catalogo sin pisar el estado operativo de salud.

    Los ADMIN_FIELDS solo se completan si estan vacios, salvo `overwrite_admin`.
    """
    preserve = {
        "health_status",
        "last_ok_at",
        "schema_signature",
        "last_probe_at",
        "last_probe_detail",
        "terms_accepted_at",
        "robots_checked_at",
        "robots_allowed",
        "failure_streak",
        "circuit_open_until",
        "last_error",
        "last_scraped_at",
    }
    for key, value in payload.items():
        if key in preserve:
            continue
        if key in ADMIN_FIELDS and not overwrite_admin and not _is_empty(getattr(source, key, None)):
            continue
        if key == "connector_config":
            current = source.connector_config if isinstance(source.connector_config, dict) else {}
            incoming = value if isinstance(value, dict) else {}
            merged = {**incoming, **{k: v for k, v in current.items() if k in {"pageToken", "cursor", "records"}}}
            source.connector_config = merged
            continue
        setattr(source, key, value)
