"""Sonda de salud por fuente (seccion 10.1 del catalogo).

Verde: responde, esquema coincide, hay registros.
Ambar: responde pero el esquema cambio, o cero registros donde siempre hay.
Rojo: no responde tras los reintentos, o el sitio bloquea.

La sonda corre antes de cada corrida de nivel A/B y a demanda desde la API.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import httpx
from sqlalchemy.orm import Session

from .audit import record_action
from .ingest.base import (
    USER_AGENT,
    ConnectorError,
    json_path_exists,
    schema_signature,
    shared_ssl_context,
)
from .models import Source

log = logging.getLogger(__name__)

CONTACT = "escaneo.horizonte@iets.org.co"
# Respuestas de un sitio en linea que no deja entrar robots (o pide sesion).
MANUAL_ONLINE = (202, 401, 403, 406, 429)


def probe_source(db: Session, source: Source, *, persist: bool = True) -> dict:
    now = datetime.now(timezone.utc)
    config = source.connector_config if isinstance(source.connector_config, dict) else {}
    spec = (config.get("probe") or {}) if isinstance(config.get("probe"), dict) else {}
    url = spec.get("url") or source.url
    params = spec.get("params") or {}
    expect_status = int(spec.get("expect_status") or 200)
    expect_path = spec.get("expect_json_path") or ""

    detail = {
        "source_id": source.id,
        "catalog_code": source.catalog_code,
        "url": url,
        "status": "rojo",
        "http_status": None,
        "message": "",
        "schema_signature": "",
        "schema_changed": False,
        "zero_records": False,
        "probed_at": now.isoformat(),
    }

    if not url:
        detail["message"] = "La fuente no declara URL de sonda."
        _store(db, source, "rojo", detail, persist)
        return detail

    if (source.connector or "html") in {"html", "pdf", "manual"}:
        # Las fuentes web se sondean como las recorre el escaner (cabeceras de
        # navegador): con el agente de robot muchas respondian 403 sin razon real.
        from .scraper import BROWSER_HEADERS

        headers = dict(BROWSER_HEADERS)
    else:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json, text/html, */*"}
    connector = source.connector or "html"
    try:
        from .ingest.base import tls_get

        try:
            resp = tls_get(url, timeout=25.0, headers=headers, params=params)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if connector != "html":
                raise
            # Igual que el escaner: si la portada no responde, vale la ruta de respaldo.
            alt = _working_fallback(source, headers, expect_status)
            if not alt:
                raise
            detail["message"] = (
                f"La portada no responde ({type(exc).__name__}); el escaneo usa {_route_label(alt)}."
            )
            _store(db, source, "verde", detail, persist)
            return detail
        detail["http_status"] = resp.status_code
        notes: list = []
        if resp.status_code != expect_status and connector == "html":
            # Igual que el escaner: si la portada bloquea, vale la ruta de respaldo.
            alt = _working_fallback(source, headers, expect_status, notes)
            if alt:
                if resp.status_code in (404, 410):
                    # La direccion ya no existe: se sigue escaneando, pero hay que corregirla.
                    detail["message"] = (
                        f"La dirección principal ya no existe (HTTP {resp.status_code}); mientras tanto "
                        f"el escaneo usa {_route_label(alt)}. Actualice la URL de la fuente."
                    )
                    _store(db, source, "ambar", detail, persist)
                    return detail
                detail["message"] = (
                    f"La portada responde HTTP {resp.status_code} (bloqueo anti-robot); "
                    f"el escaneo usa {_route_label(alt)}."
                )
                _store(db, source, "verde", detail, persist)
                return detail
        if resp.status_code != expect_status and connector == "manual" and resp.status_code in MANUAL_ONLINE:
            # Fuente de consulta manual (base con licencia o portal con login): la
            # consulta la hace una persona en su navegador; basta con que este en linea.
            detail["message"] = (
                f"Fuente de consulta manual: el sitio está en línea (HTTP {resp.status_code} al acceso "
                "automático, esperado). Se consulta con usuario en el navegador."
            )
            _store(db, source, "verde", detail, persist)
            return detail
        if resp.status_code != expect_status:
            detail["message"] = f"HTTP {resp.status_code} (se esperaba {expect_status})."
            if "news_empty" in notes:
                # Ni el sitio ni Google News: lo mas probable es que la direccion este obsoleta.
                detail["message"] += (
                    " Tampoco hay nada publicado del dominio en Google News en los últimos 90 días: "
                    "la fuente probablemente cambió de dirección o dejó de publicar. Revise y actualice la URL."
                )
            elif resp.status_code in (202, 401, 403, 429) and (source.connector or "html") in {"html", "manual"}:
                detail["message"] += (
                    " El sitio bloquea el acceso automatico (proteccion anti-robot): registre sus "
                    "senales con la carga manual de la bandeja de entrada o agregue una ruta "
                    "alternativa (RSS, PDF) en el flujo de la fuente."
                )
            _store(db, source, "rojo", detail, persist)
            return detail

        body = None
        ctype = (resp.headers.get("content-type") or "").lower()
        if "json" in ctype:
            try:
                body = resp.json()
            except ValueError:
                body = None

        if body is not None:
            signature = schema_signature(body)
            detail["schema_signature"] = signature
            if expect_path and not json_path_exists(body, expect_path):
                detail["zero_records"] = True
                detail["message"] = f"Responde pero falta la ruta {expect_path}."
                _store(db, source, "ambar", detail, persist, signature=signature)
                return detail
            previous = (source.schema_signature or "").strip()
            # Con ruta de contrato declarada y presente, la huella solo cambia porque
            # varian los campos opcionales del primer registro (o porque la ingesta la
            # guardo con otra consulta): no es ruptura y no debe suspender la fuente.
            if previous and signature and previous != signature and expect_path:
                detail["schema_changed"] = True
                detail["status"] = "verde"
                detail["message"] = "Responde y el contrato se sostiene (variaron campos opcionales)."
                _store(db, source, "verde", detail, persist, signature=signature)
                return detail
            if previous and signature and previous != signature:
                detail["schema_changed"] = True
                detail["message"] = "El esquema cambió respecto de la última corrida exitosa."
                _store(db, source, "ambar", detail, persist, signature=signature, suspend=True)
                return detail
            if _looks_empty(body):
                detail["zero_records"] = True
                detail["message"] = "Responde con cero registros donde se esperaba señal."
                _store(db, source, "ambar", detail, persist, signature=signature)
                return detail

        robots = _check_robots(url, config.get("respect_robots"))
        if robots:
            detail["robots"] = robots
            source.robots_checked_at = now
            source.robots_allowed = robots.get("allowed")
            if robots.get("allowed") is False:
                detail["message"] = "robots.txt desaconseja el rastreo automático."
                _store(db, source, "ambar", detail, persist, suspend=True)
                return detail

        detail["status"] = "verde"
        detail["message"] = "Responde y el contrato se sostiene."
        _store(db, source, "verde", detail, persist, signature=detail.get("schema_signature"))
        return detail
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        detail["message"] = f"No responde: {type(exc).__name__}: {exc}"
        _store(db, source, "rojo", detail, persist)
        return detail
    except ConnectorError as exc:
        detail["message"] = str(exc)
        _store(db, source, "rojo", detail, persist)
        return detail


def _working_fallback(source: Source, headers: dict, expect_status: int, notes: list | None = None) -> str:
    """Primera ruta de respaldo que responde (y, si es un canal, trae items).

    En `notes` deja "news_empty" si Google News no tiene nada del dominio en la
    ventana: senal de que la fuente cambio de direccion o dejo de publicar.
    """
    from .ingest.base import tls_get
    from .scraper import fallback_urls, feed_items, is_feed, is_news_feed_url

    for alt in fallback_urls(source, getattr(source, "entry_urls", None) or []):
        try:
            alt_resp = tls_get(alt, timeout=25.0, headers=headers)
        except (httpx.TimeoutException, httpx.TransportError):
            continue
        if alt_resp.status_code != expect_status:
            continue
        if is_feed(alt_resp.text) and not feed_items(alt_resp.text):
            if notes is not None and is_news_feed_url(alt):
                notes.append("news_empty")
            continue
        return alt
    return ""


def _route_label(url: str) -> str:
    from .scraper import is_news_feed_url

    if is_news_feed_url(url):
        return "el canal de Google News del dominio"
    return f"la ruta de respaldo {url}"


def probe_all(db: Session, *, only_ab: bool = False) -> list[dict]:
    query = db.query(Source).filter(Source.retired.is_(False), Source.catalog_active.is_(True))
    if only_ab:
        query = query.filter(Source.access_level.in_(("A", "B")))
    results = []
    for source in query.order_by(Source.catalog_code, Source.title).all():
        results.append(probe_source(db, source))
    return results


# --------------------------------------------------------------------------- #
#  Sondeo de todo el inventario en segundo plano
# --------------------------------------------------------------------------- #
# Sondear las 141 fuentes una tras otra dentro de la peticion tardaba minutos y
# el navegador (o el proxy de Render) cortaba antes. Ahora corre en un hilo, de
# a BULK_WORKERS fuentes a la vez, y la pantalla consulta el avance.
BULK_WORKERS = 6
BULK_SCOPES = ("all", "ab", "pending")
_bulk_lock = threading.Lock()
_bulk: dict = {
    "running": False,
    "scope": "",
    "total": 0,
    "done": 0,
    "counts": {"verde": 0, "ambar": 0, "rojo": 0},
    "current": [],
    "started_at": None,
    "finished_at": None,
    "by": "",
    "error": "",
}


def _snapshot() -> dict:
    state = dict(_bulk)
    state["counts"] = dict(_bulk["counts"])
    state["current"] = list(_bulk["current"])
    return state


def bulk_state() -> dict:
    with _bulk_lock:
        return _snapshot()


def bulk_targets(db: Session, scope: str) -> list[int]:
    """Fuentes del alcance: todas las activas, solo A/B, o las que nunca se han sondeado."""
    query = db.query(Source.id).filter(Source.retired.is_(False), Source.catalog_active.isnot(False))
    if scope == "ab":
        query = query.filter(Source.access_level.in_(("A", "B")))
    elif scope == "pending":
        query = query.filter((Source.last_probe_at.is_(None)) | (Source.health_status == ""))
    return [row[0] for row in query.order_by(Source.title).all()]


def start_bulk(session_factory, *, scope: str = "all", actor: str = "", wait: bool = False) -> dict:
    """Arranca el sondeo en segundo plano. Si ya hay uno en curso, devuelve su estado.

    `wait=True` corre en el hilo actual (pruebas y linea de comandos).
    """
    if scope not in BULK_SCOPES:
        raise ValueError(f"Alcance desconocido: {scope}")
    db = session_factory()
    try:
        ids = bulk_targets(db, scope)
    finally:
        db.close()
    with _bulk_lock:
        if _bulk["running"]:
            return _snapshot()
        _bulk.update(
            running=True,
            scope=scope,
            total=len(ids),
            done=0,
            counts={"verde": 0, "ambar": 0, "rojo": 0},
            current=[],
            started_at=datetime.now(timezone.utc).isoformat(),
            finished_at=None,
            by=actor,
            error="",
        )
    if wait:
        _run_bulk(session_factory, ids, scope, actor)
    else:
        threading.Thread(
            target=_run_bulk, args=(session_factory, ids, scope, actor), name="probe-bulk", daemon=True
        ).start()
    return bulk_state()


def _probe_one(session_factory, source_id: int) -> str:
    db = session_factory()
    label = ""
    try:
        source = db.get(Source, source_id)
        if source is None:
            return ""
        label = (source.title or "")[:80]
        with _bulk_lock:
            _bulk["current"].append(label)
        try:
            return probe_source(db, source).get("status") or "rojo"
        except Exception as exc:  # noqa: BLE001 - una fuente rara no detiene el lote
            log.warning("La sonda de %s fallo: %s", label, exc)
            db.rollback()
            try:
                source = db.get(Source, source_id)
                detail = {"source_id": source_id, "url": source.url, "message": f"Error de la sonda: {type(exc).__name__}"}
                _store(db, source, "rojo", detail, True)
            except Exception:  # noqa: BLE001
                db.rollback()
            return "rojo"
    finally:
        db.close()
        with _bulk_lock:
            if label in _bulk["current"]:
                _bulk["current"].remove(label)


def _run_bulk(session_factory, ids: list[int], scope: str, actor: str) -> None:
    from concurrent.futures import ThreadPoolExecutor

    try:
        with ThreadPoolExecutor(max_workers=BULK_WORKERS, thread_name_prefix="probe") as pool:
            for status in pool.map(lambda sid: _probe_one(session_factory, sid), ids):
                with _bulk_lock:
                    _bulk["done"] += 1
                    if status in _bulk["counts"]:
                        _bulk["counts"][status] += 1
        db = session_factory()
        try:
            record_action(
                db,
                entity_type="sources",
                entity_id="sondeo",
                action="source_probe_bulk",
                new_value={"alcance": scope, "fuentes": len(ids), "por_estado": bulk_state()["counts"], "por": actor},
            )
            db.commit()
            from .events import bump_state_version

            bump_state_version(db)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        log.exception("Sondeo en lote")
        with _bulk_lock:
            _bulk["error"] = f"{type(exc).__name__}: {exc}"[:240]
    finally:
        with _bulk_lock:
            _bulk["running"] = False
            _bulk["current"] = []
            _bulk["finished_at"] = datetime.now(timezone.utc).isoformat()


PROBE_LABELS = {"verde": "Verde", "ambar": "Ámbar", "rojo": "Rojo", "": "Sin sonda"}
PROBE_ACTIONS = {
    "verde": "Ninguna",
    "ambar": "Revisar la URL o el contrato de la fuente",
    "rojo": "Revisar la URL en la matriz o pasar la fuente a consulta manual",
    "": "Sondear",
}


def build_probe_xlsx(db: Session) -> tuple[bytes, str]:
    """Informe de sondas del inventario activo, con el que el equipo corrige la matriz."""
    from .xlsx_report import Column, Sheet, build_workbook, stamp

    sources = (
        db.query(Source)
        .filter(Source.retired.is_(False), Source.catalog_active.isnot(False))
        .order_by(Source.title)
        .all()
    )
    rows = []
    for s in sources:
        detail = s.last_probe_detail if isinstance(s.last_probe_detail, dict) else {}
        status = (s.health_status or "").lower()
        if status not in PROBE_LABELS:
            status = ""
        rows.append(
            [
                s.title or "",
                detail.get("url") or s.url or "",
                (s.access_level or "").upper(),
                s.connector or "",
                PROBE_LABELS[status],
                detail.get("http_status") or "",
                detail.get("message") or "",
                PROBE_ACTIONS[status],
                s.last_probe_at,
                s.matrix_ref or "",
            ]
        )
    order = {"Rojo": 0, "Ámbar": 1, "Sin sonda": 2, "Verde": 3}
    rows.sort(key=lambda r: (order.get(r[4], 9), r[0].lower()))
    counts = {k: sum(1 for r in rows if r[4] == v) for k, v in PROBE_LABELS.items()}
    sheet = Sheet(
        "Sondas",
        [
            Column("Fuente", 46, wrap=True),
            Column("URL sondeada", 50, kind="url"),
            Column("Nivel", 7),
            Column("Adaptador", 14),
            Column("Estado", 11, kind="status"),
            Column("HTTP", 7),
            Column("Detalle", 60, wrap=True),
            Column("Acción sugerida", 34, wrap=True),
            Column("Fecha de la sonda", 17, kind="date"),
            Column("Referencia en la matriz", 24),
        ],
        rows,
        note=(
            f"{len(rows)} fuentes: {counts['verde']} verdes, {counts['ambar']} ámbar, {counts['rojo']} rojas y "
            f"{counts['']} sin sonda. Las rojas y ámbar aparecen primero."
        ),
    )
    info = [
        ("Qué es la sonda", "Una visita de prueba a la URL de la fuente, como la hace la vigilancia: dice si responde, si cambió o si bloquea."),
        ("Verde", "Responde (directo o por su ruta de respaldo oficial). No requiere acción."),
        ("Ámbar", "Responde con cambios (esquema distinto, cero registros, robots.txt) o la URL principal ya no existe y se usa el respaldo: corregir la URL."),
        ("Rojo", "No responde o bloquea el acceso automático y no hay respaldo: revisar la URL en la matriz o pasar la fuente a consulta manual."),
    ]
    return build_workbook([sheet], title="Informe de sondas de fuentes", info=info), f"sondas_fuentes_{stamp()}.xlsx"


def health_board(db: Session) -> dict:
    rows = db.query(Source).filter(Source.retired.is_(False)).all()
    counts = {"verde": 0, "ambar": 0, "rojo": 0, "sin_sonda": 0}
    items = []
    for source in rows:
        status = (source.health_status or "").lower() or "sin_sonda"
        if status not in counts:
            status = "sin_sonda"
        counts[status] += 1
        items.append(
            {
                "id": source.id,
                "catalog_code": source.catalog_code,
                "title": source.title,
                "access_level": source.access_level,
                "connector": source.connector,
                "health_status": source.health_status or "sin_sonda",
                "last_ok_at": source.last_ok_at.isoformat() if source.last_ok_at else None,
                "last_probe_at": source.last_probe_at.isoformat() if source.last_probe_at else None,
                "circuit_open": bool(source.circuit_open_until),
                "requires_api_key": bool(source.requires_api_key),
                "scrape_enabled": bool(source.scrape_enabled),
                "message": ((source.last_probe_detail or {}) if isinstance(source.last_probe_detail, dict) else {}).get(
                    "message", ""
                ),
            }
        )
    items.sort(key=lambda x: (x["health_status"] != "rojo", x["health_status"] != "ambar", x["catalog_code"] or x["title"]))
    return {
        "counts": counts,
        "total": len(rows),
        "items": items,
    }


def _store(
    db: Session,
    source: Source,
    status: str,
    detail: dict,
    persist: bool,
    *,
    signature: str | None = None,
    suspend: bool = False,
) -> None:
    detail["status"] = status
    if not persist:
        return
    previous = source.last_probe_detail if isinstance(source.last_probe_detail, dict) else {}
    if status == "verde" and previous.get("ingestion_suspended") and not source.scrape_enabled:
        # La sonda la suspendio sola; si vuelve a verde, se reactiva sola.
        source.scrape_enabled = True
        detail["ingestion_resumed"] = True
    source.health_status = status
    source.last_probe_at = datetime.now(timezone.utc)
    source.last_probe_detail = detail
    if signature:
        if status == "verde" or not source.schema_signature:
            source.schema_signature = signature
    if status == "verde":
        source.last_ok_at = source.last_probe_at
        source.last_error = ""
    else:
        source.last_error = (detail.get("message") or "")[:2000]
    if suspend and source.scrape_enabled:
        source.scrape_enabled = False
        detail["ingestion_suspended"] = True
    record_action(
        db,
        entity_type="sources",
        entity_id=str(source.id),
        action="source_probe",
        new_value={"status": status, "message": detail.get("message"), "catalog_code": source.catalog_code},
    )
    db.commit()
    db.refresh(source)


def _looks_empty(body) -> bool:
    if body in (None, {}, []):
        return True
    if isinstance(body, list):
        return len(body) == 0
    if isinstance(body, dict):
        for key in ("results", "studies", "data", "items", "idlist"):
            value = body.get(key)
            if isinstance(value, list) and not value:
                return True
            if key == "idlist" and isinstance((body.get("esearchresult") or {}).get("idlist"), list):
                return not (body.get("esearchresult") or {}).get("idlist")
    return False


def _check_robots(url: str, respect: bool | None) -> dict | None:
    if not respect:
        return None
    parts = urlsplit(url)
    robots_url = urljoin(f"{parts.scheme}://{parts.netloc}", "/robots.txt")
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}, verify=shared_ssl_context()) as client:
            resp = client.get(robots_url)
        if resp.status_code >= 400:
            return {"url": robots_url, "allowed": True, "note": f"HTTP {resp.status_code}"}
        text = resp.text.lower()
        disallows = [
            line.split(":", 1)[1].strip()
            for line in text.splitlines()
            if line.strip().lower().startswith("disallow:")
        ]
        path = parts.path or "/"
        blocked = any(path.startswith(rule) for rule in disallows if rule and rule != "/")
        return {"url": robots_url, "allowed": not blocked, "disallows": disallows[:12]}
    except (httpx.TimeoutException, httpx.TransportError) as exc:
        return {"url": robots_url, "allowed": True, "note": f"robots.txt inaccesible: {exc}"}
