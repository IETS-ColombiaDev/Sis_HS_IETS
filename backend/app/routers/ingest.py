"""Cola de ingesta, sonda de salud, cobertura e importacion del catalogo."""
from __future__ import annotations

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
    target: str = Query("all", pattern="^(all|fda|pipeline)$"),
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
