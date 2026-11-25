"""Ubicar la senal exacta dentro de su fuente y diagnosticar la matriz (RF-001).

`signal_links` separa la URL consultada de la URL de la senal y marca como
`consulta` las senales cuya fuente no dio un enlace propio. Este modulo da el
paso siguiente para cada una de esas senales:

1. **Enlace en la pagina.** Si la pagina consultada tiene un enlace cuyo texto
   es el nombre de la senal (la ficha, la noticia, el registro), esa es la URL
   exacta: la senal pasa a `exacto` y la URL anterior queda en la evidencia.
2. **Resaltado en la pagina.** Si la fuente publica la senal en una tabla o
   listado sin enlace por item (pipelines de fabricantes, tablas regulatorias),
   se arma un enlace con fragmento de texto (`#:~:text=`): abre la pagina y el
   navegador desplaza y resalta la senal. Solo se arma si el texto se encontro
   en la pagina descargada; si no, no se inventa nada.
3. **Sin ubicar.** Queda la evidencia de captura y el motivo.

Con esos resultados, `diagnose` dice por fuente si el equipo tecnico debe
mejorar la URL en la matriz (portada, buscador, URL caida, contenido que carga
con JavaScript) o si la fuente simplemente no ofrece enlace por item.

Nada borra la URL capturada: la anterior queda en `evidence.resolved.previous_url`.
"""
from __future__ import annotations

import logging
import re
import threading
import unicodedata
from datetime import datetime, timezone
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

from sqlalchemy.orm import Session

from . import signal_links
from .models import Finding, Source, Technology

log = logging.getLogger(__name__)

# Coincidencia minima entre el nombre de la senal y el texto del enlace.
ANCHOR_MIN_SCORE = 90
MIN_NAME_CHARS = 5
# Un fragmento de texto largo es fragil (espacios, saltos): se usa el inicio.
LOCATOR_MAX_CHARS = 80
_SKIP_HREF = re.compile(r"^(mailto:|tel:|javascript:|#$)", re.I)
_SKIP_EXT = re.compile(r"\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|mp4|mp3|zip)(\?|$)", re.I)

METHOD_LABELS = {
    "enlace_en_pagina": "Enlace exacto encontrado en la página de la fuente",
    "resaltado": "La página abre y resalta la señal (la fuente no tiene enlace por ítem)",
    "sin_ubicar": "No se pudo ubicar la señal en la página",
    "enlace_del_registro": "Enlace exacto a la ficha del registro oficial",
}


