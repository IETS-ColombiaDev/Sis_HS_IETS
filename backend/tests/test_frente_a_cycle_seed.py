"""Frente A: la siembra de ciclos oficiales no destruye el trabajo de la coordinacion.

Bug corregido: en cada arranque `sync_official_cycles` borraba todo ciclo que no
fuera uno de los cuatro oficiales de 2026 (un "Ciclo I - 2027" desaparecia con
su trabajo), reconstruia un oficial si su estado habia avanzado y dejaba
puntajes huerfanos que un ciclo nuevo heredaba al reutilizar el id en SQLite.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import cycle_seed, methodology  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import (  # noqa: E402
    Cluster,
    Cycle,
    CycleTechnology,
    NoveltyAssessment,
    PriorityScore,
    TechType,
    Technology,
)


def _seeded_db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(db)
    cluster = db.query(Cluster).first()
    ttype = db.query(TechType).first()
    for i in range(24):
        db.add(
            Technology(
                commercial_name=f"Semilla {i}",
                inn_name=f"mol-{i}",
                indication="Oncologia",
                cluster_id=cluster.id,
                tech_type_id=ttype.id,
                condition="emergente",
                screening_score=80 - i,
            )
        )
    db.commit()
    cycle_seed.sync_official_cycles(db, force=True)
    return db


def _user_cycle(db, code="Ciclo I - 2027"):
    cycle = Cycle(
        code=code,
        year=2027,
        opened_on=dt.date(2027, 1, 11),
        data_cutoff_on=dt.date(2027, 3, 22),
        bulletin_due_on=dt.date(2027, 4, 5),
        status="en_filtrado",
    )
    db.add(cycle)
    db.commit()
    return cycle


def test_cycles_created_by_the_coordination_survive_a_restart():
    db = _seeded_db()
    cycle = _user_cycle(db)
    tech = Technology(commercial_name="Senal 2027", status="asignada_a_ciclo")
    db.add(tech)
    db.commit()
    db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status="asignada_a_ciclo"))
    db.commit()

    result = cycle_seed.sync_official_cycles(db)

    assert result["rebuilt"] is False
    codes = {c.code for c in db.query(Cycle).all()}
    assert "Ciclo I - 2027" in codes
    assert db.query(CycleTechnology).filter_by(cycle_id=cycle.id).count() == 1


def test_an_official_cycle_that_advanced_is_not_rebuilt():
    db = _seeded_db()
    third = db.query(Cycle).filter_by(code="Ciclo III - 2026").one()
    entries_before = db.query(CycleTechnology).filter_by(cycle_id=third.id).count()
    third.status = "en_evaluacion"
    db.commit()

    result = cycle_seed.sync_official_cycles(db)

    db.expire_all()
    third = db.query(Cycle).filter_by(code="Ciclo III - 2026").one()
    assert result["rebuilt"] is False
    assert third.status == "en_evaluacion"
    assert db.query(CycleTechnology).filter_by(cycle_id=third.id).count() == entries_before


def test_purged_regression_cycles_leave_no_orphans_and_release_their_technologies():
    db = _seeded_db()
    reg = _user_cycle(db, code="REG-e2e123")
    tech = Technology(commercial_name="Senal de regresion", status="priorizada")
    db.add(tech)
    db.commit()
    db.add(CycleTechnology(cycle_id=reg.id, technology_id=tech.id, status="priorizada"))
    db.add(PriorityScore(cycle_id=reg.id, technology_id=tech.id, criterion="P1", value=1))
    db.add(NoveltyAssessment(cycle_id=reg.id, technology_id=tech.id, option_code="no_disponible_en_pais"))
    db.commit()
    reg_id = reg.id

    cycle_seed.sync_official_cycles(db)

    db.expire_all()
    assert db.get(Cycle, reg_id) is None
    assert db.query(PriorityScore).filter_by(cycle_id=reg_id).count() == 0
    assert db.query(NoveltyAssessment).filter_by(cycle_id=reg_id).count() == 0
    assert db.query(CycleTechnology).filter_by(cycle_id=reg_id).count() == 0
    assert db.get(Technology, tech.id).status == "capturada_no_asignada"


def test_orphans_from_older_purges_are_cleaned_so_new_cycles_do_not_inherit_them():
    db = _seeded_db()
    ghost_id = max(c.id for c in db.query(Cycle).all()) + 1
    tech = db.query(Technology).first()
    db.add(PriorityScore(cycle_id=ghost_id, technology_id=tech.id, criterion="P2", value=1))
    db.add(NoveltyAssessment(cycle_id=ghost_id, technology_id=tech.id, option_code="nueva_indicacion"))
    db.commit()

    result = cycle_seed.sync_official_cycles(db)
    fresh = _user_cycle(db, code="Ciclo II - 2027")

    assert result["orphans_removed"] == 2
    assert fresh.id == ghost_id
    assert db.query(PriorityScore).filter_by(cycle_id=fresh.id).count() == 0
    assert db.query(NoveltyAssessment).filter_by(cycle_id=fresh.id).count() == 0


def test_ambiguity_rule():
    make = lambda code, historic=False: Cycle(code=code, is_historic=historic)  # noqa: E731
    assert cycle_seed.is_ambiguous(make("REG-corto-abc"))
    assert cycle_seed.is_ambiguous(make("TEST-CICLO"))
    assert cycle_seed.is_ambiguous(make("Ciclo 0 - Historico"))
    assert cycle_seed.is_ambiguous(make("Cualquiera", historic=True))
    assert not cycle_seed.is_ambiguous(make("Ciclo I - 2027"))
    assert not cycle_seed.is_ambiguous(make("Ciclo E2E-abc"))


def test_an_edited_annual_quota_survives_a_restart_but_residues_are_repaired():
    from app.models import MethodologyParam

    db = _seeded_db()
    param = db.get(MethodologyParam, "cycle.max_per_year")
    param.value = "4"
    db.commit()
    cycle_seed.sync_official_cycles(db)
    assert db.get(MethodologyParam, "cycle.max_per_year").value == "4"

    param.value = "999"  # residuo de una corrida de regresion interrumpida
    db.commit()
    cycle_seed.sync_official_cycles(db)
    assert db.get(MethodologyParam, "cycle.max_per_year").value == "3"
