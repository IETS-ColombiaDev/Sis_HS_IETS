"""Bitacora inmutable de auditoria (fase 0 del plan de actualizacion).

Requerimiento no funcional critico: toda modificacion sobre las entidades
sensibles deja registro con usuario, IP, fecha UTC y valores antes y despues.

El registro se produce por dos caminos complementarios, de modo que ningun
camino de codigo pueda saltarselo:

1. Un listener `after_flush` de SQLAlchemy que captura altas, cambios y bajas
   del ORM automaticamente, ya con las claves primarias asignadas.
2. `record_action()` para eventos de negocio que no se reducen a un cambio de
   fila (cierre de ciclo, congelacion de puntajes, asignacion por lotes).

El contexto de la peticion (usuario, IP, request id) viaja en `contextvars`,
poblado por el middleware de `main.py`.
"""
from __future__ import annotations

import contextvars
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session, configure_mappers

from .models import (
    AuditLog,
    Cluster,
    Cycle,
    CycleTechnology,
    Bulletin,
    EvaluationDoc,
    Finding,
    MergeProposal,
    MethodologyParam,
    NoveltyAssessment,
    PriorityCriterion,
    PriorityScore,
    Recommendation,
    ReviewAssignment,
    Source,
    Submission,
    TechType,
    Technology,
    User,
    utcnow,
)

# Entidades bajo auditoria automatica. El propio AuditLog nunca se audita.
#
# Incluye `Finding` porque el criterio de aceptacion de la fase 0 lo exige de
# forma explicita, y los catalogos metodologicos porque son parametros que
# gobiernan calculos oficiales: un cambio de umbral o de enunciado debe poder
# fecharse y atribuirse ante una auditoria.
#
# `InvimaRecord` queda deliberadamente fuera: son decenas de miles de filas de
# una copia local reconstruible desde la fuente, y auditarlas ahogaria la
# bitacora en ruido. Su trazabilidad vive en `InvimaSync`, que registra cada
# sincronizacion con origen, volumen y responsable.
AUDITED_MODELS: tuple[type, ...] = (
    User,
    Source,
    Finding,
    Technology,
    Cycle,
    CycleTechnology,
    PriorityScore,
    PriorityCriterion,
    Cluster,
    TechType,
    MethodologyParam,
    MergeProposal,
    NoveltyAssessment,
    Recommendation,
    Submission,
    EvaluationDoc,
    ReviewAssignment,
    Bulletin,
)

# Campos que jamas deben copiarse a la bitacora (ruido o dato sensible).
EXCLUDED_FIELDS = {
    "raw_content",
    "raw_payload",
    "picture",
    "payload",
    "token_hash",
    # Credenciales: el hash de la contrasena nunca viaja a la bitacora. Los
    # eventos de acceso se registran aparte con `record_action` (auth:*).
    "password_hash",
}

# Los dos contextos guardan un diccionario *mutable* y se reasignan lo menos
# posible. La razon es la propagacion de `contextvars` en FastAPI:
#
#   El middleware corre en la tarea de la peticion, pero las dependencias y los
#   endpoints declarados con `def` (no `async def`) se ejecutan en hilos del
#   threadpool, cada uno con una *copia* del contexto. Un `ContextVar.set()`
#   dentro de esa copia no vuelve al padre ni llega a las demas copias, asi que
#   el usuario resuelto en `get_current_user` se perdia y toda la bitacora
#   quedaba atribuida a "sistema".
#
#   Una copia de contexto comparte la *referencia* al mismo diccionario. Por eso
#   el middleware reserva el contenedor antes de enrutar y `set_user_context`
#   lo muta en sitio: la escritura es visible desde cualquier hilo que herede
#   ese contexto, sin duplicar la logica de autenticacion en el middleware.
_ctx_user: contextvars.ContextVar[dict | None] = contextvars.ContextVar("audit_user", default=None)
_ctx_request: contextvars.ContextVar[dict | None] = contextvars.ContextVar(
    "audit_request", default=None
)


def begin_request(*, ip: str = "", path: str = "", request_id: str = "") -> str:
    """Reserva los contenedores de contexto al inicio de la peticion.

    Debe invocarse desde el middleware, antes de enrutar, para que las tareas
    hijas hereden la referencia y puedan completarla.
    """
    rid = request_id or uuid.uuid4().hex[:16]
    _ctx_request.set({"ip": ip, "path": path, "request_id": rid})
    _ctx_user.set({})
    return rid


# Nombre anterior, conservado para las pruebas y los llamadores existentes.
set_request_context = begin_request