# --------------------------------------------------------------------------- #
#  Texto
# --------------------------------------------------------------------------- #
def fold(text: str) -> str:
    """Minusculas, sin tildes y con espacios simples (para comparar)."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().lower()


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def signal_names(finding: Finding) -> list[str]:
    """Nombres con los que buscar la senal en su pagina, del mas especifico al mas general."""
    names: list[str] = []
    for raw in (finding.technology or "", finding.title or ""):
        value = _clean(raw)
        if not value:
            continue
        names.append(value)
        # Titulos compactos de pipeline: "Producto · indicacion · fase".
        for sep in (" · ", " | ", " – ", " - ", ": ", " ("):
            if sep in value:
                head = value.split(sep, 1)[0].strip()
                if head:
                    names.append(head)
    out: list[str] = []
    for name in names:
        if len(name) >= MIN_NAME_CHARS and name not in out:
            out.append(name)
    return out


# --------------------------------------------------------------------------- #
#  Indice de una pagina
# --------------------------------------------------------------------------- #
def keyfold(text: str) -> str:
    """Como `fold`, sin signos: "AAA601 – Lutathera™" y "Lutathera (AAA601)" comparten palabras."""
    # Marcas (™, ®) fuera antes de normalizar: NFKD convierte "™" en "TM" y pega "LutatheraTM".
    text = re.sub(r"[™®©℠]", " ", text or "")
    return re.sub(r"\s+", " ", re.sub(r"[^0-9a-z]+", " ", fold(text))).strip()


def _tokens(text: str) -> set[str]:
    return set(keyfold(text).split())


def _structured_items(node, out: list[dict]) -> None:
    """Elementos con nombre y URL propia dentro de un bloque JSON-LD (Drug, Product, Article...)."""
    if isinstance(node, dict):
        name = node.get("name")
        url = node.get("url") or node.get("@id")
        if isinstance(name, str) and isinstance(url, str) and url.startswith(("http://", "https://", "/", "#")):
            context = " ".join(
                str(node.get(k) or "") for k in ("description", "alternateName", "indication", "disease", "headline")
                if isinstance(node.get(k), str)
            )
            out.append({"name": name, "url": url, "context": context})
        for value in node.values():
            _structured_items(value, out)
    elif isinstance(node, list):
        for value in node:
            _structured_items(value, out)


class PageIndex:
    """Enlaces, datos estructurados y texto plano de una pagina, listos para buscar senales.

    Cada candidato es (texto visible o nombre, URL, contexto). El contexto (la
    URL y la descripcion) sirve para desempatar productos con el mismo nombre,
    p. ej. un medicamento con una fila por indicacion en un pipeline.
    """

    def __init__(self, html: str, base_url: str):
        import json

        from bs4 import BeautifulSoup

        self.base_url = base_url
        self.anchors: list[tuple[str, str, str]] = []
        soup = BeautifulSoup(html or "", "lxml")
        # Datos estructurados: muchas fuentes (p. ej. pipelines de fabricantes) publican
        # ahi la URL propia de cada producto aunque la tabla visible no tenga enlaces.
        for script in soup.find_all("script", attrs={"type": re.compile(r"ld\+json", re.I)}):
            try:
                data = json.loads(script.string or script.get_text() or "")
            except (ValueError, TypeError):
                continue
            items: list[dict] = []
            _structured_items(data, items)
            for item in items:
                href = urljoin(base_url, item["url"])
                self.anchors.append((_clean(item["name"]), href, f"{item['context']} {href}"))
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        for a in soup.find_all("a", href=True):
            href = (a.get("href") or "").strip()
            if not href or _SKIP_HREF.match(href) or _SKIP_EXT.search(href):
                continue
            label = _clean(a.get_text(" ", strip=True)) or _clean(a.get("title") or "") or _clean(a.get("aria-label") or "")
            if len(label) < 3:
                continue
            absolute = urljoin(base_url, href)
            parent = a.find_parent(["tr", "li", "article"])
            context = _clean(parent.get_text(" ", strip=True))[:400] if parent is not None else ""
            self.anchors.append((label, absolute, f"{context} {absolute}"))
        self.text = _clean(soup.get_text(" ", strip=True))
        self.folded = fold(self.text)

    def contains(self, name: str) -> bool:
        return bool(name) and fold(name) in self.folded


def _same_page(a: str, b: str) -> bool:
    return signal_links._norm(a) == signal_links._norm(b)  # noqa: SLF001


def _is_page_itself(href: str, query_url: str) -> bool:
    """La misma pagina sin ancla propia (un ancla #item si lleva al punto de la senal)."""
    if not _same_page(href, query_url):
        return False
    fragment = urlsplit(href).fragment or ""
    return not fragment or fragment.startswith(("/", ":~:"))


def _name_score(name: str, label: str) -> int:
    from rapidfuzz import fuzz

    a, b = keyfold(name), keyfold(label)
    if not a or not b:
        return 0
    if a == b:
        return 100
    # Todas las palabras del nombre deben estar en el texto (en cualquier orden).
    if _tokens(name) <= _tokens(label):
        return int(fuzz.token_set_ratio(a, b))
    return min(int(fuzz.token_set_ratio(a, b)), int(fuzz.ratio(a, b)))


def _context_score(title: str, context: str) -> int:
    from rapidfuzz import fuzz

    if not title or not context:
        return 0
    joined_title = keyfold(title).replace(" ", "")
    joined_ctx = keyfold(context).replace(" ", "")
    return max(int(fuzz.token_set_ratio(keyfold(title), keyfold(context))), int(fuzz.partial_ratio(joined_title, joined_ctx)))


def match_anchor(
    names: list[str], index: PageIndex, source: Source | None, query_url: str, *, title: str = ""
) -> tuple[str, int] | None:
    """URL exacta de la senal si la pagina la enlaza con su nombre; None si no hay o es ambigua."""
    best: dict[str, tuple[int, int]] = {}
    for label, href, context in index.anchors:
        if _is_page_itself(href, query_url):
            continue
        folded_label = keyfold(label)
        for name in names:
            folded_name = keyfold(name)
            # Un enlace de menu largo ("Ver todos los productos de oncologia...") no es la ficha.
            if not folded_name or len(folded_label) > 3 * len(folded_name) + 40:
                continue
            score = _name_score(name, label)
            if score >= ANCHOR_MIN_SCORE:
                tie = _context_score(title, f"{label} {context}")
                previous = best.get(href, (0, 0))
                best[href] = max(previous, (score, tie))
            if score == 100:
                break
    if not best:
        return None
    ranked = sorted(best.items(), key=lambda kv: (-kv[1][0], -kv[1][1]))
    href, (score, tie) = ranked[0]
    if len(ranked) > 1:
        other, (o_score, o_tie) = ranked[1]
        # Dos fichas distintas con el mismo nombre: se desempata por el contexto
        # (indicacion, fase); si tampoco se distinguen, no se adivina.
        if o_score == score and not _same_page(other, href) and tie - o_tie < 5:
            return None
        if o_score == score and _same_page(other, href) and urlsplit(other).fragment != urlsplit(href).fragment and tie - o_tie < 5:
            return None
    if signal_links.classify(href, source, query_url) != "exacto":
        return None
    return href, score


def _fragment_encode(text: str) -> str:
    # En la directiva de texto, "-", "," y "&" son delimitadores: van codificados.
    return quote(text, safe="").replace("-", "%2D")


def text_locator(names: list[str], index: PageIndex, query_url: str) -> tuple[str, str] | None:
    """Enlace que abre la pagina y resalta la senal, si su nombre esta en el texto de la pagina."""
    parts = urlsplit(query_url or "")
    if not parts.scheme.startswith("http") or parts.fragment:
        # Las rutas de aplicacion (#/...) no admiten la directiva de texto.
        return None
    for name in sorted(names, key=len):
        if not index.contains(name):
            continue
        pattern = r"\s+".join(re.escape(w) for w in name.split())
        found = re.search(pattern, index.text, re.I)
        text = found.group(0) if found else name
        if len(text) > LOCATOR_MAX_CHARS:
            cut = text[:LOCATOR_MAX_CHARS].rsplit(" ", 1)[0]
            text = cut or text[:LOCATOR_MAX_CHARS]
        base = urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))
        return f"{base}#:~:text={_fragment_encode(text)}", text
    return None


