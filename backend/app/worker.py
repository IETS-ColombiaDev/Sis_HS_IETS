"""Worker en proceso de la cola de ingesta y de las tareas programadas.

La cola vive en `ingest_jobs`, no en Redis. Este hilo solo la recorre. El dia
que se adopte Celery, los conectores y `run_job` se reutilizan sin cambio: el
worker externo llamaria la misma funcion.

En cada vuelta el hilo (1) corre las tareas programadas que vencieron
(`scheduler_service.run_due_tasks`: vigilancia y barrido de duplicados, con
intervalo configurable desde /configuracion), (2) drena la cola con varios
carriles en paralelo (`ingest.parallel_jobs`) y (3) consolida las corridas de
vigilancia cuyos jobs ya terminaron. Nada de eso ocurre en el hilo de una
peticion web.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from .config import settings
from .database import IS_SQLITE, SessionLocal

log = logging.getLogger(__name__)

_stop = threading.Event()
_thread: threading.Thread | None = None
# Un solo "drenaje" de la cola a la vez (worker regular o kick). Cada drenaje
# abre hasta `ingest.parallel_jobs` carriles que toman jobs hasta vaciarla.
_drain_lock = threading.Lock()
# Tope de duracion de un `kick`: evita que un disparo manual retenga el hilo
# indefinidamente esperando reintentos. Lo que sobre lo toma el worker regular.
KICK_MAX_SECONDS = 3 * 3600
# Espera maxima entre revisiones cuando solo quedan reintentos a futuro.
RETRY_POLL_SECONDS = 30
# Render gratuito duerme el servicio tras 15 min sin trafico ENTRANTE: el trabajo
# del worker no cuenta. Si el usuario cierra la pestana a mitad de la vigilancia,
# el proceso se suspendia y la corrida quedaba congelada en la fuente N. Mientras
# haya cola, el propio servicio se visita por su URL publica cada 4 min.
KEEPALIVE_SECONDS = 240
_keepalive_thread: threading.Thread | None = None


def _force_worker_on_sqlite() -> bool:
    return os.environ.get("INGEST_WORKER_FORCE", "").strip().lower() in {"1", "true", "yes", "on"}


def start_worker() -> None:
    global _thread
    if not settings.ingest_worker_enabled:
        log.info("Worker de ingesta deshabilitado por configuracion.")
        return
    # Con SQLite el worker comparte el candado de escritura con la UI. Ya no retiene
    # escrituras durante descargas ni IA (ver scraper.scrape_source), pero sigue
    # siendo opt-in: INGEST_WORKER_FORCE=1 (asi lo activa render.yaml).
    if IS_SQLITE and not _force_worker_on_sqlite():
        log.warning(
            "Worker de ingesta apagado con SQLite (protege el login). "
            "Defina INGEST_WORKER_FORCE=1 para forzarlo o use PostgreSQL."
        )
        return
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="ingest-worker", daemon=True)
    _thread.start()
    log.info("Worker de ingesta en marcha.")
    _start_keepalive()


def keepalive_url() -> str:
    """URL publica a visitar (KEEPALIVE_URL o RENDER_EXTERNAL_URL, que Render define solo)."""
    base = (os.environ.get("KEEPALIVE_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
    return f"{base}/api/health" if base.startswith("http") else ""


def _keepalive_always() -> bool:
    return os.environ.get("KEEPALIVE_ALWAYS", "").strip().lower() in {"1", "true", "yes", "on"}


def has_pending_work() -> bool:
    from .models import IngestJob

    if draining():
        return True
    db = SessionLocal()
    try:
        return (
            db.query(IngestJob.id).filter(IngestJob.status.in_(("pendiente", "ejecutando"))).first()
            is not None
        )
    except Exception:  # noqa: BLE001
        return False
    finally:
        db.close()


def keepalive_tick() -> bool:
    """Una visita a la URL publica si hay trabajo (o KEEPALIVE_ALWAYS). True si la hizo."""
    url = keepalive_url()
    if not url or not (_keepalive_always() or has_pending_work()):
        return False
    try:
        import httpx

        httpx.get(url, timeout=20.0, headers={"User-Agent": "sis-hs-iets-keepalive"})
        return True
    except Exception as exc:  # noqa: BLE001
        log.debug("Keep-alive sin respuesta: %s", exc)
        return False


def _start_keepalive() -> None:
    global _keepalive_thread
    if not keepalive_url() or (_keepalive_thread and _keepalive_thread.is_alive()):
        return

    def loop() -> None:
        while not _stop.wait(KEEPALIVE_SECONDS):
            keepalive_tick()

    _keepalive_thread = threading.Thread(target=loop, name="ingest-keepalive", daemon=True)
    _keepalive_thread.start()
    log.info("Keep-alive activo mientras haya vigilancia en cola: %s", keepalive_url())


def stop_worker() -> None:
    _stop.set()


def is_running() -> bool:
    return bool(_thread and _thread.is_alive())


def draining() -> bool:
    """True mientras un drenaje de la cola esta en curso (hay vigilancia corriendo)."""
    return _drain_lock.locked()


def kick() -> None:
    """Procesa la cola ya, en segundo plano, sin bloquear la peticion que lo pide.

    Si ya hay un drenaje en curso, ese mismo recoge los jobs recien encolados:
    sus carriles siguen tomando trabajo hasta vaciar la cola.
    """
    thread = threading.Thread(target=_kick_run, name="ingest-kick", daemon=True)
    thread.start()


def drain(*, wait_retries: bool = False, max_seconds: float = KICK_MAX_SECONDS) -> int:
    """Vacia la cola con varios carriles en paralelo. Devuelve los jobs corridos.

    Con `wait_retries` (worker regular apagado) espera tambien los reintentos
    programados a futuro, hasta `max_seconds`; si no, termina cuando no quedan
    jobs vencidos. Si otro drenaje esta en curso, no hace nada.
    """
    if not _drain_lock.acquire(blocking=False):
        return 0
    total = 0
    deadline = time.monotonic() + max_seconds
    try:
        from .ingest_service import next_pending_at, parallel_jobs
        from .scheduler_service import finalize_scan_runs

        while not _stop.is_set() and time.monotonic() < deadline:
            db = SessionLocal()
            try:
                lanes = parallel_jobs(db)
            finally:
                db.close()
            done = _run_lanes(lanes)
            total += done
            db = SessionLocal()
            try:
                finalize_scan_runs(db)
                upcoming = next_pending_at(db) if wait_retries else None
            finally:
                db.close()
            if done:
                continue
            if upcoming is None:
                break
            wait = (upcoming - datetime.now(timezone.utc)).total_seconds()
            _stop.wait(max(1.0, min(RETRY_POLL_SECONDS, wait)))
    except Exception:  # noqa: BLE001
        log.exception("Drenaje de la cola de ingesta")
    finally:
        _drain_lock.release()
    return total


def _run_lanes(lanes: int) -> int:
    """Corre `lanes` hilos que toman jobs vencidos hasta que no quede ninguno."""

    def lane() -> int:
        from .ingest_service import claim_next, job_timeout_seconds, run_job_guarded

        count = 0
        while not _stop.is_set():
            db = SessionLocal()
            try:
                job_id = claim_next(db)
                if job_id is None:
                    return count
                timeout_s = job_timeout_seconds(db)
                db.close()
                # Cada fuente corre con tiempo maximo: una colgada no detiene la corrida.
                run_job_guarded(job_id, timeout_s)
                count += 1
            except Exception:  # noqa: BLE001
                log.exception("Carril del worker de ingesta")
                return count
            finally:
                db.close()
        return count

    if lanes <= 1:
        return lane()
    with ThreadPoolExecutor(max_workers=lanes, thread_name_prefix="ingest-lane") as pool:
        futures = [pool.submit(lane) for _ in range(lanes)]
        return sum(f.result() for f in futures)


def _kick_run() -> None:
    # Sin worker regular nadie atenderia los reintentos programados: el kick
    # los espera. Con worker regular, el kick termina al vaciar lo vencido.
    drain(wait_retries=not is_running())


def run_once() -> None:
    """Una vuelta completa del worker. Se expone para pruebas y diagnostico."""
    from .ingest_service import job_timeout_seconds, recover_stale
    from .scheduler_service import finalize_scan_runs, run_due_tasks

    db = SessionLocal()
    try:
        # Un job vivo nunca pasa de su tiempo maximo: solo es huerfano si lo supero con margen.
        recover_stale(db, minutes=max(30, int(job_timeout_seconds(db) // 60) + 10))
        run_due_tasks(db)
    finally:
        db.close()
    drain(wait_retries=False)
    db = SessionLocal()
    try:
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
