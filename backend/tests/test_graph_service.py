from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import graph_service, methodology  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import Cluster, Cycle, CycleTechnology, StrategyGraph, Technology  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


def _cycle_with_tech(db):
    cluster = db.query(Cluster).first()
    tech = Technology(commercial_name="Lutathera", inn_name="lutecio", cluster_id=cluster.id)
    cycle = Cycle(
        code="C-GRAFO",
        year=dt.date.today().year,
        opened_on=dt.date.today(),
        data_cutoff_on=dt.date.today() + dt.timedelta(weeks=12),
        status="cerrado_consolidado",
    )
    db.add_all([tech, cycle])
    db.commit()
    db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status="publicada", priority_points=6))
    db.commit()
    return cycle, tech


def test_graph_has_cycle_cluster_tech_and_funnel(db):
    cycle, tech = _cycle_with_tech(db)
    graph = graph_service.build_graph(db, cycle, include_restricted=True)
    kinds = {n["type"] for n in graph["nodes"]}
    assert "cycle" in kinds
    assert "cluster" in kinds
    assert "technology" in kinds
    assert "funnel" in kinds
    assert any(n["id"] == f"tech:{tech.id}" for n in graph["nodes"])
    assert graph["default_expanded"]


def test_node_context_mentions_the_technology(db):
    cycle, tech = _cycle_with_tech(db)
    text = graph_service.node_context(db, cycle, f"tech:{tech.id}", include_restricted=False)
    assert "Lutathera" in text
    assert cycle.code in text


def test_save_graph_view_roundtrip(db):
    cycle, _ = _cycle_with_tech(db)
    row = graph_service.save_graph(
        db,
        cycle=cycle,
        user_email="admin@iets.org.co",
        title="Lectura comite",
        payload={"expanded": ["cycle:1"], "notes": "revisar cancer"},
    )
    db.commit()
    found = db.get(StrategyGraph, row.id)
    assert found.title == "Lectura comite"
    listed = graph_service.list_graphs(db, cycle.id, "admin@iets.org.co")
    assert listed[0].id == row.id