# --------------------------------------------------------------------------- #
#  Aplicar a una senal
# --------------------------------------------------------------------------- #
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _set_evidence(finding: Finding, **fields) -> None:
    evidence = dict(finding.evidence or {}) if isinstance(finding.evidence, dict) else {}
    evidence.update(fields)
    finding.evidence = evidence  # se reasigna: SQLAlchemy no ve cambios dentro del dict


def resolve_finding(db: Session, finding: Finding, source: Source | None, index: PageIndex | None, query_url: str, *, reason: str = "") -> str:
    """Intenta ubicar una senal de `consulta`. Devuelve el metodo aplicado."""
    names = signal_names(finding)
    if index is not None and names:
        hit = match_anchor(names, index, source, query_url, title=finding.title or "")
        if hit:
            href, score = hit
            previous = finding.url or ""
            finding.url = href[:1024]
            finding.link_type = "exacto"
            finding.link_status = "sin_verificar"
            _set_evidence(
                finding,
                resolved={
                    "method": "enlace_en_pagina",
                    "label": METHOD_LABELS["enlace_en_pagina"],
                    "score": score,
                    "previous_url": previous,
                    "at": _now().isoformat(),
                },
            )
            for tech in db.query(Technology).filter(Technology.finding_id == finding.id).all():
                tech.url = finding.url
            return "enlace_en_pagina"
        locator = text_locator(names, index, query_url)
        if locator:
            url, text = locator
            _set_evidence(
                finding,
                locator_url=url,
                locator_text=text,
                resolved={
                    "method": "resaltado",
                    "label": METHOD_LABELS["resaltado"],
                    "at": _now().isoformat(),
                },
            )
            return "resaltado"
    why = reason or (
        "La página no trae el nombre de la señal en su HTML (es probable que cargue su contenido con JavaScript)."
        if index is not None
        else "La página consultada no respondió al ubicar la señal."
    )
    _set_evidence(
        finding,
        resolved={"method": "sin_ubicar", "label": METHOD_LABELS["sin_ubicar"], "reason": why, "at": _now().isoformat()},
    )
    return "sin_ubicar"


