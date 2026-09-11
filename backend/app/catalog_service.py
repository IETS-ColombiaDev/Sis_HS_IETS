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
)


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
    """Upsert de las 53 fuentes y retiro de las que ya no estan en el catalogo."""
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
        if (source.verification_status or "").strip() == LOCAL_SOURCE_MARK:
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


def _apply_catalog_fields(source: Source, payload: dict) -> None:
    """Actualiza metadatos del catalogo sin pisar el estado operativo de salud."""
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
        if key == "connector_config":
            current = source.connector_config if isinstance(source.connector_config, dict) else {}
            incoming = value if isinstance(value, dict) else {}
            merged = {**incoming, **{k: v for k, v in current.items() if k in {"pageToken", "cursor", "records"}}}
            source.connector_config = merged
            continue
        setattr(source, key, value)
