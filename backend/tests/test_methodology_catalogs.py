"""Pruebas de los catalogos y parametros metodologicos parametrizables.

La especificacion advierte que clusteres, tipologias y umbrales pueden variar
tras la referenciacion, por lo que viven en base de datos. Estas pruebas
protegen ese contrato: que la semilla este completa, que sea idempotente y que
ninguna perilla expuesta en la interfaz quede sin consumidor en el codigo.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import methodology, priority_engine  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import Cluster, MethodologyParam, PriorityCriterion, TechType  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


def test_six_clusters_and_seven_tech_types(db):
    """Las dos taxonomias obligatorias de la especificacion, completas."""
    assert db.query(Cluster).count() == 6
    assert db.query(TechType).count() == 7


def test_taxonomies_are_data_not_code(db):
    """Cada clusteres trae las claves de clasificacion asistida."""
    for cluster in db.query(Cluster):
        assert cluster.keywords, f"{cluster.code} sin palabras clave"
        assert cluster.icd10_prefixes, f"{cluster.code} sin prefijos CIE-10"


def test_priority_matrix_has_six_versioned_criteria(db):
    criteria = db.query(PriorityCriterion).order_by(PriorityCriterion.sort_order).all()
    assert [c.code for c in criteria] == ["P1", "P2", "P3", "P4", "P5", "P6"]
    for c in criteria:
        assert c.prompt.strip(), f"{c.code} sin enunciado"
        assert c.version >= 1


def test_seeding_twice_changes_nothing(db):
    """El arranque repetido no puede duplicar catalogos ni pisar valores editados."""
    param = db.get(MethodologyParam, "cycle.max_per_year")
    param.value = "2"
    db.commit()

    methodology.seed_catalogs(db)

    assert db.query(Cluster).count() == 6
    assert db.query(TechType).count() == 7
    assert db.query(PriorityCriterion).count() == 6
    assert db.get(MethodologyParam, "cycle.max_per_year").value == "2"


def test_every_seeded_parameter_has_a_consumer(db):
    """Una perilla editable que ningun calculo lee invita a creer que surtio efecto.

    Si se agrega un parametro a la semilla, debe leerse desde algun modulo o
    declararse retirado. Esta prueba falla en caso contrario.
    """
    app_dir = Path(__file__).resolve().parent.parent / "app"
    # Se recorre el paquete completo, salvo la propia semilla: un modulo nuevo
    # no deberia obligar a actualizar esta lista para que la prueba siga valiendo.
    sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted(app_dir.rglob("*.py"))
        if path.name != "methodology.py"
    )

    huerfanos = [
        row.key for row in db.query(MethodologyParam) if f'"{row.key}"' not in sources
    ]
    assert not huerfanos, f"Parametros sin consumidor: {huerfanos}"


def test_retired_parameters_are_not_reseeded(db):
    for key in methodology.RETIRED_PARAMS:
        assert db.get(MethodologyParam, key) is None


def test_classification_thresholds_come_from_the_database(db):
    """Mover el umbral en base de datos cambia la clasificacion, sin desplegar."""
    assert priority_engine.classify(db, 4) == "priorizada"
    assert priority_engine.classify(db, 3) == "bajo_vigilancia"

    db.get(MethodologyParam, "priority.points_prioritized").value = "3"
    db.commit()

    assert priority_engine.classify(db, 3) == "priorizada"


def test_exclusion_reasons_are_typified():
    """RF10 y RF12 exigen motivo tipificado, no texto libre."""
    assert len(methodology.EXCLUSION_REASONS) >= 5
    for code, label in methodology.EXCLUSION_REASONS.items():
        assert code.islower() and label.strip()
