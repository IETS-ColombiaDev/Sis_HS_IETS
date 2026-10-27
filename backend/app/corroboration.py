"""Corroboracion entre fuentes: la misma tecnologia vista en varias fuentes (RF-002).

Validacion del modulo 0: el sistema debe reconocer una misma tecnologia en
fuentes distintas (p. ej. varias agencias regulatorias), consolidar las
coincidencias y dar mas prioridad a la que se repite, *sin confundir la
repeticion con la importancia clinica*.

Reglas:

- **Coincidencia.** Se reutiliza el comparador del filtrado (`dedup.compare`):
  NCT compartido (decisivo) o similitud de nombre/DCI sobre el umbral vigente
  (`dedup.similarity_threshold`). Solo cuentan coincidencias de *otra* fuente:
  dos senales de la misma fuente son duplicado, no corroboracion.
- **Conteo.** `corroboration_count` = fuentes distintas que reportan la
  tecnologia, incluida la propia (1 = solo su fuente). Las postulaciones del
  canal reactivo cuentan como una fuente mas.
- **Bono.** `corroboration_bonus` = 5 puntos por fuente adicional, maximo 15.
  Solo ordena la bandeja (screening_score + bono). No toca el screening_score,
  ni el %P, ni la clasificacion: la priorizacion oficial sigue siendo P1-P6.
- **Alcance.** Se recalcula para las senales de la bandeja (sin asignar)
  contra todo el acervo vivo (no fusionado), de modo que una senal nueva que ya
  esta en un ciclo desde otra fuente tambien se marca.

Se recalcula al consultar la bandeja cuando cambio el acervo (huella barata
sobre conteo y ultima actualizacion), y despues de cada vigilancia.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import dedup, settings_store
from .models import Source, Technology

BONUS_PER_SOURCE = 5
BONUS_MAX = 15
STAGING_STATUS = "capturada_no_asignada"
FINGERPRINT_KEY = "corroboration.fingerprint"


def bonus_for(count: int) -> int:
    return min(BONUS_MAX, BONUS_PER_SOURCE * max(0, count - 1))


def _origin_key(tech: Technology) -> str:
    if tech.source_id:
        return f"s{tech.source_id}"
    return "reactiva" if tech.source_channel == "reactiva" else f"t{tech.id}"


def _is_block_page(tech: Technology) -> bool:
    from .scraper import _BLOCK

    name = (tech.commercial_name or tech.inn_name or "")[:200]
    return bool(name) and bool(_BLOCK.search(name))


def _fingerprint(db: Session) -> str:
    count, last, merged = (
        db.query(
            func.count(Technology.id),
            func.max(Technology.updated_at),
            func.count(Technology.merged_into_id),
        ).one()
    )
    return f"{count}|{last.isoformat() if last else ''}|{merged}|{dedup.threshold(db)}"


def refresh(db: Session, *, force: bool = False) -> dict:
    """Recalcula la corroboracion de la bandeja. Devuelve un resumen.

    Sin `force`, no hace nada si el acervo no cambio desde el ultimo calculo.
    """
    fingerprint = _fingerprint(db)
    if not force and settings_store.get_value(db, FINGERPRINT_KEY, "") == fingerprint:
        return {"refreshed": False, "staging": 0, "corroborated": 0}

    minimum = dedup.threshold(db)
    # Una pagina de bloqueo capturada por error ("Comprobando tu navegador") no es
    # una tecnologia: no corrobora ni se corrobora.
    live = [
        t
        for t in db.query(Technology).filter(Technology.merged_into_id.is_(None)).all()
        if not _is_block_page(t)
    ]
    staging = [t for t in live if t.status == STAGING_STATUS]
    titles = dict(db.query(Source.id, Source.title).all())

    buckets: dict[str, list[Technology]] = {}
    by_nct: dict[str, list[Technology]] = {}
    for tech in live:
        buckets.setdefault(dedup._blocking_key(tech), []).append(tech)
        for nct in dedup.nct_set(tech):
            by_nct.setdefault(nct, []).append(tech)

    corroborated = 0
    for tech in staging:
        own = _origin_key(tech)
        candidates: dict[int, Technology] = {}
        for nct in dedup.nct_set(tech):
            for other in by_nct.get(nct, []):
                candidates[other.id] = other
        key = dedup._blocking_key(tech)
        if key:
            for other in buckets.get(key, []):
                candidates[other.id] = other

        matches: dict[str, dict] = {}
        for other in candidates.values():
            if other.id == tech.id:
                continue
            origin = _origin_key(other)
            if origin == own or origin in matches:
                continue
            result = dedup.compare(tech, other)
            if not (result["decisive"] or result["score"] >= minimum):
                continue
            matches[origin] = {
                "technology_id": other.id,
                "source_id": other.source_id,
                "source_title": titles.get(other.source_id) or (
                    "Postulación (canal reactivo)" if other.source_channel == "reactiva" else "Sin fuente"
                ),
                "name": other.commercial_name or other.inn_name or "",
                "url": other.url or "",
                "score": result["score"],
                "matched_on": result["matched_on"],
            }

        count = 1 + len(matches)
        listing = sorted(matches.values(), key=lambda m: (-m["score"], m["source_title"]))
        if tech.corroboration_count != count:
            tech.corroboration_count = count
        if tech.corroboration_bonus != bonus_for(count):
            tech.corroboration_bonus = bonus_for(count)
        if (tech.corroborating or []) != listing:
            tech.corroborating = listing or None
        if count > 1:
            corroborated += 1

    db.flush()
    # La huella se toma despues de escribir: las propias escrituras cambian updated_at.
    settings_store.set_value(db, FINGERPRINT_KEY, _fingerprint(db))
    db.commit()
    return {"refreshed": True, "staging": len(staging), "corroborated": corroborated}