def resolve_with_pages(db: Session, source: Source | None, findings: list[Finding], pages: dict[str, str]) -> dict:
    """Resuelve senales recien capturadas con el HTML que el rastreo ya descargo (sin red)."""
    counts = {"enlace_en_pagina": 0, "resaltado": 0, "sin_ubicar": 0}
    indexes: dict[str, PageIndex] = {}
    for finding in findings:
        if finding.link_type != "consulta":
            continue
        query_url = finding.query_url or (source.url if source else "") or ""
        html = pages.get(query_url)
        if html is None:
            key = signal_links._norm(query_url)  # noqa: SLF001
            html = next((h for u, h in pages.items() if signal_links._norm(u) == key), None)  # noqa: SLF001
        if not html:
            continue
        if query_url not in indexes:
            indexes[query_url] = PageIndex(html, query_url)
        counts[resolve_finding(db, finding, source, indexes[query_url], query_url)] += 1
    return counts


# --------------------------------------------------------------------------- #
#  Corrida sobre las senales ya capturadas (en segundo plano)
# --------------------------------------------------------------------------- #
_lock = threading.Lock()
_state: dict = {"running": False, "done": 0, "total": 0, "pages": 0, "counts": {}, "started_at": None, "finished_at": None, "error": ""}


def state() -> dict:
    with _lock:
        out = dict(_state)
        out["counts"] = dict(_state["counts"])
        return out


def pending_groups(
    db: Session, *, source_ids: list[int] | None = None, retry: bool = False, untried: bool = False
) -> dict[tuple[int, str], list[int]]:
    """Senales de `consulta` agrupadas por (fuente, pagina consultada).

    Con `untried` solo entran las que nunca se intentaron ubicar (corrida automatica):
    las que ya quedaron «sin ubicar» no se vuelven a descargar solas.
    """
    query = db.query(Finding.id, Finding.source_id, Finding.query_url, Finding.url, Finding.evidence).filter(
        Finding.link_type == "consulta"
    )
    if source_ids:
        query = query.filter(Finding.source_id.in_(source_ids))
    groups: dict[tuple[int, str], list[int]] = {}
    for fid, sid, qurl, url, evidence in query.all():
        method = (evidence.get("resolved") or {}).get("method") if isinstance(evidence, dict) else None
        if untried and method:
            continue
        if method == "resaltado" and not retry:
            continue
        page = qurl or url or ""
        if not page.lower().startswith(("http://", "https://")):
            continue
        groups.setdefault((sid, page), []).append(fid)
    return groups


PAGE_BATCH = 8


