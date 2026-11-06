"""Estado en vivo de cada fuente durante la vigilancia.

La cola (`ingest_jobs`) dice si un job esta pendiente, ejecutando o terminado,
pero no en que paso va. Este modulo guarda, en memoria del proceso, la etapa de
cada fuente mientras el worker la atiende: si ya accedio al sitio, por que ruta
(sitio, ruta de la matriz, RSS oficial o Google News), cuantas paginas lleva y
si esta extrayendo senales. La pantalla de vigilancia lo consulta cada pocos
segundos (GET /api/ingest/progress).

Vive en memoria porque el worker corre en el mismo proceso que la API. Si el
proceso se reinicia se pierde el detalle, no el estado: el job sigue en la base
y `recover_stale` lo devuelve a la cola.

Las funciones de este modulo nunca lanzan: un fallo al informar el progreso no
puede tumbar una corrida.
"""
from __future__ import annotations

import contextvars
import threading
from datetime import datetime, timezone

# Etapas en orden. La UI pinta una barra con las cinco primeras.
STAGES = (
    "en_cola",      # job pendiente
    "sonda",        # verificando salud (fuentes A/B)
    "conectando",   # descargando la URL principal o consultando la API
    "accedida",     # respondio: se sabe por que ruta y con que codigo
    "buscando",     # busqueda web dentro del dominio (Yahoo, Bing, DuckDuckGo...)
    "recorriendo",  # visitando URLs de entrada y fichas internas
    "extrayendo",   # heuristica + IA sacando senales del corpus
    "guardando",    # deduplicando y escribiendo senales nuevas
    "terminada",    # ok o parcial
    "error",        # fallo; puede volver a la cola si quedan intentos
    "cancelada",
)
STAGE_LABELS = {
    "en_cola": "En cola",
    "sonda": "Verificando salud",
    "conectando": "Accediendo a la fuente",
    "accedida": "Fuente accedida",
    "buscando": "Buscando en la web",
    "recorriendo": "Recorriendo páginas",
    "extrayendo": "Extrayendo señales",
    "guardando": "Guardando señales",
    "terminada": "Terminada",
    "error": "Error",
    "cancelada": "Cancelada",
}
# Ruta por la que se obtuvo el contenido.
ACCESS_VIA_LABELS = {
    "sitio": "Sitio de la fuente",
    "ruta_matriz": "URL de entrada de la matriz EH",
    "rss_oficial": "RSS oficial del sitio (la portada no respondió)",
    "google_news": "RSS de Google News (el sitio no respondió)",
    "api": "API del adaptador",
    "pdf": "Documento PDF",
}

_lock = threading.Lock()
_state: dict[int, dict] = {}
_current: contextvars.ContextVar[int | None] = contextvars.ContextVar("scan_progress_source", default=None)
MAX_EVENTS = 12


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def bind(source_id: int | None) -> contextvars.Token:
    """Fija la fuente en curso para este hilo (lo usan `crawl_site` y la IA)."""
    return _current.set(source_id)


def unbind(token: contextvars.Token) -> None:
    try:
        _current.reset(token)
    except (ValueError, RuntimeError):
        _current.set(None)


def current() -> int | None:
    return _current.get()


def start(source_id: int, job_id: int | None, *, connector: str = "") -> None:
    """Abre (o reinicia) el estado de una fuente al arrancar su job."""
    try:
        with _lock:
            _state[source_id] = {
                "source_id": source_id,
                "job_id": job_id,
                "connector": connector or "",
                "stage": "conectando",
                "detail": "",
                "accessed": False,
                "access_via": "",
                "http_status": 0,
                "pages_visited": 0,
                "pages_planned": 0,
                "items_found": 0,
                "items_new": 0,
                # Cada URL que se intento para entrar a la fuente y que respondio.
                "access_attempts": [],
                # Busqueda web: consultas, origen (ia/reglas), motor y resultados.
                "search": {},
                # Extraccion: si la IA leyo el corpus, cuantas senales dio y cuantas
                # se descartaron por no aparecer en el texto visitado.
                "ai": {},
                "started_at": _now(),
                "updated_at": _now(),
                "events": [],
            }
    except Exception:  # noqa: BLE001
        pass


def stage(stage_name: str, detail: str = "", *, source_id: int | None = None, **fields) -> None:
    """Mueve la fuente a una etapa y deja una linea en su bitacora corta."""
    sid = source_id if source_id is not None else _current.get()
    if sid is None:
        return
    try:
        with _lock:
            row = _state.get(sid)
            if row is None:
                return
            row["stage"] = stage_name
            if detail:
                row["detail"] = detail[:240]
            for key, value in fields.items():
                if key in row:
                    row[key] = value
            row["updated_at"] = _now()
            events = row["events"]
            if not events or events[-1].get("stage") != stage_name or (detail and events[-1].get("detail") != detail[:240]):
                events.append({"at": row["updated_at"], "stage": stage_name, "detail": detail[:240]})
                del events[:-MAX_EVENTS]
    except Exception:  # noqa: BLE001
        pass


