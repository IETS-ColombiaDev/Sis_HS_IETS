"""Lectura de la bitácora para la pantalla de auditoría: filtros, nombres, resumen, exporte e integridad.

`audit.py` escribe; este módulo solo lee. Los nombres en español de acciones y
entidades viven aquí para que la pantalla, el exporte y el resumen digan lo mismo.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import String, cast, func, inspect, or_, text
from sqlalchemy.orm import Session

from .activity_service import ACTION_LABELS as BUSINESS_LABELS
from .models import AuditLog

ACTION_LABELS = {
    "create": "Creación",
    "update": "Edición",
    "delete": "Eliminación",
    "auth:login": "Inicio de sesión",
    "auth:login_failed": "Intento de inicio de sesión fallido",
    "auth:locked": "Cuenta bloqueada por intentos fallidos",
    "auth:unlocked": "Cuenta desbloqueada",
    "auth:password_changed": "Cambio de contraseña",
    "auth:password_reset": "Restablecimiento de contraseña",
    "auth:acting_role": "Cambio de perfil de trabajo",
    "auth:dev_login_denied": "Acceso de desarrollo rechazado",
    "users:delete": "Eliminación de usuario",
    "staging:legacy": "Carga de registros anteriores",
    "staging:recover_legacy": "Recuperación de registros anteriores",
    "signals:window": "Consulta de la ventana de señales",
    "search_knowledge:import": "Importación de búsquedas",
    "schedule:scan": "Vigilancia programada ejecutada",
    "review:token_expired": "Enlace de revisión vencido",
    "review:revoke": "Invitación de revisión revocada",
    "review:invite_email": "Correo de invitación a revisar",
    "review:coi": "Declaración de conflicto de interés",
    "report:export_queue": "Descarga de la cola de evaluación",
    "intelligence:reindex": "Reindexación de la base de señales",
    "intelligence:config": "Cambio en la configuración de inteligencia",
    "intelligence:config_reset": "Configuración de inteligencia restablecida",
    "intelligence:calibrate": "Calibración del clasificador",
    "intelligence:baseline": "Línea base del clasificador",
    "config:web_search": "Cambio en la búsqueda web",
    "config:horizon_rules": "Cambio en las reglas de horizonte",
    "audit:export": "Descarga de la bitácora",
    **BUSINESS_LABELS,
}
ENTITY_LABELS = {
    "users": "Usuarios",
    "sources": "Fuentes",
    "findings": "Señales capturadas",
    "technologies": "Tecnologías",
    "cycles": "Ciclos",
    "cycle_technologies": "Tecnología en ciclo",
    "priority_scores": "Calificaciones P1-P6",
    "priority_criteria": "Criterios de priorización",
    "clusters": "Clústeres de salud",
    "tech_types": "Tipologías tecnológicas",
    "methodology_params": "Parámetros metodológicos",
    "recommendations": "Informes de diseminación",
    "auth": "Autenticación",
    "notes": "Notas",
    "submissions": "Postulaciones",
    "ingest_jobs": "Trabajos de ingesta",
    "scheduled_runs": "Tareas programadas",
    "merge_proposals": "Propuestas de fusión",
    "novelty_assessments": "Verificaciones de novedad",
    "evaluation_docs": "Informes de evaluación",
    "review_assignments": "Revisiones por pares",
    "review_comments": "Observaciones de revisión",
    "bulletins": "Boletines",
    "strategy_dashboard": "Tablero estratégico",
    "config": "Configuración",
    "intelligence": "Inteligencia del sistema",
    "search_knowledge": "Base de búsquedas",
    "signals": "Ventana de señales",
    "backup": "Copias de respaldo",
    "audit_log": "Bitácora",
}
EXPORT_MAX = 10000


def action_label(code: str) -> str:
    return ACTION_LABELS.get(code, code)


def entity_label(code: str) -> str:
    return ENTITY_LABELS.get(code, code)


def filtered(
    db: Session,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    action: str | None = None,
    user_email: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    request_id: str | None = None,
    ip: str | None = None,
    q: str | None = None,
):
    query = db.query(AuditLog)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id:
        query = query.filter(AuditLog.entity_id == str(entity_id))
    if action:
        query = query.filter(AuditLog.action == action)
    if user_email:
        query = query.filter(func.lower(AuditLog.user_email).like(f"%{user_email.strip().lower()}%"))
    if since:
        query = query.filter(AuditLog.occurred_at >= since)
    if until:
        query = query.filter(AuditLog.occurred_at <= until)
    if request_id:
        query = query.filter(AuditLog.request_id == request_id.strip())
    if ip:
        query = query.filter(AuditLog.ip_address == ip.strip())
    needle = (q or "").strip().lower()[:80]
    if needle:
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(AuditLog.user_email).like(like),
                func.lower(AuditLog.action).like(like),
                func.lower(AuditLog.entity_type).like(like),
                func.lower(AuditLog.entity_id).like(like),
                func.lower(AuditLog.request_path).like(like),
                func.lower(cast(AuditLog.new_value, String)).like(like),
                func.lower(cast(AuditLog.old_value, String)).like(like),
            )
        )
    return query


def summary(query) -> dict:
    """Totales del filtro: por acción, por persona, por entidad y por día (hora de Colombia)."""
    rows = query.with_entities(AuditLog.action, AuditLog.user_email, AuditLog.entity_type, AuditLog.occurred_at).all()
    tz = timezone(timedelta(hours=-5))
    by_action: dict[str, int] = {}
    by_user: dict[str, int] = {}
    by_entity: dict[str, int] = {}
    by_day: dict[str, int] = {}
    first = last = None
    for action, email, entity, at in rows:
        by_action[action] = by_action.get(action, 0) + 1
        by_user[email or ""] = by_user.get(email or "", 0) + 1
        by_entity[entity] = by_entity.get(entity, 0) + 1
        if at is not None:
            if at.tzinfo is None:
                at = at.replace(tzinfo=timezone.utc)
            day = at.astimezone(tz).date().isoformat()
            by_day[day] = by_day.get(day, 0) + 1
            first = at if first is None or at < first else first
            last = at if last is None or at > last else last

    def top(counts: dict[str, int], label) -> list[dict]:
        ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:8]
        return [{"code": code, "label": label(code), "count": count} for code, count in ranked]

    days = sorted(by_day.items())[-14:]
    return {
        "total": len(rows),
        "users": len([u for u in by_user if u]),
        "by_action": top(by_action, action_label),
        "by_user": top(by_user, lambda email: email or "sistema"),
        "by_entity": top(by_entity, entity_label),
        "by_day": [{"date": day, "count": count} for day, count in days],
        "first_at": first.isoformat() if first else None,
        "last_at": last.isoformat() if last else None,
    }


def catalog(db: Session) -> dict:
    """Acciones y entidades que tienen registros, con su nombre y su cantidad."""
    actions = db.query(AuditLog.action, func.count(AuditLog.id)).group_by(AuditLog.action).all()
    entities = db.query(AuditLog.entity_type, func.count(AuditLog.id)).group_by(AuditLog.entity_type).all()
    return {
        "actions": sorted(
            ({"code": a, "label": action_label(a), "count": int(n)} for a, n in actions if a),
            key=lambda i: i["label"].lower(),
        ),
        "entities": sorted(
            ({"code": e, "label": entity_label(e), "count": int(n)} for e, n in entities if e),
            key=lambda i: i["label"].lower(),
        ),
    }


def integrity(db: Session) -> dict:
    """Si el motor de base de datos impide de verdad modificar o borrar la bitácora."""
    bind = db.get_bind()
    dialect = bind.dialect.name
    protected = False
    detail = ""
    try:
        if dialect == "sqlite":
            found = {
                row[0]
                for row in db.execute(
                    text("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'audit_log'")
                ).all()
            }
            protected = len(found) >= 2
            detail = (
                "Disparadores del motor rechazan modificar o borrar registros."
                if protected
                else "No se encontraron los disparadores que protegen la bitácora."
            )
        elif dialect == "postgresql":
            can_update, can_delete = db.execute(
                text(
                    "SELECT has_table_privilege(current_user, 'audit_log', 'UPDATE'), "
                    "has_table_privilege(current_user, 'audit_log', 'DELETE')"
                )
            ).one()
            protected = not can_update and not can_delete
            detail = (
                "El usuario de la aplicación no tiene permiso para modificar ni borrar registros."
                if protected
                else "El usuario de la aplicación conserva permiso para modificar o borrar registros."
            )
        else:
            detail = "Motor de base de datos sin verificación de protección."
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        detail = f"No se pudo verificar la protección: {type(exc).__name__}."
    total = db.query(func.count(AuditLog.id)).scalar() or 0
    first = db.query(func.min(AuditLog.occurred_at)).scalar()
    return {
        "protected": bool(protected),
        "engine": dialect,
        "detail": detail,
        "total": int(total),
        "first_at": first.isoformat() if first else None,
        "has_table": "audit_log" in inspect(bind).get_table_names(),
    }


EXPORT_HEADER = [
    "id", "fecha_utc", "usuario", "perfil", "ip", "entidad", "entidad_id", "accion", "accion_nombre",
    "peticion", "ruta", "valor_anterior", "valor_nuevo",
]


def export_rows(rows: list[AuditLog]) -> list[list]:
    import json

    def dump(value) -> str:
        return json.dumps(value, ensure_ascii=False, sort_keys=True) if value is not None else ""

    return [
        [
            r.id,
            r.occurred_at.isoformat() if r.occurred_at else "",
            r.user_email or "sistema",
            r.user_role or "",
            r.ip_address or "",
            entity_label(r.entity_type),
            r.entity_id,
            r.action,
            action_label(r.action),
            r.request_id or "",
            r.request_path or "",
            dump(r.old_value),
            dump(r.new_value),
        ]
        for r in rows
    ]
