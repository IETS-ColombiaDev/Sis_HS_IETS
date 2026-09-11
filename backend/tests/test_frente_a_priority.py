"""Frente A: compuerta de la matriz P1-P6 y cola paginada de priorizacion (P5-2)."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import priority_engine
from app.models import AlertEvent, AlertSubscription, CycleTechnology
from app.priority_engine import PriorityRuleError
from app.routers import priority


@pytest.fixture()
def h():
    harness = Harness(priority)
    yield harness
    harness.close()


def _rate_all(h, cycle, tech, values):
    admin = h.users["superadmin"]
    state = None
    for code, value in zip(priority_engine.CRITERIA_CODES, values):
        state = priority_engine.rate_criterion(
            h.db, cycle_id=cycle.id, technology_id=tech.id, criterion=code, value=value, user=admin
        )
    return state


# --------------------------------------------------------------------------- #
#  Bug: la matriz aceptaba tecnologias que no pasaron el filtro de novedad
# --------------------------------------------------------------------------- #
def test_rating_is_rejected_before_the_novelty_gate(h):
    """Criterio de exito 7: nada entra a la matriz sin verificacion de novedad."""
    cycle = h.cycle()
    tech = h.tech()
    h.entry(cycle, tech, "asignada_a_ciclo")

    with pytest.raises(PriorityRuleError, match="filtrado"):
        _rate_all(h, cycle, tech, [1, 1, 1, 1, 1, 1])


def test_rating_via_api_before_filtering_answers_409(h):
    cycle = h.cycle()
    tech = h.tech()
    h.entry(cycle, tech, "asignada_a_ciclo")

    res = h.client.post(f"/api/priority/{cycle.id}/{tech.id}/rate", json={"criterion": "P1", "value": 1})

    assert res.status_code == 409
    assert "novedad" in res.json()["detail"]


def test_rating_after_evaluation_does_not_pull_the_technology_back(h):
    """Antes, recalificar una tecnologia en evaluacion la devolvia a 'priorizada'."""
    cycle = h.cycle()
    tech = h.tech()
    entry = h.entry(cycle, tech, "filtrada_apta_priorizacion")
    _rate_all(h, cycle, tech, [1, 1, 1, 1, 0, 0])
    entry = h.refresh(entry)
    assert entry.status == "priorizada"
    entry.status = "en_evaluacion"
    h.db.commit()

    with pytest.raises(PriorityRuleError, match="evaluación"):
        priority_engine.rate_criterion(
            h.db, cycle_id=cycle.id, technology_id=tech.id, criterion="P5", value=1, user=h.users["superadmin"]
        )
    assert h.refresh(entry).status == "en_evaluacion"


def test_state_explains_why_the_matrix_is_read_only(h):
    cycle = h.cycle()
    tech = h.tech()
    h.entry(cycle, tech, "asignada_a_ciclo")

    data = h.client.get(f"/api/priority/{cycle.id}/{tech.id}").json()

    assert data["entry_status"] == "asignada_a_ciclo"
    assert "filtrado" in data["rate_blocked_reason"]
    assert all(score["can_rate"] is False for score in data["scores"])


def test_rateable_state_has_no_block_reason_and_respects_field_permissions(h):
    cycle = h.cycle()
    tech = h.tech()
    h.entry(cycle, tech, "filtrada_apta_priorizacion")

    data = h.as_role("evaluador_clinico").client.get(f"/api/priority/{cycle.id}/{tech.id}").json()

    assert data["rate_blocked_reason"] == ""
    can = {s["criterion"]: s["can_rate"] for s in data["scores"]}
    assert can == {"P1": False, "P2": True, "P3": True, "P4": True, "P5": False, "P6": False}


# --------------------------------------------------------------------------- #
#  P5-2: cola paginada, con busqueda y filtros
# --------------------------------------------------------------------------- #
def _many(h, n=230):
    cycle = h.cycle()
    for i in range(n):
        tech = h.tech(f"Tecnologia {i:03d}", screening_score=i % 100)
        h.entry(cycle, tech, "filtrada_apta_priorizacion")
    return cycle


def test_queue_pages_on_the_server_with_total_header(h):
    cycle = _many(h)

    first = h.client.get(f"/api/priority/{cycle.id}/queue", params={"limit": 50, "offset": 0})
    last = h.client.get(f"/api/priority/{cycle.id}/queue", params={"limit": 50, "offset": 200})

    assert first.status_code == 200
    assert first.headers["X-Total-Count"] == "230"
    assert len(first.json()) == 50
    assert len(last.json()) == 30
    ids_first = {i["technology_id"] for i in first.json()}
    ids_last = {i["technology_id"] for i in last.json()}
    assert not ids_first & ids_last


def test_queue_search_and_status_filter(h):
    cycle = _many(h, n=12)
    target = h.tech("Pembrolizumab subcutaneo", indication="Melanoma avanzado")
    h.entry(h.refresh(cycle), target, "bajo_vigilancia")

    found = h.client.get(f"/api/priority/{cycle.id}/queue", params={"q": "melanoma"})
    watch = h.client.get(f"/api/priority/{cycle.id}/queue", params={"status": "bajo_vigilancia"})
    bad = h.client.get(f"/api/priority/{cycle.id}/queue", params={"status": "excluida"})

    assert [i["technology_id"] for i in found.json()] == [target.id]
    assert found.headers["X-Total-Count"] == "1"
    assert [i["technology_id"] for i in watch.json()] == [target.id]
    assert bad.status_code == 422


def test_queue_only_pending_counts_after_filtering(h):
    cycle = h.cycle()
    done = h.tech("Ya calificada")
    todo = h.tech("Pendiente")
    h.entry(cycle, done, "filtrada_apta_priorizacion")
    h.entry(cycle, todo, "filtrada_apta_priorizacion")
    for code in ("P1", "P5", "P6"):
        priority_engine.rate_criterion(
            h.db, cycle_id=cycle.id, technology_id=done.id, criterion=code, value=1,
            user=h.users["evaluador_tecnico"],
        )

    res = h.as_role("evaluador_tecnico").client.get(
        f"/api/priority/{cycle.id}/queue", params={"only_pending": True}
    )

    assert [i["technology_id"] for i in res.json()] == [todo.id]
    assert res.headers["X-Total-Count"] == "1"


def test_queue_exposes_the_carried_over_reference(h):
    cycle = h.cycle()
    tech = h.tech("Arrastrada")
    h.entry(cycle, tech, "filtrada_apta_priorizacion", carried_from_cycle_id=99, previous_priority_pct=50.0)

    item = h.client.get(f"/api/priority/{cycle.id}/queue").json()[0]

    assert item["carried_from_cycle_id"] == 99
    assert item["previous_priority_pct"] == 50.0


# --------------------------------------------------------------------------- #
#  RF20: el cambio de franja de una tecnologia de alto riesgo avisa
# --------------------------------------------------------------------------- #
def test_classification_change_of_high_budget_technology_alerts_subscribers(h):
    cycle = h.cycle()
    tech = h.tech("Alto costo")
    h.entry(cycle, tech, "filtrada_apta_priorizacion")
    subscriber = h.users["tomador_decisiones"]
    h.db.add(AlertSubscription(user_id=subscriber.id, cluster_id=None, enabled=True))
    h.db.commit()

    _rate_all(h, cycle, tech, [1, 1, 1, 1, 1, 0])

    events = h.db.query(AlertEvent).filter(AlertEvent.user_id == subscriber.id).all()
    assert [e.kind for e in events] == ["phase_change_high_budget"]
    entry = h.db.query(CycleTechnology).filter_by(cycle_id=cycle.id, technology_id=tech.id).one()
    assert entry.status == "priorizada"


def test_queue_focus_returns_the_page_that_contains_the_linked_technology(h):
    """Enlace directo ?tecnologia=<id>: la cola devuelve la pagina donde esta."""
    cycle = _many(h, n=120)
    all_ids = [i["technology_id"] for i in h.client.get(f"/api/priority/{cycle.id}/queue", params={"limit": 500}).json()]
    target = all_ids[105]

    res = h.client.get(f"/api/priority/{cycle.id}/queue", params={"limit": 50, "offset": 0, "focus": target})
    missing = h.client.get(f"/api/priority/{cycle.id}/queue", params={"limit": 50, "focus": 999999})

    assert res.headers["X-Focus-Found"] == "1"
    assert res.headers["X-Offset"] == "100"
    assert target in [i["technology_id"] for i in res.json()]
    assert missing.headers["X-Focus-Found"] == "0" and missing.headers["X-Offset"] == "0"
