"""Bandeja de alertas del usuario: filtros, resumen, reglas, contexto y exporte.

`strategy_service` y `scheduler_service` crean las alertas; este módulo solo
lee y ordena la bandeja de quien consulta. Una alerta es de un usuario: nada de
aquí cruza bandejas.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .methodology import get_param
from .models import AlertEvent, AlertSubscription, Cluster, Technology, User

KIND_LABELS = {
    "new_phase3_colombia": "Ensayo fase III en el país",
    "phase_change_high_budget": "Cambio de etapa · alto riesgo presupuestal",
    "clinical_phase_change_high_budget": "Cambio de fase clínica · alto riesgo presupuestal",
    "vigilancia_programada": "Vigilancia programada",
    "duplicados_propuestos": "Duplicados propuestos",
}
# Donde se atiende cada aviso que no apunta a una tecnología.
KIND_LINKS = {
    "vigilancia_programada": "/vigilancia",
    "duplicados_propuestos": "/filtrado",
}
MAX_PAGE = 200


def base_query(db: Session, user: User, *, unread: bool = False, kind: str = "", cluster_id: int | None = None, q: str = ""):
    query = db.query(AlertEvent).filter(AlertEvent.user_id == user.id)
    if unread:
        query = query.filter(AlertEvent.read_at.is_(None))
    if kind:
        query = query.filter(AlertEvent.kind == kind)
    if cluster_id:
        query = query.filter(AlertEvent.cluster_id == cluster_id)
    text = (q or "").strip()[:80]
    if text:
        like = f"%{text}%"
        query = query.filter(or_(AlertEvent.title.ilike(like), AlertEvent.body.ilike(like)))
    return query


def enrich(db: Session, rows: list[AlertEvent]) -> list[dict]:
    """Cada alerta con el nombre del tipo, de la tecnología y del clúster, y a dónde lleva."""
    tech_ids = {r.technology_id for r in rows if r.technology_id}
    cluster_ids = {r.cluster_id for r in rows if r.cluster_id}
    techs = {t.id: t for t in db.query(Technology).filter(Technology.id.in_(tech_ids)).all()} if tech_ids else {}
    clusters = dict(db.query(Cluster.id, Cluster.name).filter(Cluster.id.in_(cluster_ids)).all()) if cluster_ids else {}
    out = []
    for r in rows:
        tech = techs.get(r.technology_id) if r.technology_id else None
        out.append(
            {
                "id": r.id,
                "kind": r.kind,
                "kind_label": KIND_LABELS.get(r.kind, r.kind),
                "title": r.title,
                "body": r.body or "",
                "technology_id": r.technology_id,
                "technology_name": ((tech.commercial_name or tech.inn_name or "").strip() if tech else ""),
                "technology_status": (tech.status or "") if tech else "",
                "cluster_id": r.cluster_id,
                "cluster_name": clusters.get(r.cluster_id, "") if r.cluster_id else "",
                "link": KIND_LINKS.get(r.kind, ""),
                "read_at": r.read_at,
                "created_at": r.created_at,
            }
        )
    return out


def summary(db: Session, user: User) -> dict:
    rows = (
        db.query(AlertEvent.kind, AlertEvent.read_at.is_(None), func.count(AlertEvent.id), func.max(AlertEvent.created_at))
        .filter(AlertEvent.user_id == user.id)
        .group_by(AlertEvent.kind, AlertEvent.read_at.is_(None))
        .all()
    )
    kinds: dict[str, dict] = {}
    last = None
    for kind, is_unread, count, latest in rows:
        item = kinds.setdefault(kind, {"kind": kind, "label": KIND_LABELS.get(kind, kind), "total": 0, "unread": 0})
        item["total"] += count
        if is_unread:
            item["unread"] += count
        if latest is not None and (last is None or latest > last):
            last = latest
    by_kind = sorted(kinds.values(), key=lambda k: (-k["unread"], -k["total"], k["label"]))
    return {
        "total": sum(k["total"] for k in by_kind),
        "unread": sum(k["unread"] for k in by_kind),
        "by_kind": by_kind,
        "last_at": last.isoformat() if last else None,
    }


def rules(db: Session, user: User) -> list[dict]:
    """Las reglas que disparan alertas, con el umbral vigente y lo recibido en 30 días."""
    threshold = int(get_param(db, "alerts.high_budget_points", 5) or 5)
    since = datetime.now(timezone.utc) - timedelta(days=30)
    recent = dict(
        db.query(AlertEvent.kind, func.count(AlertEvent.id))
        .filter(AlertEvent.user_id == user.id, AlertEvent.created_at >= since)
        .group_by(AlertEvent.kind)
        .all()
    )
    high = f"Aplica a tecnologías con {threshold} o más puntos en la matriz de priorización."
    items = [
        {
            "kind": "new_phase3_colombia",
            "when": "Una tecnología pasa a fase III y su ficha menciona a Colombia.",
            "scope": "Llega a quien sigue el clúster de la tecnología.",
        },
        {
            "kind": "phase_change_high_budget",
            "when": "Una tecnología de alto riesgo presupuestal cambia de etapa en el flujo (por ejemplo, de priorizada a en evaluación).",
            "scope": high,
        },
        {
            "kind": "clinical_phase_change_high_budget",
            "when": "Una tecnología de alto riesgo presupuestal cambia de fase clínica.",
            "scope": high,
        },
        {
            "kind": "vigilancia_programada",
            "when": "Termina una vigilancia programada con señales nuevas o con fuentes que fallaron.",
            "scope": "Llega a quien puede ejecutar la vigilancia, sin necesidad de suscripción.",
        },
        {
            "kind": "duplicados_propuestos",
            "when": "El barrido automático encuentra tecnologías que parecen duplicadas.",
            "scope": "Llega a quien puede fusionar tecnologías, sin necesidad de suscripción.",
        },
    ]
    for item in items:
        item["label"] = KIND_LABELS[item["kind"]]
        item["last_30_days"] = int(recent.get(item["kind"], 0))
    return items


def subscription_overview(db: Session, user: User) -> dict:
    subs = db.query(AlertSubscription).filter(AlertSubscription.user_id == user.id, AlertSubscription.enabled == True).all()  # noqa: E712
    return {
        "all": any(s.cluster_id is None for s in subs),
        "cluster_ids": sorted(s.cluster_id for s in subs if s.cluster_id is not None),
    }


EXPORT_HEADER = ["Fecha", "Tipo", "Título", "Detalle", "Tecnología", "Clúster", "Leída el"]


def export_rows(db: Session, rows: list[AlertEvent]) -> list[list]:
    return [
        [
            item["created_at"].isoformat() if item["created_at"] else "",
            item["kind_label"],
            item["title"],
            item["body"],
            item["technology_name"],
            item["cluster_name"],
            item["read_at"].isoformat() if item["read_at"] else "",
        ]
        for item in enrich(db, rows)
    ]