def attempt(url: str, status: str, detail: str = "", *, route: str = "") -> None:
    """Registra un intento de acceso (URL principal, ruta de la matriz, respaldo)."""
    sid = _current.get()
    if sid is None:
        return
    try:
        with _lock:
            row = _state.get(sid)
            if row is None:
                return
            row["access_attempts"].append(
                {"route": route, "url": (url or "")[:300], "status": status, "detail": (detail or "")[:160]}
            )
            del row["access_attempts"][:-8]
    except Exception:  # noqa: BLE001
        pass


def note(section: str, **data) -> None:
    """Guarda el resumen de la busqueda web (`search`) o de la IA (`ai`)."""
    sid = _current.get()
    if sid is None or section not in ("search", "ai"):
        return
    try:
        with _lock:
            row = _state.get(sid)
            if row is not None:
                row[section] = {**row.get(section, {}), **data}
    except Exception:  # noqa: BLE001
        pass


def accessed(via: str, http_status: int = 0, detail: str = "", *, source_id: int | None = None) -> None:
    stage(
        "accedida",
        detail or ACCESS_VIA_LABELS.get(via, via),
        source_id=source_id,
        accessed=True,
        access_via=via,
        http_status=int(http_status or 0),
    )


def page_visited(url: str, status: str, *, planned: int | None = None) -> None:
    """Una pagina mas del recorrido (llamado desde `crawl_site`)."""
    sid = _current.get()
    if sid is None:
        return
    try:
        with _lock:
            row = _state.get(sid)
            if row is None:
                return
            if status == "ok":
                row["pages_visited"] = int(row.get("pages_visited") or 0) + 1
            if planned is not None:
                row["pages_planned"] = max(int(row.get("pages_planned") or 0), int(planned))
            # La estimacion no cuenta resultados de busqueda ni paginacion.
            row["pages_planned"] = max(int(row.get("pages_planned") or 0), int(row.get("pages_visited") or 0))
        done = _state.get(sid, {}).get("pages_visited", 0)
        plan = _state.get(sid, {}).get("pages_planned", 0)
        short = (url or "")[:120]
        stage("recorriendo", f"Página {done}{f' de ~{plan}' if plan else ''}: {short}", source_id=sid)
    except Exception:  # noqa: BLE001
        pass


def finish(source_id: int, *, ok: bool, detail: str = "", items_found: int = 0, items_new: int = 0, final_stage: str | None = None) -> None:
    stage(
        final_stage or ("terminada" if ok else "error"),
        detail,
        source_id=source_id,
        items_found=int(items_found or 0),
        items_new=int(items_new or 0),
    )


def get(source_id: int) -> dict | None:
    with _lock:
        row = _state.get(source_id)
        return _copy(row) if row else None


def snapshot() -> dict[int, dict]:
    with _lock:
        return {sid: _copy(row) for sid, row in _state.items()}


def forget(source_id: int) -> None:
    with _lock:
        _state.pop(source_id, None)


def clear() -> None:
    with _lock:
        _state.clear()


def _copy(row: dict) -> dict:
    out = dict(row)
    out["events"] = [dict(e) for e in row.get("events") or []]
    return out


# --------------------------------------------------------------------------- #
#  Informe persistente: ultimo resultado de cada fuente
# --------------------------------------------------------------------------- #
REPORT_KEY = "cfg.scan.access_report"
_report_lock = threading.Lock()


def _summary(row: dict, job) -> dict:
    return {
        "at": row.get("updated_at") or _now(),
        "job_id": row.get("job_id"),
        "job_status": getattr(job, "status", "") or "",
        "stage": row.get("stage") or "",
        "accessed": bool(row.get("accessed")),
        "access_via": row.get("access_via") or "",
        "http_status": int(row.get("http_status") or 0),
        "detail": (row.get("detail") or "")[:240],
        "pages_visited": int(row.get("pages_visited") or 0),
        "items_found": int(getattr(job, "items_found", 0) or row.get("items_found") or 0),
        "items_new": int(getattr(job, "items_new", 0) or row.get("items_new") or 0),
        "access_attempts": list(row.get("access_attempts") or [])[-8:],
        "search": dict(row.get("search") or {}),
        "ai": dict(row.get("ai") or {}),
        "message": (getattr(job, "message", "") or "")[:300],
    }


def load_report(db) -> dict[str, dict]:
    import json

    from . import settings_store

    try:
        data = json.loads(settings_store.get_value(db, REPORT_KEY, "") or "{}")
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def persist(db, source_id: int, job) -> None:
    """Guarda el resultado final de la fuente para el informe de acceso. Nunca lanza."""
    import json

    from . import settings_store

    row = get(source_id)
    if row is None:
        return
    try:
        with _report_lock:
            report = load_report(db)
            report[str(source_id)] = _summary(row, job)
            settings_store.set_value(db, REPORT_KEY, json.dumps(report, ensure_ascii=False, default=str))
    except Exception:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
