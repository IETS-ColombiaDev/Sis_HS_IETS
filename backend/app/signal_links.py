"""Enlace de cada senal a su fuente original (RF-001, III seguimiento).

Cada senal guarda dos URL distintas:

- `query_url`: la pagina que el sistema consulto (listado, buscador, portada,
  canal RSS o API de la fuente);
- `url`: la URL exacta del item cuando la fuente la ofrece.

`link_type` dice cual de los dos casos aplica, para que la interfaz no presente
como exacto un enlace que no lo es:

- `exacto`: la URL lleva al item (ficha, articulo, documento, registro).
- `consulta`: la URL es la pagina consultada (listado, buscador, portada); la
  fuente no ofrece enlace directo al item. La senal muestra entonces la
  evidencia de captura (titulo, fragmento, fecha y hora, URL consultada).
- `sin_enlace`: la senal no trae URL.

`link_status` es el resultado de la ultima verificacion (`ok`, `redirigido`,
`caido`, `bloqueado`, `sin_verificar`). Nada de esto borra ni reescribe la URL
capturada: solo la clasifica y la complementa.
"""
from __future__ import annotations

import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlsplit, urlunsplit

from sqlalchemy.orm import Session

from .models import Finding, Source

log = logging.getLogger(__name__)

LINK_TYPES = ("exacto", "consulta", "sin_enlace")
LINK_TYPE_LABELS = {
    "exacto": "Enlace exacto",
    "consulta": "Página de consulta, la fuente no ofrece enlace directo",
    "sin_enlace": "Sin enlace",
}
LINK_STATUS_LABELS = {
    "ok": "Responde",
    "redirigido": "Redirige a otra página",
    "caido": "No responde",
    "bloqueado": "El sitio bloquea la verificación automática",
    "sin_verificar": "Sin verificar",
    "sin_respuesta": "El sitio no respondió a la verificación (se reintenta)",
}
# Parametros que delatan una pagina de resultados de busqueda o de formulario.
_SEARCH_PARAMS = {
    "q", "query", "search", "searchterm", "search_term", "term", "terms", "keyword", "keywords",
    "s", "k", "text", "texto", "buscar", "busqueda", "cond", "intr", "filter", "filters",
}
_SEARCH_PATH = re.compile(r"/(search|buscar|busqueda|results?|resultados|find)(/|$|\.)", re.I)
_FRAGMENT_ROUTE = re.compile(r"^/")
CHECK_TIMEOUT_S = 20
CHECK_WORKERS = 6
EVIDENCE_SNIPPET_CHARS = 600


