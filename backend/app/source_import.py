"""Importacion comparada de la matriz EH (Excel o Google Sheets) con sugerencias de IA.

Flujo del boton "Importar matriz" del catalogo de fuentes:

1. Lectura: el Excel "FUENTES DE INFORMACION PROACTIVA EH" subido, o una hoja de
   Google Sheets por URL (se descarga como .xlsx; la hoja debe estar compartida
   como "cualquier persona con el enlace" o publicada en la web). Se lee con el
   mismo `source_matrix.parse_workbook` que la importacion directa.
2. Comparacion con el inventario, fila por fila:
   - `nueva`: no hay fuente con su codigo de catalogo, su URL ni su dominio/nombre;
   - `cambios`: la fuente existe y la matriz trae valores distintos (nivel,
     prioridad, tipos, URLs de entrada, ruta de acceso, que consultar...);
   - `sin_cambios`;
   - `ausentes`: fuentes que vinieron de una matriz anterior y no estan en esta.
3. Deteccion sugerida para cada fila nueva: primero por reglas (adaptador por
   dominio, PDF, curaduria humana si hay login o pago, palabras guia de la ruta
   de acceso, alcance del sitio con un GET corto) y luego la IA, que revisa y
   ajusta el adaptador, el nivel de acceso, si conviene activar la ingesta y
   las palabras guia, con una justificacion. Sin IA quedan las reglas y la
   respuesta lo dice.
4. Aplicacion: la persona elige que crear y que actualizar. Nada se escribe en
   la comparacion; la comparacion queda en memoria `TOKEN_TTL_S` segundos.
"""
from __future__ import annotations

import re
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from . import source_matrix
from .models import Source

TOKEN_TTL_S = 3600
MAX_SHEET_BYTES = 10 * 1024 * 1024
MAX_AI_ROWS = 40
AI_BATCH = 12
REACH_WORKERS = 8

_GSHEET = re.compile(r"^https://docs\.google\.com/spreadsheets/d/(e/)?([A-Za-z0-9_-]{10,})", re.I)

# Campos que la matriz aporta a una fuente, con su etiqueta en la interfaz.
DIFF_FIELDS = {
    "source_level": "Nivel de fuente",
    "tech_types": "Tipos de tecnología",
    "entry_urls": "URLs de entrada",
    "reference_urls": "URLs de referencia",
    "material_type": "Tipo de material",
    "access_path": "Ruta de acceso",
    "consult_info": "Qué consultar",
    "observations": "Observaciones",
    "usage_restrictions": "Restricciones",
}

# Adaptador con API propia segun el dominio de la URL.
CONNECTOR_BY_HOST = (
    ("clinicaltrials.gov", "clinicaltrials"),
    ("pubmed.ncbi.nlm.nih.gov", "pubmed"),
    ("api.fda.gov", "fda"),
    ("health-products.canada.ca", "health_canada"),
    ("euclinicaltrials.eu", "ctis"),
    ("trialsearch.who.int", "who_ictrp"),
    ("pcori.org", "pcori_hs"),
)
API_CONNECTORS = {"clinicaltrials", "pubmed", "fda", "health_canada", "ctis", "who_ictrp", "pcori_hs", "ema", "file_feed"}
_MANUAL_HINT = re.compile(
    r"(suscripci|subscription|login|log in|registro previo|registrarse|password|contrase|pago|paid|"
    r"de pago|membres|member only|solo miembros|acceso restringido|sin acceso)",
    re.I,
)
_STRUCTURED_HINT = re.compile(r"(tabla|table|listado|base de datos|database|pipeline|registro de|buscador)", re.I)
_FEED_HINT = re.compile(r"\b(rss|atom|feed)\b", re.I)

DETECTION_LABELS = {
    "api": "API del adaptador",
    "rss": "Canal RSS",
    "html_recorrido": "Rastreo HTML con recorrido de fichas",
    "pdf": "Extracción de PDF",
    "manual": "Curaduría humana (sin ingesta automática)",
}

