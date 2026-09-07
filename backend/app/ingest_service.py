"""Orquestacion de la cola de ingesta (RF01, RF03).

Los conectores no tocan la base. Aqui se encolan los trabajos, se abre o
cierra el cortacircuitos por fuente, se guarda el crudo y se proyecta cada
registro a `Finding` + `Technology`. Un fallo de un conector no aborta a los
demas: cada job vive en su propia transaccion.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from . import ingest
from .audit import record_action
from .events import bump_state_version
from .ingest.base import CanonicalRecord, ConnectorError, RateLimited, SchemaChanged
from .methodology import get_param
from .models import Finding, IngestJob, RawRecord, ScrapeLog, Source, Technology
from .priority import compute_screening_score
from .technology_service import sync_technology_from_finding

log = logging.getLogger(__name__)

HTML_CONNECTORS = {"html", "pdf", "", None}
GOVERNOR_LEVELS = {"A", "B"}
LEVEL_RANK = {"A": 4, "B": 3, "C": 2, "D": 1, "E": 0, "": 0}


def enqueue(
    db: Session,
    sources: Iterable[Source],
    *,
    triggered_by: str,
    origin: str = "manual",
) -> list[IngestJob]:
    """Crea un job por fuente. No ejecuta nada: eso lo hace `tick` o `run_job`."""
    jobs: list[IngestJob] = []
    now = datetime.now(timezone.utc)
    for source in sources:
        if getattr(source, "retired", False) or source.catalog_active is False:
            continue
        pending = (
            db.query(IngestJob)
            .filter(
                IngestJob.source_id == source.id,
                IngestJob.status.in_(("pendiente", "ejecutando")),
            )
            .first()
        )
        if pending:
            jobs.append(pending)
            continue
        job = IngestJob(
            connector=(source.connector or "html"),
            source_id=source.id,
            status="pendiente",
            scheduled_for=now,
            triggered_by=triggered_by,
            origin=origin,
        )
        db.add(job)
        jobs.append(job)
    db.commit()
    for job in jobs:
        db.refresh(job)
    return jobs


def enqueue_due(db: Session, *, triggered_by: str = "programador") -> list[IngestJob]:
    """Encola las fuentes cuyo intervalo ya vencio y cuyo circuito esta cerrado."""
    now = datetime.now(timezone.utc)
    due: list[Source] = []
    for source in db.query(Source).filter(Source.scrape_enabled.is_(True)).all():
        if _circuit_is_open(source, now):
            continue
        hours = source.scan_interval_hours or 24
        last = source.last_scraped_at
        if last and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if last and (now - last) < timedelta(hours=hours):
            continue
        due.append(source)
    return enqueue(db, due, triggered_by=triggered_by, origin="programado") if due else []


def tick(db: Session, *, limit: int = 4) -> list[IngestJob]:
    """Toma hasta `limit` jobs vencidos y los ejecuta. Aislados entre si."""
    now = datetime.now(timezone.utc)
    pending = (
        db.query(IngestJob)
        .filter(IngestJob.status == "pendiente", IngestJob.scheduled_for <= now)
        .order_by(IngestJob.scheduled_for.asc(), IngestJob.id.asc())
        .limit(limit)
        .all()
    )
    done: list[IngestJob] = []
    for job in pending:
        done.append(run_job(db, job.id))
    return done


def run_job(db: Session, job_id: int) -> IngestJob:
    job = db.get(IngestJob, job_id)
    if job is None:
        raise ValueError(f"job {job_id} no existe")

    job.status = "ejecutando"
    job.attempts = (job.attempts or 0) + 1
    job.started_at = datetime.now(timezone.utc)
    job.message = ""
    db.commit()

    source = db.get(Source, job.source_id) if job.source_id else None
    if source is None:
        return _fail(db, job, "La fuente asociada ya no existe.", retry=False)

    now = datetime.now(timezone.utc)
    if _circuit_is_open(source, now):
        return _fail(
            db,
            job,
            f"Circuito abierto hasta {source.circuit_open_until.isoformat()}.",
            retry=False,
        )

    connector_code = (job.connector or source.connector or "html").lower()
    used_html = connector_code in HTML_CONNECTORS
    if (source.access_level or "").upper() in GOVERNOR_LEVELS and source.catalog_code:
        from .probe_service import probe_source

        probe = probe_source(db, source)
        if probe.get("status") in {"ambar", "rojo"}:
            return _fail(
                db,
                job,
                f"Sonda {probe.get('status')}: {probe.get('message')}. Ingesta no arrancada.",
                retry=probe.get("status") == "rojo",
            )
    try:
        if used_html:
            found, new, message, partial = _run_html(db, source, job.triggered_by)
        else:
            found, new, message, partial = _run_adapter(db, source, job, connector_code)
    except SchemaChanged as exc:
        source.health_status = "ambar"
        source.scrape_enabled = False
        source.last_error = str(exc)[:2000]
        return _fail(db, job, str(exc), retry=False)
    except RateLimited as exc:
        _open_circuit(db, source, hours=1, error=str(exc))
        return _fail(db, job, str(exc), retry=True)
    except ConnectorError as exc:
        _trip_failure(db, source, str(exc))
        return _fail(db, job, str(exc), retry=True)
    except Exception as exc:  # noqa: BLE001
        log.exception("Fallo inesperado en el job %s (%s)", job.id, connector_code)
        _trip_failure(db, source, str(exc))
        return _fail(db, job, f"{type(exc).__name__}: {exc}", retry=True)

    _clear_circuit(source)
    source.last_scraped_at = datetime.now(timezone.utc)
    source.last_ok_at = source.last_scraped_at
    if source.health_status != "ambar":
        source.health_status = "verde"
    job.items_found = found
    job.items_new = new
    job.message = message
    job.status = "parcial" if partial else "ok"
    job.finished_at = datetime.now(timezone.utc)
    if not used_html:
        _mirror_scrape_log(db, source, job)
    record_action(
        db,
        entity_type="ingest_jobs",
        entity_id=str(job.id),
        action="ingest_run",
        new_value={
            "connector": connector_code,
            "source_id": source.id,
            "items_found": found,
            "items_new": new,
            "status": job.status,
        },
    )
    db.commit()
    db.refresh(job)
    bump_state_version(db)
    return job


def persist_record(
    db: Session,
    record: CanonicalRecord,
    *,
    source: Source,
    connector: str,
    job_id: int | None,
    captured_by: str,
) -> tuple[RawRecord, bool]:
    """Guarda el crudo y, si es nuevo, crea la senal y la tecnologia."""
    payload = record.raw if isinstance(record.raw, dict) else {"value": record.raw}
    payload_hash = hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()[:32]

    raw = (
        db.query(RawRecord)
        .filter(RawRecord.connector == connector, RawRecord.external_id == record.external_id)
        .first()
    )
    adapter = ingest.get_connector(connector)
    adapter_version = getattr(adapter, "adapter_version", "") if adapter else ""
    if raw is None:
        raw = RawRecord(
            connector=connector,
            external_id=record.external_id,
            source_id=source.id,
            job_id=job_id,
            payload=payload,
            payload_hash=payload_hash,
            adapter_version=adapter_version,
            endpoint=(source.url or "")[:1024],
        )
        db.add(raw)
        db.flush()
    else:
        raw.payload = payload
        raw.payload_hash = payload_hash
        raw.job_id = job_id
        raw.adapter_version = adapter_version or raw.adapter_version
        raw.endpoint = (source.url or raw.endpoint or "")[:1024]
        raw.reprocessed_count = (raw.reprocessed_count or 0) + 1
        raw.fetched_at = datetime.now(timezone.utc)
        if raw.finding_id:
            return raw, False

    content_hash = record.content_hash(connector)
    existing = (
        db.query(Finding)
        .filter(Finding.source_id == source.id, Finding.content_hash == content_hash)
        .first()
    )
    if existing:
        raw.finding_id = existing.id
        tech = db.query(Technology).filter(Technology.finding_id == existing.id).first()
        if tech:
            raw.technology_id = tech.id
        raw.processed_at = datetime.now(timezone.utc)
        return raw, False

    score = compute_screening_score(
        horizon=record.horizon,
        technology_type=record.technology_type,
        phase=record.development_phase,
        therapeutic_area=record.therapeutic_area or record.indication,
        summary=record.summary,
        technology=record.commercial_name,
        title=record.title,
    )
    finding = Finding(
        source_id=source.id,
        title=record.title[:600],
        url=record.url[:1024],
        summary=record.summary,
        raw_content=json.dumps(payload, default=str)[:8000],
        technology=record.commercial_name[:400],
        technology_type=record.technology_type or "otro",
        horizon=record.horizon,
        phase=record.development_phase,
        therapeutic_area=(record.therapeutic_area or record.indication)[:300],
        published_date=record.published_date[:60],
        content_hash=content_hash,
        screening_score=score,
        status="nuevo",
    )
    db.add(finding)
    db.flush()

    tech = sync_technology_from_finding(db, finding, captured_by=captured_by)
    _apply_canonical(tech, record, source)
    tech.raw_payload = {
        "origin": "connector",
        "connector": connector,
        "external_id": record.external_id,
        "access_level": source.access_level or "",
        "catalog_code": source.catalog_code or "",
        "adapter_version": adapter_version,
        "payload": payload,
    }

    raw.finding_id = finding.id
    raw.technology_id = tech.id
    raw.processed_at = datetime.now(timezone.utc)
    if record.development_phase:
        tech.development_phase = record.development_phase[:120]
    from . import strategy_service

    strategy_service.watch_technology(db, tech, previous_phase="", previous_status="")
    return raw, True


def list_connectors() -> list[dict]:
    return [
        {
            "code": c.code,
            "label": c.label,
            "description": c.description,
            "min_interval": c.min_interval,
            "requires_url": c.requires_url,
        }
        for c in ingest.all_connectors()
    ] + [
        {
            "code": "html",
            "label": "Rastreo HTML / PDF (ultimo recurso)",
            "description": "El scraper generico se conserva para referentes sin API.",
            "min_interval": 0.0,
            "requires_url": True,
        },
        {
            "code": "pdf",
            "label": "Extraccion de PDF",
            "description": "Documentos oficiales sin capa de datos (MHRA, ACE).",
            "min_interval": 0.0,
            "requires_url": True,
        },
    ]


# --------------------------------------------------------------------------- #
#  Internos
# --------------------------------------------------------------------------- #
def _run_adapter(
    db: Session, source: Source, job: IngestJob, connector_code: str
) -> tuple[int, int, str, bool]:
    adapter = ingest.get_connector(connector_code)
    if adapter is None:
        raise ConnectorError(f"No hay adaptador registrado para '{connector_code}'.")

    max_records = int(get_param(db, "ingest.max_records_per_run", 50) or 50)
    result = adapter.fetch(config=source.connector_config or {}, url=source.url or "")
    if result.next_cursor:
        cfg = dict(source.connector_config or {})
        cfg["pageToken"] = result.next_cursor
        source.connector_config = cfg
    if result.schema_signature and not source.schema_signature:
        source.schema_signature = result.schema_signature
    new = 0
    for record in result.records[:max_records]:
        _raw, created = persist_record(
            db,
            record,
            source=source,
            connector=connector_code,
            job_id=job.id,
            captured_by=job.triggered_by or connector_code,
        )
        if created:
            new += 1
    return len(result.records), new, result.message, result.partial


def _run_html(db: Session, source: Source, triggered_by: str) -> tuple[int, int, str, bool]:
    from .scraper import scrape_source

    scrape_log = scrape_source(db, source, triggered_by=triggered_by)
    return (
        scrape_log.items_found or 0,
        scrape_log.items_new or 0,
        scrape_log.message or "",
        scrape_log.status == "parcial",
    )


def _apply_canonical(tech: Technology, record: CanonicalRecord, source: Source | None = None) -> None:
    incoming = ((source.access_level if source else "") or "").upper()
    existing = ((tech.raw_payload or {}).get("access_level") or "").upper()
    agency = (source.connector if source else "") in {"fda", "ema", "health_canada"}

    def take(current, incoming_value, *, agency_field: bool = False) -> bool:
        if not incoming_value:
            return False
        if not current:
            return True
        if agency_field and agency:
            return True
        if LEVEL_RANK.get(incoming, 0) < LEVEL_RANK.get(existing, 0) and incoming in {"D", "E"}:
            return False
        return True

    if take(tech.inn_name, record.inn_name):
        tech.inn_name = record.inn_name[:400]
    if take(tech.manufacturer, record.manufacturer):
        tech.manufacturer = record.manufacturer[:300]
    if take(tech.mechanism, record.mechanism):
        tech.mechanism = record.mechanism
    if take(tech.indication, record.indication):
        tech.indication = record.indication
    if record.nct_ids:
        merged = list(dict.fromkeys([*(tech.nct_ids or []), *record.nct_ids]))
        tech.nct_ids = merged
    if take(tech.phase3_completion_date, record.phase3_completion_date):
        tech.phase3_completion_date = record.phase3_completion_date
    if take(tech.fda_approval_date, record.fda_approval_date, agency_field=True):
        tech.fda_approval_date = record.fda_approval_date
    if take(tech.ema_approval_date, record.ema_approval_date, agency_field=True):
        tech.ema_approval_date = record.ema_approval_date
    if take(tech.regulatory_status, record.regulatory_status, agency_field=True):
        tech.regulatory_status = record.regulatory_status[:120]


def _circuit_is_open(source: Source, now: datetime) -> bool:
    until = source.circuit_open_until
    if until is None:
        return False
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    return until > now


def _trip_failure(db: Session, source: Source, error: str) -> None:
    source.failure_streak = (source.failure_streak or 0) + 1
    source.last_error = (error or "")[:2000]
    threshold = int(get_param(db, "ingest.circuit_failures", 3) or 3)
    hours = int(get_param(db, "ingest.circuit_cooldown_hours", 6) or 6)
    if source.failure_streak >= threshold:
        _open_circuit(db, source, hours=hours, error=error)


def _open_circuit(db: Session, source: Source, *, hours: int, error: str) -> None:
    source.circuit_open_until = datetime.now(timezone.utc) + timedelta(hours=hours)
    source.last_error = (error or "")[:2000]
    db.add(source)


def _clear_circuit(source: Source) -> None:
    source.failure_streak = 0
    source.circuit_open_until = None
    source.last_error = ""


def _fail(db: Session, job: IngestJob, message: str, *, retry: bool) -> IngestJob:
    job.message = message
    job.finished_at = datetime.now(timezone.utc)
    max_attempts = job.max_attempts or 3
    if retry and job.attempts < max_attempts:
        delay = min(2 ** (job.attempts - 1), 16)
        job.status = "pendiente"
        job.scheduled_for = datetime.now(timezone.utc) + timedelta(minutes=delay)
    else:
        job.status = "error"
    db.commit()
    db.refresh(job)
    return job


def _mirror_scrape_log(db: Session, source: Source, job: IngestJob) -> None:
    """La pantalla de vigilancia sigue leyendo scrape_logs; se replica el resultado."""
    db.add(
        ScrapeLog(
            source_id=source.id,
            status=job.status,
            items_found=job.items_found,
            items_new=job.items_new,
            message=f"[{job.connector}] {job.message}",
            triggered_by=job.triggered_by,
            started_at=job.started_at,
            finished_at=job.finished_at,
        )
    )
