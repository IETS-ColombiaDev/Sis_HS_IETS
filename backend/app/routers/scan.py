"""Ejecucion del escaneo y consulta de su historial.

La extraccion ya no corre en el hilo de la peticion: se encola un job por
fuente y el worker lo atiende. `/source/{id}` sigue esperando ese job para no
romper el boton de una sola fuente en la interfaz.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_role
from ..ingest_service import enqueue, run_job
from ..models import IngestJob, ScrapeLog, Source, User
from ..schemas import LinkPreviewIn, LinkPreviewOut, ScanRequest, ScanResult, ScrapeLogOut
from ..scraper import preview_url
from ..worker import kick

router = APIRouter(prefix="/api/scan", tags=["scan"])


def _log_to_out(log: ScrapeLog) -> ScrapeLogOut:
    out = ScrapeLogOut.model_validate(log)
    out.source_title = log.source.title if log.source else ""
    return out


def _job_as_log(job: IngestJob, source: Source | None) -> ScrapeLogOut:
    return ScrapeLogOut(
        id=job.id,
        source_id=job.source_id,
        source_title=source.title if source else "",
        status=job.status,
        items_found=job.items_found,
        items_new=job.items_new,
        message=job.message or f"Encolado ({job.connector})",
        triggered_by=job.triggered_by,
        started_at=job.started_at or job.created_at,
        finished_at=job.finished_at,
    )


@router.post("/run", response_model=ScanResult)
def run_scan(
    payload: ScanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    query = db.query(Source).filter(Source.scrape_enabled == True)  # noqa: E712
    if payload.source_ids:
        query = query.filter(Source.id.in_(payload.source_ids))
    sources = query.all()
    if not sources:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay fuentes habilitadas para escanear.",
        )

    jobs = enqueue(db, sources, triggered_by=user.email, origin="manual")
    kick()
    by_id = {s.id: s for s in sources}
    logs = [_job_as_log(j, by_id.get(j.source_id)) for j in jobs]
    return ScanResult(logs=logs, total_new=0, total_found=0)


@router.post("/source/{source_id}", response_model=ScrapeLogOut)
def run_scan_source(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    jobs = enqueue(db, [source], triggered_by=user.email, origin="manual")
    job = run_job(db, jobs[0].id)
    return _job_as_log(job, source)


@router.post("/preview", response_model=LinkPreviewOut)
def preview_link(
    payload: LinkPreviewIn,
    user: User = Depends(require_role("editor")),
):
    """Previsualiza que informacion se extraeria de un enlace (sin guardar nada)."""
    return LinkPreviewOut(**preview_url(payload.url.strip()))


@router.get("/logs", response_model=list[ScrapeLogOut])
def list_logs(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(100, le=500),
):
    logs = db.query(ScrapeLog).order_by(ScrapeLog.started_at.desc()).limit(limit).all()
    return [_log_to_out(log) for log in logs]
