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

from . import ingest, product_details
from .audit import record_action
from .events import bump_state_version
from .ingest.base import CanonicalRecord, ConnectorError, RateLimited, SchemaChanged
from .methodology import get_param
from .models import Finding, IngestJob, RawRecord, ScrapeLog, Source, Technology
from .priority import compute_screening_score, screening_weights
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
    """Crea un job por fuente. No ejecuta nada: eso lo hace `tick` o `run_job`.

    Los jobs se crean en orden alfabetico. La prioridad de la matriz EH era un
    comentario interno: no ordena ni filtra la vigilancia.
    """
    ordered = sorted(sources, key=lambda s: (s.title or "").lower())
    jobs: list[IngestJob] = []
    now = datetime.now(timezone.utc)
    for source in ordered:
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


def recover_stale(db: Session, *, minutes: int = 30) -> int:
    """Devuelve a la cola los jobs que quedaron `ejecutando` tras una caida.

    Sin esto, un job huerfano bloquea su fuente para siempre: `enqueue` reutiliza
    el job pendiente o en ejecucion en lugar de crear uno nuevo.
    """
    limit = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    stale = []
    for job in db.query(IngestJob).filter(IngestJob.status == "ejecutando").all():
        started = job.started_at or job.created_at
        if started is not None and started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if started is None or started < limit:
            stale.append(job)
    for job in stale:
        job.finished_at = datetime.now(timezone.utc)
        job.message = "Interrumpido: el proceso se detuvo durante la ejecución."
        if (job.attempts or 0) < (job.max_attempts or 3):
            job.status = "pendiente"
            job.scheduled_for = datetime.now(timezone.utc)
        else:
            job.status = "error"
    if stale:
        db.commit()
    return len(stale)


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
        # Reclamo atomico: el worker regular y un `kick` pueden haber leido el
        # mismo job pendiente. Solo quien lo pasa a `ejecutando` lo corre.
        claimed = (
            db.query(IngestJob)
            .filter(IngestJob.id == job.id, IngestJob.status == "pendiente")
            .update({IngestJob.status: "ejecutando"}, synchronize_session=False)
        )
        db.commit()
        if not claimed:
            continue
        done.append(run_job(db, job.id))
    return done


def claim_next(db: Session) -> int | None:
    """Reclama el siguiente job vencido (pasa a `ejecutando`) y devuelve su id.

    Varios hilos del worker llaman esto a la vez: el UPDATE condicionado al
    estado `pendiente` garantiza que cada job lo corra uno solo.
    """
    for _ in range(20):
        now = datetime.now(timezone.utc)
        job = (
            db.query(IngestJob.id)
            .filter(IngestJob.status == "pendiente", IngestJob.scheduled_for <= now)
            .order_by(IngestJob.scheduled_for.asc(), IngestJob.id.asc())
            .first()
        )
        if job is None:
            return None
        claimed = (
            db.query(IngestJob)
            .filter(IngestJob.id == job.id, IngestJob.status == "pendiente")
            .update({IngestJob.status: "ejecutando"}, synchronize_session=False)
        )
        db.commit()
        if claimed:
            return job.id
    return None


def next_pending_at(db: Session) -> datetime | None:
    """Fecha del proximo job pendiente (incluye reintentos programados a futuro)."""
    row = (
        db.query(IngestJob.scheduled_for)
        .filter(IngestJob.status == "pendiente")
        .order_by(IngestJob.scheduled_for.asc())
        .first()
    )
    if row is None or row[0] is None:
        return None
    value = row[0]
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def cancel_pending(db: Session, *, actor: str, source_ids: list[int] | None = None) -> int:
    """Cancela los jobs que aun no arrancan. Los que estan corriendo terminan solos."""
    from . import scan_progress

    query = db.query(IngestJob).filter(IngestJob.status == "pendiente")
    if source_ids:
        query = query.filter(IngestJob.source_id.in_(source_ids))
    jobs = query.all()
    now = datetime.now(timezone.utc)
    for job in jobs:
        job.status = "cancelado"
        job.finished_at = now
        job.message = f"Cancelado por {actor}."
        if job.source_id:
            scan_progress.forget(job.source_id)
    if jobs:
        record_action(
            db,
            entity_type="ingest_jobs",
            entity_id="cola",
            action="ingest_cancel",
            new_value={"cancelled": len(jobs), "by": actor},
        )
        db.commit()
        bump_state_version(db)
    return len(jobs)


def max_parallel() -> int:
    """Tope de carriles que admite la maquina (INGEST_MAX_PARALLEL; 3, o 1 en Render).

    En Render gratuito (0,1 CPU y 512 MB) varios rastreos a la vez agotan la
    memoria y el proceso se reinicia: alli se fija en 1 (render.yaml).
    """
    import os

    # Render define RENDER=true en sus contenedores: sin variable explicita, uno a la vez.
    default = "1" if os.environ.get("RENDER") else "3"
    try:
        return max(1, min(int(os.environ.get("INGEST_MAX_PARALLEL", default) or default), 8))
    except ValueError:
        return int(default)


