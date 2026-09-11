"""Tablero estrategico, boletines y alertas (RF17, RF19, RF20)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from .. import graph_service, strategy_service
from ..database import get_db
from ..deps import get_current_user, require_permission
from ..events import bump_state_version
from ..models import AlertEvent, AlertSubscription, Bulletin, Cluster, Cycle, StrategyGraph, User
from ..rbac import P_CYCLE_WRITE, P_RESTRICTED_ANALYTICS, has_permission
from ..methodology import TECHNOLOGY_STATUSES
from ..strategy_service import StrategyRuleError
from ..ttm import TTM_BANDS
from ..schemas import (
    AlertEventOut,
    AlertSubscriptionIn,
    AlertSubscriptionOut,
    BulletinDecisionIn,
    BulletinOut,
    StrategyDashboardOut,
    StrategyGraphIn,
    StrategyGraphOut,
)

router = APIRouter(tags=["strategy"])


def _cycle(db: Session, cycle_id: int) -> Cycle:
    cycle = db.get(Cycle, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Ciclo no encontrado")
    return cycle


def dashboard_filters(
    cluster_id: int | None = Query(None, ge=0),
    tech_type_id: int | None = Query(None, ge=0),
    band: str = "",
    status: str = "",
    phase: str = "",
    stage: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
    priority_min: int | None = Query(None, ge=0),
) -> dict:
    """Filtros del tablero (RF17), validados: un valor desconocido responde 422.

    `cluster_id=0` y `tech_type_id=0` seleccionan lo que no tiene cluster o
    tipologia. `stage` filtra por etapa alcanzada del embudo. Es una funcion (no
    una clase) para que FastAPI resuelva las anotaciones diferidas.
    """
    problems = []
    if band and band not in TTM_BANDS:
        problems.append(f"Franja de time-to-market desconocida: {band}")
    if phase and phase not in strategy_service.PHASE_LABELS:
        problems.append(f"Fase clínica desconocida: {phase}")
    if status and status not in TECHNOLOGY_STATUSES:
        problems.append(f"Estado desconocido: {status}")
    if stage and stage not in strategy_service.FUNNEL_STAGES:
        problems.append(f"Etapa del embudo desconocida: {stage}")
    if date_from and date_to and date_from > date_to:
        problems.append("La fecha 'desde' es posterior a la fecha 'hasta'.")
    if problems:
        raise HTTPException(status_code=422, detail=" ".join(problems))
    return dict(
        cluster_id=cluster_id,
        tech_type_id=tech_type_id,
        band=band,
        status=status,
        phase=phase,
        stage=stage,
        date_from=date_from,
        date_to=date_to,
        priority_min=priority_min,
    )


@router.get("/api/strategy/dashboard", response_model=StrategyDashboardOut)
def strategy_dashboard(
    cycle_id: int = Query(...),
    filters: dict = Depends(dashboard_filters),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cycle = _cycle(db, cycle_id)
    data = strategy_service.dashboard_for(
        db,
        cycle,
        include_restricted=has_permission(user, P_RESTRICTED_ANALYTICS),
        **filters,
    )
    return StrategyDashboardOut(**data)


@router.get("/api/strategy/dashboard/export")
def export_dashboard(
    cycle_id: int = Query(...),
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    filters: dict = Depends(dashboard_filters),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Descarga el recorte del tablero. Sin `analytics:restricted` no hay montos."""
    cycle = _cycle(db, cycle_id)
    restricted = has_permission(user, P_RESTRICTED_ANALYTICS)
    data = strategy_service.dashboard_for(
        db, cycle, include_restricted=restricted, **filters
    )
    content, media_type, filename = strategy_service.export_dashboard(
        cycle, data, fmt=format, include_restricted=restricted
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/api/strategy/graph")
def strategy_graph(
    cycle_id: int = Query(...),
    filters: dict = Depends(dashboard_filters),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cycle = _cycle(db, cycle_id)
    return graph_service.build_graph(
        db,
        cycle,
        include_restricted=has_permission(user, P_RESTRICTED_ANALYTICS),
        **filters,
    )


@router.get("/api/strategy/graphs", response_model=list[StrategyGraphOut])
def list_saved_graphs(
    cycle_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return graph_service.list_graphs(db, cycle_id, user.email)


@router.post("/api/strategy/graphs", response_model=StrategyGraphOut)
def save_graph_view(
    payload: StrategyGraphIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cycle = _cycle(db, payload.cycle_id)
    row = graph_service.save_graph(
        db,
        cycle=cycle,
        user_email=user.email,
        title=payload.title,
        payload=payload.payload,
    )
    db.commit()
    db.refresh(row)
    return row


@router.put("/api/strategy/graphs/{graph_id}", response_model=StrategyGraphOut)
def update_graph_view(
    graph_id: int,
    payload: StrategyGraphIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cycle = _cycle(db, payload.cycle_id)
    row = graph_service.save_graph(
        db,
        cycle=cycle,
        user_email=user.email,
        title=payload.title,
        payload=payload.payload,
        graph_id=graph_id,
    )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/strategy/graphs/{graph_id}", status_code=204)
def delete_graph_view(
    graph_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(StrategyGraph, graph_id)
    if row is None or row.user_email != user.email:
        raise HTTPException(status_code=404, detail="Grafo no encontrado")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


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
    if cycle.is_historic:
        raise HTTPException(status_code=409, detail="El ciclo histórico no produce boletines.")
    row = strategy_service.compile_bulletin(db, cycle, actor=user.email)
    db.commit()
    db.refresh(row)
    bump_state_version(db)
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
        raise HTTPException(status_code=404, detail="Boletín no encontrado")
    try:
        strategy_service.approve_bulletin(db, row, actor=user.email, publish=False)
        if payload.publish:
            strategy_service.publish_bulletin(db, row, actor=user.email)
    except StrategyRuleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(row)
    bump_state_version(db)
    return row


@router.get("/api/bulletins/{bulletin_id}/export")
def export_bulletin(
    bulletin_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(Bulletin, bulletin_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Boletín no encontrado")
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


@router.get("/api/alerts/channels")
def alert_channels(user: User = Depends(get_current_user)):
    """Canales de aviso disponibles: la bandeja siempre; el correo si hay SMTP."""
    from .. import mailer

    return {"in_app": True, "email": mailer.is_configured(), "email_to": user.email}


@router.post("/api/alerts/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Marca como leidas todas las alertas pendientes del usuario."""
    rows = (
        db.query(AlertEvent)
        .filter(AlertEvent.user_id == user.id, AlertEvent.read_at.is_(None))
        .all()
    )
    now = strategy_service._utcnow()
    for row in rows:
        row.read_at = now
    db.commit()
    return {"updated": len(rows)}


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
    if payload.cluster_id is not None and db.get(Cluster, payload.cluster_id) is None:
        raise HTTPException(status_code=422, detail="El clúster indicado no existe.")
    row = strategy_service.subscribe(db, user, payload.cluster_id)
    row.enabled = payload.enabled
    db.commit()
    db.refresh(row)
    return row