_lock = threading.Lock()
_cache: dict[str, dict] = {}


# --------------------------------------------------------------------------- #
#  Lectura
# --------------------------------------------------------------------------- #
def google_sheet_export_url(url: str) -> str:
    """URL de descarga .xlsx de una hoja de Google Sheets; '' si la URL no es de Sheets."""
    match = _GSHEET.match((url or "").strip())
    if not match:
        return ""
    published, key = match.group(1), match.group(2)
    if published:
        return f"https://docs.google.com/spreadsheets/d/e/{key}/pub?output=xlsx"
    return f"https://docs.google.com/spreadsheets/d/{key}/export?format=xlsx"


def fetch_google_sheet(url: str) -> bytes:
    """Descarga la hoja como .xlsx. Lanza ValueError con un mensaje para la persona."""
    export = google_sheet_export_url(url)
    if not export:
        raise ValueError(
            "La URL no es de Google Sheets. Use un enlace como https://docs.google.com/spreadsheets/d/…"
        )
    import httpx

    try:
        with httpx.Client(timeout=httpx.Timeout(40.0, connect=10.0), follow_redirects=True) as client:
            resp = client.get(export, headers={"User-Agent": "IETS-Escaneo-Horizonte/1.0"})
    except httpx.HTTPError as exc:
        raise ValueError(f"No se pudo descargar la hoja de Google Sheets ({type(exc).__name__}).") from exc
    content = resp.content or b""
    if resp.status_code in (401, 403) or (resp.status_code < 400 and not content.startswith(b"PK")):
        raise ValueError(
            "Google no entregó la hoja: compártala como «Cualquier persona con el enlace · Lector» "
            "(o publíquela en la web) y vuelva a intentar."
        )
    if resp.status_code == 404:
        raise ValueError("Google Sheets respondió 404: revise que el enlace de la hoja sea correcto.")
    if resp.status_code >= 400:
        raise ValueError(f"Google Sheets respondió HTTP {resp.status_code}.")
    if len(content) > MAX_SHEET_BYTES:
        raise ValueError("La hoja supera 10 MB.")
    return content


# --------------------------------------------------------------------------- #
#  Comparacion
# --------------------------------------------------------------------------- #
def _norm(url: str) -> str:
    from .catalog_service import normalize_url

    return normalize_url(url or "")


def _row_key(row: dict, index: int) -> str:
    return str(row.get("excel_row") or f"i{index}")


def _main_url(row: dict) -> str:
    urls = source_matrix.entry_urls_for(row)
    return urls[0] if urls else ""


def _match(row: dict, sources: list[Source], by_code: dict[str, Source], index: dict) -> tuple[Source | None, str]:
    from .source_discovery import match_existing

    for code in row.get("codes") or []:
        hit = by_code.get(code)
        if hit is not None:
            return hit, "codigo"
    urls = {_norm(u) for u in source_matrix.entry_urls_for(row) if u}
    urls.discard("")
    if urls:
        for source in sources:
            known = {_norm(source.url)} | {_norm(u) for u in (source.entry_urls or []) if isinstance(u, str)}
            if urls & known:
                return source, "url"
    name = (row.get("name") or "").strip().lower()
    for source in sources:
        if name and (source.title or "").strip().lower() == name:
            return source, "nombre"
    hit = match_existing(index, _main_url(row), row.get("name") or "")
    if hit and hit.get("source_id"):
        source = next((s for s in sources if s.id == hit["source_id"]), None)
        if source is not None:
            return source, hit.get("reason") or "dominio"
    return None, ""


def _code_siblings(row: dict, by_code: dict[str, Source], primary: Source) -> list[Source]:
    out = []
    for code in row.get("codes") or []:
        hit = by_code.get(code)
        if hit is not None and hit.id != primary.id and hit not in out:
            out.append(hit)
    return out


