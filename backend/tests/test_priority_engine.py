"""Pruebas unitarias del motor oficial de priorizacion (%P).

La fase 0 del plan exige cobertura obligatoria sobre el modulo de priorizacion
por ser el nucleo metodologico del sistema. Se prueban las tres franjas de
clasificacion, sus bordes (2, 3 y 4 puntos), el control de acceso por campo y
la congelacion de puntajes al cierre del ciclo.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import cycle_service, methodology, priority_engine, rbac  # noqa: E402
from app.cycle_service import CycleRuleError  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import Cycle, CycleTechnology, Technology, User  # noqa: E402
from app.priority_engine import PriorityRuleError  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


@pytest.fixture()
def tecnico(db):
    user = User(email="tecnico@iets.org.co", name="Tecnico", role=rbac.EVALUADOR_TECNICO)
    db.add(user)
    db.commit()
    return user


@pytest.fixture()
def clinico(db):
    user = User(email="clinico@iets.org.co", name="Clinico", role=rbac.EVALUADOR_CLINICO)
    db.add(user)
    db.commit()
    return user


@pytest.fixture()
def admin(db):
    user = User(email="admin@iets.org.co", name="Admin", role=rbac.SUPERADMIN)
    db.add(user)
    db.commit()
    return user


@pytest.fixture()
def cycle(db):
    today = dt.date.today()
    row = Cycle(
        code="Ciclo I - prueba",
        year=today.year,
        opened_on=today,
        data_cutoff_on=today + dt.timedelta(weeks=12),
        status="en_priorizacion",
    )
    db.add(row)
    db.commit()
    return row


@pytest.fixture()
def entry(db, cycle):
    tech = Technology(commercial_name="Tecnologia de prueba", status="filtrada_apta_priorizacion")
    db.add(tech)
    db.commit()
    row = CycleTechnology(
        cycle_id=cycle.id,
        technology_id=tech.id,
        status="filtrada_apta_priorizacion",
    )
    db.add(row)
    db.commit()
    return row


def rate_all(db, entry, admin, values: dict[str, int]):
    for code, value in values.items():
        priority_engine.rate_criterion(
            db,
            cycle_id=entry.cycle_id,
            technology_id=entry.technology_id,
            criterion=code,
            value=value,
            user=admin,
        )


# --------------------------------------------------------------------------- #
#  Clasificacion y bordes
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "points,expected",
    [
        (0, "no_priorizada"),
        (1, "no_priorizada"),
        (2, "no_priorizada"),   # borde inferior
        (3, "bajo_vigilancia"),  # franja intermedia
        (4, "priorizada"),       # borde de priorizacion
        (5, "priorizada"),
        (6, "priorizada"),
    ],
)
def test_classification_bands(db, points, expected):
    assert priority_engine.classify(db, points) == expected


def test_percentage_formula(db):
    assert priority_engine.compute_percentage(6, 6) == 100.0
    assert priority_engine.compute_percentage(4, 6) == 66.67
    assert priority_engine.compute_percentage(3, 6) == 50.0
    assert priority_engine.compute_percentage(0, 6) == 0.0


def test_four_points_is_prioritized_despite_being_under_70_pct(db):
    """Inconsistencia documentada de la especificacion: 4/6 = 66,67% pero la
    regla vigente clasifica por conteo de puntos."""
    assert priority_engine.compute_percentage(4, 6) < 70
    assert priority_engine.classify(db, 4) == "priorizada"


# --------------------------------------------------------------------------- #
#  Completitud
# --------------------------------------------------------------------------- #
def test_percentage_not_computed_until_all_criteria_rated(db, entry, admin):
    rate_all(db, entry, admin, {"P1": 1, "P2": 1, "P3": 1})
    state = priority_engine.evaluation_state(db, entry.cycle_id, entry.technology_id)
    assert state["complete"] is False
    assert state["priority_pct"] is None
    assert state["classification"] is None
    assert sorted(state["missing"]) == ["P4", "P5", "P6"]


def test_full_rating_sets_status_and_percentage(db, entry, admin):
    rate_all(db, entry, admin, {"P1": 1, "P2": 1, "P3": 1, "P4": 0, "P5": 1, "P6": 0})
    state = priority_engine.evaluation_state(db, entry.cycle_id, entry.technology_id)
    assert state["complete"] is True
    assert state["points"] == 4
    assert state["priority_pct"] == 66.67
    assert state["classification"] == "priorizada"

    db.refresh(entry)
    assert entry.status == "priorizada"
    assert entry.priority_points == 4


def test_watchlist_band(db, entry, admin):
    rate_all(db, entry, admin, {"P1": 1, "P2": 1, "P3": 1, "P4": 0, "P5": 0, "P6": 0})
    db.refresh(entry)
    assert entry.status == "bajo_vigilancia"
    assert float(entry.priority_pct) == 50.0


# --------------------------------------------------------------------------- #
#  Control de acceso a nivel de campo
# --------------------------------------------------------------------------- #
def test_clinical_evaluator_cannot_rate_technical_criteria(db, entry, clinico):
    for code in ("P1", "P5", "P6"):
        with pytest.raises(PermissionError):
            priority_engine.rate_criterion(
                db,
                cycle_id=entry.cycle_id,
                technology_id=entry.technology_id,
                criterion=code,
                value=1,
                user=clinico,
            )


def test_technical_evaluator_cannot_rate_clinical_criteria(db, entry, tecnico):
    for code in ("P2", "P3"):
        with pytest.raises(PermissionError):
            priority_engine.rate_criterion(
                db,
                cycle_id=entry.cycle_id,
                technology_id=entry.technology_id,
                criterion=code,
                value=1,
                user=tecnico,
            )


def test_each_profile_rates_its_own_criteria(db, entry, tecnico, clinico):
    for code in ("P1", "P5", "P6"):
        priority_engine.rate_criterion(
            db, cycle_id=entry.cycle_id, technology_id=entry.technology_id,
            criterion=code, value=1, user=tecnico,
        )
    for code in ("P2", "P3", "P4"):
        priority_engine.rate_criterion(
            db, cycle_id=entry.cycle_id, technology_id=entry.technology_id,
            criterion=code, value=1, user=clinico,
        )
    state = priority_engine.evaluation_state(db, entry.cycle_id, entry.technology_id)
    assert state["points"] == 6
    assert state["priority_pct"] == 100.0


def test_rateable_criteria_by_profile(tecnico, clinico):
    assert sorted(rbac.rateable_criteria(tecnico)) == ["P1", "P5", "P6"]
    assert sorted(rbac.rateable_criteria(clinico)) == ["P2", "P3", "P4"]


# --------------------------------------------------------------------------- #
#  Validaciones de escritura
# --------------------------------------------------------------------------- #
def test_non_binary_value_is_rejected(db, entry, admin):
    with pytest.raises(PriorityRuleError):
        priority_engine.rate_criterion(
            db, cycle_id=entry.cycle_id, technology_id=entry.technology_id,
            criterion="P1", value=2, user=admin,
        )


def test_unknown_criterion_is_rejected(db, entry, admin):
    with pytest.raises(PriorityRuleError):
        priority_engine.rate_criterion(
            db, cycle_id=entry.cycle_id, technology_id=entry.technology_id,
            criterion="P9", value=1, user=admin,
        )


def test_technology_outside_cycle_cannot_be_rated(db, cycle, admin):
    orphan = Technology(commercial_name="Sin ciclo")
    db.add(orphan)
    db.commit()
    with pytest.raises(PriorityRuleError):
        priority_engine.rate_criterion(
            db, cycle_id=cycle.id, technology_id=orphan.id,
            criterion="P1", value=1, user=admin,
        )


# --------------------------------------------------------------------------- #
#  Congelacion al cierre del ciclo
# --------------------------------------------------------------------------- #
def test_frozen_entry_rejects_new_ratings(db, entry, cycle, admin):
    rate_all(db, entry, admin, {"P1": 1, "P2": 1, "P3": 1, "P4": 1, "P5": 1, "P6": 1})
    cycle.status = "en_evaluacion"
    db.commit()
    cycle_service.close_cycle(db, cycle, actor=admin.email)

    db.refresh(entry)
    assert entry.frozen is True
    with pytest.raises(PriorityRuleError):
        priority_engine.rate_criterion(
            db, cycle_id=entry.cycle_id, technology_id=entry.technology_id,
            criterion="P1", value=0, user=admin,
        )


def test_excluded_technology_is_not_rated(db, entry, admin):
    entry.status = "excluida"
    db.commit()
    with pytest.raises(PriorityRuleError):
        priority_engine.rate_criterion(
            db, cycle_id=entry.cycle_id, technology_id=entry.technology_id,
            criterion="P1", value=1, user=admin,
        )


# --------------------------------------------------------------------------- #
#  Parametrizacion en base de datos
# --------------------------------------------------------------------------- #
def test_thresholds_come_from_database_not_code(db):
    from app.models import MethodologyParam

    param = db.get(MethodologyParam, "priority.points_prioritized")
    param.value = "5"
    db.commit()
    assert priority_engine.classify(db, 4) == "bajo_vigilancia"
    assert priority_engine.classify(db, 5) == "priorizada"
