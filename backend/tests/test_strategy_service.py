"""Pruebas del time-to-market, datamart, ficha publica y boletines (fase 6)."""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import methodology, strategy_service, ttm  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import Cluster, Cycle, CycleTechnology, EvaluationDoc, MethodologyParam, Technology  # noqa: E402
from app.strategy_service import StrategyRuleError  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


def _tech(db, **kwargs):
    kwargs.setdefault("commercial_name", "Betamab")
    kwargs.setdefault("inn_name", "betamab")
    tech = Technology(**kwargs)
    db.add(tech)
    db.commit()
    return tech


def test_ttm_bands_follow_parametrized_thresholds(db):
    assert ttm.classify_months(db, 6) == "inminente"
    assert ttm.classify_months(db, 18) == "transicion"
    assert ttm.classify_months(db, 30) == "emergente"
    assert ttm.classify_months(db, None) == "desconocido"
    db.get(MethodologyParam, "ttm.inminente_months_max").value = "20"
    db.commit()
    assert ttm.classify_months(db, 18) == "inminente"


def test_ttm_past_phase3_does_not_go_negative():
    tech = Technology(phase3_completion_date=dt.date(2022, 6, 30))
    months, basis = ttm.estimate_months(tech, as_of=dt.date(2026, 9, 7), review_days=180)
    assert basis == "fase_iii_mas_revision"
    assert months == 0.0


def test_ttm_uses_phase3_plus_review_days():
    tech = Technology(phase3_completion_date=dt.date.today() - dt.timedelta(days=30))
    months, basis = ttm.estimate_months(tech, as_of=dt.date.today(), review_days=180)
    assert basis == "fase_iii_mas_revision"
    assert months is not None
    assert months > 0


def test_public_fiche_hides_budget_and_confidential(db):
    tech = _tech(db)
    cycle = Cycle(
        code="C-TTM",
        year=dt.date.today().year,
        opened_on=dt.date.today(),
        data_cutoff_on=dt.date.today() + dt.timedelta(weeks=12),
        status="cerrado_consolidado",
    )
    db.add(cycle)
    db.commit()
    doc = EvaluationDoc(
        cycle_id=cycle.id,
        technology_id=tech.id,
        status="publicado",
        confidential=False,
        confidential_fields=["mechanism"],
        body={
            "health_condition": "Asma",
            "mechanism": "secreto",
            "budget_year_1": "12000",
            "comparators_sgsss": "ICS",
        },
        title="Ficha Betamab",
    )
    db.add(doc)
    db.commit()
    fiche = strategy_service.public_fiche(db, tech.id)
    assert "budget_year_1" not in fiche["body"]
    assert "comparators_sgsss" not in fiche["body"]
    assert "mechanism" not in fiche["body"]
    assert fiche["body"]["health_condition"] == "Asma"
    assert fiche["field_labels"]["health_condition"] == "Condicion de salud"
    assert "budget_year_1" not in fiche["field_labels"]


def test_confidential_doc_is_not_listed(db):
    tech = _tech(db, commercial_name="Oculta")
    cycle = Cycle(
        code="C-HID",
        year=dt.date.today().year,
        opened_on=dt.date.today(),
        data_cutoff_on=dt.date.today() + dt.timedelta(weeks=12),
    )
    db.add(cycle)
    db.commit()
    db.add(
        EvaluationDoc(
            cycle_id=cycle.id,
            technology_id=tech.id,
            status="publicado",
            confidential=True,
            title="Secreto",
            body={"health_condition": "x"},
        )
    )
    db.commit()
    assert strategy_service.list_public_fiches(db) == []


def test_bulletin_cannot_publish_without_approval(db):
    cycle = Cycle(
        code="C-BOL",
        year=dt.date.today().year,
        opened_on=dt.date.today(),
        data_cutoff_on=dt.date.today() + dt.timedelta(weeks=12),
    )
    db.add(cycle)
    db.commit()
    row = strategy_service.compile_bulletin(db, cycle, actor="admin@iets.org.co")
    row.approved_by = ""
    with pytest.raises(StrategyRuleError, match="aprobacion"):
        strategy_service.publish_bulletin(db, row, actor="admin@iets.org.co")


def test_datamart_funnel_and_restricted_payload(db):
    cycle = Cycle(
        code="C-DM",
        year=dt.date.today().year,
        opened_on=dt.date.today(),
        data_cutoff_on=dt.date.today() + dt.timedelta(weeks=12),
    )
    tech = _tech(db)
    db.add(cycle)
    db.commit()
    db.add(
        CycleTechnology(
            cycle_id=cycle.id, technology_id=tech.id, status="priorizada", priority_points=5
        )
    )
    db.commit()
    payload = strategy_service.build_payload(db, cycle)
    assert payload["funnel"]["captured"] == 1
    assert payload["funnel"]["prioritized"] == 1
    public = strategy_service.dashboard_for(db, cycle, include_restricted=False)
    assert "budget_heatmap" not in public
    assert "comparators" not in public
    restricted = strategy_service.dashboard_for(db, cycle, include_restricted=True)
    assert "budget_heatmap" in restricted
    assert restricted["funnel"]["captured"] == 1
    assert restricted["conversion"]["priority_rate"] == 100


def test_dashboard_filters_recompute_funnel(db):
    cluster = db.query(Cluster).first()
    other = db.query(Cluster).filter(Cluster.id != cluster.id).first()
    cycle = Cycle(
        code="C-FIL",
        year=dt.date.today().year,
        opened_on=dt.date.today(),
        data_cutoff_on=dt.date.today() + dt.timedelta(weeks=12),
        status="en_priorizacion",
    )
    a = _tech(db, commercial_name="Alfa", cluster_id=cluster.id, development_phase="Fase III")
    b = _tech(db, commercial_name="Beta", cluster_id=other.id if other else cluster.id, development_phase="Fase I")
    db.add(cycle)
    db.commit()
    db.add(CycleTechnology(cycle_id=cycle.id, technology_id=a.id, status="priorizada", priority_points=5))
    db.add(CycleTechnology(cycle_id=cycle.id, technology_id=b.id, status="asignada_a_ciclo", priority_points=1))
    db.commit()
    full = strategy_service.dashboard_for(db, cycle, include_restricted=False)
    assert full["funnel"]["captured"] == 2
    filtered = strategy_service.dashboard_for(
        db, cycle, include_restricted=False, cluster_id=cluster.id
    )
    assert filtered["funnel"]["captured"] == 1
    assert filtered["ttm_scatter"][0]["name"] == "Alfa"
    phased = strategy_service.dashboard_for(db, cycle, include_restricted=False, phase="fase_i")
    assert phased["funnel"]["captured"] == 1
    assert phased["from_cache"] is False


def test_public_stats_never_include_budget(db):
    stats = strategy_service.public_stats(db)
    assert "budget" not in stats
    assert "comparators" not in stats
    assert "published" in stats