def _comparable(value):
    if isinstance(value, list):
        return sorted(_norm(v) if isinstance(v, str) and v.startswith("http") else str(v) for v in value)
    return (value or "").strip() if isinstance(value, str) else value


def _diff(source: Source, row: dict, primary: bool) -> list[dict]:
    fields = source_matrix.profile_fields(row, primary=primary)
    out = []
    for key, label in DIFF_FIELDS.items():
        if key not in fields:
            continue
        incoming = fields[key]
        current = getattr(source, key, None)
        if incoming in (None, "", []):
            continue  # la matriz no trae el dato: no se propone borrar lo que hay
        if key == "source_level" and incoming == "por_definir" and current:
            continue
        if _comparable(incoming) != _comparable(current):
            out.append({"field": key, "label": label, "current": current, "incoming": incoming})
    return out


def compare(db: Session, parsed: dict, *, origin: str, ai: bool = True, check_reach: bool = True) -> dict:
    """Compara la matriz leida con el inventario y sugiere la deteccion de lo nuevo."""
    from .source_discovery import build_index

    rows = parsed.get("rows") or []
    sources = db.query(Source).all()
    by_code = {s.catalog_code: s for s in sources if s.catalog_code}
    index = build_index(db)
    matched_ids: set[int] = set()
    new: list[dict] = []
    changed: list[dict] = []
    same: list[dict] = []
    for i, row in enumerate(rows):
        key = _row_key(row, i)
        source, reason = _match(row, sources, by_code, index)
        base = {
            "key": key,
            "excel_row": row.get("excel_row") or 0,
            "name": row.get("name") or "",
            "url": _main_url(row),
            "entity_label": row.get("entity_label") or "",
            "country": row.get("country") or "",
            "tech_types": row.get("tech_types") or [],
            "source_level": row.get("source_level") or "",
            "frequency": row.get("frequency") or "",
            "codes": row.get("codes") or [],
        }
        if source is None:
            new.append({**base, "suggestion": rule_suggestion(row)})
            continue
        matched_ids.add(source.id)
        primary = not row.get("codes") or (row.get("codes") or [""])[0] == source.catalog_code
        diffs = _diff(source, row, primary)
        # Los demas codigos de la fila son sub-servicios de la misma organizacion:
        # comparten la clasificacion y tampoco estan "ausentes".
        for other in _code_siblings(row, by_code, source):
            matched_ids.add(other.id)
            diffs += [{**d, "label": f"{d['label']} ({other.title})", "source_id": other.id}
                      for d in _diff(other, row, False)]
        entry = {
            **base,
            "source_id": source.id,
            "source_title": source.title,
            "match_reason": reason,
            "probable": reason in {"dominio", "nombre"} and not row.get("codes"),
        }
        if diffs:
            changed.append({**entry, "changes": diffs})
        else:
            same.append(entry)

    missing = [
        {"source_id": s.id, "title": s.title, "url": s.url, "matrix_ref": s.matrix_ref or ""}
        for s in sources
        if s.matrix_ref and s.id not in matched_ids and not s.retired
    ]

    if new and check_reach:
        _attach_reach(new)
    ai_note = ""
    if new and ai:
        ai_note = _ai_review(new, rows_by_key={_row_key(r, i): r for i, r in enumerate(rows)})
    elif new:
        ai_note = "IA no solicitada: sugerencias por reglas."

    token = _store(parsed, origin=origin)
    return {
        "token": token,
        "origin": origin,
        "sheet": parsed.get("sheet") or "",
        "rows": len(rows),
        "search_terms": len(parsed.get("search_terms") or []),
        "summary": {
            "nuevas": len(new),
            "cambios": len(changed),
            "sin_cambios": len(same),
            "ausentes": len(missing),
        },
        "new": new,
        "changed": changed,
        "unchanged": same,
        "missing": missing,
        "ai_note": ai_note,
        "detection_labels": DETECTION_LABELS,
    }


