"""Pruebas de la maquina de estados y las reglas de integridad del ciclo."""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import cycle_service, methodology, rbac  # noqa: E402
from app.cycle_service import CycleRuleError  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import Cycle, CycleTechnology, Technology, User  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


@pytest.fixture()
def admin(db):
    user = User(email="admin@iets.org.co", role=rbac.SUPERADMIN)
    db.add(user)
    db.commit()
    return user


def make_cycle(db, code: str, *, weeks: int = 12, year_offset: int = 0, status="en_configuracion"):
    opened = dt.date(dt.date.today().year + year_offset, 1, 15)
    row = Cycle(
        code=code,
        year=opened.year,
        opened_on=opened,
        data_cutoff_on=opened + dt.timedelta(weeks=weeks),
        status=status,
    )
    db.add(row)
    db.commit()
    return row


# --------------------------------------------------------------------------- #
#  Ventana operativa y cupo anual
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("weeks", [10, 12, 16])
def test_valid_window_is_accepted(db, weeks):
    start = dt.date(2026, 1, 15)
    cycle_service.validate_window(db, start, start + dt.timedelta(weeks=weeks))


@pytest.mark.parametrize("weeks", [1, 9, 17, 30])
def test_window_outside_range_is_rejected(db, weeks):
    start = dt.date(2026, 1, 15)
    with pytest.raises(CycleRuleError):
        cycle_service.validate_window(db, start, start + dt.timedelta(weeks=weeks))


def test_fourth_cycle_in_a_year_is_rejected(db):
    year = dt.date.today().year
    for i in range(3):
        make_cycle(db, f"Ciclo {i + 1}")
    with pytest.raises(CycleRuleError):
        cycle_service.validate_year_quota(db, year)


def test_historic_cycle_does_not_consume_year_quota(db):
    year = dt.date.today().year
    historic = make_cycle(db, "Ciclo 0 - Historico")
    historic.is_historic = True
    db.commit()
    cycle_service.validate_year_quota(db, year)  # no debe lanzar


# --------------------------------------------------------------------------- #
#  Maquina de estados
# --------------------------------------------------------------------------- #
def test_valid_transition_sequence(db, admin):
    cycle = make_cycle(db, "Ciclo I")
    for target in ("en_filtrado", "en_priorizacion", "en_evaluacion"):
        cycle_service.transition(db, cycle, target, actor=admin.email)
        assert cycle.status == target


def test_invalid_transition_is_rejected(db, admin):
    cycle = make_cycle(db, "Ciclo I")
    with pytest.raises(CycleRuleError):
        cycle_service.transition(db, cycle, "en_evaluacion", actor=admin.email)


def test_closed_cycle_has_no_further_transitions(db, admin):
    cycle = make_cycle(db, "Ciclo I", status="en_evaluacion")
    cycle_service.close_cycle(db, cycle, actor=admin.email)
    with pytest.raises(CycleRuleError):
        cycle_service.transition(db, cycle, "en_priorizacion", actor=admin.email)


# --------------------------------------------------------------------------- #
#  Cierre con tecnologias en evaluacion
# --------------------------------------------------------------------------- #
def _add_entry(db, cycle, status="en_evaluacion"):
    tech = Technology(commercial_name="Tec")
    db.add(tech)
    db.commit()
    entry = CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status=status)
    db.add(entry)
    db.commit()
    return entry


def test_cycle_cannot_close_with_technology_in_evaluation_without_report(db, admin):
    cycle = make_cycle(db, "Ciclo I", status="en_evaluacion")
    _add_entry(db, cycle)
    with pytest.raises(CycleRuleError):
        cycle_service.close_cycle(db, cycle, actor=admin.email)


def test_cycle_closes_with_explicit_justification(db, admin):
    cycle = make_cycle(db, "Ciclo I", status="en_evaluacion")
    entry = _add_entry(db, cycle)
    cycle_service.close_cycle(db, cycle, actor=admin.email, force_note="Prorrogado al ciclo siguiente")
    assert cycle.status == "cerrado_consolidado"
    db.refresh(entry)
    assert entry.exclusion_note == "Prorrogado al ciclo siguiente"


def test_close_freezes_all_entries(db, admin):
    cycle = make_cycle(db, "Ciclo I", status="en_evaluacion")
    entry = _add_entry(db, cycle, status="priorizada")
    assert entry.frozen is False
    cycle_service.close_cycle(db, cycle, actor=admin.email)
    db.refresh(entry)
    assert entry.frozen is True


# --------------------------------------------------------------------------- #
#  Arrastre del monitoreo activo
# --------------------------------------------------------------------------- #
def test_watchlist_is_carried_to_next_cycle_with_previous_score(db, admin):
    source = make_cycle(db, "Ciclo I", status="en_evaluacion")
    entry = _add_entry(db, source, status="bajo_vigilancia")
    entry.priority_pct = 50.0
    db.commit()
    cycle_service.close_cycle(db, source, actor=admin.email)

    target = make_cycle(db, "Ciclo II")
    carried = cycle_service.carry_over_watchlist(db, source, target, actor=admin.email)
    assert carried == 1

    new_entry = (
        db.query(CycleTechnology)
        .filter(CycleTechnology.cycle_id == target.id)
        .one()
    )
    assert new_entry.status == "filtrada_apta_priorizacion"
    assert new_entry.carried_from_cycle_id == source.id
    assert float(new_entry.previous_priority_pct) == 50.0
    # El registro original permanece congelado e intacto.
    db.refresh(entry)
    assert entry.frozen is True
    assert float(entry.priority_pct) == 50.0


def test_carry_over_is_idempotent(db, admin):
    source = make_cycle(db, "Ciclo I", status="en_evaluacion")
    _add_entry(db, source, status="bajo_vigilancia")
    cycle_service.close_cycle(db, source, actor=admin.email)
    target = make_cycle(db, "Ciclo II")

    assert cycle_service.carry_over_watchlist(db, source, target) == 1
    assert cycle_service.carry_over_watchlist(db, source, target) == 0


def test_carry_over_to_closed_cycle_is_rejected(db, admin):
    source = make_cycle(db, "Ciclo I", status="en_evaluacion")
    _add_entry(db, source, status="bajo_vigilancia")
    cycle_service.close_cycle(db, source, actor=admin.email)
    target = make_cycle(db, "Ciclo II", status="en_evaluacion")
    cycle_service.close_cycle(db, target, actor=admin.email)

    with pytest.raises(CycleRuleError):
        cycle_service.carry_over_watchlist(db, source, target)


# --------------------------------------------------------------------------- #
#  Ciclo activo
# --------------------------------------------------------------------------- #
def test_active_cycle_ignores_historic_and_closed(db, admin):
    historic = make_cycle(db, "Ciclo 0 - Historico")
    historic.is_historic = True
    closed = make_cycle(db, "Ciclo I", status="en_evaluacion")
    cycle_service.close_cycle(db, closed, actor=admin.email)
    active = make_cycle(db, "Ciclo II", status="en_filtrado")
    db.commit()

    assert cycle_service.get_active_cycle(db).id == active.id
