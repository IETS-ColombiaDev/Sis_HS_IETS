"""Tablero estrategico, boletines y alertas (RF17, RF19, RF20)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from .. import strategy_service
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..models import AlertEvent, AlertSubscription, Bulletin, Cycle, User
from ..rbac import P_CYCLE_WRITE, P_RESTRICTED_ANALYTICS, has_permission
from ..strategy_service import StrategyRuleError
from ..schemas import (
    AlertEventOut,
    AlertSubscriptionIn,
    AlertSubscriptionOut,
    BulletinDecisionIn,
    BulletinOut,
    StrategyDashboardOut,
)

router = APIRouter(tags=["strategy"])


def _cycle(db: Session, cycle_id: int) -> Cycle:
    cycle = db.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Ciclo no encontrado")
    return cycle


@router.get("/api/strategy/dashboard", response_model=StrategyDashboardOut)
def strategy_dashboard(
    cycle_id: int = Query(...),
    cluster_id: int | None = None,
    tech_type_id: int | None = None,
    band: str = "",
    status: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cycle = _cycle(db, cycle_id)
    data = strategy_service.dashboard_for(
        db,
        cycle,
        include_restricted=has_permission(user, P_RESTRICTED_ANALYTICS),
        cluster_id=cluster_id,
        tech_type_id=tech_type_id,
        band=band,
        status=status,
    )
    return StrategyDashboardOut(**data)


@router.post("/api/strategy/refresh/{cycle_id}")
def refresh_datamart(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    cycle = _cycle(db, cycle_id)
    strategy_service.snapshot_ttm(db, cycle)
    row = strategy_service.refresh_datamart(db, cycle)
    db.commit()
    bump_state_version(db)
    return {"cycle_id": cycle.id, "refreshed_at": row.refreshed_at}


@router.get("/api/bulletins", response_model=list[BulletinOut])
def list_bulletins(
    cycle_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Bulletin)
    if cycle_id:
        q = q.filter(Bulletin.cycle_id == cycle_id)
    return q.order_by(Bulletin.created_at.desc()).all()


@router.post("/api/bulletins/compile/{cycle_id}", response_model=BulletinOut)
def compile_bulletin(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    cycle = _cycle(db, cycle_id)
    row = strategy_service.compile_bulletin(db, cycle, actor=user.email)
    db.commit()
    db.refresh(row)
    return row


@router.post("/api/bulletins/{bulletin_id}/approve", response_model=BulletinOut)
def approve_bulletin(
    bulletin_id: int,
    payload: BulletinDecisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission(P_CYCLE_WRITE)),
):
    row = db.get(Bulletin, bulletin_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Boletin no encontrado")
    try:
        strategy_service.approve_bulletin(db, row, actor=user.email, publish=False)
        if payload.publish:
            strategy_service.publish_bulletin(db, row, actor=user.email)
    except StrategyRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(row)
    return row


@router.get("/api/bulletins/{bulletin_id}/export")
def export_bulletin(
    bulletin_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(Bulletin, bulletin_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Boletin no encontrado")
    html = strategy_service.render_bulletin_html(row)
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="boletin-{row.id}.html"'},
    )


@router.get("/api/alerts", response_model=list[AlertEventOut])
def list_alerts(
    unread: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(AlertEvent).filter(AlertEvent.user_id == user.id)
    if unread:
        q = q.filter(AlertEvent.read_at.is_(None))
    return q.order_by(AlertEvent.created_at.desc()).limit(50).all()


@router.post("/api/alerts/{alert_id}/read", response_model=AlertEventOut)
def mark_read(
    alert_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(AlertEvent, alert_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    row.read_at = strategy_service._utcnow()
    db.commit()
    db.refresh(row)
    return row


@router.get("/api/alerts/subscriptions", response_model=list[AlertSubscriptionOut])
def list_subs(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(AlertSubscription)
        .filter(AlertSubscription.user_id == user.id)
        .all()
    )


@router.post("/api/alerts/subscriptions", response_model=AlertSubscriptionOut)
def upsert_sub(
    payload: AlertSubscriptionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = strategy_service.subscribe(db, user, payload.cluster_id)
    row.enabled = payload.enabled
    db.commit()
    db.refresh(row)
    return row