# --------------------------------------------------------------------------- #
#  Deteccion sugerida
# --------------------------------------------------------------------------- #
def _host(url: str) -> str:
    return (urlsplit(url or "").hostname or "").lower().removeprefix("www.")


def rule_suggestion(row: dict) -> dict:
    """Como deberia detectar senales el sistema en esta fuente, solo con reglas."""
    from . import source_profile

    url = _main_url(row)
    host = _host(url)
    hints = " ".join(
        str(row.get(k) or "")
        for k in ("interface", "restrictions", "format", "publication_structure", "access_path", "observations")
    )
    connector = "html"
    detection = "html_recorrido"
    access = "D"
    reasons: list[str] = []
    for domain, code in CONNECTOR_BY_HOST:
        if host == domain or host.endswith("." + domain):
            connector, detection, access = code, "api", "A"
            reasons.append(f"El dominio {domain} tiene adaptador con API ({code}).")
            break
    if connector == "html":
        if url.lower().endswith(".pdf"):
            connector, detection, access = "pdf", "pdf", "D"
            reasons.append("La URL principal es un PDF.")
        elif _MANUAL_HINT.search(hints):
            connector, detection, access = "manual", "manual", "E"
            reasons.append("La matriz indica acceso con registro, suscripción o pago: curaduría humana.")
        elif _FEED_HINT.search(hints):
            detection, access = "rss", "B"
            reasons.append("La matriz menciona un canal RSS: se lee como canal.")
        elif _STRUCTURED_HINT.search(hints):
            access = "C"
            reasons.append("Publica tablas o listados: rastreo HTML con recorrido de fichas.")
        else:
            reasons.append("Sin API conocida: rastreo HTML con recorrido de fichas y extracción con IA.")
    keywords = source_profile.access_path_keywords(row.get("access_path") or "", domain=host)
    return {
        "connector": connector,
        "detection": detection,
        "access_level": access,
        "enable_ingest": connector != "manual" and bool(url),
        "follow_keywords": keywords,
        "search_terms": [],
        "entry_urls": source_matrix.entry_urls_for(row)[1:6],
        "frequency": row.get("frequency") or "semanal",
        "rationale": " ".join(reasons),
        "origin": "reglas",
        "reach": None,
    }


def _attach_reach(new: list[dict]) -> None:
    """GET corto a cada URL nueva: un sitio que bloquea robots cambia la sugerencia."""
    from .source_discovery import check_reachable

    targets = [(i, r["url"]) for i, r in enumerate(new) if r.get("url")]

    def probe(item):
        i, url = item
        try:
            return i, check_reachable(url)
        except Exception as exc:  # noqa: BLE001
            return i, {"ok": False, "status": 0, "detail": type(exc).__name__}

    with ThreadPoolExecutor(max_workers=REACH_WORKERS) as pool:
        for i, reach in pool.map(probe, targets):
            sug = new[i]["suggestion"]
            sug["reach"] = reach
            status = int(reach.get("status") or 0)
            if sug["connector"] in ("html", "pdf") and status in (401, 403, 429):
                sug["rationale"] += (
                    f" El sitio responde HTTP {status} a robots: la vigilancia caerá al RSS de Google News "
                    "(solo titulares pertinentes). Si hay RSS oficial, agréguelo como URL de entrada."
                )
            elif sug["connector"] in ("html", "pdf") and not reach.get("ok"):
                sug["enable_ingest"] = False
                sug["rationale"] += f" No respondió ({reach.get('detail')}): revise la URL antes de activar la ingesta."


