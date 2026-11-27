"""Ciclos: motivo al devolver, vista previa de cierre y arrastre, recorrido y exporte."""
from __future__ import annotations

import io

import pytest

from frente_a_helpers import Harness

from app import audit
from app.models import AuditLog, CycleTechnology
from app.routers import cycles


@pytest.fixture()
def h():
    audit.install_listeners()
    harness = Harness(cycles)
    yield harness
    harness.close()


def _payload(code="Ciclo I - 2032", opened="2032-01-05", cutoff="2032-03-15", bulletin="2032-03-29", notes=""):
    return {"code": code, "opened_on": opened, "data_cutoff_on": cutoff, "bulletin_due_on": bulletin, "notes": notes}


def _entry(h, cycle, name, status, **extra):
    tech = h.tech(name)
    h.db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status=status, **extra))
    h.db.commit()
    return tech


def test_code_is_trimmed_before_the_duplicate_check_and_lengths_answer_422(h):
    assert h.client.post("/api/cycles", json=_payload(code="Uno")).status_code == 201
    dup = h.client.post("/api/cycles", json=_payload(code="  Uno  ", opened="2032-05-04", cutoff="2032-07-13", bulletin="2032-07-27"))
    assert dup.status_code == 400 and "Ya existe" in dup.json()["detail"]

    long_code = h.client.post("/api/cycles", json=_payload(code="C" * 121, opened="2032-05-04", cutoff="2032-07-13", bulletin="2032-07-27"))
    assert long_code.status_code == 422 and "120" in long_code.json()["detail"]
    long_notes = h.client.post(
        "/api/cycles",
        json=_payload(code="Dos", opened="2032-05-04", cutoff="2032-07-13", bulletin="2032-07-27", notes="n" * 4001),
    )
    assert long_notes.status_code == 422 and "notas" in long_notes.json()["detail"]


def test_going_back_requires_a_reason_and_it_is_kept_in_the_log(h):
    cycle = h.client.post("/api/cycles", json=_payload()).json()
    cid = cycle["id"]
    assert h.client.put(f"/api/cycles/{cid}/status", json={"status": "en_filtrado"}).status_code == 200

    missing = h.client.put(f"/api/cycles/{cid}/status", json={"status": "en_configuracion", "justification": "  "})
    assert missing.status_code == 422 and "motivo" in missing.json()["detail"]
    assert h.client.get(f"/api/cycles/{cid}").json()["status"] == "en_filtrado"

    back = h.client.put(f"/api/cycles/{cid}/status", json={"status": "en_configuracion", "justification": "Faltaba ajustar el corte"})
    assert back.status_code == 200 and back.json()["status"] == "en_configuracion"
    h.db.expire_all()
    ev = h.db.query(AuditLog).filter(AuditLog.action == "cycle:transition").order_by(AuditLog.id.desc()).first()
    assert ev.new_value == {"status": "en_configuracion", "justification": "Faltaba ajustar el corte"}


def test_history_tells_creation_edits_moves_close_and_carry_over(h):
    cid = h.client.post("/api/cycles", json=_payload(code="Origen")).json()["id"]
    h.client.put(f"/api/cycles/{cid}", json={"data_cutoff_on": "2032-03-16", "notes": "Ajuste"})
    for target in ("en_filtrado", "en_priorizacion"):
        h.client.put(f"/api/cycles/{cid}/status", json={"status": target})
    h.client.put(f"/api/cycles/{cid}/status", json={"status": "en_filtrado", "justification": "Faltó depurar duplicados"})
    for target in ("en_priorizacion", "en_evaluacion"):
        h.client.put(f"/api/cycles/{cid}/status", json={"status": target})
    source = h.db.get(cycles.Cycle, cid)
    _entry(h, source, "Vigilada", "bajo_vigilancia", priority_pct=50)
    closed = h.client.put(f"/api/cycles/{cid}/status", json={"status": "cerrado_consolidado"})
    assert closed.status_code == 200 and closed.json()["closed_by_name"] == "superadmin"

    target = h.cycle("Destino", status="en_filtrado", year=2033)
    assert h.client.post(f"/api/cycles/{cid}/carry-over", json={"target_cycle_id": target.id}).json()["carried"] == 1

    events = h.client.get(f"/api/cycles/{cid}/history").json()
    assert [e["kind"] for e in events] == [
        "created", "edited", "advanced", "advanced", "returned", "advanced", "advanced", "closed", "carried_out",
    ]
    assert events[0]["detail"] == "Apertura 2032-01-05 · corte 2032-03-15 · boletín 2032-03-29"
    assert events[1]["detail"] == "Cambió: corte de datos (2032-03-15 → 2032-03-16), notas"
    assert events[4]["detail"] == "En priorización → En filtrado · Motivo: Faltó depurar duplicados"
    assert events[7]["detail"] == "1 puntaje(s) congelados"
    assert events[8]["detail"] == "1 tecnología(s) hacia Destino"

    received = h.client.get(f"/api/cycles/{target.id}/history").json()
    assert received[-1]["kind"] == "carried_in" and received[-1]["detail"] == "1 tecnología(s) desde Origen"
    assert h.client.get("/api/cycles/99999/history").status_code == 404