def _norm(url: str) -> str:
    """URL comparable. Conserva las rutas SPA del fragmento (#/...), que son paginas distintas."""
    raw = (url or "").strip()
    if not raw:
        return ""
    parts = urlsplit(raw)
    host = parts.netloc.lower().removeprefix("www.")
    query = sorted((k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not k.lower().startswith("utm_"))
    fragment = parts.fragment if _FRAGMENT_ROUTE.match(parts.fragment or "") else ""
    path = parts.path.rstrip("/") or "/"
    return urlunsplit(("", host, path, "&".join(f"{k}={v}" for k, v in query), fragment)).lower()


# Buscadores de registros oficiales: sin identificador en la URL son el formulario
# de consulta, no la ficha de un producto, aunque la ruta no sea la portada.
_SEARCH_HOMES = {
    _norm(u)
    for u in (
        "https://health-products.canada.ca/dpd-bdpp/",
        "https://health-products.canada.ca/mdall-limh/",
        "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm",
        "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPMN/pmn.cfm",
        "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPMN/denovo.cfm",
        "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm",
        "https://euclinicaltrials.eu/ctis-public/search",
        "https://euclinicaltrials.eu/search-for-clinical-trials/",
    )
}


def source_query_urls(source: Source | None) -> list[str]:
    """Paginas que el sistema consulta en la fuente: URL principal y URL de entrada de la matriz."""
    if source is None:
        return []
    urls = [source.url or ""]
    urls += [u for u in (source.entry_urls or []) if isinstance(u, str)]
    urls += [u for u in (source.reference_urls or []) if isinstance(u, str)]
    return [u for u in urls if u]


def classify(url: str, source: Source | None = None, query_url: str = "") -> str:
    """`exacto`, `consulta` o `sin_enlace` (ver el encabezado del modulo)."""
    if not (url or "").strip():
        return "sin_enlace"
    key = _norm(url)
    bases = {_norm(u) for u in [query_url, *source_query_urls(source)] if u}
    parts = urlsplit(url)
    anchor = parts.fragment or ""
    if key in bases:
        # Un ancla de la misma pagina (#seccion) si lleva al punto donde esta la senal.
        if anchor and not anchor.startswith(("/", ":~:")):
            return "exacto"
        return "consulta"
    route = parts.fragment if _FRAGMENT_ROUTE.match(parts.fragment or "") else ""
    if (parts.path in ("", "/")) and not parts.query and not route:
        return "consulta"
    if key in _SEARCH_HOMES:
        return "consulta"
    params = {k.lower() for k, _ in parse_qsl(parts.query, keep_blank_values=True)}
    if params & _SEARCH_PARAMS or _SEARCH_PATH.search(parts.path or "") or _SEARCH_PATH.search(route):
        return "consulta"
    return "exacto"


def evidence_for(finding: Finding, query_url: str = "") -> dict:
    """Evidencia de captura: lo que el sistema vio, cuando y donde."""
    from .evidence_locator import quote_from_raw

    quote = quote_from_raw(finding.raw_content or "", finding.technology or "")
    snippet = quote or (finding.summary or "") or (finding.raw_content or "")
    snippet = re.sub(r"\s+", " ", snippet).strip()[:EVIDENCE_SNIPPET_CHARS]
    captured = finding.created_at or datetime.now(timezone.utc)
    if captured.tzinfo is None:
        captured = captured.replace(tzinfo=timezone.utc)
    return {
        "title": (finding.title or "")[:600],
        "snippet": snippet,
        "is_quote": bool(quote),
        "captured_at": captured.isoformat(),
        "query_url": (query_url or finding.query_url or "")[:1024],
    }


def annotate(finding: Finding, source: Source | None, *, query_url: str = "") -> None:
    """Completa URL consultada, tipo de enlace y evidencia de una senal (nueva o historica).

    No toca `url`: lo capturado se conserva tal cual.
    """
    if not finding.query_url:
        finding.query_url = (query_url or (source.url if source else "") or "")[:1024]
    finding.link_type = classify(finding.url or "", source, finding.query_url)
    if not finding.link_status:
        finding.link_status = "sin_verificar"
    if not finding.evidence:
        finding.evidence = evidence_for(finding, finding.query_url)


# --------------------------------------------------------------------------- #
#  Aplicacion a las senales ya capturadas
# --------------------------------------------------------------------------- #
def backfill(db: Session, *, actor: str = "sistema", only_missing: bool = False) -> dict:
    """Clasifica todas las senales y les guarda la evidencia. Deja una entrada en bitacora."""
    from .audit import record_action

    sources = {s.id: s for s in db.query(Source).all()}
    query = db.query(Finding)
    if only_missing:
        query = query.filter((Finding.link_type == "") | (Finding.link_type.is_(None)))
    before = {t: 0 for t in LINK_TYPES}
    after = {t: 0 for t in LINK_TYPES}
    changed = 0
    processed = 0
    for finding in query.yield_per(200):
        processed += 1
        old = finding.link_type or ""
        if old in before:
            before[old] += 1
        annotate(finding, sources.get(finding.source_id))
        after[finding.link_type] += 1
        if finding.link_type != old:
            changed += 1
    if not processed:
        return {"por_tipo": after, "cambiadas": 0, "procesadas": 0}
    record_action(
        db,
        entity_type="findings",
        entity_id="link_backfill",
        action="link_classify",
        old_value={"por_tipo": before},
        new_value={"por_tipo": after, "cambiadas": changed, "ejecutado_por": actor},
    )
    db.commit()
    return {"por_tipo": after, "cambiadas": changed, "procesadas": processed}


# --------------------------------------------------------------------------- #
#  Verificacion de enlaces
# --------------------------------------------------------------------------- #
# Titulo o encabezado de una pagina que dice que el contenido no existe. Hay sitios
# que responden 200 con una pagina de «no encontrado» (404 blando).
_SOFT_404 = re.compile(
    r"\b(404|page not found|not found|p[aá]gina no encontrada|no se encontr[oó]|no encontrad[ao]|page introuvable|"
    r"seite nicht gefunden|pagina non trovata|no longer available|has been (removed|moved)|does not exist|error 404)\b",
    re.I,
)
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.I | re.S)
CHECK_BODY_BYTES = 120_000
CHECK_HOST_PAUSE_S = 1.0
# Por tanda, a un mismo sitio no se le piden mas paginas que estas, y si rechaza
# o no contesta varias seguidas se le deja en paz hasta el dia siguiente.
CHECK_MAX_PER_HOST = 25
CHECK_HOST_GIVE_UP = 3
CHECK_RETRY_PAUSE_S = 2.0
AUTO_CHECK_BATCH = 150
RECHECK_SILENT_HOURS = 24
GONE = (404, 410)