def _ai_review(new: list[dict], *, rows_by_key: dict[str, dict]) -> str:
    """La IA revisa la sugerencia por reglas de cada fila nueva. Devuelve una nota."""
    from . import ai_service, ingest
    from .ai_web import _loads_payload

    if not ai_service.is_enabled():
        return "IA no disponible: sugerencias por reglas. Actívela en Configuración › IA para una revisión asistida."
    connectors = "\n".join(
        f"- {c.code}: {c.label}. {c.description[:160]}" for c in ingest.all_connectors() if c.code != "fixture"
    ) + "\n- html: rastreo HTML de la página y sus fichas internas, con extracción por IA.\n- pdf: documento PDF."
    targets = new[:MAX_AI_ROWS]
    reviewed = 0
    for start in range(0, len(targets), AI_BATCH):
        batch = targets[start : start + AI_BATCH]
        listing = []
        for n, item in enumerate(batch):
            row = rows_by_key.get(item["key"], {})
            sug = item["suggestion"]
            reach = sug.get("reach") or {}
            listing.append(
                f"{n}. {item['name']} | {item['url'] or '(sin URL)'} | entidad: {item['entity_label']} | "
                f"pais: {item['country']} | tipos: {','.join(item['tech_types'])} | "
                f"material: {row.get('material_type', '')[:120]} | ruta: {row.get('access_path', '')[:200]} | "
                f"consultar: {row.get('consult_info', '')[:200]} | formato: {row.get('format', '')[:80]} | "
                f"interfaz: {row.get('interface', '')[:80]} | restricciones: {row.get('restrictions', '')[:120]} | "
                f"respuesta del sitio: {reach.get('detail', 'no verificada')} | "
                f"regla propone: {sug['connector']}/{sug['detection']}/nivel {sug['access_level']}"
            )
        prompt = (
            "Eres el curador de fuentes del sistema de escaneo de horizonte de tecnologias sanitarias del IETS "
            "(Colombia). Para cada fuente NUEVA de la matriz, decide como debe detectar senales el sistema.\n\n"
            f"Adaptadores disponibles:\n{connectors}\n\n"
            "Niveles de acceso: A=API estable, B=feed o descarga oficial, C=pagina estructurada (tablas/listados), "
            "D=pagina que confirma, E=curaduria humana.\n\n"
            "Fuentes nuevas:\n" + "\n".join(listing) + "\n\n"
            "Responde SOLO un JSON array con un objeto por fuente: index (numero de la lista), connector "
            "(codigo de la lista), detection (api|rss|html_recorrido|pdf|manual), access_level (A-E), "
            "enable_ingest (true/false), follow_keywords (hasta 8 palabras de navegacion en el idioma del sitio "
            "que lleven a fichas de tecnologias: pipeline, news, approvals...), search_terms (hasta 5 terminos "
            "de busqueda dentro del dominio), entry_url (URL mas especifica para entrar, si la conoces; si no, "
            "vacio), rationale (una o dos frases en espanol: por que asi y que riesgo hay)."
        )
        try:
            text, _model = ai_service.generate(
                prompt, system=ai_service.SYSTEM_ANALYST, temperature=0.2, max_tokens=2600, timeout=90
            )
        except Exception:  # noqa: BLE001
            continue
        if not text or text.startswith("[Error"):
            continue
        try:
            items = _loads_payload(re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.I))
        except Exception:  # noqa: BLE001
            continue
        for obj in items or []:
            if not isinstance(obj, dict):
                continue
            try:
                idx = int(obj.get("index"))
            except (TypeError, ValueError):
                continue
            if 0 <= idx < len(batch):
                _merge_ai(batch[idx]["suggestion"], obj, main_url=batch[idx]["url"])
                reviewed += 1
    if not reviewed:
        return "La IA no respondió con un formato legible: quedan las sugerencias por reglas."
    extra = f" Las {len(new) - len(targets)} restantes quedan por reglas." if len(new) > len(targets) else ""
    return f"La IA revisó {reviewed} de {len(new)} fuente(s) nueva(s).{extra}"


# Adaptadores que no arrancan sin configuracion propia (mapa de columnas, etc.):
# la IA puede recomendarlos, pero la fuente se crea con rastreo HTML y una nota.
NEEDS_CONFIG = {"file_feed": "Configure el adaptador «Descarga estructurada» con la URL del archivo y el mapa de columnas."}