def set_user_context(user: Any | None) -> None:
    holder = _ctx_user.get()
    if user is None:
        if holder is None:
            _ctx_user.set(None)
        else:
            holder.clear()
        return

    data = {
        "id": getattr(user, "id", None),
        "email": getattr(user, "email", ""),
        "role": getattr(user, "role", ""),
    }
    if holder is None:
        # Fuera de una peticion HTTP (pruebas, arranque, tareas de fondo).
        _ctx_user.set(data)
    else:
        holder.clear()
        holder.update(data)


def clear_context() -> None:
    _ctx_user.set(None)
    _ctx_request.set(None)


def _context() -> dict:
    user = _ctx_user.get() or {}
    req = _ctx_request.get() or {}
    return {
        "user_id": user.get("id"),
        "user_email": user.get("email", "") or "sistema",
        "user_role": user.get("role", ""),
        "ip_address": req.get("ip", ""),
        "request_id": req.get("request_id", ""),
        "request_path": req.get("path", ""),
    }


def _jsonable(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    return str(value)


def _snapshot(obj: Any) -> dict:
    data = {}
    for col in inspect(obj.__class__).columns:
        if col.key in EXCLUDED_FIELDS:
            continue
        data[col.key] = _jsonable(getattr(obj, col.key, None))
    return data


def _entity_id(obj: Any) -> str:
    pk = inspect(obj).identity
    if pk:
        return "-".join(str(p) for p in pk)
    return str(getattr(obj, "id", "") or "")


def record_action(
    db: Session,
    *,
    entity_type: str,
    entity_id: str | int,
    action: str,
    old_value: dict | None = None,
    new_value: dict | None = None,
) -> None:
    """Registra un evento de negocio. No hace commit: lo hace el llamador."""
    ctx = _context()
    db.add(
        AuditLog(
            entity_type=entity_type,
            entity_id=str(entity_id),
            action=action,
            old_value=_jsonable(old_value) if old_value is not None else None,
            new_value=_jsonable(new_value) if new_value is not None else None,
            **ctx,
        )
    )


def _diff(obj: Any) -> tuple[dict, dict]:
    old: dict = {}
    new: dict = {}
    for attr in inspect(obj).attrs:
        if attr.key in EXCLUDED_FIELDS:
            continue
        history = attr.load_history()
        if not history.has_changes():
            continue
        old[attr.key] = _jsonable(history.deleted[0]) if history.deleted else None
        new[attr.key] = _jsonable(history.added[0]) if history.added else None
    return old, new


def _after_flush(session: Session, _flush_context) -> None:
    """En `after_flush` las claves primarias ya estan asignadas y las listas
    new/dirty/deleted siguen disponibles. Se escribe por Core para no reentrar
    en la unidad de trabajo del ORM."""
    ctx = _context()
    rows: list[dict] = []

    def add_row(obj: Any, action: str, old: dict | None, new: dict | None) -> None:
        rows.append(
            {
                **ctx,
                "entity_type": obj.__tablename__,
                "entity_id": _entity_id(obj),
                "action": action,
                "old_value": old,
                "new_value": new,
                "occurred_at": utcnow(),
            }
        )

    for obj in session.new:
        if isinstance(obj, AUDITED_MODELS):
            add_row(obj, "create", None, _snapshot(obj))

    for obj in session.dirty:
        if not isinstance(obj, AUDITED_MODELS) or not session.is_modified(obj):
            continue
        old, new = _diff(obj)
        if new:
            add_row(obj, "update", old, new)

    for obj in session.deleted:
        if isinstance(obj, AUDITED_MODELS):
            add_row(obj, "delete", _snapshot(obj), None)

    if rows:
        session.execute(AuditLog.__table__.insert(), rows)


def _enable_active_history() -> None:
    """Fuerza a SQLAlchemy a cargar el valor anterior antes de reemplazarlo.

    Sin esto, mutar un atributo que no estaba cargado (por ejemplo, tras expirar
    la instancia en un commit previo) produce un `old_value` vacio y deja un
    hueco en la trazabilidad. El costo es un SELECT adicional en ese caso, que
    es el precio correcto para una bitacora de recursos publicos.
    """
    configure_mappers()
    for model in AUDITED_MODELS:
        for attr in inspect(model).column_attrs:
            if attr.key in EXCLUDED_FIELDS:
                continue
            getattr(model, attr.key).impl.active_history = True


_INSTALLED = False


def install_listeners() -> None:
    global _INSTALLED
    if _INSTALLED:
        return
    _enable_active_history()
    event.listen(Session, "after_flush", _after_flush)
    _INSTALLED = True