def resolve_all(
    session_factory, *, actor: str = "sistema", source_ids: list[int] | None = None, retry: bool = False,
    untried: bool = False,
) -> dict:
    """Descarga cada pagina consultada una vez y ubica sus senales. Pensado para un hilo aparte.

    Trabaja por lotes de `PAGE_BATCH` paginas: descarga, ubica, guarda y suelta el
    HTML antes del lote siguiente, para no tener todas las paginas en memoria a la
    vez (Render tiene 512 MB).
    """
    from concurrent.futures import ThreadPoolExecutor

    from .audit import record_action
    from .scraper import fetch_many

    with _lock:
        if _state["running"]:
            return state()
        _state.update(running=True, done=0, total=0, pages=0, counts={}, started_at=_now().isoformat(), finished_at=None, error="")
    db = session_factory()
    try:
        groups = pending_groups(db, source_ids=source_ids, retry=retry, untried=untried)
        with _lock:
            _state["total"] = sum(len(v) for v in groups.values())
            _state["pages"] = len(groups)
        sources = {s.id: s for s in db.query(Source).filter(Source.id.in_([k[0] for k in groups] or [0])).all()}
        by_page: dict[str, list[tuple[int, list[int]]]] = {}
        for (sid, page), ids in groups.items():
            by_page.setdefault(page, []).append((sid, ids))
        pages = list(by_page)
        counts = {"enlace_en_pagina": 0, "resaltado": 0, "sin_ubicar": 0}
        # Descarga en lotes paralelos (misma politica que el rastreo).
        for i in range(0, len(pages), PAGE_BATCH):
            batch = pages[i : i + PAGE_BATCH]
            html_by_page: dict[str, str] = {}
            for url, result, _ms, _err in fetch_many(batch, 20.0):
                if result and 0 < result[0] < 400 and result[2]:
                    html_by_page[url] = result[2]
            for page in batch:
                html = html_by_page.pop(page, None)
                index = PageIndex(html, page) if html else None
                for sid, ids in by_page[page]:
                    for finding in db.query(Finding).filter(Finding.id.in_(ids)).all():
                        method = resolve_finding(db, finding, sources.get(sid), index, page)
                        counts[method] += 1
                        with _lock:
                            _state["done"] += 1
                            _state["counts"] = dict(counts)
                db.commit()
        record_action(
            db,
            entity_type="findings",
            entity_id="link_resolve",
            action="link_resolve",
            new_value={"por_metodo": counts, "paginas": len(groups), "ejecutado_por": actor},
        )
        db.commit()
        from .events import bump_state_version

        bump_state_version(db)
        return {"counts": counts, "pages": len(groups)}
    except Exception as exc:  # noqa: BLE001
        log.exception("Ubicacion de senales exactas")
        db.rollback()
        with _lock:
            _state["error"] = f"{type(exc).__name__}: {exc}"[:240]
        return {"error": True}
    finally:
        db.close()
        with _lock:
            _state.update(running=False, finished_at=_now().isoformat())


def start(
    session_factory, *, actor: str, source_ids: list[int] | None = None, retry: bool = False, untried: bool = False
) -> dict:
    with _lock:
        if _state["running"]:
            return state()
    threading.Thread(
        target=resolve_all,
        kwargs={"session_factory": session_factory, "actor": actor, "source_ids": source_ids, "retry": retry,
                "untried": untried},
        name="link-resolve",
        daemon=True,
    ).start()
    return state()


AUTO_ACTOR = "sistema (automático)"
AUTO_MAX_RUNS = 3
_auto_runs = 0


def auto_start(session_factory) -> bool:
    """Ubica sola las senales que nunca se intentaron ubicar. True si lanzo la corrida.

    El equipo no tiene que pulsar (Ubicar señales exactas): las senales capturadas
    antes de esta funcion se ubican en segundo plano cuando el sistema esta libre
    (lo llama el vigilante de la cola). Cada senal se intenta una sola vez, asi que
    un reinicio no repite descargas; el boton sigue sirviendo para reintentar.
    `LINK_AUTO_RESOLVE=false` lo apaga.
    """
    global _auto_runs
    from .config import settings

    if not settings.link_auto_resolve or _auto_runs >= AUTO_MAX_RUNS:
        return False
    with _lock:
        if _state["running"]:
            return False
    from . import corroboration

    db = session_factory()
    try:
        # Con una vigilancia en curso no se compite por la red ni por la base.
        if corroboration.scan_in_progress(db):
            return False
        pending = pending_groups(db, untried=True)
    finally:
        db.close()
    if not pending:
        return False
    _auto_runs += 1
    log.info("Ubicacion automatica de senales: %s pagina(s) por revisar.", len(pending))
    start(session_factory, actor=AUTO_ACTOR, untried=True)
    return True


