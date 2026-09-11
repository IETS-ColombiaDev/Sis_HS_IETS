"""Sonda de salud por fuente (seccion 10.1 del catalogo).

Verde: responde, esquema coincide, hay registros.
Ambar: responde pero el esquema cambio, o cero registros donde siempre hay.
Rojo: no responde tras los reintentos, o el sitio bloquea.

La sonda corre antes de cada corrida de nivel A/B y a demanda desde la API.
"""
from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import httpx
from sqlalchemy.orm import Session

from .audit import record_action
from .ingest.base import (
    USER_AGENT,
    ConnectorError,
    json_path_exists,
    schema_signature,
)
from .models import Source

CONTACT = "escaneo.horizonte@iets.org.co"


def probe_source(db: Session, source: Source, *, persist: bool = True) -> dict:
    now = datetime.now(timezone.utc)
    config = source.connector_config if isinstance(source.connector_config, dict) else {}
    spec = (config.get("probe") or {}) if isinstance(config.get("probe"), dict) else {}
    url = spec.get("url") or source.url
    params = spec.get("params") or {}
    expect_status = int(spec.get("expect_status") or 200)
    expect_path = spec.get("expect_json_path") or ""

    detail = {
        "source_id": source.id,
        "catalog_code": source.catalog_code,
        "url": url,
        "status": "rojo",
        "http_status": None,
        "message": "",
        "schema_signature": "",
        "schema_changed": False,
        "zero_records": False,
        "probed_at": now.isoformat(),
    }

    if not url:
        detail["message"] = "La fuente no declara URL de sonda."
        _store(db, source, "rojo", detail, persist)
        return detail

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, text/html, */*"}
    try:
        with httpx.Client(timeout=25.0, follow_redirects=True, headers=headers) as client:
            resp = client.get(url, params=params)
        detail["http_status"] = resp.status_code
        if resp.status_code != expect_status:
            detail["message"] = f"HTTP {resp.status_code} (se esperaba {expect_status})."
            _store(db, source, "rojo", detail, persist)
            return detail

        body = None
        ctype = (resp.headers.get("content-type") or "").lower()
        if "json" in ctype:
            try:
                body = resp.json()
            except ValueError:
                body = None

        if body is not None:
            signature = schema_signature(body)
            detail["schema_signature"] = signature
            if expect_path and not json_path_exists(body, expect_path):
                detail["zero_records"] = True
                detail["message"] = f"Responde pero falta la ruta {expect_path}."
                _store(db, source, "ambar", detail, persist, signature=signature)
                return detail
            previous = (source.schema_signature or "").strip()
            if previous and signature and previous != signature:
                detail["schema_changed"] = True
                detail["message"] = "El esquema cambió respecto de la última corrida exitosa."
                _store(db, source, "ambar", detail, persist, signature=signature, suspend=True)
                return detail
            if _looks_empty(body):
                detail["zero_records"] = True
                detail["message"] = "Responde con cero registros donde se esperaba señal."
                _store(db, source, "ambar", detail, persist, signature=signature)
                return detail

        robots = _check_robots(url, config.get("respect_robots"))
        if robots:
            detail["robots"] = robots
            source.robots_checked_at = now
            source.robots_allowed = robots.get("allowed")
            if robots.get("allowed") is False:
                detail["message"] = "robots.txt desaconseja el rastreo automático."
                _store(db, source, "ambar", detail, persist, suspend=True)
                return detail

        detail["status"] = "verde"
        detail["message"] = "Responde y el contrato se sostiene."
        _store(db, source, "verde", detail, persist, signature=detail.get("schema_signature"))
        return detail
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        detail["message"] = f"No responde: {type(exc).__name__}: {exc}"
        _store(db, source, "rojo", detail, persist)
        return detail
    except ConnectorError as exc:
        detail["message"] = str(exc)
        _store(db, source, "rojo", detail, persist)
        return detail


def probe_all(db: Session, *, only_ab: bool = False) -> list[dict]:
    query = db.query(Source).filter(Source.retired.is_(False), Source.catalog_active.is_(True))
    if only_ab:
        query = query.filter(Source.access_level.in_(("A", "B")))
    results = []
    for source in query.order_by(Source.catalog_code, Source.title).all():
        results.append(probe_source(db, source))
    return results


def health_board(db: Session) -> dict:
    rows = db.query(Source).filter(Source.retired.is_(False)).all()
    counts = {"verde": 0, "ambar": 0, "rojo": 0, "sin_sonda": 0}
    items = []
    for source in rows:
        status = (source.health_status or "").lower() or "sin_sonda"
        if status not in counts:
            status = "sin_sonda"
        counts[status] += 1
        items.append(
            {
                "id": source.id,
                "catalog_code": source.catalog_code,
                "title": source.title,
                "access_level": source.access_level,
                "connector": source.connector,
                "health_status": source.health_status or "sin_sonda",
                "last_ok_at": source.last_ok_at.isoformat() if source.last_ok_at else None,
                "last_probe_at": source.last_probe_at.isoformat() if source.last_probe_at else None,
                "circuit_open": bool(source.circuit_open_until),
                "requires_api_key": bool(source.requires_api_key),
                "scrape_enabled": bool(source.scrape_enabled),
                "message": ((source.last_probe_detail or {}) if isinstance(source.last_probe_detail, dict) else {}).get(
                    "message", ""
                ),
            }
        )
    items.sort(key=lambda x: (x["health_status"] != "rojo", x["health_status"] != "ambar", x["catalog_code"] or x["title"]))
    return {
        "counts": counts,
        "total": len(rows),
        "items": items,
    }


def _store(
    db: Session,
    source: Source,
    status: str,
    detail: dict,
    persist: bool,
    *,
    signature: str | None = None,
    suspend: bool = False,
) -> None:
    detail["status"] = status
    if not persist:
        return
    source.health_status = status
    source.last_probe_at = datetime.now(timezone.utc)
    source.last_probe_detail = detail
    if signature:
        if status == "verde" or not source.schema_signature:
            source.schema_signature = signature
    if status == "verde":
        source.last_ok_at = source.last_probe_at
        source.last_error = ""
    else:
        source.last_error = (detail.get("message") or "")[:2000]
    if suspend and source.scrape_enabled:
        source.scrape_enabled = False
        detail["ingestion_suspended"] = True
    record_action(
        db,
        entity_type="sources",
        entity_id=str(source.id),
        action="source_probe",
        new_value={"status": status, "message": detail.get("message"), "catalog_code": source.catalog_code},
    )
    db.commit()
    db.refresh(source)


def _looks_empty(body) -> bool:
    if body in (None, {}, []):
        return True
    if isinstance(body, list):
        return len(body) == 0
    if isinstance(body, dict):
        for key in ("results", "studies", "data", "items", "idlist"):
            value = body.get(key)
            if isinstance(value, list) and not value:
                return True
            if key == "idlist" and isinstance((body.get("esearchresult") or {}).get("idlist"), list):
                return not (body.get("esearchresult") or {}).get("idlist")
    return False


def _check_robots(url: str, respect: bool | None) -> dict | None:
    if not respect:
        return None
    parts = urlsplit(url)
    robots_url = urljoin(f"{parts.scheme}://{parts.netloc}", "/robots.txt")
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}) as client:
            resp = client.get(robots_url)
        if resp.status_code >= 400:
            return {"url": robots_url, "allowed": True, "note": f"HTTP {resp.status_code}"}
        text = resp.text.lower()
        disallows = [
            line.split(":", 1)[1].strip()
            for line in text.splitlines()
            if line.strip().lower().startswith("disallow:")
        ]
        path = parts.path or "/"
        blocked = any(path.startswith(rule) for rule in disallows if rule and rule != "/")
        return {"url": robots_url, "allowed": not blocked, "disallows": disallows[:12]}
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        return {"url": robots_url, "allowed": True, "note": f"robots.txt inaccesible: {exc}"}