def _merge_ai(sug: dict, obj: dict, *, main_url: str = "") -> None:
    from . import ingest

    known = {c.code for c in ingest.all_connectors() if c.code != "fixture"} | {"html", "pdf"}
    connector = str(obj.get("connector") or "").strip().lower()
    pending_note = ""
    if connector in NEEDS_CONFIG:
        pending_note = f" Recomendado: {connector}. {NEEDS_CONFIG[connector]}"
        connector = "html"
    if connector in known:
        sug["connector"] = connector
    detection = str(obj.get("detection") or "").strip().lower()
    if detection in DETECTION_LABELS:
        sug["detection"] = detection
    access = str(obj.get("access_level") or "").strip().upper()[:1]
    if access in {"A", "B", "C", "D", "E"}:
        sug["access_level"] = access
    if isinstance(obj.get("enable_ingest"), bool):
        sug["enable_ingest"] = obj["enable_ingest"] and sug["connector"] != "manual"
    for key, limit in (("follow_keywords", 8), ("search_terms", 5)):
        values = obj.get(key)
        if isinstance(values, list):
            merged = list(sug.get(key) or [])
            for v in values:
                text = re.sub(r"\s+", " ", str(v or "")).strip()[:80]
                if text and text.lower() not in {m.lower() for m in merged}:
                    merged.append(text)
            sug[key] = merged[: limit + 4]
    entry = str(obj.get("entry_url") or "").strip()
    known_urls = {_norm(u) for u in [main_url, *sug["entry_urls"]] if u}
    if entry.lower().startswith(("http://", "https://")) and _norm(entry) not in known_urls:
        sug["entry_urls"] = [entry, *sug["entry_urls"]][:6]
    if sug["connector"] in ("html", "pdf") and sug.get("detection") == "api":
        sug["detection"] = "html_recorrido"
    rationale = re.sub(r"\s+", " ", str(obj.get("rationale") or "")).strip()[:500]
    if rationale:
        sug["rationale"] = rationale
    sug["rationale"] = (sug["rationale"] + pending_note).strip()
    sug["origin"] = "ia"


# --------------------------------------------------------------------------- #
#  Cache de comparaciones y aplicacion
# --------------------------------------------------------------------------- #
def _store(parsed: dict, *, origin: str) -> str:
    token = secrets.token_urlsafe(16)
    now = time.monotonic()
    with _lock:
        for key in [k for k, v in _cache.items() if now - v["at"] > TOKEN_TTL_S]:
            _cache.pop(key, None)
        _cache[token] = {"parsed": parsed, "origin": origin, "at": now}
    return token


def _load(token: str) -> dict | None:
    with _lock:
        entry = _cache.get(token or "")
        if entry is None or time.monotonic() - entry["at"] > TOKEN_TTL_S:
            return None
        return entry


