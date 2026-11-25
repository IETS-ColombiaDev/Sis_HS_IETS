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
import sys
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
# Vigilante de la cola. En Render solo corre el proceso web y el worker regular
# suele estar apagado: la cola la atendia unicamente el hilo que lanzo la corrida.
# Si el servicio se reiniciaba (despliegue, memoria, suspension), ese hilo moria,
# los jobs quedaban pendientes sin nadie que los tomara y la pantalla mostraba
# "vigilancia en curso" durante dias. El vigilante revisa cada minuto: si hay
# trabajo vencido y nadie lo atiende, devuelve a la cola lo que quedo a medias y
# relanza el drenaje. Tambien mantiene despierto el servicio mientras haya cola.
GUARDIAN_SECONDS = 60
GUARDIAN_FIRST_SECONDS = 10
_guardian_thread: threading.Thread | None = None
_guardian_resumes = 0


_libc = None


def release_memory() -> None:
    """Devuelve al sistema la memoria que dejo libre la fuente recien procesada.

    En Linux (Render) glibc conserva la memoria liberada por Python: tras decenas
    de paginas grandes analizadas, el proceso crecia fuente a fuente hasta pasar
    los 512 MB del plan gratuito y Render lo reiniciaba a mitad de la corrida.
    `gc.collect` libera los ciclos y `malloc_trim(0)` devuelve los bloques libres.
    En otros sistemas solo se hace la recoleccion.
    """
    global _libc
    import gc

    gc.collect()
    if _libc is False or not sys.platform.startswith("linux"):
        return
    try:
        if _libc is None:
            import ctypes

            _libc = ctypes.CDLL("libc.so.6")
        _libc.malloc_trim(0)
    except Exception:  # noqa: BLE001 - p. ej. musl sin malloc_trim
        _libc = False


_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


def _force_worker_on_sqlite() -> bool:
    return os.environ.get("INGEST_WORKER_FORCE", "").strip().lower() in _TRUE


def guardian_enabled() -> bool:
    """El vigilante corre cuando este proceso es el unico que puede atender la cola.

    `INGEST_GUARDIAN` lo fuerza o lo apaga. Sin esa variable: encendido con SQLite
    y un solo proceso (Render, equipo local), donde no existe un servicio `worker`
    aparte; apagado con PostgreSQL y varios procesos web, donde la cola es del
    servicio `worker`. Nunca corre dentro de las pruebas unitarias.
    """
    if "pytest" in sys.modules:
        return False
    raw = os.environ.get("INGEST_GUARDIAN", "").strip().lower()
    if raw in _TRUE:
        return True
    if raw in _FALSE:
        return False
    try:
        single = int(os.environ.get("WEB_CONCURRENCY", "1") or 1) <= 1
    except ValueError:
        single = False
    return IS_SQLITE and single


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


def guardian_tick() -> str:
    """Una revision del vigilante. Devuelve "reanudada" si relanzo el drenaje."""
    global _guardian_resumes
    if draining() or is_running():
        return ""
    from .ingest_service import job_timeout_seconds, next_pending_at, recover_stale

    db = SessionLocal()
    try:
        # Nadie esta drenando: un job `ejecutando` es huerfano si paso su tiempo maximo.
        recover_stale(db, minutes=max(5, int(job_timeout_seconds(db) // 60) + 2))
        upcoming = next_pending_at(db)
    finally:
        db.close()
    if upcoming is None:
        # Sistema libre: se ubican las senales que aun no tienen su punto exacto en la pagina (RF-001).
        try:
            from . import link_resolver

            if link_resolver.auto_start(SessionLocal):
                return "ubicando"
        except Exception:  # noqa: BLE001
            log.exception("Ubicacion automatica de senales")
        # Y se pone al dia la base de conocimiento de senales (y su calibracion).
        from . import intelligence

        return intelligence.auto_maintain(SessionLocal)
    _guardian_resumes += 1
    log.warning("Vigilante: hay cola de vigilancia sin atender; se reanuda el drenaje.")
    kick()
    return "reanudada"


def guardian_running() -> bool:
    return bool(_guardian_thread and _guardian_thread.is_alive())


def guardian_status() -> dict:
    return {"running": guardian_running(), "resumes": _guardian_resumes, "keepalive": bool(keepalive_url())}


def start_guardian() -> None:
    """Arranca el vigilante de la cola y el keep-alive, con o sin worker regular."""
    global _guardian_thread
    if not guardian_enabled() or guardian_running():
        return
    _stop.clear()

    def loop() -> None:
        wait = GUARDIAN_FIRST_SECONDS
        since_ping = 0.0
        while not _stop.wait(wait):
            since_ping += wait
            wait = GUARDIAN_SECONDS
            try:
                guardian_tick()
                if since_ping >= KEEPALIVE_SECONDS:
                    since_ping = 0.0
                    keepalive_tick()
            except Exception:  # noqa: BLE001
                log.exception("Vigilante de la cola de ingesta")

    _guardian_thread = threading.Thread(target=loop, name="ingest-guardian", daemon=True)
    _guardian_thread.start()
    log.info("Vigilante de la cola en marcha (keep-alive: %s).", keepalive_url() or "sin URL pública")


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
        from .ingest_service import job_timeout_seconds, next_pending_at, parallel_jobs, recover_stale
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
                # Sin worker regular nadie mas devuelve a la cola un job que quedo
                # `ejecutando` (hilo cortado): lo hace el propio drenaje.
                if recover_stale(db, minutes=max(30, int(job_timeout_seconds(db) // 60) + 10)):
                    done += 1
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
        if total:
            # La bandeja no recalcula la corroboracion en cada consulta mientras hay
            # vigilancia: se deja al dia aqui, al terminar.
            try:
                from . import corroboration

                corroboration.refresh_after_scan(SessionLocal)
            except Exception:  # noqa: BLE001
                log.warning("No se pudo recalcular la corroboracion tras la vigilancia")
            # Corrida terminada: las senales nuevas van a Firestore ya, sin esperar
            # el minimo entre copias (un reinicio de Render las borraria del disco).
            try:
                from . import firebase_db

                firebase_db.push_soon()
            except Exception:  # noqa: BLE001
                log.warning("No se pudo programar la copia a Firestore tras la vigilancia")
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
                release_memory()
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
