"""Base de conocimiento de busqueda: las paginas utiles de cada fuente.

Los buscadores gratuitos (Yahoo, Bing, DuckDuckGo) responden con bloqueo cuando
la consulta sale de un servidor en la nube: en Render la busqueda web traia cero
resultados y cada fuente perdia cerca de un minuto esperandolos.

Esta base guarda lo que una busqueda ya encontro, venga de donde venga:

- del paquete que viaja con el codigo (`data/base_busqueda_eh.json`), armado con
  `scripts/build_search_knowledge.py` desde un equipo donde los buscadores si
  responden;
- de una busqueda en vivo que funciono (con llave de Brave, un SearXNG propio o
  los motores gratuitos cuando contestan);
- de un paquete cargado a mano desde Configuracion.

La vigilancia visita esas paginas sin preguntar a ningun buscador. No pertenece a
un ciclo: la consultan todas las corridas y todos los ciclos, y como vive en la
base del sistema se respalda en Firestore con ella y sobrevive a los reinicios.

Cada visita deja la cuenta de si la pagina aporto senales. La que no aporta en
`SILENT_AFTER_VISITS` visitas deja de visitarse (`sin_senal`) y se vuelve a
probar pasados `RETRY_SILENT_DAYS`, por si la fuente publico algo nuevo alli.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy.orm import Session

from . import settings_store
from .models import SearchKnowledge, Source

log = logging.getLogger(__name__)

PACK_FILE = Path(__file__).resolve().parent / "data" / "base_busqueda_eh.json"
PACK_SHA_KEY = "search.knowledge.pack_sha"
# Cuando se busco por ultima vez cada dominio: {dominio: fecha ISO}.
SEARCHED_KEY = "search.knowledge.searched"
PACK_VERSION = 1

STATUS_ACTIVE = "activa"
STATUS_SILENT = "sin_senal"
ORIGIN_SEARCH = "busqueda"
ORIGIN_PACK = "paquete"
ENGINE_LABEL = "base_conocimiento"

# Visitas seguidas sin aportar una sola senal antes de dejar de visitar la pagina.
SILENT_AFTER_VISITS = 2
# Una pagina sin senal se vuelve a probar pasado este plazo.
RETRY_SILENT_DAYS = 45
# Tope de paginas guardadas por dominio: evita que un sitio enorme llene la base.
MAX_PER_DOMAIN = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def host_of(url: str) -> str:
    return (urlsplit(url or "").hostname or "").lower().removeprefix("www.")


def clean_domain(domain: str) -> str:
    return (domain or "").strip().lower().removeprefix("www.")


def in_domain(url: str, domain: str) -> bool:
    host, domain = host_of(url), clean_domain(domain)
    return bool(host and domain and (host == domain or host.endswith("." + domain)))


def canonical_url(url: str) -> str:
    """URL sin fragmento, con esquema y host en minuscula y sin barra final."""
    parts = urlsplit((url or "").strip())
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        return ""
    path = parts.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def url_hash(url: str) -> str:
    """Huella de la pagina: la misma con http o https, con o sin www."""
    parts = urlsplit(canonical_url(url))
    key = f"{parts.netloc.removeprefix('www.')}{parts.path}?{parts.query}"
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def enabled(cfg: dict | None) -> bool:
    return bool((cfg or {}).get("knowledge_enabled", True))


# --------------------------------------------------------------------------- #
#  Escritura
# --------------------------------------------------------------------------- #
def remember(
    db: Session,
    source,
    domain: str,
    results: list[dict],
    *,
    origin: str = ORIGIN_SEARCH,
    commit: bool = True,
) -> dict:
    """Guarda (o refresca) las paginas que una busqueda encontro. Nunca borra.

    Una pagina ya conocida conserva sus cuentas de visitas y senales: solo se
    actualiza cuando fue vista por ultima vez y los textos que venian vacios.
    """
    domain = clean_domain(domain)
    source_id = getattr(source, "id", None)
    added = refreshed = 0
    now = _now()
    room = MAX_PER_DOMAIN - db.query(SearchKnowledge.id).filter(SearchKnowledge.domain == domain).count() if domain else 0
    seen: set[str] = set()
    for row in results or []:
        url = canonical_url(row.get("url") or "")
        if not url or (domain and not in_domain(url, domain)):
            continue
        key = url_hash(url)
        if key in seen:
            continue
        seen.add(key)
        entry = db.query(SearchKnowledge).filter(SearchKnowledge.url_hash == key).first()
        if entry is not None:
            entry.last_seen_at = now
            entry.title = entry.title or (row.get("title") or "")[:300]
            entry.snippet = entry.snippet or (row.get("snippet") or "")[:500]
            if entry.source_id is None and source_id:
                entry.source_id = source_id
            refreshed += 1
            continue
        if room <= 0:
            continue
        room -= 1
        db.add(
            SearchKnowledge(
                source_id=source_id,
                domain=domain or host_of(url),
                url=url[:1020],
                url_hash=key,
                title=(row.get("title") or "")[:300],
                snippet=(row.get("snippet") or "")[:500],
                query=(row.get("query") or "")[:300],
                engine=(row.get("engine") or "")[:40],
                origin=origin,
                status=STATUS_ACTIVE,
                found_at=now,
                last_seen_at=now,
            )
        )
        added += 1
    if commit and (added or refreshed):
        db.commit()
    return {"added": added, "refreshed": refreshed}


def _due_again(entry: SearchKnowledge, now: datetime) -> bool:
    last = _aware(entry.last_visit_at)
    return last is None or (now - last) >= timedelta(days=RETRY_SILENT_DAYS)


def pages_for(db: Session, source, domain: str, *, limit: int = 6, exclude: set[str] | None = None) -> list[dict]:
    """Paginas conocidas que conviene visitar, con el formato de un resultado de busqueda.

    Primero las propias de la fuente y, si no tiene, las del dominio (varias
    fuentes de un mismo sitio comparten paginas). Adelante van las que ya
    aportaron senales; las `sin_senal` solo vuelven pasado el plazo de reintento.
    """
    domain = clean_domain(domain)
    if not domain or limit <= 0:
        return []
    source_id = getattr(source, "id", None)
    rows = db.query(SearchKnowledge).filter(SearchKnowledge.domain == domain).all()
    if not rows:
        return []
    now = _now()
    usable = [r for r in rows if r.status != STATUS_SILENT or _due_again(r, now)]
    own = [r for r in usable if source_id and r.source_id == source_id]
    pool = own or usable
    skip = {url_hash(u) for u in (exclude or set()) if u}
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    pool.sort(
        key=lambda r: (
            0 if r.status == STATUS_ACTIVE else 1,
            -(r.signals or 0),
            -((_aware(r.last_signal_at) or epoch).timestamp()),
            -((_aware(r.last_seen_at) or epoch).timestamp()),
            r.id,
        )
    )
    out: list[dict] = []
    for row in pool:
        if row.url_hash in skip:
            continue
        out.append(
            {
                "url": row.url,
                "title": row.title or "",
                "snippet": row.snippet or "",
                "query": row.query or "",
                "engine": ENGINE_LABEL,
                "signals": row.signals or 0,
            }
        )
        if len(out) >= limit:
            break
    return out


def _searched(db: Session) -> dict:
    try:
        data = json.loads(settings_store.get_value(db, SEARCHED_KEY, "") or "{}")
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def searched_recently(db: Session, domain: str, days: int) -> bool:
    """True si este dominio ya se busco (buscadores, mapa del sitio o paquete) hace menos de `days`.

    Es lo que evita repetir la busqueda en cada corrida: lo encontrado esta en la
    base y, si no se encontro nada, volver a preguntar manana tampoco lo traeria.
    """
    raw = _searched(db).get(clean_domain(domain))
    if not raw:
        return False
    try:
        when = _aware(datetime.fromisoformat(raw))
    except (TypeError, ValueError):
        return False
    return when is not None and (_now() - when) < timedelta(days=max(1, int(days or 1)))


def mark_searched(db: Session, domains, *, commit: bool = True) -> None:
    """Anota que estos dominios se acaban de buscar."""
    names = [domains] if isinstance(domains, str) else list(domains or [])
    names = [clean_domain(d) for d in names if clean_domain(d)]
    if not names:
        return
    data = _searched(db)
    stamp = _now().isoformat()
    for name in names:
        data[name] = stamp
    settings_store._upsert(db, SEARCHED_KEY, json.dumps(data, sort_keys=True))
    if commit:
        db.commit()


def clear_searched(db: Session, *, commit: bool = True) -> None:
    """Olvida cuando se busco cada dominio: la proxima vigilancia vuelve a buscar.

    Se usa al cambiar los motores o la llave en Configuracion, para que el motor
    nuevo se pruebe de inmediato y no cuando venza el plazo.
    """
    settings_store._upsert(db, SEARCHED_KEY, "{}")
    if commit:
        db.commit()


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text).strip().lower()


def record_visits(db: Session, source, pages: list[dict], findings: list[dict], *, commit: bool = True) -> dict:
    """Anota, por cada pagina visitada que esta en la base, si aporto senales.

    Una senal cuenta para la pagina si su URL es la de la pagina o si su titulo
    aparece en el texto de la pagina. Sin senal en `SILENT_AFTER_VISITS` visitas
    seguidas, la pagina deja de visitarse.
    """
    visited = [p for p in pages or [] if p.get("url")]
    if not visited:
        return {"visited": 0, "with_signals": 0, "silenced": 0}
    by_hash = {url_hash(p["url"]): p for p in visited}
    rows = db.query(SearchKnowledge).filter(SearchKnowledge.url_hash.in_(list(by_hash))).all()
    if not rows:
        return {"visited": 0, "with_signals": 0, "silenced": 0}
    titles = [(_norm(f.get("title") or ""), url_hash(f.get("url") or "")) for f in findings or []]
    now = _now()
    with_signals = silenced = 0
    for row in rows:
        page = by_hash[row.url_hash]
        text = _norm(page.get("text") or "")
        hits = sum(
            1
            for title, fhash in titles
            if fhash == row.url_hash or (len(title) >= 12 and title in text)
        )
        row.visits = (row.visits or 0) + 1
        row.last_visit_at = now
        if hits:
            row.signals = (row.signals or 0) + hits
            row.last_signal_at = now
            row.status = STATUS_ACTIVE
            with_signals += 1
        elif not (row.signals or 0) and row.visits >= SILENT_AFTER_VISITS and row.status != STATUS_SILENT:
            row.status = STATUS_SILENT
            silenced += 1
    if commit:
        db.commit()
    return {"visited": len(rows), "with_signals": with_signals, "silenced": silenced}


# --------------------------------------------------------------------------- #
#  Consulta
# --------------------------------------------------------------------------- #
def stats(db: Session) -> dict:
    rows = db.query(
        SearchKnowledge.domain, SearchKnowledge.source_id, SearchKnowledge.status,
        SearchKnowledge.signals, SearchKnowledge.origin, SearchKnowledge.last_seen_at,
    ).all()
    domains = {r[0] for r in rows}
    last = max((_aware(r[5]) for r in rows if r[5] is not None), default=None)
    return {
        "pages": len(rows),
        "active": sum(1 for r in rows if r[2] == STATUS_ACTIVE),
        "silent": sum(1 for r in rows if r[2] == STATUS_SILENT),
        "with_signals": sum(1 for r in rows if (r[3] or 0) > 0),
        "signals": sum(int(r[3] or 0) for r in rows),
        "domains": len(domains),
        "sources": len({r[1] for r in rows if r[1]}),
        "from_pack": sum(1 for r in rows if r[4] == ORIGIN_PACK),
        "from_search": sum(1 for r in rows if r[4] == ORIGIN_SEARCH),
        "last_seen_at": last,
        "silent_after_visits": SILENT_AFTER_VISITS,
        "retry_silent_days": RETRY_SILENT_DAYS,
    }


def _out(row: SearchKnowledge, titles: dict[int, str] | None = None) -> dict:
    return {
        "id": row.id,
        "source_id": row.source_id,
        "source_title": (titles or {}).get(row.source_id or 0, ""),
        "domain": row.domain,
        "url": row.url,
        "title": row.title,
        "snippet": row.snippet,
        "query": row.query,
        "engine": row.engine,
        "origin": row.origin,
        "status": row.status,
        "visits": row.visits or 0,
        "signals": row.signals or 0,
        "found_at": _aware(row.found_at),
        "last_seen_at": _aware(row.last_seen_at),
        "last_visit_at": _aware(row.last_visit_at),
        "last_signal_at": _aware(row.last_signal_at),
    }


def search(db: Session, text: str = "", *, source_id: int | None = None, status: str = "", limit: int = 50) -> list[dict]:
    """Recupera paginas de la base por texto (titulo, extracto, URL o dominio).

    Cada palabra de la consulta suma; adelante quedan las paginas que mas
    palabras contienen y, a igualdad, las que mas senales han aportado.
    """
    query = db.query(SearchKnowledge)
    if source_id:
        query = query.filter(SearchKnowledge.source_id == source_id)
    if status:
        query = query.filter(SearchKnowledge.status == status)
    rows = query.all()
    words = [w for w in _norm(text).split() if len(w) >= 2]
    scored: list[tuple[int, SearchKnowledge]] = []
    for row in rows:
        if not words:
            scored.append((0, row))
            continue
        blob = _norm(f"{row.title} {row.snippet} {row.url} {row.domain} {row.query}")
        hits = sum(1 for w in words if w in blob)
        if hits:
            scored.append((hits, row))
    scored.sort(key=lambda item: (-item[0], -(item[1].signals or 0), item[1].id))
    top = [row for _score, row in scored[: max(1, min(limit, 500))]]
    ids = {r.source_id for r in top if r.source_id}
    titles = {s.id: s.title for s in db.query(Source.id, Source.title).filter(Source.id.in_(list(ids) or [0])).all()}
    return [_out(r, titles) for r in top]


def coverage(db: Session) -> list[dict]:
    """Por fuente con ingesta activa: cuantas paginas conoce la base y cuantas aportan."""
    rows = db.query(SearchKnowledge.domain, SearchKnowledge.status, SearchKnowledge.signals).all()
    by_domain: dict[str, dict] = {}
    for domain, status, signals in rows:
        item = by_domain.setdefault(domain, {"pages": 0, "active": 0, "with_signals": 0})
        item["pages"] += 1
        item["active"] += 1 if status == STATUS_ACTIVE else 0
        item["with_signals"] += 1 if (signals or 0) > 0 else 0
    out = []
    for source in db.query(Source).filter(Source.scrape_enabled.is_(True)).order_by(Source.title).all():
        if getattr(source, "retired", False) or source.catalog_active is False:
            continue
        domain = host_of(source.url or "")
        item = by_domain.get(domain) or _match_parent(by_domain, domain)
        out.append(
            {
                "source_id": source.id,
                "title": source.title,
                "domain": domain,
                **(item or {"pages": 0, "active": 0, "with_signals": 0}),
            }
        )
    return out


def _match_parent(by_domain: dict[str, dict], host: str) -> dict | None:
    for domain, item in by_domain.items():
        if host and (host.endswith("." + domain) or domain.endswith("." + host)):
            return item
    return None


# --------------------------------------------------------------------------- #
#  Paquete (exportar, cargar, sembrar el que viaja con el codigo)
# --------------------------------------------------------------------------- #
def export_pack(db: Session) -> dict:
    rows = db.query(SearchKnowledge).order_by(SearchKnowledge.domain, SearchKnowledge.id).all()
    return {
        "version": PACK_VERSION,
        "generated_at": _now().isoformat(),
        # Sitios ya buscados, con o sin resultados: quien cargue el paquete no repite esa busqueda.
        "searched_domains": sorted(_searched(db)),
        "pages": [
            {
                "domain": r.domain,
                "url": r.url,
                "title": r.title,
                "snippet": r.snippet,
                "query": r.query,
                "engine": r.engine,
                "status": r.status,
                "visits": r.visits or 0,
                "signals": r.signals or 0,
            }
            for r in rows
        ],
    }


def _source_ids_by_domain(db: Session) -> dict[str, int]:
    """Fuente que responde por cada dominio (si varias lo comparten, ninguna: queda por dominio)."""
    owners: dict[str, list[int]] = {}
    for sid, url in db.query(Source.id, Source.url).all():
        host = host_of(url or "")
        if host:
            owners.setdefault(host, []).append(sid)
    return {host: ids[0] for host, ids in owners.items() if len(ids) == 1}


def import_pack(db: Session, pack: dict, *, origin: str = ORIGIN_PACK, commit: bool = True) -> dict:
    """Suma un paquete a la base. Nunca borra ni baja las cuentas que ya tiene el servidor."""
    if not isinstance(pack, dict) or not isinstance(pack.get("pages"), list):
        raise ValueError("El paquete no tiene el formato esperado (falta la lista «pages»).")
    owners = _source_ids_by_domain(db)
    added = updated = skipped = 0
    now = _now()
    seen: set[str] = set()
    per_domain_seen: set[str] = set()
    per_domain: dict[str, int] = {}
    for domain, count in (
        db.query(SearchKnowledge.domain, SearchKnowledge.id).all()
    ):
        per_domain[domain] = per_domain.get(domain, 0) + 1
    for item in pack["pages"]:
        if not isinstance(item, dict):
            skipped += 1
            continue
        url = canonical_url(str(item.get("url") or ""))
        domain = clean_domain(str(item.get("domain") or "")) or host_of(url)
        if not url or not in_domain(url, domain):
            skipped += 1
            continue
        key = url_hash(url)
        if key in seen:
            continue
        seen.add(key)
        per_domain_seen.add(domain)
        visits = max(0, int(item.get("visits") or 0))
        signals = max(0, int(item.get("signals") or 0))
        status = item.get("status") if item.get("status") in {STATUS_ACTIVE, STATUS_SILENT} else STATUS_ACTIVE
        entry = db.query(SearchKnowledge).filter(SearchKnowledge.url_hash == key).first()
        if entry is not None:
            entry.last_seen_at = now
            entry.title = entry.title or str(item.get("title") or "")[:300]
            entry.snippet = entry.snippet or str(item.get("snippet") or "")[:500]
            # El paquete solo aporta evidencia a favor: una pagina que alla dio
            # senales vuelve a estar activa; nunca apaga una que aqui si aporta.
            if signals > (entry.signals or 0):
                entry.signals = signals
                entry.status = STATUS_ACTIVE
            entry.visits = max(entry.visits or 0, visits)
            updated += 1
            continue
        if per_domain.get(domain, 0) >= MAX_PER_DOMAIN:
            skipped += 1
            continue
        per_domain[domain] = per_domain.get(domain, 0) + 1
        db.add(
            SearchKnowledge(
                source_id=owners.get(domain),
                domain=domain,
                url=url[:1020],
                url_hash=key,
                title=str(item.get("title") or "")[:300],
                snippet=str(item.get("snippet") or "")[:500],
                query=str(item.get("query") or "")[:300],
                engine=str(item.get("engine") or "")[:40],
                origin=origin,
                status=status,
                visits=visits,
                signals=signals,
                found_at=now,
                last_seen_at=now,
                last_signal_at=now if signals else None,
            )
        )
        added += 1
    # El paquete es el resultado de una busqueda completa: sus dominios quedan como
    # recien buscados y la primera vigilancia no vuelve a preguntar por ellos.
    extra = pack.get("searched_domains")
    if isinstance(extra, list):
        per_domain_seen.update(clean_domain(d) for d in extra if isinstance(d, str) and 0 < len(d) <= 200)
    mark_searched(db, sorted(per_domain_seen), commit=False)
    if commit:
        db.commit()
    else:
        db.flush()
    return {"added": added, "updated": updated, "skipped": skipped, "total": db.query(SearchKnowledge.id).count()}


def seed_from_package(db: Session, path: Path | None = None) -> dict:
    """Carga el paquete que viaja con el codigo, una vez por version del archivo."""
    path = Path(path or PACK_FILE)
    try:
        raw = path.read_bytes()
    except OSError:
        return {"status": "sin_paquete"}
    sha = hashlib.sha256(raw).hexdigest()
    if settings_store.get_value(db, PACK_SHA_KEY, "") == sha:
        return {"status": "vigente"}
    try:
        out = import_pack(db, json.loads(raw.decode("utf-8")), commit=False)
    except (ValueError, UnicodeDecodeError) as exc:
        db.rollback()
        log.warning("El paquete de la base de busqueda no se pudo leer: %s", exc)
        return {"status": "error", "detail": str(exc)[:200]}
    settings_store.set_value(db, PACK_SHA_KEY, sha)
    log.info("Base de busqueda: paquete cargado (%s nuevas, %s ya conocidas).", out["added"], out["updated"])
    return {"status": "cargado", **out}