def soft_404(html: str) -> bool:
    """True si el titulo o el encabezado de la pagina dicen que no existe."""
    head = html[:CHECK_BODY_BYTES] if html else ""
    for pattern in (_TITLE, _H1):
        match = pattern.search(head)
        if match:
            text = re.sub(r"<[^>]+>", " ", match.group(1))
            text = re.sub(r"\s+", " ", text).strip()
            if text and len(text) <= 120 and _SOFT_404.search(text):
                return True
    return False


def _get(url: str) -> tuple[int, str, str]:
    """(codigo, URL final, inicio del cuerpo si es HTML). Lanza si no hay respuesta.

    Usa el mismo cliente del rastreador: hay sitios que le responden a el y no a
    un cliente distinto, y un enlace que el sistema si pudo leer no debe salir
    como «sin respuesta».
    """
    import httpx

    from .ingest.base import tls_get
    from .scraper import BROWSER_HEADERS

    cfg = httpx.Timeout(CHECK_TIMEOUT_S, connect=min(10.0, CHECK_TIMEOUT_S), read=CHECK_TIMEOUT_S, write=CHECK_TIMEOUT_S)
    resp = tls_get(url, timeout=cfg, headers=BROWSER_HEADERS)
    body = ""
    if "html" in (resp.headers.get("content-type") or "").lower():
        body = (resp.content or b"")[:CHECK_BODY_BYTES].decode(resp.encoding or "utf-8", errors="replace")
    return resp.status_code, str(resp.url), body


def check_url(url: str) -> tuple[str, int, str]:
    """(estado, codigo HTTP, URL final).

    - `ok`: la pagina responde y no dice que el contenido no existe.
    - `caido`: 404, 410 u otro error del sitio, o una pagina de «no encontrado».
    - `redirigido`: lleva a la portada (el item ya no esta en esa direccion).
    - `bloqueado`: el sitio rechaza la verificacion automatica (en el navegador abre).
    - `sin_respuesta`: no contesto a tiempo. No es un enlace roto: se reintenta.
    """
    from .scraper import is_internal_url

    if not url.lower().startswith(("http://", "https://")) or is_internal_url(url):
        return "caido", 0, ""
    target = url.split("#:~:text=", 1)[0]
    try:
        code, final, body = _get(target)
    except Exception:  # noqa: BLE001
        # Un fallo de red suele ser pasajero (el sitio limita las visitas seguidas).
        time.sleep(CHECK_RETRY_PAUSE_S)
        try:
            code, final, body = _get(target)
        except Exception:  # noqa: BLE001
            return "sin_respuesta", 0, ""
    if code >= 500:
        return "sin_respuesta", code, final
    if code in GONE:
        return "caido", code, final
    if code >= 400:
        # 401, 403, 429 y tambien 400: asi responden los sitios que rechazan visitas
        # automaticas (la FDA devuelve 400 a todo cuando considera que hay demasiadas).
        # No dice que la pagina no exista: en el navegador abre.
        return "bloqueado", code, final
    if _norm(final) != _norm(target) and urlsplit(final).path in ("", "/") and urlsplit(target).path not in ("", "/"):
        # Redirige a la portada: el item ya no existe en esa direccion.
        return "redirigido", code, final
    if body and soft_404(body):
        return "caido", 404, final
    return "ok", code, final


_check_lock = threading.Lock()
_check_state: dict = {"running": False, "done": 0, "total": 0, "started_at": None, "finished_at": None}


def check_state() -> dict:
    with _check_lock:
        return dict(_check_state)


