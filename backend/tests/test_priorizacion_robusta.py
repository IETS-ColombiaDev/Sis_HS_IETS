"""Priorización: avance por criterio, orden y filtro de la cola, recorrido, exporte
y justificación obligatoria al cambiar una respuesta."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import audit, priority_engine
from app.models import AuditLog
from app.priority_engine import PriorityRuleError
from app.routers import priority


@pytest.fixture()
def h():
    audit.install_listeners()
    harness = Harness(priority)
    yield harness
    harness.close()


def _rate(h, cycle, tech, values, role="superadmin", **extra):
    state = None
    for code, value in values.items():
        state = priority_engine.rate_criterion(
            h.db, cycle_id=cycle.id, technology_id=tech.id, criterion=code, value=value, user=h.users[role], **extra
        )
    return state


def _apt(h, cycle, name):
    tech = h.tech(name)
    h.entry(cycle, tech, "filtrada_apta_priorizacion")
    return tech


ALL_YES = {c: 1 for c in priority_engine.CRITERIA_CODES}


def test_changing_an_answer_requires_a_justification(h):
    cycle = h.cycle()
    tech = _apt(h, cycle, "Alfamab")
    _rate(h, cycle, tech, {"P1": 1})

    # Repetir la misma respuesta no es un cambio.
    _rate(h, cycle, tech, {"P1": 1})
    with pytest.raises(PriorityRuleError, match="justificación"):
        _rate(h, cycle, tech, {"P1": 0})
    with pytest.raises(PriorityRuleError, match="justificación"):
        _rate(h, cycle, tech, {"P1": 0}, justification="corto")

    _rate(h, cycle, tech, {"P1": 0}, justification="Ya tiene registro sanitario vigente.")
    assert int(priority_engine.get_scores(h.db, cycle.id, tech.id)["P1"].value) == 0

    res = h.client.post(f"/api/priority/{cycle.id}/{tech.id}/rate", json={"criterion": "P1", "value": 1})
    assert res.status_code == 409
    assert "justificación" in res.json()["detail"]


def test_stats_report_progress_per_criterion_and_for_the_profile(h):
    cycle = h.cycle()
    a = _apt(h, cycle, "Alfamab")
    b = _apt(h, cycle, "Betacept")
    _apt(h, cycle, "Gammavir")
    _rate(h, cycle, a, ALL_YES)
    _rate(h, cycle, b, {"P1": 1, "P2": 0})

    data = h.client.get(f"/api/priority/{cycle.id}/stats").json()

    assert data["rateable"] == 3 and data["complete"] == 1 and data["pending"] == 2
    assert data["progress_pct"] == 33
    assert data["pending_for_me"] == 2  # superadmin califica todo
    assert data["avg_pct"] == 100.0
    assert data["points_distribution"]["6"] == 1
    by_code = {c["code"]: c for c in data["criteria"]}
    assert by_code["P1"]["rated"] == 2 and by_code["P1"]["yes"] == 2
    assert by_code["P2"]["rated"] == 2 and by_code["P2"]["yes"] == 1
    assert by_code["P6"]["rated"] == 1 and by_code["P6"]["total"] == 3
    assert all(c["mine"] for c in data["criteria"])

    # El evaluador técnico solo responde P1, P5 y P6.
    h.as_role("evaluador_tecnico")
    tech_view = h.client.get(f"/api/priority/{cycle.id}/stats").json()
    assert sorted(c["code"] for c in tech_view["criteria"] if c["mine"]) == ["P1", "P5", "P6"]
    assert tech_view["pending_for_me"] == 2


def test_queue_carries_scores_and_supports_order_and_progress(h):
    cycle = h.cycle()
    a = _apt(h, cycle, "Zeta")
    b = _apt(h, cycle, "Alfa")
    c = _apt(h, cycle, "Mu")
    _rate(h, cycle, a, {**ALL_YES, "P6": 0})
    _rate(h, cycle, b, ALL_YES)
    _rate(h, cycle, c, {"P1": 1, "P2": 0})

    url = f"/api/priority/{cycle.id}/queue"
    by_pct = h.client.get(url, params={"order": "pct"}).json()
    assert [i["name"] for i in by_pct] == ["Alfa", "Zeta", "Mu"]
    mu = by_pct[-1]
    assert mu["scores"] == {"P1": 1, "P2": 0, "P3": None, "P4": None, "P5": None, "P6": None}
    assert mu["my_missing"] == ["P3", "P4", "P5", "P6"]
    assert mu["last_rated_at"]

    assert [i["name"] for i in h.client.get(url, params={"order": "nombre"}).json()] == ["Alfa", "Mu", "Zeta"]
    assert h.client.get(url, params={"order": "avance"}).json()[0]["name"] == "Mu"

    incomplete = h.client.get(url, params={"progress": "incompletas"})
    assert [i["name"] for i in incomplete.json()] == ["Mu"]
    assert incomplete.headers["X-Total-Count"] == "1"
    assert len(h.client.get(url, params={"progress": "completas"}).json()) == 2

    assert h.client.get(url, params={"order": "azar"}).status_code == 422
    assert h.client.get(url, params={"progress": "todas"}).status_code == 422


def test_history_tells_who_rated_and_what_changed(h):
    cycle = h.cycle()
    tech = _apt(h, cycle, "Alfamab")
    _rate(h, cycle, tech, ALL_YES)
    _rate(h, cycle, tech, {"P4": 0}, justification="No cambia la ruta de atención actual.")

    events = h.client.get(f"/api/priority/{cycle.id}/{tech.id}/history").json()
    labels = [e["label"] for e in events]

    assert "P1 calificado: Sí" in labels
    assert "P4 cambió de Sí a No" in labels
    changed = next(e for e in events if e["kind"] == "changed")
    assert changed["detail"] == "No cambia la ruta de atención actual."
    classified = [e for e in events if e["kind"] == "classified"]
    assert classified[0]["label"] == "Matriz completa: Priorizada"
    assert classified[-1]["detail"].startswith("5 puntos")
    assert events == sorted(events, key=lambda e: e["at"])

    assert h.client.get(f"/api/priority/{cycle.id}/999999/history").status_code == 404


def test_export_is_csv_safe_and_audited(h):
    cycle = h.cycle()
    tech = _apt(h, cycle, "=HYPERLINK(\"http://x\")")
    _rate(h, cycle, tech, ALL_YES, justification="+nota")
    _apt(h, cycle, "Betacept")

    res = h.client.get(f"/api/priority/{cycle.id}/export.csv")

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    text = res.content.decode("utf-8-sig")
    lines = text.strip().split("\n")
    assert lines[0].startswith("ID;Tecnología;DCI;")
    assert "P1;P2;P3;P4;P5;P6;Calificados;Puntos;%P" in lines[0]
    assert len(lines) == 3
    assert "'=HYPERLINK" in lines[1] and ";'+nota" in lines[1]
    assert ";Sí;Sí;Sí;Sí;Sí;Sí;6;6;100.0;" in lines[1]
    assert lines[2].count("Sí") == 0

    logged = h.db.query(AuditLog).filter(AuditLog.action == "priority:export").one()
    assert logged.new_value == {"rows": 2}
    assert h.client.get("/api/priority/999999/export.csv").status_code == 404