# --------------------------------------------------------------------------- #
#  Senales de registros oficiales: del buscador a la ficha del producto
# --------------------------------------------------------------------------- #
_REGISTRY_HOSTS = ("health-products.canada.ca", "accessdata.fda.gov", "euclinicaltrials.eu")
_CTIS_ID = re.compile(r"^\d{4}-\d{6}-\d{2}-\d{2}$")


def registry_url(raw_payload: dict | None) -> str:
    """Ficha propia de una senal de conector oficial, a partir de su registro original ('' si no aplica)."""
    if not isinstance(raw_payload, dict):
        return ""
    row = raw_payload.get("payload") if isinstance(raw_payload.get("payload"), dict) else {}
    connector = raw_payload.get("connector") or ""
    if connector == "health_canada" and row.get("drug_code"):
        from .ingest.health_canada import HealthCanadaConnector

        return HealthCanadaConnector.drug_url(row.get("drug_code"))
    if connector == "fda":
        from .ingest import fda

        if row.get("k_number"):
            return fda.device_url(row, "device/510k")
        if row.get("pma_number"):
            return fda.device_url(row, "device/pma")
        if row.get("application_number"):
            return fda.drug_url(row.get("application_number"))
    if connector == "ctis" and _CTIS_ID.match(str(raw_payload.get("external_id") or "")):
        from .ingest.ctis import trial_url

        return trial_url(str(raw_payload["external_id"]))
    return ""


def repair_registry_links(db: Session, *, actor: str = "sistema") -> dict:
    """Corrige las senales de la FDA y de Health Canada que abrian el buscador o una pagina rota.

    El identificador del producto esta en el registro original de cada senal: con
    el se arma la URL de su ficha. La URL anterior queda en la evidencia. Las que
    no tienen ficha propia dejan de presentarse como «enlace exacto». Es
    idempotente: corre en cada arranque y solo toca lo que falta.
    """
    from sqlalchemy import or_

    from .audit import record_action

    rows = (
        db.query(Technology, Finding)
        .join(Finding, Finding.id == Technology.finding_id)
        .filter(or_(*[Finding.url.like(f"%{host}%") for host in _REGISTRY_HOSTS]))
        .all()
    )
    sources = {s.id: s for s in db.query(Source).filter(Source.id.in_({f.source_id for _t, f in rows} or {0})).all()}
    fixed = reclassified = 0
    for tech, finding in rows:
        source = sources.get(finding.source_id)
        target = registry_url(tech.raw_payload if isinstance(tech.raw_payload, dict) else None)
        current = finding.url or ""
        if target and signal_links.classify(target, source, finding.query_url or "") == "exacto" and not _same_page(target, current):
            if (tech.url or "") in ("", current):
                tech.url = target[:1024]
            finding.url = target[:1024]
            finding.link_type = "exacto"
            finding.link_status = "sin_verificar"
            _set_evidence(
                finding,
                resolved={
                    "method": "enlace_del_registro",
                    "label": METHOD_LABELS["enlace_del_registro"],
                    "previous_url": current,
                    "at": _now().isoformat(),
                },
            )
            fixed += 1
            continue
        kind = signal_links.classify(current, source, finding.query_url or "")
        if kind != (finding.link_type or ""):
            finding.link_type = kind
            reclassified += 1
    if fixed or reclassified:
        record_action(
            db,
            entity_type="findings",
            entity_id="link_registry",
            action="link_registry_repair",
            new_value={"con_ficha_propia": fixed, "reclasificadas": reclassified, "ejecutado_por": actor},
        )
        db.commit()
    return {"fixed": fixed, "reclassified": reclassified}


