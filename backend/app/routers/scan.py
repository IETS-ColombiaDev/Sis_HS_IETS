"""Ejecucion del escaneo (web scraping) y consulta de su historial."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, require_role
from ..events import bump_state_version
from ..models import ScrapeLog, Source, User
from ..schemas import LinkPreviewIn, LinkPreviewOut, ScanRequest, ScanResult, ScrapeLogOut
from ..scraper import preview_url, scrape_source

router = APIRouter(prefix="/api/scan", tags=["scan"])


def _log_to_out(log: ScrapeLog) -> ScrapeLogOut:
    out = ScrapeLogOut.model_validate(log)
    out.source_title = log.source.title if log.source else ""
    return out


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

    logs: list[ScrapeLogOut] = []
    total_new = 0
    total_found = 0
    for source in sources:
        log = scrape_source(db, source, triggered_by=user.email)
        logs.append(_log_to_out(log))
        total_new += log.items_new
        total_found += log.items_found

    bump_state_version(db)
    return ScanResult(logs=logs, total_new=total_new, total_found=total_found)


@router.post("/source/{source_id}", response_model=ScrapeLogOut)
def run_scan_source(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("editor")),
):
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuente no encontrada")
    log = scrape_source(db, source, triggered_by=user.email)
    bump_state_version(db)
    return _log_to_out(log)


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