def parallel_jobs(db: Session) -> int:
    """Fuentes que el worker atiende a la vez (parametro `ingest.parallel_jobs`, con el tope de la maquina)."""
    try:
        value = int(get_param(db, "ingest.parallel_jobs", 3) or 3)
    except (TypeError, ValueError):
        value = 3
    return max(1, min(value, 8, max_parallel()))


JOB_TIMEOUT_DEFAULT_MIN = 20


def job_timeout_seconds(db: Session) -> float:
    """Tiempo maximo por fuente (parametro `ingest.job_timeout_minutes`, minimo 2 min)."""
    try:
        minutes = float(get_param(db, "ingest.job_timeout_minutes", JOB_TIMEOUT_DEFAULT_MIN) or JOB_TIMEOUT_DEFAULT_MIN)
    except (TypeError, ValueError):
        minutes = JOB_TIMEOUT_DEFAULT_MIN
    return max(2.0, minutes) * 60.0


def run_job_guarded(job_id: int, timeout_s: float) -> str:
    """Corre un job en su propio hilo y sesion con tiempo maximo.

    Devuelve "ok" (termino, con el desenlace que sea) o "timeout". Sin este tope,
    una sola fuente colgada (una pagina que no cierra la conexion, un proveedor de
    IA que no responde) retenia el carril para siempre y la corrida quedaba
    detenida en la fuente N. Al agotarse el tiempo se cierra el job con error, el
    hilo recibe la senal de corte en su siguiente paso y la cola sigue.
    """
    import threading

    from . import scan_progress
    from .database import SessionLocal

    abort = threading.Event()
    done = threading.Event()

    def target() -> None:
        db = SessionLocal()
        token = scan_progress.arm(abort)
        try:
            run_job(db, job_id)
        except scan_progress.JobAborted:
            db.rollback()
        except Exception:  # noqa: BLE001
            log.exception("Job de ingesta %s", job_id)
        finally:
            scan_progress.disarm(token)
            db.close()
            done.set()

    worker = threading.Thread(target=target, name=f"ingest-job-{job_id}", daemon=True)
    worker.start()
    if done.wait(timeout_s):
        return "ok"
    abort.set()

    def close_job() -> bool:
        db = SessionLocal()
        try:
            _expire_job(db, job_id, timeout_s)
            return True
        except Exception:  # noqa: BLE001 - p. ej. SQLite ocupado por el hilo que se esta soltando
            log.warning("No se pudo cerrar por tiempo el job %s; se reintenta", job_id, exc_info=True)
            db.rollback()
            return False
        finally:
            db.close()

    closed = close_job()
    # Margen para que el hilo suelte la fuente antes de tomar la siguiente.
    done.wait(30)
    if not closed:
        close_job()
    return "timeout"


def _expire_job(db: Session, job_id: int, timeout_s: float) -> None:
    from . import scan_progress

    job = db.get(IngestJob, job_id)
    if job is None or job.status != "ejecutando":
        return
    minutes = int(round(timeout_s / 60))
    live = scan_progress.get(job.source_id) if job.source_id else None
    where = ""
    if live and live.get("stage"):
        label = scan_progress.STAGE_LABELS.get(live["stage"], live["stage"]).lower()
        where = f" (iba en: {label}{' · ' + live['detail'][:90] if live.get('detail') else ''})"
    job.status = "error"
    job.finished_at = datetime.now(timezone.utc)
    job.message = (
        f"Tiempo máximo agotado: la fuente superó {minutes} min{where}. La vigilancia siguió con la "
        "siguiente. Ajuste el tope en Configuración › Gobierno metodológico (ingest.job_timeout_minutes)."
    )[:2000]
    record_action(
        db,
        entity_type="ingest_jobs",
        entity_id=str(job.id),
        action="ingest_timeout",
        new_value={"source_id": job.source_id, "minutes": minutes},
    )
    db.commit()
    if job.source_id:
        scan_progress.finish(job.source_id, ok=False, detail=job.message[:240])
        scan_progress.persist(db, job.source_id, job)
    bump_state_version(db)


def run_job(db: Session, job_id: int) -> IngestJob:
    """Ejecuta un job y deja su etapa en `scan_progress` para la pantalla de vigilancia."""
    from . import scan_progress

    job = db.get(IngestJob, job_id)
    if job is None:
        raise ValueError(f"job {job_id} no existe")
    source_id = job.source_id
    if source_id is None:
        return _run_job(db, job)
    scan_progress.start(source_id, job.id, connector=job.connector or "")
    token = scan_progress.bind(source_id)
    try:
        job = _run_job(db, job)
    except Exception as exc:  # noqa: BLE001
        scan_progress.finish(source_id, ok=False, detail=f"{type(exc).__name__}: {exc}"[:240])
        raise
    finally:
        scan_progress.unbind(token)
    _report_final(scan_progress, source_id, job)
    if job.status != "pendiente":
        # Los reintentos aun pendientes no cuentan: el informe guarda el desenlace.
        scan_progress.persist(db, source_id, job)
    return job


