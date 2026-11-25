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
}
# Parametros que delatan una pagina de resultados de busqueda o de formulario.
_SEARCH_PARAMS = {
    "q", "query", "search", "searchterm", "search_term", "term", "terms", "keyword", "keywords",
    "s", "k", "text", "texto", "buscar", "busqueda", "cond", "intr", "filter", "filters",
}
_SEARCH_PATH = re.compile(r"/(search|buscar|busqueda|results?|resultados|find)(/|$|\.)", re.I)
_FRAGMENT_ROUTE = re.compile(r"^/")
CHECK_TIMEOUT_S = 12
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
def check_url(url: str) -> tuple[str, int, str]:
    """(estado, codigo HTTP, URL final). Usa el mismo cliente que el rastreador."""
    import httpx

    from .ingest.base import shared_ssl_context
    from .scraper import BROWSER_HEADERS, is_internal_url

    if not url.lower().startswith(("http://", "https://")) or is_internal_url(url):
        return "caido", 0, ""
    try:
        with httpx.Client(follow_redirects=True, timeout=CHECK_TIMEOUT_S, headers=BROWSER_HEADERS, verify=shared_ssl_context()) as client:
            resp = client.get(url)
    except Exception:  # noqa: BLE001
        return "caido", 0, ""
    final = str(resp.url)
    code = resp.status_code
    if code in (401, 403, 429, 999):
        return "bloqueado", code, final
    if code >= 400:
        return "caido", code, final
    if _norm(final) != _norm(url) and urlsplit(final).path in ("", "/") and urlsplit(url).path not in ("", "/"):
        # Redirige a la portada: el item ya no existe en esa direccion.
        return "redirigido", code, final
    return "ok", code, final


_check_lock = threading.Lock()
_check_state: dict = {"running": False, "done": 0, "total": 0, "started_at": None, "finished_at": None}


def check_state() -> dict:
    with _check_lock:
        return dict(_check_state)


def check_links(session_factory, *, ids: list[int] | None = None, limit: int = 2000, actor: str = "sistema") -> dict:
    """Verifica los enlaces (en paralelo). Pensado para correr en un hilo aparte."""
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
        rows = query.order_by(Finding.id.desc()).limit(limit).all()
        with _check_lock:
            _check_state["total"] = len(rows)
        results: dict[int, tuple[str, int]] = {}

        def work(row):
            status, code, _final = check_url(row.url)
            with _check_lock:
                _check_state["done"] += 1
            return row.id, status, code

        with ThreadPoolExecutor(max_workers=CHECK_WORKERS, thread_name_prefix="link-check") as pool:
            for fid, status, code in pool.map(work, rows):
                results[fid] = (status, code)
        now = datetime.now(timezone.utc)
        counts: dict[str, int] = {}
        for finding in db.query(Finding).filter(Finding.id.in_(list(results) or [0])).all():
            status, code = results[finding.id]
            finding.link_status = status
            finding.link_http = code
            finding.link_checked_at = now
            counts[status] = counts.get(status, 0) + 1
        record_action(
            db,
            entity_type="findings",
            entity_id="link_check",
            action="link_check",
            new_value={"verificadas": len(results), "por_estado": counts, "ejecutado_por": actor},
        )
        db.commit()
        return {"checked": len(results), "por_estado": counts}
    except Exception:  # noqa: BLE001
        log.exception("Verificacion de enlaces")
        db.rollback()
        return {"checked": 0, "error": True}
    finally:
        db.close()
        with _check_lock:
            _check_state.update(running=False, finished_at=datetime.now(timezone.utc).isoformat())


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