def _fall_back(db: Session, finding: Finding, sources: dict) -> bool:
    """Un enlace que ya no existe deja de presentarse como «enlace exacto».

    La senal pasa a su pagina consultada (que si abre) y queda lista para que el
    sistema la ubique alli. La direccion rota se conserva en la evidencia.
    """
    source = sources.get(finding.source_id)
    fallback = finding.query_url or (source.url if source else "") or ""
    broken = finding.url or ""
    if not fallback or _norm(fallback) == _norm(broken):
        return False
    evidence = dict(finding.evidence or {}) if isinstance(finding.evidence, dict) else {}
    evidence["broken_url"] = broken
    for key in ("resolved", "locator_url", "locator_text"):
        evidence.pop(key, None)
    finding.evidence = evidence
    finding.url = fallback[:1024]
    finding.link_type = classify(finding.url, source, finding.query_url or "")
    from .models import Technology

    for tech in db.query(Technology).filter(Technology.finding_id == finding.id).all():
        if (tech.url or "") in ("", broken):
            tech.url = finding.url
    return True


def check_links(
    session_factory, *, ids: list[int] | None = None, limit: int = 2000, actor: str = "sistema", pending_only: bool = False,
) -> dict:
    """Verifica los enlaces de las senales. Pensado para correr en un hilo aparte.

    Los sitios se visitan en paralelo, pero cada sitio de a una pagina y con pausa:
    pedirle 40 paginas a la vez a un mismo sitio hacia que dejara de responder y
    las senales quedaban marcadas como caidas sin estarlo.
    """
    from datetime import timedelta

    from .audit import record_action

    with _check_lock:
        if _check_state["running"]:
            return dict(_check_state)
        _check_state.update(running=True, done=0, total=0, started_at=datetime.now(timezone.utc).isoformat(), finished_at=None)
    db = session_factory()
    try:
        query = db.query(Finding.id, Finding.url).filter(Finding.url != "")
        if ids:
            query = query.filter(Finding.id.in_(ids))
        if pending_only:
            stale = datetime.now(timezone.utc) - timedelta(hours=RECHECK_SILENT_HOURS)
            query = query.filter(
                (Finding.link_status.in_(["", "sin_verificar"]))
                | (Finding.link_status.is_(None))
                | ((Finding.link_status == "sin_respuesta") & ((Finding.link_checked_at.is_(None)) | (Finding.link_checked_at < stale)))
            )
        rows = query.order_by(Finding.id.desc()).limit(limit).all()
        with _check_lock:
            _check_state["total"] = len(rows)
        by_host: dict[str, list] = {}
        for row in rows:
            by_host.setdefault((urlsplit(row.url).hostname or "").lower(), []).append(row)
        results: dict[int, tuple[str, int]] = {}

        def work(host_rows):
            out = []
            refused = 0
            for i, row in enumerate(host_rows):
                if refused >= CHECK_HOST_GIVE_UP or i >= CHECK_MAX_PER_HOST:
                    # El sitio esta rechazando visitas (o ya se le pidio bastante): insistir
                    # solo empeora el bloqueo. Lo que falta se reintenta mas tarde.
                    status, code = "sin_respuesta", 0
                else:
                    if i:
                        time.sleep(CHECK_HOST_PAUSE_S)
                    status, code, _final = check_url(row.url)
                    refused = refused + 1 if status in ("bloqueado", "sin_respuesta") else 0
                with _check_lock:
                    _check_state["done"] += 1
                out.append((row.id, status, code))
            return out

        with ThreadPoolExecutor(max_workers=CHECK_WORKERS, thread_name_prefix="link-check") as pool:
            for batch in pool.map(work, list(by_host.values())):
                for fid, status, code in batch:
                    results[fid] = (status, code)
        now = datetime.now(timezone.utc)
        counts: dict[str, int] = {}
        moved = 0
        sources = {s.id: s for s in db.query(Source).all()}
        for finding in db.query(Finding).filter(Finding.id.in_(list(results) or [0])).all():
            status, code = results[finding.id]
            finding.link_http = code
            finding.link_checked_at = now
            counts[status] = counts.get(status, 0) + 1
            if status == "caido" and code in GONE and _fall_back(db, finding, sources):
                # Ahora apunta a su pagina consultada: ese enlace esta sin verificar.
                finding.link_status = "sin_verificar"
                moved += 1
            else:
                finding.link_status = status
        if results:
            record_action(
                db,
                entity_type="findings",
                entity_id="link_check",
                action="link_check",
                new_value={"verificadas": len(results), "por_estado": counts, "pasadas_a_pagina_consultada": moved, "ejecutado_por": actor},
            )
        db.commit()
        if moved:
            from .events import bump_state_version

            bump_state_version(db)
        return {"checked": len(results), "por_estado": counts, "moved": moved}
    except Exception:  # noqa: BLE001
        log.exception("Verificacion de enlaces")
        db.rollback()
        return {"checked": 0, "error": True}
    finally:
        db.close()
        with _check_lock:
            _check_state.update(running=False, finished_at=datetime.now(timezone.utc).isoformat())


