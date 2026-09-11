"""Worker en proceso de la cola de ingesta y de las tareas programadas.

La cola vive en `ingest_jobs`, no en Redis. Este hilo solo la recorre. El dia
que se adopte Celery, los conectores y `run_job` se reutilizan sin cambio: el
worker externo llamaria la misma funcion.

En cada vuelta el hilo (1) corre las tareas programadas que vencieron
(`scheduler_service.run_due_tasks`: vigilancia y barrido de duplicados, con
intervalo configurable desde /configuracion), (2) procesa la cola con `tick` y
(3) consolida las corridas de vigilancia cuyos jobs ya terminaron. Nada de eso
ocurre en el hilo de una peticion web.
"""
from __future__ import annotations

import logging
import threading

from .config import settings
from .database import SessionLocal

log = logging.getLogger(__name__)

_stop = threading.Event()
_thread: threading.Thread | None = None
_kick_lock = threading.Lock()
# Tope de vueltas de un `kick`: evita que un disparo manual se quede con el hilo
# si la cola crece mientras corre. Lo que sobre lo toma el worker regular.
KICK_MAX_ROUNDS = 25


def start_worker() -> None:
    global _thread
    if not settings.ingest_worker_enabled:
        log.info("Worker de ingesta deshabilitado por configuracion.")
        return
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="ingest-worker", daemon=True)
    _thread.start()
    log.info("Worker de ingesta en marcha.")


def stop_worker() -> None:
    _stop.set()


def is_running() -> bool:
    return bool(_thread and _thread.is_alive())


def kick() -> None:
    """Procesa la cola ya, en segundo plano, sin bloquear la peticion que lo pide.

    Antes corria `tick` dentro del hilo de la peticion: un conector lento dejaba
    la pantalla colgada. Ahora se lanza un hilo aparte; si ya hay uno corriendo,
    ese mismo recogera los jobs recien encolados.
    """
    thread = threading.Thread(target=_kick_run, name="ingest-kick", daemon=True)
    thread.start()


def _kick_run() -> None:
    if not _kick_lock.acquire(blocking=False):
        return
    try:
        from .ingest_service import tick
        from .scheduler_service import finalize_scan_runs

        for _ in range(KICK_MAX_ROUNDS):
            db = SessionLocal()
            try:
                done = tick(db)
                finalize_scan_runs(db)
            finally:
                db.close()
            if not done:
                break
    except Exception:  # noqa: BLE001
        log.exception("Kick del worker fallo")
    finally:
        _kick_lock.release()


def run_once() -> None:
    """Una vuelta completa del worker. Se expone para pruebas y diagnostico."""
    from .ingest_service import recover_stale, tick
    from .scheduler_service import finalize_scan_runs, run_due_tasks

    db = SessionLocal()
    try:
        recover_stale(db)
        run_due_tasks(db)
        tick(db)
        finalize_scan_runs(db)
    finally:
        db.close()


def _loop() -> None:
    interval = max(5, int(settings.ingest_worker_interval_seconds or 20))
    while not _stop.is_set():
        try:
            run_once()
        except Exception:  # noqa: BLE001
            log.exception("Ciclo del worker de ingesta")
        _stop.wait(interval)
