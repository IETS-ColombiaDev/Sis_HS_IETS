"""Cola de ingesta, sonda de salud, cobertura e importacion del catalogo."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..catalog import catalog_stats
from ..catalog_service import accept_terms, sync_catalog
from ..coverage_service import coverage_gaps
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..ingest_service import enqueue, list_connectors, run_job, tick
from ..models import IngestJob, RawRecord, Source, Technology, User
from ..probe_service import health_board, probe_all, probe_source
from ..rbac import P_CONFIG_MANAGE, P_SCAN_RUN, P_SOURCE_WRITE
from ..schemas import (
    CatalogImportOut,
    ConnectorOut,
    CoverageOut,
    IngestHealthOut,
    IngestJobOut,
    IngestRunIn,
    IngestRunOut,
    RawPreviewOut,
    SourceProbeOut,
)
from ..worker import kick

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


def _job_out(job: IngestJob, db: Session) -> IngestJobOut:
    out = IngestJobOut.model_validate(job)
    if job.source_id:
        source = db.get(Source, job.source_id)
        out.source_title = source.title if source else ""
    return out


@router.get("/connectors", response_model=list[ConnectorOut])
def connectors(user: User = Depends(get_current_user)):
    return [ConnectorOut(**row) for row in list_connectors()]


@router.get("/jobs", response_model=list[IngestJobOut])
def list_jobs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(80, le=300),
):
    rows = db.query(IngestJob).order_by(IngestJob.id.desc()).limit(limit).all()
    return [_job_out(j, db) for j in rows]


@router.post("/run", response_model=IngestRunOut)
def run_ingest(
    payload: IngestRunIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCAN_RUN)),
):
    query = db.query(Source).filter(Source.scrape_enabled.is_(True))
    if payload.source_ids:
        query = query.filter(Source.id.in_(payload.source_ids))
    sources = query.all()
    if not sources:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay fuentes habilitadas para ingerir.",
        )
    jobs = enqueue(db, sources, triggered_by=user.email, origin="manual")
    processed = 0
    if payload.process_now:
        for job in jobs:
            run_job(db, job.id)
            processed += 1
            db.refresh(job)
    else:
        kick()
    return IngestRunOut(
        jobs=[_job_out(j, db) for j in jobs],
        queued=len(jobs),
        processed=processed,
    )


# Etapa que se muestra cuando el proceso no tiene el detalle en memoria
# (se reinicio, o el job aun no arranca).
_STAGE_FROM_STATUS = {
    "pendiente": "en_cola",
    "ejecutando": "conectando",
    "ok": "terminada",
    "parcial": "terminada",
    "error": "error",
    "cancelado": "cancelada",
}
PROGRESS_WINDOW_HOURS = 12


def _utc(value: datetime | None) -> datetime | None:
    """SQLite devuelve fechas sin zona: se marcan UTC para que el navegador no las lea como hora local."""
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


@router.get("/progress")
def ingest_progress(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Estado en vivo de cada fuente de la vigilancia en curso o reciente.

    Por fuente: el ultimo job de las ultimas horas, la etapa (en cola, accediendo,
    accedida, recorriendo, extrayendo, guardando, terminada, error), por que ruta
    se accedio y cuantas senales lleva. La pantalla lo consulta cada pocos segundos
    mientras haya trabajo pendiente.
    """
    from .. import scan_eta, scan_progress
    from ..ingest_service import job_timeout_seconds, parallel_jobs
    from ..worker import is_running, keepalive_url

    since = datetime.now(timezone.utc) - timedelta(hours=PROGRESS_WINDOW_HOURS)
    rows = (
        db.query(IngestJob)
        .filter(IngestJob.source_id.isnot(None), IngestJob.created_at >= since)
        .order_by(IngestJob.id.desc())
        .limit(600)
        .all()
    )
    latest: dict[int, IngestJob] = {}
    for job in rows:
        latest.setdefault(job.source_id, job)
    # Un job viejo que sigue pendiente o en ejecucion tambien cuenta.
    for job in db.query(IngestJob).filter(IngestJob.status.in_(("pendiente", "ejecutando"))).all():
        if job.source_id and (job.source_id not in latest or latest[job.source_id].id < job.id):
            latest[job.source_id] = job

    # Con una corrida activa, el avance cuenta SOLO esa corrida: mezclar las fuentes
    # de una corrida anterior (ultimas 12 h) mostraba "77 de 87" en una de 14.
    running_now = [j for j in latest.values() if j.status in ("pendiente", "ejecutando")]
    if running_now:
        run_start = min(_utc(j.created_at) or datetime.now(timezone.utc) for j in running_now) - timedelta(seconds=5)
        latest = {
            sid: j
            for sid, j in latest.items()
            if j.status in ("pendiente", "ejecutando") or (_utc(j.created_at) and _utc(j.created_at) >= run_start)
        }

    titles = {
        s.id: s.title
        for s in db.query(Source.id, Source.title).filter(Source.id.in_(list(latest) or [0])).all()
    }
    live = scan_progress.snapshot()
    saved = scan_progress.load_report(db)
    counts = {k: 0 for k in ("pendiente", "ejecutando", "ok", "parcial", "error", "cancelado")}
    out = []
    for source_id, job in latest.items():
        counts[job.status] = counts.get(job.status, 0) + 1
        mem = live.get(source_id)
        if mem and mem.get("job_id") != job.id:
            mem = None
        if mem is None:
            # Tras un reinicio el detalle sale del informe guardado (mismo job).
            stored = saved.get(str(source_id))
            if stored and stored.get("job_id") == job.id:
                mem = stored
        stage = (mem or {}).get("stage") or _STAGE_FROM_STATUS.get(job.status, "en_cola")
        if job.status == "cancelado":
            stage = "cancelada"
        via = (mem or {}).get("access_via") or ""
        out.append(
            {
                "source_id": source_id,
                "source_title": titles.get(source_id, ""),
                "job_id": job.id,
                "job_status": job.status,
                "origin": job.origin,
                "attempts": job.attempts or 0,
                "max_attempts": job.max_attempts or 3,
                "stage": stage,
                "stage_label": scan_progress.STAGE_LABELS.get(stage, stage),
                "detail": (mem or {}).get("detail") or job.message or "",
                "accessed": bool((mem or {}).get("accessed")) or job.status in ("ok", "parcial"),
                "access_via": via,
                "access_label": scan_progress.ACCESS_VIA_LABELS.get(via, ""),
                "http_status": (mem or {}).get("http_status") or 0,
                "pages_visited": (mem or {}).get("pages_visited") or 0,
                "pages_planned": (mem or {}).get("pages_planned") or 0,
                "items_found": job.items_found or (mem or {}).get("items_found") or 0,
                "items_new": job.items_new or (mem or {}).get("items_new") or 0,
                "message": job.message or "",
                "scheduled_for": _utc(job.scheduled_for),
                "started_at": _utc(job.started_at),
                "finished_at": _utc(job.finished_at),
                "updated_at": (mem or {}).get("updated_at") or (mem or {}).get("at"),
                "events": (mem or {}).get("events") or [],
                "access_attempts": (mem or {}).get("access_attempts") or [],
                "search": (mem or {}).get("search") or {},
                "ai": (mem or {}).get("ai") or {},
            }
        )
    lanes = parallel_jobs(db)
    timeout_s = job_timeout_seconds(db)
    eta = None
    try:
        eta = scan_eta.estimate(db, list(latest.values()), lanes=lanes, timeout_s=timeout_s)
    except Exception:  # noqa: BLE001 - la estimacion es complementaria
        log.exception("Estimacion de la vigilancia")
    try:
        typical = scan_eta.expected_seconds(
            db, [r["source_id"] for r in out if r["job_status"] in ("pendiente", "ejecutando")]
        )
    except Exception:  # noqa: BLE001 - complementario: nunca tumba el avance
        log.exception("Duracion tipica de las fuentes")
        typical = {}
    for row in out:
        row["typical_seconds"] = typical.get(row["source_id"])
    order = {"ejecutando": 0, "pendiente": 1, "error": 2, "parcial": 3, "ok": 4, "cancelado": 5}
    out.sort(key=lambda r: (order.get(r["job_status"], 9), r["source_title"].lower()))
    return {
        "active": counts["pendiente"] + counts["ejecutando"] > 0,
        "worker_running": is_running(),
        "parallel": lanes,
        "job_timeout_minutes": int(timeout_s // 60),
        "keepalive": bool(keepalive_url()),
        "server_time": datetime.now(timezone.utc).isoformat(),
        "eta": eta,
        "counts": counts,
        "total": len(out),
        "sources": out,
    }


OUTCOME_LABELS = {
    "entro_directo": "Entró a la fuente",
    "entro_respaldo": "Entró por una ruta de respaldo",
    "entro_sin_senales": "Entró, pero no encontró señales",
    "no_entro": "No pudo entrar",
    "fallo_despues": "Entró, pero la extracción falló",
    "en_curso": "En curso",
    "sin_ejecutar": "Sin ejecutar",
}


def access_outcome(entry: dict | None, job_status: str = "") -> str:
    if job_status in ("pendiente", "ejecutando"):
        return "en_curso"
    if not entry:
        return "sin_ejecutar"
    if not entry.get("accessed"):
        return "no_entro"
    if entry.get("job_status") == "error":
        return "fallo_despues"
    if not (entry.get("items_found") or 0):
        return "entro_sin_senales"
    if entry.get("access_via") in ("google_news", "rss_oficial"):
        return "entro_respaldo"
    return "entro_directo"


@router.get("/access-report")
def access_report(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Ultimo desenlace de cada fuente activa: si entro, por donde, que busco, que hizo la IA, que encontro.

    Es el informe de transparencia de la vigilancia: una fila por fuente con
    ingesta activa, incluidas las que nunca se han rastreado.
    """
    from .. import scan_progress

    saved = scan_progress.load_report(db)
    live_jobs = {
        j.source_id: j.status
        for j in db.query(IngestJob).filter(IngestJob.status.in_(("pendiente", "ejecutando"))).all()
    }
    rows = []
    sources = (
        db.query(Source)
        .filter(Source.scrape_enabled.is_(True), Source.retired.isnot(True))
        .order_by(Source.title)
        .all()
    )
    for source in sources:
        if source.catalog_active is False:
            continue
        entry = saved.get(str(source.id))
        outcome = access_outcome(entry, live_jobs.get(source.id, ""))
        rows.append(
            {
                "source_id": source.id,
                "title": source.title,
                "url": source.url,
                "connector": source.connector or "html",
                "access_level": source.access_level or "",
                "outcome": outcome,
                "outcome_label": OUTCOME_LABELS[outcome],
                "access_label": scan_progress.ACCESS_VIA_LABELS.get((entry or {}).get("access_via") or "", ""),
                "last_scraped_at": _utc(source.last_scraped_at),
                **({k: v for k, v in entry.items()} if entry else {}),
            }
        )
    counts = {key: 0 for key in OUTCOME_LABELS}
    for row in rows:
        counts[row["outcome"]] += 1
    return {
        "counts": counts,
        "labels": OUTCOME_LABELS,
        "total": len(rows),
        "sources": rows,
        "search_health": _search_health(db, rows),
    }


def _search_health(db: Session, rows: list[dict]) -> dict:
    """Estado real de la busqueda web: motores en pausa y cuantas fuentes obtuvieron resultados."""
    from .. import source_profile, web_search

    cfg = source_profile.load_search(db)
    searched = [r for r in rows if (r.get("search") or {}).get("enabled")]
    with_results = sum(1 for r in searched if (r.get("search") or {}).get("results"))
    has_api = bool(source_profile.brave_api_key(db)) or bool(cfg.get("searxng_url"))
    note = ""
    if searched and with_results < max(1, len(searched) // 3) and not has_api:
        note = (
            "Los buscadores gratuitos (Yahoo, Bing, DuckDuckGo) bloquean o devuelven vacío cuando se les "
            "consulta en volumen, y más desde servidores en la nube. Para una búsqueda web confiable, configure "
            "una llave de Brave Search API (plan gratuito) o un SearXNG propio en Configuración › Parámetros de fuentes."
        )
    return {
        "enabled": bool(cfg.get("enabled")),
        "engines": list(cfg.get("engines") or []),
        "cooling": web_search.cooldown_status(),
        "api_configured": has_api,
        "sources_searched": len(searched),
        "sources_with_results": with_results,
        "note": note,
    }


@router.post("/cancel")
def cancel_queue(
    payload: IngestRunIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCAN_RUN)),
):
    """Detiene la vigilancia: cancela lo que sigue en cola. Lo que ya corre termina."""
    from ..ingest_service import cancel_pending

    ids = list(payload.source_ids) if payload and payload.source_ids else None
    cancelled = cancel_pending(db, actor=user.email, source_ids=ids)
    return {"cancelled": cancelled}


@router.post("/tick", response_model=list[IngestJobOut])
def process_pending(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCAN_RUN)),
    limit: int = Query(8, le=40),
):
    done = tick(db, limit=limit)
    return [_job_out(j, db) for j in done]


@router.post("/sources/import", response_model=CatalogImportOut)
def import_catalog(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SOURCE_WRITE)),
):
    return CatalogImportOut(**sync_catalog(db, triggered_by=user.email))


@router.get("/catalog/stats")
def catalog_overview(user: User = Depends(get_current_user)):
    return catalog_stats()


@router.post("/sources/{source_id}/probe", response_model=SourceProbeOut)
def probe_one(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCAN_RUN)),
):
    source = db.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Fuente no encontrada")
    return SourceProbeOut(**probe_source(db, source))


@router.post("/sources/{source_id}/accept-terms")
def accept_source_terms(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SOURCE_WRITE)),
):
    source = db.get(Source, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Fuente no encontrada")
    row = accept_terms(db, source)
    return {"id": row.id, "terms_accepted_at": row.terms_accepted_at}


@router.post("/probe")
def probe_governors(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_SCAN_RUN)),
    only_ab: bool = Query(True),
):
    return probe_all(db, only_ab=only_ab)


@router.get("/health", response_model=IngestHealthOut)
def ingest_health(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return IngestHealthOut(**health_board(db))


@router.get("/coverage", response_model=CoverageOut)
def ingest_coverage(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    cycle_id: int | None = Query(None),
):
    return CoverageOut(**coverage_gaps(db, cycle_id))


@router.get("/raw/{technology_id}", response_model=RawPreviewOut)
def raw_preview(
    technology_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tech = db.get(Technology, technology_id)
    if tech is None:
        raise HTTPException(status_code=404, detail="Tecnología no encontrada")

    raw = (
        db.query(RawRecord)
        .filter(RawRecord.technology_id == technology_id)
        .order_by(RawRecord.fetched_at.desc())
        .first()
    )
    payload = (tech.raw_payload or {}) if isinstance(tech.raw_payload, dict) else {}
    origin = payload.get("origin") or ("connector" if raw else "")
    nested = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    source_title = ""
    if tech.source_id:
        source = db.get(Source, tech.source_id)
        source_title = source.title if source else ""

    return RawPreviewOut(
        technology_id=tech.id,
        origin=origin,
        connector=(raw.connector if raw else payload.get("connector") or ""),
        external_id=(raw.external_id if raw else payload.get("external_id") or ""),
        fetched_at=raw.fetched_at if raw else tech.captured_at,
        payload=raw.payload if raw and raw.payload else nested,
        finding_id=tech.finding_id,
        source_title=source_title,
    )


@router.post("/reprocess")
def reprocess_from_raw(
    target: str = Query("all", pattern="^(all|fda|pipeline|producto)$"),
    apply: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CONFIG_MANAGE)),
):
    """Vuelve a mapear lo ya capturado desde el crudo, sin consultar la fuente.

    Sin `apply=true` es una simulacion: devuelve los cambios que haria. Ver
    `reprocess_service` para el detalle de cada correccion.
    """
    from ..reprocess_service import reprocess_all

    return reprocess_all(db, apply=apply, only=target, actor=user.email)
