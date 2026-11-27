"""Boletines: contenido ampliado, edición, anular aprobación, vigencia, recorrido y baja."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app.models import AuditLog, Bulletin, CycleTechnology
from app.routers import strategy


@pytest.fixture()
def h():
    harness = Harness(strategy)
    yield harness
    harness.close()


def _entry(h, cycle, name, status, points=None):
    tech = h.tech(name)
    h.db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status=status, priority_points=points))
    h.db.commit()
    return tech


def _compile(h, cycle):
    res = h.client.post(f"/api/bulletins/compile/{cycle.id}")
    assert res.status_code == 200, res.text
    return res.json()


def test_compiled_body_brings_top_prioritized_previous_cycle_and_no_amounts(h):
    older = h.cycle("Ciclo anterior", status="en_evaluacion", year=2030)
    _entry(h, older, "Vieja", "priorizada", 4)
    cycle = h.cycle("Ciclo actual", status="en_evaluacion")
    _entry(h, cycle, "Seis puntos", "priorizada", 6)
    _entry(h, cycle, "Cuatro puntos", "priorizada", 4)
    _entry(h, cycle, "Sin filtrar", "asignada_a_ciclo")

    out = _compile(h, cycle)
    body = out["body"]
    assert out["cycle_code"] == "Ciclo actual" and out["updated_at"]
    assert [t["name"] for t in body["top_prioritized"]] == ["Seis puntos", "Cuatro puntos"]
    assert body["top_prioritized"][0]["points"] == 6 and body["top_prioritized_total"] == 2
    assert body["previous"]["cycle_code"] == "Ciclo anterior" and body["previous"]["funnel"]["prioritized"] == 1
    assert body["total"] == 3 and set(body["summary"]) >= {"imminent", "act_now", "docs"}
    assert "budget" not in str(body).lower() and "monto" not in str(body).lower()

    html = h.client.get(f"/api/bulletins/{out['id']}/export").text
    assert "Tecnologías priorizadas" in html and "Seis puntos" in html
    assert "Frente al ciclo anterior" in html and "Ciclo anterior" in html
    assert "Pendiente de aprobación" in html and "pendiente_aprobacion" not in html


def test_editing_keeps_the_note_on_recompile_and_voids_the_approval(h):
    cycle = h.cycle(status="en_evaluacion")
    bid = _compile(h, cycle)["id"]

    edited = h.client.put(f"/api/bulletins/{bid}", json={"title": "  Boletín de prueba  ", "note": "Mensaje del líder."})
    assert edited.status_code == 200
    assert edited.json()["title"] == "Boletín de prueba" and edited.json()["body"]["note"] == "Mensaje del líder."
    assert "Mensaje del líder." in h.client.get(f"/api/bulletins/{bid}/export").text

    assert h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": False}).json()["approved_by"]
    again = h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": False})
    assert again.status_code == 409 and "ya fue aprobado" in again.json()["detail"]

    # Sin cambios reales no se toca la aprobación; con cambios, se anula.
    same = h.client.put(f"/api/bulletins/{bid}", json={"note": "Mensaje del líder."}).json()
    assert same["approved_by"]
    changed = h.client.put(f"/api/bulletins/{bid}", json={"note": "Otro mensaje."}).json()
    assert changed["approved_by"] == "" and changed["status"] == "pendiente_aprobacion"

    assert _compile(h, cycle)["body"]["note"] == "Otro mensaje."  # recompilar no borra la nota

    assert h.client.put(f"/api/bulletins/{bid}", json={"title": "   "}).status_code == 422
    assert h.client.put(f"/api/bulletins/{bid}", json={"note": "n" * 3001}).status_code == 422
    h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": True})
    assert h.client.put(f"/api/bulletins/{bid}", json={"note": "tarde"}).status_code == 409
    assert h.as_role("revisor_pares").client.put(f"/api/bulletins/{bid}", json={"note": "x"}).status_code == 403


def test_unapprove_needs_a_reason_and_publishing_keeps_who_approved(h):
    cycle = h.cycle(status="en_evaluacion")
    bid = _compile(h, cycle)["id"]
    assert h.client.post(f"/api/bulletins/{bid}/unapprove", json={"reason": "x"}).status_code == 409  # no está aprobado

    h.as_role("evaluador_tecnico").client.post(f"/api/bulletins/{bid}/approve", json={"publish": False})
    assert h.client.post(f"/api/bulletins/{bid}/unapprove", json={"reason": " "}).status_code == 422
    back = h.client.post(f"/api/bulletins/{bid}/unapprove", json={"reason": "Falta revisar las cifras"})
    assert back.status_code == 200 and back.json()["approved_by"] == ""

    h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": False})
    published = h.as_role("superadmin").client.post(f"/api/bulletins/{bid}/approve", json={"publish": True}).json()
    assert published["status"] == "publicado"
    assert published["approved_by"] == "evaluador_tecnico@iets.org.co"  # quien aprobó, no quien publicó
    assert published["body"]["published_by"] == "superadmin@iets.org.co"
    assert h.client.post(f"/api/bulletins/{bid}/unapprove", json={"reason": "tarde"}).status_code == 409


def test_freshness_tells_when_the_cycle_changed_after_compiling(h):
    cycle = h.cycle(status="en_evaluacion")
    _entry(h, cycle, "Una", "priorizada", 5)
    bid = _compile(h, cycle)["id"]
    assert h.client.get(f"/api/bulletins/{bid}/freshness").json() == {"stale": False, "changes": []}

    _entry(h, cycle, "Otra", "priorizada", 4)
    fresh = h.client.get(f"/api/bulletins/{bid}/freshness").json()
    assert fresh["stale"] is True
    by_key = {c["key"]: c for c in fresh["changes"]}
    assert (by_key["prioritized"]["compiled"], by_key["prioritized"]["current"]) == (1, 2)
    assert by_key["captured"]["label"]

    h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": True})
    assert h.client.get(f"/api/bulletins/{bid}/freshness").json()["stale"] is False  # publicado: ya no cambia
    assert h.client.get("/api/bulletins/99999/freshness").status_code == 404


def test_history_and_pdf_download_are_recorded(h):
    cycle = h.cycle(status="en_evaluacion")
    bid = _compile(h, cycle)["id"]
    h.client.put(f"/api/bulletins/{bid}", json={"note": "Nota"})
    h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": False})
    h.client.post(f"/api/bulletins/{bid}/unapprove", json={"reason": "Revisar"})
    _compile(h, cycle)
    h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": False})
    h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": True})
    assert h.client.get(f"/api/bulletins/{bid}/export", params={"format": "pdf"}).status_code == 200
    h.client.get(f"/api/bulletins/{bid}/export")  # ver el HTML no deja registro

    events = h.client.get(f"/api/bulletins/{bid}/history").json()
    assert [e["kind"] for e in events] == [
        "compiled", "edited", "approved", "unapproved", "recompiled", "approved", "published", "exported",
    ]
    assert events[1]["detail"] == "Cambió: nota editorial"
    assert events[3]["detail"] == "Motivo: Revisar"
    h.db.expire_all()
    assert h.db.query(AuditLog).filter(AuditLog.action == "bulletin:export").count() == 1


def test_unpublished_bulletin_can_be_deleted_and_a_published_one_cannot(h):
    cycle = h.cycle(status="en_evaluacion")
    bid = _compile(h, cycle)["id"]
    assert h.as_role("revisor_pares").client.delete(f"/api/bulletins/{bid}").status_code == 403
    assert h.as_role("superadmin").client.delete(f"/api/bulletins/{bid}").status_code == 204
    assert h.db.query(Bulletin).count() == 0

    other = _compile(h, cycle)["id"]
    h.client.post(f"/api/bulletins/{other}/approve", json={"publish": True})
    res = h.client.delete(f"/api/bulletins/{other}")
    assert res.status_code == 409 and "publicado" in res.json()["detail"]
