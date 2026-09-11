"""Frente B: los routers de operacion respetan la matriz RBAC declarada.

Bug corregido: notas, fuentes, vigilancia, recomendaciones y configuracion
usaban `require_role("editor"/"admin")`, que traduce a `technology:write` o
`user:manage`. Con eso el tomador de decisiones no podia escribir notas aunque
la matriz le concede `note:write`.
"""
from __future__ import annotations

import pytest

from frente_b_support import api  # noqa: F401  (fixture)


def _note(api, role="superadmin", **kw):
    data = {"entity_type": "general", "content": "Observacion del equipo", "title": "T"}
    data.update(kw)
    return api.post("/api/notes", role=role, json=data)


def test_decision_maker_can_write_notes_but_peer_reviewer_cannot(api):
    assert _note(api, "tomador_decisiones").status_code == 201
    res = _note(api, "revisor_pares")
    assert res.status_code == 403
    assert "note:write" in res.json()["detail"]


def test_only_author_or_superadmin_edits_or_deletes_a_note(api):
    note = _note(api, "evaluador_tecnico").json()
    other = api.put(f"/api/notes/{note['id']}", role="evaluador_clinico", json={"content": "cambio ajeno"})
    assert other.status_code == 403
    assert api.delete(f"/api/notes/{note['id']}", role="tomador_decisiones").status_code == 403
    # Fijar ordena la vista del equipo: lo puede cualquiera con note:write.
    pin = api.put(f"/api/notes/{note['id']}", role="evaluador_clinico", json={"pinned": True})
    assert pin.status_code == 200 and pin.json()["pinned"] is True
    own = api.put(f"/api/notes/{note['id']}", role="evaluador_tecnico", json={"content": "ajuste propio"})
    assert own.status_code == 200 and own.json()["content"] == "ajuste propio"
    assert api.delete(f"/api/notes/{note['id']}", role="superadmin").status_code == 204


def test_note_link_must_point_to_an_existing_entity(api):
    res = _note(api, entity_type="finding", entity_id=99999)
    assert res.status_code == 404
    source_id = api.add_source()
    ok = _note(api, entity_type="source", entity_id=source_id)
    assert ok.status_code == 201
    assert ok.json()["entity_label"] == "Fuente de prueba"


@pytest.mark.parametrize("role", ["tomador_decisiones", "revisor_pares"])
def test_read_only_profiles_cannot_touch_sources_or_scans(api, role):
    source_id = api.add_source()
    assert api.post("/api/sources/quick", role=role, json={"title": "X", "url": "https://x.org"}).status_code == 403
    assert api.put(f"/api/sources/{source_id}", role=role, json={"scrape_enabled": False}).status_code == 403
    assert api.delete(f"/api/sources/{source_id}", role=role).status_code == 403
    assert api.post("/api/ingest/run", role=role, json={"source_ids": [source_id]}).status_code == 403
    assert api.post(f"/api/scan/source/{source_id}", role=role).status_code == 403
    assert api.post("/api/scan/preview", role=role, json={"url": "https://x.org"}).status_code == 403
    # Leer si pueden.
    assert api.get("/api/sources", role=role).status_code == 200
    assert api.get("/api/scan/logs", role=role).status_code == 200


def test_clinical_evaluator_manages_sources(api):
    res = api.post("/api/sources/quick", role="evaluador_clinico", json={"title": "Nueva", "url": "https://nueva.org"})
    assert res.status_code == 201


def test_configuration_requires_config_manage(api):
    for role in ("evaluador_tecnico", "evaluador_clinico", "tomador_decisiones", "revisor_pares"):
        assert api.get("/api/config", role=role).status_code == 403
        assert api.put("/api/config/schedule", role=role, json={"scan_interval_hours": 4}).status_code == 403
    assert api.get("/api/config", role="superadmin").status_code == 200


def test_recommendations_require_report_write(api):
    body = {"title": "Informe", "content": "Contenido", "impact": "medio"}
    assert api.post("/api/recommendations", role="tomador_decisiones", json=body).status_code == 403
    assert api.post("/api/recommendations", role="revisor_pares", json=body).status_code == 403
    created = api.post("/api/recommendations", role="evaluador_clinico", json=body)
    assert created.status_code == 201
    rid = created.json()["id"]
    assert api.delete(f"/api/recommendations/{rid}", role="tomador_decisiones").status_code == 403


def test_findings_writes_require_technology_write(api):
    source_id = api.add_source()
    payload = {"source_id": source_id, "title": "Senal manual"}
    assert api.post("/api/findings", role="tomador_decisiones", json=payload).status_code == 403
    created = api.post("/api/findings", role="evaluador_tecnico", json=payload)
    assert created.status_code == 201
    fid = created.json()["id"]
    assert api.put(f"/api/findings/{fid}", role="revisor_pares", json={"status": "revisado"}).status_code == 403
    assert api.delete(f"/api/findings/{fid}", role="tomador_decisiones").status_code == 403
