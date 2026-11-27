"""Evaluación: observaciones con estado, cola con datos del expediente, cambios entre
versiones y exporte del estado editorial."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import evaluation as catalog
from app.models import AuditLog
from app.routers import evaluation, review_portal, technologies


@pytest.fixture()
def h():
    harness = Harness(evaluation, review_portal, technologies)
    yield harness
    harness.close()


def _doc(h, name="Lutecio-177 dotatate", *, cycle=None, fill=True):
    cycle = cycle or h.cycle(status="en_evaluacion")
    tech = h.tech(name)
    h.entry(cycle, tech, "priorizada", priority_points=5, priority_pct=83.33)
    doc = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()
    h.client.post(f"/api/reports/{doc['id']}/coi", json={"accepted": True})
    if fill:
        body = {key: f"Contenido de {key}" for key in catalog.required_fields("mini_hta")}
        res = h.client.put(f"/api/reports/{doc['id']}", json={"body": body})
        assert res.status_code == 200, res.text
    return cycle, tech, doc["id"]


def _comment(h, doc_id, body="Precisar la población objetivo.", field="target_population_co"):
    res = h.client.post(f"/api/reports/{doc_id}/comments", json={"field_key": field, "body": body})
    assert res.status_code == 200, res.text
    return res.json()


def test_an_observation_is_resolved_with_an_answer_and_can_be_reopened(h):
    _, _, doc_id = _doc(h)
    comment = _comment(h, doc_id)
    assert comment["resolved_at"] is None

    res = h.client.post(
        f"/api/reports/{doc_id}/comments/{comment['id']}/resolve", json={"note": "Se agregó la cifra del DANE."}
    )

    assert res.status_code == 200, res.text
    row = res.json()["comments"][0]
    assert row["resolved_at"] and row["resolved_by"] == "superadmin@iets.org.co"
    assert row["resolution_note"] == "Se agregó la cifra del DANE."
    assert row["version_label"].startswith("v")
    again = h.client.post(f"/api/reports/{doc_id}/comments/{comment['id']}/resolve", json={})
    assert again.status_code == 409

    reopened = h.client.post(f"/api/reports/{doc_id}/comments/{comment['id']}/reopen")
    assert reopened.status_code == 200
    assert reopened.json()["comments"][0]["resolved_at"] is None
    assert reopened.json()["comments"][0]["resolution_note"] == ""
    assert h.client.post(f"/api/reports/{doc_id}/comments/{comment['id']}/reopen").status_code == 409

    actions = [a.action for a in h.db.query(AuditLog).filter(AuditLog.entity_type == "review_comments")]
    assert "review:comment_resolved" in actions and "review:comment_reopened" in actions


def test_resolving_needs_the_writing_permission_and_the_right_document(h):
    _, _, doc_id = _doc(h)
    _, _, other_id = _doc(h, "Otra tecnología", cycle=h.cycle("Ciclo B", status="en_evaluacion", year=2032))
    comment = _comment(h, doc_id)

    assert h.client.post(f"/api/reports/{other_id}/comments/{comment['id']}/resolve", json={}).status_code == 404
    assert h.client.post(f"/api/reports/{doc_id}/comments/999999/resolve", json={}).status_code == 404

    h.as_role("tomador_decisiones")
    assert h.client.post(f"/api/reports/{doc_id}/comments/{comment['id']}/resolve", json={}).status_code == 403
    assert h.client.post(f"/api/reports/{doc_id}/comments/{comment['id']}/reopen").status_code == 403


def test_a_comment_has_a_length_limit(h):
    _, _, doc_id = _doc(h)

    res = h.client.post(f"/api/reports/{doc_id}/comments", json={"body": "x" * 4001})

    assert res.status_code == 409
    assert "máximo" in res.json()["detail"]


def test_queue_tells_what_each_dossier_is_waiting_for(h):
    cycle, tech, doc_id = _doc(h)
    pending = h.tech("Sin expediente")
    h.entry(cycle, pending, "priorizada", priority_points=4, priority_pct=66.67)
    first = _comment(h, doc_id)
    _comment(h, doc_id, "Falta el comparador.", "comparators_sgsss")
    h.client.post(f"/api/reports/{doc_id}/comments/{first['id']}/resolve", json={})
    h.client.post(f"/api/reports/{doc_id}/transition", json={"status": "revision_interna"})
    h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Par Externo", "reviewer_email": "par@universidad.edu"},
    )

    rows = {r["technology_id"]: r for r in h.client.get("/api/reports", params={"cycle_id": cycle.id}).json()}

    row = rows[tech.id]
    assert row["doc_status"] == "revision_interna"
    assert row["open_comments"] == 1
    assert row["reviews_pending"] == 1 and row["reviews_done"] == 0
    assert row["invites_expiring"] == 0  # el enlace dura 10 días
    assert row["completeness_pct"] == 100 and row["missing_count"] == 0
    assert row["status_since"] and row["updated_at"] and row["version"]
    empty = rows[pending.id]
    assert empty["doc_id"] is None and empty["open_comments"] == 0 and empty["version"] == ""


def test_versions_list_the_fields_that_changed(h):
    _, _, doc_id = _doc(h)
    h.client.post(f"/api/reports/{doc_id}/transition", json={"status": "revision_interna"})
    h.client.post(f"/api/reports/{doc_id}/transition", json={"status": "borrador"})
    body = {key: f"Contenido de {key}" for key in catalog.required_fields("mini_hta")}
    body["mechanism"] = "Radioligando dirigido a receptores de somatostatina."
    h.client.put(f"/api/reports/{doc_id}", json={"body": body})
    h.client.post(f"/api/reports/{doc_id}/transition", json={"status": "revision_interna"})

    versions = h.client.get(f"/api/reports/{doc_id}/versions").json()

    assert versions[0]["changed_fields"] == []
    assert versions[-1]["status_label"] == "Revisión interna de calidad"
    assert any(v["changed_fields"] == ["mechanism"] for v in versions)


def test_export_of_the_editorial_state_is_csv_safe_and_audited(h):
    cycle, _, doc_id = _doc(h, "=CMD()")
    _comment(h, doc_id)

    res = h.client.get("/api/reports/export.csv", params={"cycle_id": cycle.id})

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    lines = res.content.decode("utf-8-sig").strip().split("\n")
    assert lines[0].startswith("ID;Tecnología;DCI;Clúster;Puntos;Producto;Estado editorial")
    assert len(lines) == 2
    assert ";'=CMD();" in lines[1]
    assert ";Borrador en redacción;" in lines[1]
    logged = h.db.query(AuditLog).filter(AuditLog.action == "report:export_queue").one()
    assert logged.new_value == {"rows": 1}
    assert h.client.get("/api/reports/export.csv", params={"cycle_id": 999999}).status_code == 404