AUTO_CHECK_ACTOR = "sistema (automático)"


def auto_check(session_factory) -> bool:
    """Verifica solos los enlaces que aun no se han verificado. True si lanzo una tanda.

    Lo llama el vigilante de la cola con el sistema libre, por tandas de
    `AUTO_CHECK_BATCH`, hasta que no quede ninguno. `LINK_AUTO_CHECK=false` lo apaga.
    """
    from datetime import timedelta

    from .config import settings

    if not settings.link_auto_check or check_state()["running"]:
        return False
    db = session_factory()
    try:
        stale = datetime.now(timezone.utc) - timedelta(hours=RECHECK_SILENT_HOURS)
        pending = (
            db.query(Finding.id)
            .filter(Finding.url != "")
            .filter(
                (Finding.link_status.in_(["", "sin_verificar"]))
                | (Finding.link_status.is_(None))
                | ((Finding.link_status == "sin_respuesta") & ((Finding.link_checked_at.is_(None)) | (Finding.link_checked_at < stale)))
            )
            .first()
        )
    finally:
        db.close()
    if pending is None:
        return False
    _spawn(check_links, {"session_factory": session_factory, "limit": AUTO_CHECK_BATCH, "actor": AUTO_CHECK_ACTOR, "pending_only": True})
    return True


def _spawn(target, kwargs: dict) -> None:
    """Lanza la tanda en un hilo aparte (punto unico, para correrla en linea en las pruebas)."""
    threading.Thread(target=target, kwargs=kwargs, name="link-check-auto", daemon=True).start()


# --------------------------------------------------------------------------- #
#  Reporte por fuente
# --------------------------------------------------------------------------- #
def report(db: Session) -> dict:
    """Conteo por fuente del tipo de enlace y del estado de verificacion."""
    from sqlalchemy import func

    titles = {s.id: s.title for s in db.query(Source.id, Source.title).all()}
    rows = (
        db.query(Finding.source_id, Finding.link_type, Finding.link_status, func.count(Finding.id))
        .group_by(Finding.source_id, Finding.link_type, Finding.link_status)
        .all()
    )
    per: dict[int, dict] = {}
    totals = {"total": 0, "exacto": 0, "consulta": 0, "sin_enlace": 0, "sin_clasificar": 0, "caido": 0, "con_evidencia": 0}
    for source_id, link_type, link_status, n in rows:
        entry = per.setdefault(
            source_id,
            {"source_id": source_id, "source_title": titles.get(source_id, ""), "total": 0, "exacto": 0,
             "consulta": 0, "sin_enlace": 0, "sin_clasificar": 0, "caido": 0, "redirigido": 0, "bloqueado": 0},
        )
        key = link_type if link_type in LINK_TYPES else "sin_clasificar"
        entry[key] += n
        entry["total"] += n
        totals[key] += n
        totals["total"] += n
        if link_status in ("caido", "redirigido", "bloqueado"):
            entry[link_status] += n
            if link_status == "caido":
                totals["caido"] += n
    totals["con_evidencia"] = db.query(func.count(Finding.id)).filter(Finding.evidence.isnot(None)).scalar() or 0
    sources = sorted(per.values(), key=lambda e: (-(e["consulta"] + e["sin_enlace"]), e["source_title"].lower()))
    for entry in sources:
        entry["predominante"] = max(LINK_TYPES, key=lambda t: entry[t]) if entry["total"] else ""
    return {"totals": totals, "sources": sources, "labels": LINK_TYPE_LABELS, "status_labels": LINK_STATUS_LABELS}
