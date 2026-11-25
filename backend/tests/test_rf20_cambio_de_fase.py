"""RF20: alerta cuando cambia la fase clinica de una tecnologia de alto riesgo presupuestal.

Antes la alerta "cambio de fase" solo miraba el estado del flujo (franja de
priorizacion). Ahora tambien avisa cuando cambia la fase de desarrollo real
(por ejemplo de fase II a fase III), incluso si el cambio llega por la
vigilancia en un registro que ya se habia capturado.
"""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness
from frente_b_support import api, fixture_record  # noqa: F401  (fixture)

from app import ingest_service, priority_engine, strategy_service
from app.models import AlertEvent, AlertSubscription, Source, Technology
from app.routers import priority

KIND = "clinical_phase_change_high_budget"


@pytest.fixture()
def h():
    harness = Harness(priority)
    yield harness
    harness.close()


def _high_risk(h, phase="Fase II"):
    cycle = h.cycle()
    tech = h.tech("Terapia de alto costo", development_phase=phase)
    h.entry(cycle, tech, "filtrada_apta_priorizacion")
    admin = h.users["superadmin"]
    for code, value in zip(priority_engine.CRITERIA_CODES, [1, 1, 1, 1, 1, 0]):
        priority_engine.rate_criterion(
            h.db, cycle_id=cycle.id, technology_id=tech.id, criterion=code, value=value, user=admin
        )
    subscriber = h.users["tomador_decisiones"]
    h.db.add(AlertSubscription(user_id=subscriber.id, cluster_id=None, enabled=True))
    h.db.commit()
    h.db.query(AlertEvent).delete()
    h.db.commit()
    return tech, subscriber


def _kinds(h, user):
    return [e.kind for e in h.db.query(AlertEvent).filter(AlertEvent.user_id == user.id).all()]


def test_a_real_phase_change_of_a_high_risk_technology_alerts(h):
    tech, subscriber = _high_risk(h)

    assert strategy_service.update_development_phase(h.db, tech, "Fase III") is True
    h.db.commit()

    events = h.db.query(AlertEvent).filter(AlertEvent.user_id == subscriber.id).all()
    assert [e.kind for e in events] == [KIND]
    assert "Fase II" in events[0].body and "Fase III" in events[0].body
    assert h.db.get(Technology, tech.id).development_phase == "Fase III"


def test_the_same_phase_written_differently_is_not_a_change(h):
    tech, subscriber = _high_risk(h)

    assert strategy_service.update_development_phase(h.db, tech, "  fase   ii ") is False
    assert strategy_service.update_development_phase(h.db, tech, "") is False
    h.db.commit()

    assert _kinds(h, subscriber) == []
    assert h.db.get(Technology, tech.id).development_phase == "Fase II"


def test_learning_the_phase_for_the_first_time_is_not_a_change(h):
    tech, subscriber = _high_risk(h, phase="")

    assert strategy_service.update_development_phase(h.db, tech, "Fase II") is True
    h.db.commit()

    assert _kinds(h, subscriber) == []


def test_a_low_risk_technology_changes_phase_without_alert(h):
    tech = h.tech("Sin priorizar", development_phase="Fase I")
    subscriber = h.users["tomador_decisiones"]
    h.db.add(AlertSubscription(user_id=subscriber.id, cluster_id=None, enabled=True))
    h.db.commit()

    assert strategy_service.update_development_phase(h.db, tech, "Fase II") is True
    h.db.commit()

    assert _kinds(h, subscriber) == []


def test_surveillance_updates_the_phase_of_a_record_it_already_captured(api):  # noqa: F811
    """El registro ya visto vuelve con otra fase: la tecnologia se actualiza."""
    record = fixture_record("NCT-1", "Fármaco demo", development_phase="Fase II")
    sid = api.add_source(connector_config={"records": [record]})
    with api.db() as db:
        ingest_service.run_job(db, ingest_service.enqueue(db, [db.get(Source, sid)], triggered_by="t")[0].id)
        tech = db.query(Technology).filter(Technology.source_id == sid).one()
        assert tech.development_phase == "Fase II"
        tid = tech.id

        source = db.get(Source, sid)
        source.connector_config = {"records": [{**record, "development_phase": "Fase III", "raw": {"id": "NCT-1", "v": 2}}]}
        db.commit()
        ingest_service.run_job(db, ingest_service.enqueue(db, [db.get(Source, sid)], triggered_by="t")[0].id)

        assert db.query(Technology).filter(Technology.source_id == sid).count() == 1  # no se duplica
        assert db.get(Technology, tid).development_phase == "Fase III"