# --------------------------------------------------------------------------- #
#  Diagnostico por fuente: ¿hay que mejorar la matriz?
# --------------------------------------------------------------------------- #
DIAGNOSIS = {
    "ok": ("Enlaces exactos", False, "Las señales llevan a su ficha o artículo. No requiere cambios en la matriz."),
    "sin_enlace_por_item": (
        "La fuente no tiene enlace por ítem",
        False,
        "La fuente publica sus señales en una tabla o listado sin enlace propio. El sistema abre la página y resalta "
        "la señal. No requiere cambio en la matriz.",
    ),
    "actualizar_url": (
        "Actualizar la URL en la matriz",
        True,
        "La URL de la matriz no responde, redirige o ya no existe. Registre la dirección vigente de la sección.",
    ),
    "portada": (
        "La matriz apunta a la portada",
        True,
        "La URL de la matriz es la página principal del sitio. Registre la URL de la sección donde se publican "
        "las novedades (listado de noticias, pipeline, aprobaciones o informes).",
    ),
    "buscador": (
        "La matriz apunta a un buscador",
        True,
        "La URL es un buscador o formulario: el resultado cambia en cada consulta. Registre una URL de listado fija, "
        "un canal RSS o una descarga oficial.",
    ),
    "no_ubicable": (
        "La señal no se puede ubicar en la página",
        True,
        "La página no deja ubicar la señal (carga su contenido con JavaScript o cambió). Registre una URL más "
        "específica (listado, RSS o descarga) o pase la fuente a consulta manual.",
    ),
    "sin_verificar": (
        "Falta ubicar las señales",
        False,
        "Pulse «Ubicar señales exactas» para que el sistema busque el enlace o el texto de cada señal en su página.",
    ),
    "sin_senales": ("Sin señales todavía", False, "La fuente aún no tiene señales capturadas."),
}


def _url_shape(url: str) -> str:
    parts = urlsplit(url or "")
    if not parts.scheme:
        return ""
    route = parts.fragment if (parts.fragment or "").startswith("/") else ""
    if parts.path in ("", "/") and not parts.query and not route:
        return "portada"
    if signal_links.classify(url, None, "") == "consulta":
        return "buscador"
    return ""