def _report_final(scan_progress, source_id: int, job: IngestJob) -> None:
    if job.status in ("ok", "parcial"):
        detail = f"+{job.items_new} nuevas de {job.items_found} detectadas"
        if job.status == "parcial":
            detail += " (parcial)"
        scan_progress.finish(source_id, ok=True, detail=detail, items_found=job.items_found, items_new=job.items_new)
    elif job.status == "pendiente":
        when = job.scheduled_for.strftime("%H:%M") if job.scheduled_for else "pronto"
        scan_progress.finish(
            source_id,
            ok=False,
            final_stage="en_cola",
            detail=f"Falló: {job.message} · reintento {job.attempts + 1}/{job.max_attempts or 3} a las {when} UTC"[:240],
        )
    else:
        scan_progress.finish(source_id, ok=False, detail=(job.message or "Error")[:240])


def _run_job(db: Session, job: IngestJob) -> IngestJob:
    from . import scan_progress

    job.status = "ejecutando"
    job.attempts = (job.attempts or 0) + 1
    job.started_at = datetime.now(timezone.utc)
    job.message = ""
    db.commit()

    source = db.get(Source, job.source_id) if job.source_id else None
    if source is None:
        return _fail(db, job, "La fuente asociada ya no existe.", retry=False)

    now = datetime.now(timezone.utc)
    # El circuito protege la vigilancia programada de insistir sobre un sitio
    # caido. Una corrida manual es una orden explicita: se intenta igual.
    if _circuit_is_open(source, now) and (job.origin or "") != "manual":
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

        scan_progress.stage("sonda", "Verificando la salud de la fuente antes de ingerir")
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
        if not used_html:
            scan_progress.attempt(source.url or "", "error", str(exc)[:160], route="api")
        _trip_failure(db, source, str(exc))
        return _fail(db, job, str(exc), retry=True)
    except Exception as exc:  # noqa: BLE001
        log.exception("Fallo inesperado en el job %s (%s)", job.id, connector_code)
        _trip_failure(db, source, str(exc))
        return _fail(db, job, f"{type(exc).__name__}: {exc}", retry=True)

    # Cerrado por tiempo mientras terminaba: el desenlace ya lo escribio el worker.
    scan_progress.check_abort()
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
        weights=screening_weights(db),
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
        details=product_details.merge(
            record.details,
            product_details.extract(
                title=record.title, summary=record.summary, technology_type=record.technology_type
            ),
        )
        or None,
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
            "label": "Rastreo HTML / PDF (último recurso)",
            "description": "El scraper genérico se conserva para referentes sin API.",
            "min_interval": 0.0,
            "requires_url": True,
        },
        {
            "code": "pdf",
            "label": "Extracción de PDF",
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

    from . import scan_progress

    max_records = int(get_param(db, "ingest.max_records_per_run", 50) or 50)
    scan_progress.stage("conectando", f"Consultando la API ({adapter.label or connector_code})")
    result = adapter.fetch(config=source.connector_config or {}, url=source.url or "")
    scan_progress.attempt(source.url or "", "ok", f"{len(result.records)} registro(s)", route="api")
    scan_progress.accessed("api", 200, f"API respondió: {len(result.records)} registro(s)")
    scan_progress.note("search", enabled=False, reason="Fuente con API: los registros llegan estructurados, no se busca en la web")
    scan_progress.note("ai", used=False, reason="Registros estructurados de la API: se mapean campo a campo, sin IA")
    scan_progress.stage("guardando", f"Guardando hasta {min(len(result.records), max_records)} registro(s)")
    cfg = dict(source.connector_config or {})
    if result.next_cursor:
        cfg["pageToken"] = result.next_cursor
        source.connector_config = cfg
    elif "pageToken" in cfg:
        # Ultima pagina (o cursor caducado y reiniciado): la proxima corrida
        # vuelve a empezar por lo mas reciente.
        cfg.pop("pageToken")
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
    if scrape_log.status == "error":
        # Un 403 o una caida de la fuente no es un job "ok": cuenta para el
        # reintento y el cortacircuitos como cualquier conector.
        raise ConnectorError(scrape_log.message or "El escaneo HTML fallo.")
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
    from . import scan_progress

    # Si el worker ya cerro el job por tiempo, este hilo no reescribe su desenlace.
    scan_progress.check_abort()
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
