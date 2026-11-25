"""Vigencia de las senales por ano de publicacion.

El equipo decide que anos le interesan: por defecto todos. La vigencia se fija
de manera general (todas las fuentes) o para fuentes especificas, que entonces
usan su propio rango en lugar del general.

- **En la captura**: una senal cuyo ano de publicacion queda fuera de la
  vigencia de su fuente no entra a la bandeja.
- **Sobre lo ya capturado** (`preview` y `apply`): muestra cuantas senales de
  la bandeja quedan fuera y, si el equipo lo confirma, las pasa a Descartadas
  con el motivo. Es reversible: se restauran como cualquier descarte.

El ano sale de la fecha de publicacion de la senal (o de su fecha de aprobacion
FDA/EMA). Una senal sin fecha no se puede juzgar: se conserva, salvo que el
equipo apague «conservar las senales sin fecha».
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import settings_store
from .intelligence import DISCARD_ACTION, DISCARDED_STATUS, STAGING_STATUS, year_of
from .models import Finding, Source, Technology

KEY = "signals.window"
MIN_YEAR = 1980
REASON_PREFIX = "Fuera de la vigencia configurada"


def max_year() -> int:
    return datetime.now(timezone.utc).year + 5


def _year(value) -> int | None:
    if value in (None, "", 0, "0"):
        return None
    try:
        year = int(value)
    except (TypeError, ValueError):
        raise ValueError("El año debe ser un número entero.") from None
    if not MIN_YEAR <= year <= max_year():
        raise ValueError(f"El año debe estar entre {MIN_YEAR} y {max_year()}.")
    return year


def _range(year_from, year_to) -> tuple[int | None, int | None]:
    lo, hi = _year(year_from), _year(year_to)
    if lo and hi and lo > hi:
        raise ValueError("El año inicial no puede ser mayor que el año final.")
    return lo, hi


def load(db: Session) -> dict:
    raw = settings_store.get_value(db, KEY, "")
    try:
        data = json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    sources = {}
    for key, value in (data.get("sources") or {}).items():
        if str(key).isdigit() and isinstance(value, dict) and (value.get("year_from") or value.get("year_to")):
            sources[int(key)] = {"year_from": value.get("year_from") or None, "year_to": value.get("year_to") or None}
    return {
        "year_from": data.get("year_from") or None,
        "year_to": data.get("year_to") or None,
        "keep_undated": data.get("keep_undated", True) is not False,
        "sources": sources,
    }


def _save(db: Session, cfg: dict) -> dict:
    stored = dict(cfg, sources={str(k): v for k, v in cfg["sources"].items()})
    settings_store.set_value(db, KEY, json.dumps(stored))
    db.commit()
    return load(db)


def set_global(db: Session, *, year_from=None, year_to=None, keep_undated: bool | None = None) -> dict:
    cfg = load(db)
    cfg["year_from"], cfg["year_to"] = _range(year_from, year_to)
    if keep_undated is not None:
        cfg["keep_undated"] = bool(keep_undated)
    return _save(db, cfg)


def set_sources(db: Session, source_ids: list[int], *, year_from=None, year_to=None) -> dict:
    """Vigencia propia para esas fuentes. Sin anos, vuelven a la vigencia general."""
    lo, hi = _range(year_from, year_to)
    cfg = load(db)
    valid = {sid for (sid,) in db.query(Source.id).filter(Source.id.in_(source_ids or [0])).all()}
    for sid in valid:
        if lo or hi:
            cfg["sources"][sid] = {"year_from": lo, "year_to": hi}
        else:
            cfg["sources"].pop(sid, None)
    return _save(db, cfg)


def effective(cfg: dict, source_id: int | None) -> tuple[int | None, int | None, str]:
    """(desde, hasta, de donde sale: «fuente» o «general»)."""
    own = cfg["sources"].get(source_id) if source_id else None
    if own:
        return own.get("year_from"), own.get("year_to"), "fuente"
    return cfg["year_from"], cfg["year_to"], "general"


def allows(cfg: dict, source_id: int | None, year: int | None) -> bool:
    lo, hi, _scope = effective(cfg, source_id)
    if not lo and not hi:
        return True
    if year is None:
        return cfg["keep_undated"]
    return (not lo or year >= lo) and (not hi or year <= hi)


def label(lo: int | None, hi: int | None) -> str:
    if lo and hi:
        return f"{lo} a {hi}"
    if lo:
        return f"desde {lo}"
    if hi:
        return f"hasta {hi}"
    return "todos los años"


def is_open(cfg: dict) -> bool:
    return not cfg["year_from"] and not cfg["year_to"] and not cfg["sources"]


# --------------------------------------------------------------------------- #
#  En la captura
# --------------------------------------------------------------------------- #
def filter_items(db: Session, source: Source, items: list[dict]) -> tuple[list[dict], int]:
    """Candidatos de una pagina dentro de la vigencia de la fuente y cuantos quedaron fuera."""
    cfg = load(db)
    if is_open(cfg):
        return items, 0
    kept = [item for item in items if allows(cfg, source.id, year_of(item.get("published_date")))]
    return kept, len(items) - len(kept)


def record_allowed(db: Session, source: Source, published_date: str = "", *dates) -> bool:
    cfg = load(db)
    return is_open(cfg) or allows(cfg, source.id, year_of(published_date, *dates))


# --------------------------------------------------------------------------- #
#  Sobre lo ya capturado
# --------------------------------------------------------------------------- #
def _inbox(db: Session, source_ids: list[int] | None = None) -> list[tuple[Technology, int | None]]:
    query = db.query(Technology).filter(Technology.status == STAGING_STATUS, Technology.merged_into_id.is_(None))
    if source_ids:
        query = query.filter(Technology.source_id.in_(source_ids))
    techs = query.all()
    dates = dict(
        db.query(Finding.id, Finding.published_date)
        .filter(Finding.id.in_([t.finding_id for t in techs if t.finding_id] or [0]))
        .all()
    )
    return [(t, year_of(dates.get(t.finding_id, ""), t.fda_approval_date, t.ema_approval_date)) for t in techs]


def overview(db: Session) -> dict:
    """Vigencia vigente, fuentes con vigencia propia y anos de las senales de la bandeja."""
    cfg = load(db)
    titles = dict(db.query(Source.id, Source.title).all())
    years: dict[int | None, int] = {}
    per_source: dict[int | None, dict] = {}
    for tech, year in _inbox(db):
        years[year] = years.get(year, 0) + 1
        entry = per_source.setdefault(tech.source_id, {"total": 0, "undated": 0, "min": None, "max": None})
        entry["total"] += 1
        if year is None:
            entry["undated"] += 1
        else:
            entry["min"] = year if entry["min"] is None else min(entry["min"], year)
            entry["max"] = year if entry["max"] is None else max(entry["max"], year)
    sources = []
    for sid, title in sorted(titles.items(), key=lambda kv: (kv[1] or "").lower()):
        lo, hi, scope = effective(cfg, sid)
        seen = per_source.get(sid, {"total": 0, "undated": 0, "min": None, "max": None})
        sources.append({
            "source_id": sid, "title": title or "", "own": scope == "fuente", "year_from": lo, "year_to": hi,
            "label": label(lo, hi), "signals": seen["total"], "undated": seen["undated"],
            "first_year": seen["min"], "last_year": seen["max"],
        })
    return {
        "year_from": cfg["year_from"], "year_to": cfg["year_to"], "keep_undated": cfg["keep_undated"],
        "label": label(cfg["year_from"], cfg["year_to"]),
        "own_sources": len(cfg["sources"]),
        "min_year": MIN_YEAR, "max_year": max_year(),
        "years": [{"year": y, "signals": n} for y, n in sorted(years.items(), key=lambda kv: (kv[0] is None, kv[0] or 0))],
        "sources": sources,
    }


def preview(db: Session, source_ids: list[int] | None = None) -> dict:
    """Senales de la bandeja que quedan fuera de la vigencia, sin cambiar nada."""
    cfg = load(db)
    titles = dict(db.query(Source.id, Source.title).all())
    outside: dict[int | None, list[dict]] = {}
    total = 0
    for tech, year in _inbox(db, source_ids):
        total += 1
        if allows(cfg, tech.source_id, year):
            continue
        outside.setdefault(tech.source_id, []).append(
            {"technology_id": tech.id, "name": tech.commercial_name or tech.inn_name or "", "year": year}
        )
    rows = []
    for sid, items in outside.items():
        lo, hi, scope = effective(cfg, sid)
        rows.append({
            "source_id": sid, "source_title": titles.get(sid, "Sin fuente"), "window": label(lo, hi), "own": scope == "fuente",
            "count": len(items), "sample": sorted(items, key=lambda i: (i["year"] or 0, i["name"]))[:5],
        })
    rows.sort(key=lambda r: (-r["count"], r["source_title"].lower()))
    return {"inbox": total, "outside": sum(r["count"] for r in rows), "sources": rows, "open": is_open(cfg)}


def apply(db: Session, *, actor: str, source_ids: list[int] | None = None) -> dict:
    """Pasa a Descartadas las senales de la bandeja fuera de la vigencia. Reversible."""
    from .audit import record_action
    from .events import bump_state_version

    cfg = load(db)
    if is_open(cfg):
        return {"affected": 0, "open": True}
    affected = 0
    for tech, year in _inbox(db, source_ids):
        if allows(cfg, tech.source_id, year):
            continue
        lo, hi, _scope = effective(cfg, tech.source_id)
        why = f"año {year}" if year else "sin fecha de publicación"
        tech.status = DISCARDED_STATUS
        record_action(
            db, entity_type="technologies", entity_id=tech.id, action=DISCARD_ACTION,
            old_value={"status": STAGING_STATUS},
            new_value={"status": DISCARDED_STATUS, "reason": f"{REASON_PREFIX}: {why} (vigencia {label(lo, hi)})", "actor": actor},
        )
        affected += 1
    if affected:
        record_action(db, entity_type="signals", entity_id="window", action="signals:window_apply",
                      new_value={"descartadas": affected, "fuentes": source_ids or "todas", "ejecutado_por": actor})
    db.commit()
    if affected:
        bump_state_version(db)
    return {"affected": affected, "open": False}