def test_close_check_names_what_blocks_and_counts_what_is_left(h):
    cycle = h.cycle("Por cerrar", status="en_evaluacion")
    blocked = _entry(h, cycle, "Sin informe", "en_evaluacion")
    _entry(h, cycle, "Vigilada", "bajo_vigilancia")
    _entry(h, cycle, "Sin filtrar", "asignada_a_ciclo")
    _entry(h, cycle, "Sin calificar", "filtrada_apta_priorizacion")

    check = h.client.get(f"/api/cycles/{cycle.id}/close-check").json()
    assert check["can_close"] is False and check["blocking_count"] == 1
    assert check["blocking"] == [{"technology_id": blocked.id, "name": "Sin informe"}]
    assert check["blocking_technology_ids"] == [blocked.id]
    assert (check["to_freeze"], check["watchlist"], check["pending_screening"], check["pending_rating"]) == (4, 1, 1, 1)
    assert "en evaluación sin informe final" in check["message"]


def test_carry_over_preview_marks_what_is_already_in_the_target(h):
    source = h.cycle("Origen", status="cerrado_consolidado")
    target = h.cycle("Destino", status="en_priorizacion", year=2032)
    first = _entry(h, source, "Primera", "bajo_vigilancia", priority_pct=50)
    second = _entry(h, source, "Segunda", "bajo_vigilancia")
    _entry(h, source, "Priorizada", "priorizada")
    h.db.add(CycleTechnology(cycle_id=target.id, technology_id=second.id, status="priorizada"))
    h.db.commit()

    alone = h.client.get(f"/api/cycles/{source.id}/carry-over/preview").json()
    assert (alone["total"], alone["to_carry"], alone["already_in_target"]) == (2, 2, 0)

    preview = h.client.get(f"/api/cycles/{source.id}/carry-over/preview", params={"target_cycle_id": target.id}).json()
    assert (preview["total"], preview["to_carry"], preview["already_in_target"]) == (2, 1, 1)
    assert preview["items"] == [
        {"technology_id": first.id, "name": "Primera", "priority_pct": 50.0, "already_in_target": False},
        {"technology_id": second.id, "name": "Segunda", "priority_pct": None, "already_in_target": True},
    ]
    # La vista previa no arrastra nada.
    assert h.db.query(CycleTechnology).filter_by(cycle_id=target.id).count() == 1
    carried = h.client.post(f"/api/cycles/{source.id}/carry-over", json={"target_cycle_id": target.id}).json()
    assert carried["carried"] == preview["to_carry"]


def test_export_lists_every_cycle_and_is_audited(h):
    from openpyxl import load_workbook

    cycle = h.cycle("=Formula", status="en_priorizacion")
    _entry(h, cycle, "Una", "priorizada")
    _entry(h, cycle, "Dos", "bajo_vigilancia")
    h.cycle("Cerrado", status="cerrado_consolidado", year=2030)

    res = h.as_role("revisor_pares").client.get("/api/cycles/export")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    lines = res.content.decode("utf-8-sig").splitlines()
    assert lines[0].startswith("Código;Año;Estado;Histórico;Apertura")
    row = next(line.split(";") for line in lines if "Formula" in line)
    assert row[0] == "'=Formula"  # no se ejecuta como fórmula
    assert row[2] == "En priorización" and row[7] == "12.0"
    assert (row[9], row[13], row[14]) == ("2", "1", "1")
    closed = next(line.split(";") for line in lines if line.startswith("Cerrado;"))
    assert closed[8] == ""  # los días solo aplican a ciclos abiertos

    xlsx = h.client.get("/api/cycles/export", params={"format": "xlsx"})
    ws = load_workbook(io.BytesIO(xlsx.content))["Ciclos"]
    assert ws.max_row == 3 and ws["A1"].value == "Código"
    assert h.client.get("/api/cycles/export", params={"format": "pdf"}).status_code == 422

    h.db.expire_all()
    events = h.db.query(AuditLog).filter(AuditLog.action == "cycle:export").order_by(AuditLog.id).all()
    assert [e.new_value for e in events] == [{"format": "csv", "rows": 2}, {"format": "xlsx", "rows": 2}]
