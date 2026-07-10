"""Metricas agregadas para los dashboards del sistema."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Finding, Recommendation, ScrapeLog, Source, User
from ..schemas import CountItem, DashboardStats, FindingOut, ScrapeLogOut

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


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
