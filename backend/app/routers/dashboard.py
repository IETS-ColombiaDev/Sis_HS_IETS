"""Metricas agregadas para los dashboards del sistema."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import cycle_service
from ..database import get_db
from ..deps import get_current_user
from ..methodology import CYCLE_STATUS_LABELS
from ..models import (
    CycleTechnology,
    Finding,
    PriorityScore,
    Recommendation,
    ScrapeLog,
    Source,
    Technology,
    User,
)
from ..priority import SCREENING_QUEUE_THRESHOLD
from ..rbac import rateable_criteria
from ..schemas import CountItem, DashboardStats, FindingOut, ScrapeLogOut, WorkbenchStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _finding_out(db: Session, f: Finding) -> FindingOut:
    out = FindingOut.model_validate(f)
    out.source_title = f.source.title if f.source else ""
    out.source_category = f.source.category if f.source else ""
    out.source_url = f.source.url if f.source else ""
    out.recommendations_count = (
        db.query(func.count(Recommendation.id)).filter(Recommendation.finding_id == f.id).scalar() or 0
    )
    return out


def _is_incomplete_characterization(f: Finding) -> bool:
    return not all([
        (f.technology or "").strip(),
        (f.horizon or "").strip(),
        (f.summary or "").strip(),
        (f.therapeutic_area or "").strip(),
    ])


def _counts(rows) -> list[CountItem]:
    return [CountItem(label=str(label or "Sin clasificar"), value=int(value)) for label, value in rows]


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    total_sources = db.query(func.count(Source.id)).scalar() or 0
    total_findings = db.query(func.count(Finding.id)).scalar() or 0
    total_recommendations = db.query(func.count(Recommendation.id)).scalar() or 0
    total_scrapes = db.query(func.count(ScrapeLog.id)).scalar() or 0

    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    findings_last_7d = (
        db.query(func.count(Finding.id)).filter(Finding.created_at >= week_ago).scalar() or 0
    )

    by_category = _counts(
        db.query(Source.category, func.count(Source.id)).group_by(Source.category).all()
    )
    by_horizon = _counts(
        db.query(Finding.horizon, func.count(Finding.id)).group_by(Finding.horizon).all()
    )
    by_technology_type = _counts(
        db.query(Finding.technology_type, func.count(Finding.id))
        .group_by(Finding.technology_type)
        .all()
    )
    by_status = _counts(
        db.query(Finding.status, func.count(Finding.id)).group_by(Finding.status).all()
    )
    by_language = _counts(
        db.query(Source.language, func.count(Source.id)).group_by(Source.language).all()
    )

    top_rows = (
        db.query(Source.title, func.count(Finding.id).label("c"))
        .join(Finding, Finding.source_id == Source.id)
        .group_by(Source.id)
        .order_by(func.count(Finding.id).desc())
        .limit(8)
        .all()
    )
    top_sources = _counts(top_rows)

    recent = db.query(Finding).order_by(Finding.created_at.desc()).limit(8).all()
    recent_out = []
    for f in recent:
        out = FindingOut.model_validate(f)
        out.source_title = f.source.title if f.source else ""
        out.source_category = f.source.category if f.source else ""
        out.source_url = f.source.url if f.source else ""
        recent_out.append(out)

    last_log = db.query(ScrapeLog).order_by(ScrapeLog.started_at.desc()).first()
    last_scan = None
    if last_log:
        last_scan = ScrapeLogOut.model_validate(last_log)
        last_scan.source_title = last_log.source.title if last_log.source else ""

    return DashboardStats(
        total_sources=total_sources,
        total_findings=total_findings,
        total_recommendations=total_recommendations,
        total_scrapes=total_scrapes,
        findings_last_7d=findings_last_7d,
        by_category=by_category,
        by_horizon=by_horizon,
        by_technology_type=by_technology_type,
        by_status=by_status,
        by_language=by_language,
        top_sources=top_sources,
        recent_findings=recent_out,
        last_scan=last_scan,
    )


@router.get("/workbench", response_model=WorkbenchStats)
def get_workbench(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Bandeja operativa para el tecnico: cola de trabajo y contadores por fase."""
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    findings_last_7d = (
        db.query(func.count(Finding.id)).filter(Finding.created_at >= week_ago).scalar() or 0
    )
    sources_enabled = (
        db.query(func.count(Source.id)).filter(Source.scrape_enabled == True).scalar() or 0  # noqa: E712
    )

    pending_review = db.query(func.count(Finding.id)).filter(Finding.status == "nuevo").scalar() or 0
    in_triage = db.query(func.count(Finding.id)).filter(Finding.status == "revisado").scalar() or 0
    prioritized = db.query(func.count(Finding.id)).filter(Finding.status == "priorizado").scalar() or 0
    high_priority = (
        db.query(func.count(Finding.id))
        .filter(Finding.screening_score >= SCREENING_QUEUE_THRESHOLD)
        .scalar()
        or 0
    )

    char_candidates = (
        db.query(Finding)
        .filter(Finding.status.in_(["revisado", "priorizado"]))
        .all()
    )
    needs_characterization = sum(1 for f in char_candidates if _is_incomplete_characterization(f))

    prior_rows = db.query(Finding.id).filter(Finding.status == "priorizado").all()
    prior_ids = [r[0] for r in prior_rows]
    pending_recommendations = 0
    if prior_ids:
        with_rec = (
            db.query(func.count(func.distinct(Recommendation.finding_id)))
            .filter(Recommendation.finding_id.in_(prior_ids))
            .scalar()
            or 0
        )
        pending_recommendations = max(0, len(prior_ids) - with_rec)

    queue_rows = (
        db.query(Finding)
        .filter(Finding.status.in_(["nuevo", "revisado"]))
        .order_by(Finding.screening_score.desc(), Finding.created_at.desc())
        .limit(12)
        .all()
    )
    queue = [_finding_out(db, f) for f in queue_rows]

    last_log = db.query(ScrapeLog).order_by(ScrapeLog.started_at.desc()).first()
    last_scan = None
    if last_log:
        last_scan = ScrapeLogOut.model_validate(last_log)
        last_scan.source_title = last_log.source.title if last_log.source else ""

    # --- Contexto metodologico: staging y ciclo activo (fases 1 y 2) --------- #
    staging_unassigned = (
        db.query(func.count(Technology.id))
        .filter(Technology.status == "capturada_no_asignada")
        .scalar()
        or 0
    )

    cycle = cycle_service.get_active_cycle(db)
    my_criteria = rateable_criteria(user)
    cycle_pending_rating = 0
    cycle_pending_for_me = 0
    cycle_prioritized = 0
    cycle_watchlist = 0

    if cycle is not None:
        summary = cycle_service.cycle_summary(db, cycle)
        cycle_prioritized = summary["prioritized"]
        cycle_watchlist = summary["watchlist"]

        rateable = (
            db.query(CycleTechnology)
            .filter(
                CycleTechnology.cycle_id == cycle.id,
                CycleTechnology.status.in_(
                    ["filtrada_apta_priorizacion", "priorizada", "bajo_vigilancia", "no_priorizada"]
                ),
                CycleTechnology.frozen == False,  # noqa: E712
            )
            .all()
        )
        cycle_pending_rating = sum(1 for e in rateable if e.priority_pct is None)

        if my_criteria and rateable:
            rated_map: dict[int, set[str]] = {}
            for tech_id, criterion in (
                db.query(PriorityScore.technology_id, PriorityScore.criterion)
                .filter(PriorityScore.cycle_id == cycle.id)
                .all()
            ):
                rated_map.setdefault(tech_id, set()).add(criterion)
            cycle_pending_for_me = sum(
                1 for e in rateable if set(my_criteria) - rated_map.get(e.technology_id, set())
            )

    return WorkbenchStats(
        pending_review=pending_review,
        in_triage=in_triage,
        prioritized=prioritized,
        high_priority=high_priority,
        needs_characterization=needs_characterization,
        pending_recommendations=pending_recommendations,
        findings_last_7d=findings_last_7d,
        sources_enabled=sources_enabled,
        last_scan=last_scan,
        queue=queue,
        active_cycle_id=cycle.id if cycle else None,
        active_cycle_code=cycle.code if cycle else "",
        active_cycle_status=cycle.status if cycle else "",
        active_cycle_status_label=(
            CYCLE_STATUS_LABELS.get(cycle.status, cycle.status) if cycle else ""
        ),
        staging_unassigned=staging_unassigned,
        cycle_pending_rating=cycle_pending_rating,
        cycle_pending_for_me=cycle_pending_for_me,
        cycle_prioritized=cycle_prioritized,
        cycle_watchlist=cycle_watchlist,
        my_criteria=my_criteria,
    )