def diagnose(db: Session) -> dict:
    """Por fuente: como quedaron sus enlaces y si conviene mejorar la URL en la matriz."""
    sources = (
        db.query(Source)
        .filter(Source.retired.is_(False), Source.catalog_active.isnot(False))
        .order_by(Source.title)
        .all()
    )
    stats: dict[int, dict] = {}
    rows = db.query(Finding.source_id, Finding.link_type, Finding.link_status, Finding.evidence).all()
    for sid, link_type, link_status, evidence in rows:
        entry = stats.setdefault(
            sid,
            {"total": 0, "exacto": 0, "consulta": 0, "sin_enlace": 0, "resaltado": 0, "enlace_en_pagina": 0,
             "sin_ubicar": 0, "sin_intento": 0, "caido": 0},
        )
        entry["total"] += 1
        key = link_type if link_type in ("exacto", "consulta", "sin_enlace") else "consulta"
        entry[key] += 1
        method = ((evidence or {}).get("resolved") or {}).get("method") if isinstance(evidence, dict) else None
        if method in ("resaltado", "enlace_en_pagina", "sin_ubicar"):
            entry[method] += 1
        elif key == "consulta":
            entry["sin_intento"] += 1
        if link_status in ("caido", "redirigido"):
            entry["caido"] += 1
    out = []
    totals = {code: 0 for code in DIAGNOSIS}
    for s in sources:
        e = stats.get(s.id) or {"total": 0, "exacto": 0, "consulta": 0, "sin_enlace": 0, "resaltado": 0,
                                "enlace_en_pagina": 0, "sin_ubicar": 0, "sin_intento": 0, "caido": 0}
        probe = (s.health_status or "").lower()
        detail = s.last_probe_detail if isinstance(s.last_probe_detail, dict) else {}
        gone = probe == "rojo" or (probe == "ambar" and "ya no existe" in str(detail.get("message") or ""))
        shape = _url_shape(s.url or "")
        located = e["exacto"] + e["resaltado"]
        if e["total"] == 0:
            code = "actualizar_url" if gone else "sin_senales"
        elif gone or (e["caido"] and e["caido"] * 3 >= e["total"]):
            code = "actualizar_url"
        elif e["exacto"] >= 0.8 * e["total"]:
            code = "ok"
        elif located >= 0.8 * e["total"]:
            code = "sin_enlace_por_item"
        elif e["sin_intento"] and e["sin_intento"] >= e["sin_ubicar"]:
            code = "sin_verificar"
        elif shape in ("portada", "buscador"):
            code = shape
        else:
            code = "no_ubicable"
        label, change, advice = DIAGNOSIS[code]
        totals[code] += 1
        out.append(
            {
                "source_id": s.id,
                "source_title": s.title or "",
                "url": s.url or "",
                "matrix_ref": s.matrix_ref or "",
                "connector": s.connector or "",
                "probe_status": probe,
                "total": e["total"],
                "exacto": e["exacto"],
                "resaltado": e["resaltado"],
                "sin_ubicar": e["sin_ubicar"] + e["sin_intento"],
                "sin_enlace": e["sin_enlace"],
                "caido": e["caido"],
                "code": code,
                "label": label,
                "matrix_change": change,
                "advice": advice,
            }
        )
    out.sort(key=lambda r: (not r["matrix_change"], r["code"] == "sin_senales", r["source_title"].lower()))
    return {
        "sources": out,
        "totals": totals,
        "matrix_changes": sum(1 for r in out if r["matrix_change"]),
        "labels": {k: v[0] for k, v in DIAGNOSIS.items()},
    }


def build_diagnosis_xlsx(db: Session) -> tuple[bytes, str]:
    from .xlsx_report import Column, Sheet, build_workbook, stamp

    data = diagnose(db)
    rows = [
        [
            r["source_title"],
            r["url"],
            r["matrix_ref"],
            "Sí" if r["matrix_change"] else "No",
            r["label"],
            r["advice"],
            r["total"],
            r["exacto"],
            r["resaltado"],
            r["sin_ubicar"],
            r["caido"],
        ]
        for r in data["sources"]
    ]
    sheet = Sheet(
        "Diagnóstico por fuente",
        [
            Column("Fuente", 46, wrap=True),
            Column("URL en la matriz", 50, kind="url"),
            Column("Referencia en la matriz", 24),
            Column("¿Mejorar la matriz?", 12),
            Column("Diagnóstico", 30, wrap=True),
            Column("Qué hacer", 70, wrap=True),
            Column("Señales", 9, kind="number"),
            Column("Con enlace exacto", 10, kind="number"),
            Column("Abre y resalta la señal", 10, kind="number"),
            Column("Sin ubicar", 9, kind="number"),
            Column("Enlace caído", 9, kind="number"),
        ],
        rows,
        note=(
            f"{data['matrix_changes']} fuente(s) requieren mejorar la URL en la matriz. Las que no, ya llevan a la señal "
            "exacta o abren la página resaltándola."
        ),
    )
    info = [
        ("Enlace exacto", "La señal abre su propia ficha, noticia o registro."),
        ("Abre y resalta la señal", "La fuente no tiene enlace por ítem: el enlace abre la página y el navegador resalta la señal (Chrome, Edge, Safari y Firefox recientes)."),
        ("Sin ubicar", "La señal no se encontró en la página: queda la evidencia de captura (título, fragmento, fecha y URL consultada)."),
    ]
    return build_workbook([sheet], title="Diagnóstico de enlaces por fuente (RF-001)", info=info), f"diagnostico_enlaces_matriz_{stamp()}.xlsx"
