"""Frente B: catalogos de clusteres y tipologias, parametros y llaves de fuentes."""
from __future__ import annotations

from frente_b_support import api  # noqa: F401  (fixture)

from app.config import settings
from app.models import Cluster, Technology


def test_catalog_create_validates_code_and_duplicates(api):
    bad = api.post("/api/clusters", json={"code": "Con Espacio", "name": "X"})
    assert bad.status_code == 422
    assert api.post("/api/clusters", json={"code": "piel", "name": "  "}).status_code == 422
    ok = api.post("/api/clusters", json={"code": "piel", "name": "Dermatologia", "keywords": ["piel", " "]})
    assert ok.status_code == 201 and ok.json()["keywords"] == ["piel"]
    assert api.post("/api/clusters", json={"code": "piel", "name": "Otra"}).status_code == 409
    assert api.post("/api/clusters", role="evaluador_tecnico", json={"code": "otro_x", "name": "X"}).status_code == 403


def test_catalog_edit_and_toggle(api):
    cid = api.post("/api/tech-types", json={"code": "nanotec", "name": "Nanotecnologia"}).json()["id"]
    assert api.put(f"/api/tech-types/{cid}", json={"name": ""}).status_code == 422
    res = api.put(f"/api/tech-types/{cid}", json={"name": "Nanomedicina", "is_active": False})
    assert res.status_code == 200 and res.json()["is_active"] is False
    listed = api.get("/api/tech-types?include_inactive=true").json()
    assert any(x["id"] == cid for x in listed)
    assert not any(x["id"] == cid for x in api.get("/api/tech-types").json())


def test_catalog_delete_only_local_and_unused(api):
    with api.db() as db:
        seeded = db.query(Cluster).first().id
    res = api.delete(f"/api/clusters/{seeded}")
    assert res.status_code == 409 and "desactívelo" in res.json()["detail"]

    used = api.post("/api/clusters", json={"code": "usado", "name": "En uso"}).json()["id"]
    with api.db() as db:
        db.add(Technology(commercial_name="X", cluster_id=used))
        db.commit()
    assert api.delete(f"/api/clusters/{used}").status_code == 409

    free = api.post("/api/clusters", json={"code": "libre", "name": "Libre"}).json()["id"]
    assert api.delete(f"/api/clusters/{free}", role="evaluador_clinico").status_code == 403
    assert api.delete(f"/api/clusters/{free}").status_code == 204


def test_integer_parameters_reject_decimals(api):
    assert api.put("/api/methodology/params/cycle.max_per_year", json={"value": "3.5"}).status_code == 400
    assert api.put("/api/methodology/params/cycle.max_per_year", json={"value": ""}).status_code == 400
    ok = api.put("/api/methodology/params/cycle.max_per_year", json={"value": " 4.0 "})
    assert ok.status_code == 200 and ok.json()["value"] == "4"


def test_removing_a_saved_source_key_takes_effect_without_restart(api, monkeypatch):
    # Bug: al borrar la llave desde /configuracion, la anterior seguia viva en memoria.
    monkeypatch.setitem(api.config_router._ENV_INGEST_KEYS, "openfda_api_key", "")
    monkeypatch.setattr(settings, "openfda_api_key", "")
    assert api.put("/api/config", json={"openfda_api_key": "LLAVE-123"}).json()["openfda_has_key"] is True
    assert settings.openfda_api_key == "LLAVE-123"
    out = api.put("/api/config", json={"openfda_api_key": ""}).json()
    assert out["openfda_has_key"] is False
    assert settings.openfda_api_key == ""


def test_scan_prompts_can_be_edited_and_restored(api):
    original = api.get("/api/config/prompts").json()
    assert "{content}" in original["user"]
    updated = api.put("/api/config/prompts", json={"system": "Analista de prueba", "max_pages": 5})
    assert updated.status_code == 200
    body = updated.json()
    assert body["system"] == "Analista de prueba" and body["max_pages"] == 5
    restored = api.post("/api/config/prompts/reset").json()
    assert restored["system"] == original["defaults"]["system"]
    assert restored["max_pages"] == original["defaults"]["max_pages"]


def test_token_usage_counter_is_visible_in_admin_config(api):
    from app import usage_meter

    usage_meter.reset()
    usage_meter.record(prompt_tokens=3, completion_tokens=2, total_tokens=5, model="MiniMax-M3")
    cfg = api.get("/api/config").json()
    assert cfg["ai_usage_calls"] >= 1
    assert cfg["ai_usage_total_tokens"] >= 5
    reset = api.post("/api/config/usage/reset").json()
    assert reset["ai_usage_calls"] == 0


def test_scan_timing_knobs_are_saved(api):
    out = api.put(
        "/api/config",
        json={"scan_fetch_timeout": 18, "scan_retries": 2, "scan_pause_ms": 200, "scan_child_timeout": 12},
    ).json()
    assert out["scan_fetch_timeout"] == 18
    assert out["scan_retries"] == 2
    assert out["scan_pause_ms"] == 200
    traces = api.get("/api/config/scan-traces")
    assert traces.status_code == 200 and isinstance(traces.json(), list)