def apply(
    db: Session,
    token: str,
    *,
    create: list[dict],
    update: list[str],
    overwrite: bool,
    persist: bool,
    actor: str,
) -> dict:
    """Crea las filas nuevas elegidas y actualiza las fuentes con cambios elegidas."""
    from . import source_profile
    from .audit import record_action
    from .catalog import FREQ_HOURS
    from .catalog_service import MATRIX_IMPORT_MARK, _apply_catalog_fields, _category_for, human_edits
    from .source_discovery import build_index

    entry = _load(token)
    if entry is None:
        raise LookupError("La comparación expiró o no existe. Vuelva a cargar la matriz.")
    parsed = entry["parsed"]
    rows = parsed.get("rows") or []
    by_key = {_row_key(r, i): r for i, r in enumerate(rows)}
    sources = db.query(Source).all()
    by_code = {s.catalog_code: s for s in sources if s.catalog_code}
    index = build_index(db)
    edits = human_edits(db)

    updated: list[str] = []
    for key in update or []:
        row = by_key.get(str(key))
        if row is None:
            continue
        source, _reason = _match(row, sources, by_code, index)
        if source is None:
            continue
        primary = not row.get("codes") or row["codes"][0] == source.catalog_code
        targets = [(source, primary)] + [(o, False) for o in _code_siblings(row, by_code, source)]
        for target, is_primary in targets:
            _apply_catalog_fields(
                target,
                source_matrix.profile_fields(row, primary=is_primary),
                overwrite_admin=overwrite,
                edits=edits.get(target.id),
            )
            updated.append(target.title)

    created: list[str] = []
    skipped: list[str] = []
    for choice in create or []:
        row = by_key.get(str(choice.get("key")))
        if row is None:
            continue
        url = _norm(str(choice.get("url") or _main_url(row)))
        if not url.lower().startswith(("http://", "https://")):
            skipped.append(f"{row.get('name')}: sin URL válida")
            continue
        if any(_norm(s.url) == url for s in sources):
            skipped.append(f"{row.get('name')}: ya existe una fuente con esa URL")
            continue
        sug = {**rule_suggestion(row), **{k: v for k, v in choice.items() if v is not None}}
        connector = str(sug.get("connector") or "html").lower()
        category, entity_type = _category_for(row.get("entity_label") or "")
        freq = sug.get("frequency") or row.get("frequency") or "semanal"
        fields = source_matrix.profile_fields(row, primary=True)
        entry_urls = [u for u in (sug.get("entry_urls") or []) if isinstance(u, str) and u.startswith("http")]
        if entry_urls:
            fields["entry_urls"] = list(dict.fromkeys([*fields.get("entry_urls", []), *entry_urls]))[:20]
        profile = source_profile.normalize_profile(
            {"follow_keywords": sug.get("follow_keywords") or [], "search_terms": sug.get("search_terms") or []}
        )
        source = Source(
            title=str(choice.get("title") or row["name"])[:590],
            url=url[:1020],
            category=category,
            entity_type=entity_type,
            description=(row.get("consult_info") or row["name"])[:1000],
            relation_iets=f"Matriz EH ({row.get('matrix_ref', '')})"[:300],
            language=(row.get("language") or "Ingles")[:60],
            connector=connector,
            access_level=str(sug.get("access_level") or "D")[:1],
            sync_frequency=freq,
            scan_interval_hours=FREQ_HOURS.get(freq, 168),
            scrape_enabled=bool(sug.get("enable_ingest")) and connector != "manual",
            link_status="Activo",
            country=(row.get("country") or "")[:80],
            verification_status=MATRIX_IMPORT_MARK,
            catalog_note=(
                f"Creada al importar la matriz EH ({entry['origin']}). Detección sugerida "
                f"({sug.get('origin', 'reglas')}): {DETECTION_LABELS.get(sug.get('detection'), sug.get('detection'))}. "
                f"{sug.get('rationale', '')}"
            )[:2000],
            tags="matriz EH",
            scan_profile=profile,
            **fields,
        )
        db.add(source)
        sources.append(source)
        created.append(source.title)

    if persist and (created or updated):
        prev = source_matrix.DATA_FILE.with_suffix(".prev.json")
        if source_matrix.DATA_FILE.exists():
            prev.write_text(source_matrix.DATA_FILE.read_text(encoding="utf-8"), encoding="utf-8")
        source_matrix.write_data_file(parsed)
    summary = {
        "created": len(created),
        "updated": len(updated),
        "skipped": skipped,
        "created_titles": created,
        "updated_titles": updated,
        "persisted": bool(persist and (created or updated)),
        "origin": entry["origin"],
        "overwrite": overwrite,
    }
    record_action(
        db,
        entity_type="sources",
        entity_id="matrix",
        action="matrix_import_compare",
        new_value={k: v for k, v in summary.items() if k not in {"created_titles", "updated_titles"}},
    )
    db.commit()
    return summary
