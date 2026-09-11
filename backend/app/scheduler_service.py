"""Tareas programadas del worker (P0-4 vigilancia y P1-4 barrido de duplicados).

El worker en proceso llama `run_due_tasks` en cada vuelta. Cada tarea tiene un
interruptor y un intervalo en horas que se editan desde /configuracion
(`settings_store.load_schedule`). Toda ejecucion, programada o manual, deja una
fila en `scheduled_runs` con su resultado: ese es el registro de ejecucion que
exige el backlog.

- **Vigilancia**: encola las fuentes habilitadas cuya frecuencia propia ya
  vencio (`ingest_service.enqueue_due`). No ejecuta los conectores: eso lo hace
  el mismo worker con `tick`, fuera del hilo de cualquier peticion web. La
  corrida queda `en_curso` hasta que sus jobs terminan; entonces se consolidan
  los totales y, si hubo senales nuevas, se avisa en la bandeja de alertas.
- **Duplicados**: llama `screening_service.scan_duplicates` tal cual, sobre el
  ciclo activo (o todo el acervo si no hay ciclo abierto). Si aparecen
  propuestas nuevas se avisa a quien puede resolverlas.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from . import rbac, settings_store
from .audit import record_action
from .events import bump_state_version
from .models import AlertEvent, IngestJob, ScheduledRun, User

log = logging.getLogger(__name__)

TASK_SCAN = "vigilancia"
TASK_DEDUP = "duplicados"
TASKS = {
    TASK_SCAN: {
        "label": "Vigilancia programada",
        "enabled_key": "scan_enabled",
        "hours_key": "scan_interval_hours",
        "permission": rbac.P_SCAN_RUN,
    },
    TASK_DEDUP: {
        "label": "Barrido de duplicados",
        "enabled_key": "dedup_enabled",
        "hours_key": "dedup_interval_hours",
        "permission": rbac.P_SCREENING_WRITE,
    },
}
FINISHED_JOB_STATUSES = {"ok", "parcial", "error", "cancelado"}
ALERT_KIND_SCAN = "vigilancia_programada"
ALERT_KIND_DEDUP = "duplicados_propuestos"

# Una sola tarea a la vez: el worker y el boton "Ejecutar ahora" no deben
# pisarse sobre la misma cola.
_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


# --------------------------------------------------------------------------- #
#  Consulta
# --------------------------------------------------------------------------- #
def last_run(db: Session, task: str) -> ScheduledRun | None:
    return (
        db.query(ScheduledRun)
        .filter(ScheduledRun.task == task)
        .order_by(ScheduledRun.started_at.desc(), ScheduledRun.id.desc())
        .first()
    )


def next_due(db: Session, task: str, cfg: dict | None = None) -> datetime | None:
    """Momento en que la tarea vuelve a correr. None si esta apagada."""
    cfg = cfg or settings_store.load_schedule(db)
    meta = TASKS[task]
    if not cfg[meta["enabled_key"]]:
        return None
    last = last_run(db, task)
    if last is None:
        return _now()
    return _aware(last.started_at) + timedelta(hours=int(cfg[meta["hours_key"]]))


def is_due(db: Session, task: str, cfg: dict | None = None, now: datetime | None = None) -> bool:
    due = next_due(db, task, cfg)
    return due is not None and due <= (now or _now())


def schedule_overview(db: Session) -> dict:
    """Estado de cada tarea para la pantalla de configuracion y la de vigilancia."""
    cfg = settings_store.load_schedule(db)
    tasks = []
    for code, meta in TASKS.items():
        last = last_run(db, code)
        tasks.append(
            {
                "task": code,
                "label": meta["label"],
                "enabled": bool(cfg[meta["enabled_key"]]),
                "interval_hours": int(cfg[meta["hours_key"]]),
                "next_run_at": next_due(db, code, cfg),
                "last_run": run_out(db, last) if last else None,
            }
        )
    return {**cfg, "tasks": tasks}


def run_out(db: Session, run: ScheduledRun) -> dict:
    """Serializa una corrida; la de vigilancia en curso reporta su avance vivo."""
    detail = dict(run.detail or {})
    data = {
        "id": run.id,
        "task": run.task,
        "label": TASKS.get(run.task, {}).get("label", run.task),
        "status": run.status,
        "origin": run.origin,
        "triggered_by": run.triggered_by,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "items_found": run.items_found or 0,
        "items_new": run.items_new or 0,
        "message": run.message or "",
        "jobs_total": len(detail.get("job_ids") or []),
        "jobs_pending": 0,
        "cycle_code": detail.get("cycle_code", ""),
    }
    if run.task == TASK_SCAN and detail.get("job_ids"):
        jobs = db.query(IngestJob).filter(IngestJob.id.in_(detail["job_ids"])).all()
        data["jobs_pending"] = sum(1 for j in jobs if j.status not in FINISHED_JOB_STATUSES)
        if run.status == "en_curso":
            data["items_found"] = sum(j.items_found or 0 for j in jobs)
            data["items_new"] = sum(j.items_new or 0 for j in jobs)
    return data


def list_runs(db: Session, *, task: str | None = None, limit: int = 30) -> list[dict]:
    query = db.query(ScheduledRun)
    if task:
        query = query.filter(ScheduledRun.task == task)
    rows = query.order_by(ScheduledRun.started_at.desc(), ScheduledRun.id.desc()).limit(limit).all()
    return [run_out(db, r) for r in rows]


# --------------------------------------------------------------------------- #
#  Ejecucion
# --------------------------------------------------------------------------- #
def run_scan(db: Session, *, origin: str = "programado", triggered_by: str = "programador") -> ScheduledRun:
    """Encola las fuentes vencidas. No espera a los conectores."""
    from .ingest_service import enqueue_due

    run = ScheduledRun(task=TASK_SCAN, origin=origin, triggered_by=triggered_by, status="en_curso")
    db.add(run)
    db.commit()
    try:
        jobs = enqueue_due(db, triggered_by=triggered_by if origin == "manual" else "programador")
    except Exception as exc:  # noqa: BLE001
        log.exception("Vigilancia programada")
        db.rollback()
        run.status = "error"
        run.message = f"No se pudo encolar la vigilancia: {type(exc).__name__}: {exc}"[:2000]
        run.finished_at = _now()
        db.commit()
        return run

    job_ids = [j.id for j in jobs]
    run.detail = {"job_ids": job_ids, "source_ids": [j.source_id for j in jobs]}
    if not job_ids:
        run.status = "sin_trabajo"
        run.finished_at = _now()
        run.message = "Ninguna fuente habilitada tenía la frecuencia vencida. No se encoló nada."
    else:
        run.message = f"{len(job_ids)} fuente(s) encoladas; el worker las procesa en segundo plano."
    record_action(
        db,
        entity_type="scheduled_runs",
        entity_id=str(run.id),
        action="schedule:scan",
        new_value={"origin": origin, "jobs": len(job_ids), "actor": triggered_by},
    )
    db.commit()
    db.refresh(run)
    bump_state_version(db)
    return run


def run_dedup(db: Session, *, origin: str = "programado", triggered_by: str = "programador") -> ScheduledRun:
    """Barrido difuso sobre el ciclo activo, sin tocar la logica del motor."""
    from . import screening_service
    from .cycle_service import get_active_cycle

    cycle = get_active_cycle(db)
    run = ScheduledRun(
        task=TASK_DEDUP,
        origin=origin,
        triggered_by=triggered_by,
        status="en_curso",
        detail={"cycle_id": cycle.id if cycle else None, "cycle_code": cycle.code if cycle else ""},
    )
    db.add(run)
    db.commit()
    try:
        result = screening_service.scan_duplicates(
            db, cycle_id=cycle.id if cycle else None, actor=triggered_by
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("Barrido programado de duplicados")
        db.rollback()
        run.status = "error"
        run.message = f"El barrido falló: {type(exc).__name__}: {exc}"[:2000]
        run.finished_at = _now()
        db.commit()
        return run

    created = int(result.get("created") or 0)
    run.items_found = int(result.get("detected") or 0)
    run.items_new = created
    run.status = "ok"
    run.finished_at = _now()
    if cycle is None:
        scope = "todo el acervo (no hay ciclo abierto)"
    elif cycle.code.lower().startswith("ciclo"):
        scope = cycle.code
    else:
        scope = f"el ciclo {cycle.code}"
    run.message = (
        f"Barrido sobre {scope}: {run.items_found} pares sobre el umbral, "
        f"{created} propuesta(s) nueva(s), {result.get('pending', 0)} pendiente(s) de revisión."
    )
    run.detail = {**(run.detail or {}), **{k: result.get(k) for k in ("refreshed", "pending", "threshold")}}
    db.commit()
    if created:
        notify(
            db,
            permission=rbac.P_SCREENING_WRITE,
            kind=ALERT_KIND_DEDUP,
            title=f"{created} propuesta(s) de fusión nuevas por revisar",
            body=(
                f"El barrido de duplicados encontró {created} par(es) nuevos en {scope}. "
                "Revise y confirme o descarte cada propuesta en Filtrado y depuración > Duplicados."
            ),
        )
    db.refresh(run)
    bump_state_version(db)
    return run


def finalize_scan_runs(db: Session) -> int:
    """Cierra las corridas de vigilancia cuyos jobs ya terminaron. Devuelve cuantas."""
    closed = 0
    for run in db.query(ScheduledRun).filter(
        ScheduledRun.task == TASK_SCAN, ScheduledRun.status == "en_curso"
    ).all():
        job_ids = (run.detail or {}).get("job_ids") or []
        jobs = db.query(IngestJob).filter(IngestJob.id.in_(job_ids)).all() if job_ids else []
        if any(j.status not in FINISHED_JOB_STATUSES for j in jobs):
            continue
        errors = sum(1 for j in jobs if j.status in {"error", "cancelado"})
        partial = sum(1 for j in jobs if j.status == "parcial")
        run.items_found = sum(j.items_found or 0 for j in jobs)
        run.items_new = sum(j.items_new or 0 for j in jobs)
        if jobs and errors == len(jobs):
            run.status = "error"
        elif errors or partial:
            run.status = "parcial"
        else:
            run.status = "ok"
        run.finished_at = _now()
        run.message = (
            f"{len(jobs)} fuente(s) procesadas: {run.items_new} señal(es) nuevas de "
            f"{run.items_found} detectadas"
            + (f"; {errors} con error" if errors else "")
            + "."
        )
        db.commit()
        closed += 1
        if run.items_new:
            notify(
                db,
                permission=rbac.P_STAGING_ASSIGN,
                kind=ALERT_KIND_SCAN,
                title=f"{run.items_new} señal(es) nuevas en la bandeja de entrada",
                body=(
                    f"La vigilancia programada proceso {len(jobs)} fuente(s) y dejó {run.items_new} "
                    "señal(es) nuevas por clasificar en la Bandeja de entrada."
                ),
            )
    if closed:
        bump_state_version(db)
    return closed


def run_task(db: Session, task: str, *, origin: str, triggered_by: str) -> ScheduledRun:
    if task not in TASKS:
        raise ValueError(f"Tarea desconocida: {task}")
    with _lock:
        if task == TASK_SCAN:
            return run_scan(db, origin=origin, triggered_by=triggered_by)
        return run_dedup(db, origin=origin, triggered_by=triggered_by)


def run_due_tasks(db: Session, now: datetime | None = None) -> list[ScheduledRun]:
    """Punto de entrada del worker: corre lo que vencio y consolida lo terminado."""
    cfg = settings_store.load_schedule(db)
    done: list[ScheduledRun] = []
    for task in TASKS:
        if is_due(db, task, cfg, now):
            done.append(run_task(db, task, origin="programado", triggered_by="programador"))
    finalize_scan_runs(db)
    return done


# --------------------------------------------------------------------------- #
#  Aviso en la bandeja de alertas
# --------------------------------------------------------------------------- #
def notify(db: Session, *, permission: str, kind: str, title: str, body: str) -> int:
    """Deja un aviso en plataforma a cada usuario activo con el permiso.

    Si el usuario ya tiene un aviso del mismo tipo sin leer, se actualiza en
    lugar de acumular uno nuevo: la bandeja no debe llenarse de repeticiones.
    """
    count = 0
    for user in db.query(User).filter(User.is_active.is_(True)).all():
        if not rbac.has_permission(user, permission):
            continue
        existing = (
            db.query(AlertEvent)
            .filter(AlertEvent.user_id == user.id, AlertEvent.kind == kind, AlertEvent.read_at.is_(None))
            .first()
        )
        if existing:
            existing.title = title[:400]
            existing.body = body
            existing.created_at = _now()
        else:
            db.add(AlertEvent(user_id=user.id, kind=kind, title=title[:400], body=body))
        count += 1
    db.commit()
    return count
