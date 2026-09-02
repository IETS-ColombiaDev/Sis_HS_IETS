"""Worker en proceso de la cola de ingesta.

La cola vive en `ingest_jobs`, no en Redis. Este hilo solo la recorre. El dia
que se adopte Celery, los conectores y `run_job` se reutilizan sin cambio: el
worker externo llamaria la misma funcion.
"""
from __future__ import annotations

import logging
import threading
import time

from .config import settings
from .database import SessionLocal

log = logging.getLogger(__name__)

_stop = threading.Event()
_thread: threading.Thread | None = None


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


def kick() -> None:
    """Despierta un ciclo inmediato sin esperar el intervalo de sondeo."""
    try:
        from .ingest_service import tick

        db = SessionLocal()
        try:
            tick(db)
        finally:
            db.close()
    except Exception:  # noqa: BLE001
        log.exception("Kick del worker fallo")


def _loop() -> None:
    from .ingest_service import enqueue_due, tick

    interval = max(5, int(settings.ingest_worker_interval_seconds or 20))
    cycles = 0
    while not _stop.is_set():
        db = SessionLocal()
        try:
            if cycles % 15 == 0:
                enqueue_due(db)
            tick(db)
        except Exception:  # noqa: BLE001
            log.exception("Ciclo del worker de ingesta")
        finally:
            db.close()
        cycles += 1
        _stop.wait(interval)
