"""Panel de cobertura: senales de fuentes de contraste ausentes del ciclo.

PCORI, CDA-AMC, NIHRIO, ACE, ScanMedicine e INAHTA son control de calidad
del propio escaneo: si aparecen alli y no en el ciclo activo, hay un hueco
que hay que justificar.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from .dedup import normalize_name
from .models import Cycle, CycleTechnology, Finding, Source, Technology


def coverage_gaps(db: Session, cycle_id: int | None = None) -> dict:
    cycle = None
    if cycle_id:
        cycle = db.get(Cycle, cycle_id)
    if cycle is None:
        cycle = (
            db.query(Cycle)
            .filter(Cycle.is_historic.is_(False), Cycle.status != "cerrado_consolidado")
            .order_by(Cycle.id.desc())
            .first()
        )

    contrast_sources = (
        db.query(Source)
        .filter(Source.is_contrast.is_(True), Source.retired.is_(False))
        .all()
    )
    contrast_ids = [s.id for s in contrast_sources]

    cycle_techs: list[Technology] = []
    if cycle:
        links = db.query(CycleTechnology).filter(CycleTechnology.cycle_id == cycle.id).all()
        tech_ids = [l.technology_id for l in links]
        if tech_ids:
            cycle_techs = db.query(Technology).filter(Technology.id.in_(tech_ids)).all()

    cycle_keys = _index(cycle_techs)

    candidates: list[Technology] = []
    if contrast_ids:
        candidates = (
            db.query(Technology)
            .filter(Technology.source_id.in_(contrast_ids), Technology.merged_into_id.is_(None))
            .all()
        )
        if not candidates:
            finding_ids = [
                f.id
                for f in db.query(Finding.id).filter(Finding.source_id.in_(contrast_ids)).all()
            ]
            if finding_ids:
                candidates = (
                    db.query(Technology)
                    .filter(Technology.finding_id.in_(finding_ids), Technology.merged_into_id.is_(None))
                    .all()
                )

    gaps = []
    for tech in candidates:
        if _matches(tech, cycle_keys):
            continue
        source = db.get(Source, tech.source_id) if tech.source_id else None
        gaps.append(
            {
                "technology_id": tech.id,
                "commercial_name": tech.commercial_name,
                "inn_name": tech.inn_name,
                "manufacturer": tech.manufacturer,
                "nct_ids": tech.nct_ids or [],
                "indication": (tech.indication or "")[:280],
                "source_id": tech.source_id,
                "source_title": source.title if source else "",
                "catalog_code": source.catalog_code if source else "",
                "captured_at": tech.captured_at.isoformat() if tech.captured_at else None,
            }
        )

    return {
        "cycle_id": cycle.id if cycle else None,
        "cycle_code": cycle.code if cycle else "",
        "contrast_sources": [
            {"id": s.id, "code": s.catalog_code, "title": s.title} for s in contrast_sources
        ],
        "cycle_size": len(cycle_techs),
        "contrast_captured": len(candidates),
        "gaps": gaps,
        "gap_count": len(gaps),
    }


def _index(techs: list[Technology]) -> dict:
    ncts: set[str] = set()
    names: set[str] = set()
    inns: set[str] = set()
    for tech in techs:
        for nct in tech.nct_ids or []:
            if nct:
                ncts.add(str(nct).upper())
        name = normalize_name(tech.commercial_name or "")
        inn = normalize_name(tech.inn_name or "")
        if name:
            names.add(name)
        if inn:
            inns.add(inn)
    return {"ncts": ncts, "names": names, "inns": inns}


def _matches(tech: Technology, keys: dict) -> bool:
    for nct in tech.nct_ids or []:
        if nct and str(nct).upper() in keys["ncts"]:
            return True
    name = normalize_name(tech.commercial_name or "")
    inn = normalize_name(tech.inn_name or "")
    if name and name in keys["names"]:
        return True
    if inn and inn in keys["inns"]:
        return True
    if name and name in keys["inns"]:
        return True
    if inn and inn in keys["names"]:
        return True
    return False
