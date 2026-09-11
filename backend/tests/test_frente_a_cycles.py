"""Frente A: CRUD de ciclos (RF05), validaciones de fechas, eliminacion y arrastre."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import cycle_service
from app.cycle_service import CycleRuleError
from app.models import Cycle, Technology
from app.routers import cycles


@pytest.fixture()
def h():
    harness = Harness(cycles)
    yield harness
    harness.close()


def _payload(code="Ciclo I - 2032", opened="2032-01-05", cutoff="2032-03-15", bulletin="2032-03-29"):
    return {"code": code, "opened_on": opened, "data_cutoff_on": cutoff, "bulletin_due_on": bulletin, "notes": ""}


def test_create_rejects_a_cutoff_before_the_opening(h):
    res = h.client.post("/api/cycles", json=_payload(cutoff="2031-12-01"))

    assert res.status_code == 422
    assert "corte" in res.json()["detail"]


def test_create_rejects_a_bulletin_before_the_cutoff(h):
    res = h.client.post("/api/cycles", json=_payload(cutoff="2032-03-20", bulletin="2032-03-10"))

    assert res.status_code == 422
    assert "boletín" in res.json()["detail"]


def test_create_enforces_window_and_quota_with_explicit_messages(h):
    short = h.client.post("/api/cycles", json=_payload(cutoff="2032-02-01", bulletin="2032-02-10"))
    assert short.status_code == 422 and "semanas" in short.json()["detail"]

    for i, month in enumerate(("01", "05", "09")):
        ok = h.client.post(
            "/api/cycles",
            json=_payload(code=f"C{i}", opened=f"2032-{month}-01", cutoff=f"2032-{int(month) + 2:02d}-20", bulletin=None),
        )
        assert ok.status_code == 201, ok.text
    fourth = h.client.post("/api/cycles", json=_payload(code="C4", opened="2032-10-01", cutoff="2032-12-20", bulletin=None))
    assert fourth.status_code == 422
    assert "máximo" in fourth.json()["detail"]


def test_update_with_a_duplicated_code_answers_400_not_500(h):
    first = h.client.post("/api/cycles", json=_payload(code="Uno")).json()
    second = h.client.post("/api/cycles", json=_payload(code="Dos", opened="2032-05-04", cutoff="2032-07-13", bulletin="2032-07-27")).json()

    res = h.client.put(f"/api/cycles/{second['id']}", json={"code": "Uno"})

    assert res.status_code == 400
    assert "Uno" in res.json()["detail"]
    assert h.client.get(f"/api/cycles/{first['id']}").json()["code"] == "Uno"


def test_update_edits_dates_and_notes_and_revalidates(h):
    created = h.client.post("/api/cycles", json=_payload()).json()

    ok = h.client.put(f"/api/cycles/{created['id']}", json={"notes": "Ajuste", "bulletin_due_on": "2032-04-05"})
    bad = h.client.put(f"/api/cycles/{created['id']}", json={"bulletin_due_on": "2032-06-30"})

    assert ok.status_code == 200 and ok.json()["notes"] == "Ajuste"
    assert bad.status_code == 422
    assert h.client.get(f"/api/cycles/{created['id']}").json()["bulletin_due_on"] == "2032-04-05"


def test_delete_an_empty_cycle_in_configuration(h):
    created = h.client.post("/api/cycles", json=_payload()).json()

    res = h.client.delete(f"/api/cycles/{created['id']}")

    assert res.status_code == 204
    h.db.expire_all()
    assert h.db.get(Cycle, created["id"]) is None


def test_delete_is_blocked_with_work_or_after_configuration(h):
    busy = h.cycle("Con trabajo", status="en_configuracion")
    h.entry(busy, h.tech(), "asignada_a_ciclo")
    advanced = h.cycle("Avanzado", status="en_filtrado", year=2033)

    with_work = h.client.delete(f"/api/cycles/{busy.id}")
    moved = h.client.delete(f"/api/cycles/{advanced.id}")

    assert with_work.status_code == 409 and "tecnologías" in with_work.json()["detail"]
    assert moved.status_code == 409 and "configuración" in moved.json()["detail"]


def test_delete_requires_cycle_write(h):
    created = h.client.post("/api/cycles", json=_payload()).json()

    res = h.as_role("evaluador_clinico").client.delete(f"/api/cycles/{created['id']}")

    assert res.status_code == 403


def test_carry_over_to_the_same_cycle_is_rejected(h):
    open_cycle = h.cycle("Abierto", status="en_filtrado")

    with pytest.raises(CycleRuleError, match="distinto"):
        cycle_service.carry_over_watchlist(h.db, open_cycle, open_cycle)
    res = h.client.post(f"/api/cycles/{open_cycle.id}/carry-over", json={"target_cycle_id": open_cycle.id})
    assert res.status_code == 409


def test_carry_over_puts_the_technology_back_in_the_queue(h):
    source = h.cycle("Origen", status="cerrado_consolidado")
    target = h.cycle("Destino", status="en_priorizacion", year=2032)
    tech = h.tech("Vigilada")
    h.entry(source, tech, "bajo_vigilancia", priority_pct=50.0, frozen=True)

    res = h.client.post(f"/api/cycles/{source.id}/carry-over", json={"target_cycle_id": target.id})

    assert res.status_code == 200 and res.json()["carried"] == 1
    h.db.expire_all()
    assert h.db.get(Technology, tech.id).status == "filtrada_apta_priorizacion"


def test_delete_cleans_stale_rows_so_a_reused_id_starts_clean(h):
    """Residuos sin instancia (de bases antiguas) no bloquean ni sobreviven a la baja."""
    from app.models import NoveltyAssessment, PriorityScore

    cycle = h.cycle("Configuracion con residuos", status="en_configuracion")
    tech = h.tech()
    h.db.add(PriorityScore(cycle_id=cycle.id, technology_id=tech.id, criterion="P1", value=1))
    h.db.add(NoveltyAssessment(cycle_id=cycle.id, technology_id=tech.id, option_code="nueva_indicacion"))
    h.db.commit()
    cycle_id = cycle.id

    res = h.client.delete(f"/api/cycles/{cycle_id}")

    assert res.status_code == 204
    h.db.expire_all()
    assert h.db.query(PriorityScore).filter_by(cycle_id=cycle_id).count() == 0
    assert h.db.query(NoveltyAssessment).filter_by(cycle_id=cycle_id).count() == 0
