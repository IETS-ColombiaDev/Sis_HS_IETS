"""Frente B: CRUD de fuentes y ejecucion por fuente sin callejones sin salida."""
from __future__ import annotations

from frente_b_support import api  # noqa: F401  (fixture)

from app.models import Finding, IngestJob, Source


def test_quick_create_uses_a_catalog_block_and_sane_defaults(api):
    res = api.post("/api/sources/quick", json={"title": "Observatorio X", "url": "https://obs.example.org/"})
    assert res.status_code == 201
    body = res.json()
    # Antes quedaba en "Referente internacional", un bloque que los filtros no ofrecen.
    assert body["category"] == "Agencias de HTA y redes de EH"
    assert body["connector"] == "html" and body["access_level"] == "D"
    assert body["sync_frequency"] == "semanal" and body["scan_interval_hours"] == 168
    chosen = api.post(
        "/api/sources/quick",
        json={"title": "Otra", "url": "https://otra.example.org", "category": "Agencias regulatorias"},
    )
    assert chosen.json()["category"] == "Agencias regulatorias"


def test_quick_create_rejects_bad_url_and_duplicates(api):
    assert api.post("/api/sources/quick", json={"title": "X", "url": "ftp://x"}).status_code == 422
    assert api.post("/api/sources/quick", json={"title": " ", "url": "https://x.org"}).status_code == 422
    assert api.post("/api/sources/quick", json={"title": "A", "url": "https://dup.example.org/a"}).status_code == 201
    dup = api.post("/api/sources/quick", json={"title": "B", "url": "https://DUP.example.org/a/?utm_source=x"})
    assert dup.status_code == 409
    assert "Ya existe una fuente" in dup.json()["detail"]


def test_full_create_validates_connector_level_and_config(api):
    base = {"title": "Fuente", "url": "https://f.example.org"}
    assert api.post("/api/sources", json={**base, "connector": "inventado"}).status_code == 422
    assert api.post("/api/sources", json={**base, "access_level": "Z"}).status_code == 422
    ok = api.post(
        "/api/sources",
        json={**base, "connector": "fixture", "access_level": "b", "sync_frequency": "diaria", "connector_config": {"records": []}},
    )
    assert ok.status_code == 201
    assert ok.json()["access_level"] == "B"
    assert ok.json()["scan_interval_hours"] == 24


def test_toggle_ingest_and_block_enabling_a_retired_source(api):
    sid = api.add_source()
    off = api.put(f"/api/sources/{sid}", json={"scrape_enabled": False})
    assert off.status_code == 200 and off.json()["scrape_enabled"] is False
    retired = api.add_source(title="Vieja", url="https://vieja.example.org", retired=True, catalog_active=False, scrape_enabled=False)
    res = api.put(f"/api/sources/{retired}", json={"scrape_enabled": True})
    assert res.status_code == 409
    assert "retirada" in res.json()["detail"]


def test_delete_is_refused_for_sources_with_signals_or_from_the_catalog(api):
    with_signals = api.add_source()
    with api.db() as db:
        db.add(Finding(source_id=with_signals, title="Senal", content_hash="h1"))
        db.commit()
    res = api.delete(f"/api/sources/{with_signals}")
    assert res.status_code == 409 and "Deshabilite" in res.json()["detail"]

    catalog = api.add_source(title="CT.gov", url="https://ct.example.org", catalog_code="FP-RE-01")
    res = api.delete(f"/api/sources/{catalog}")
    assert res.status_code == 409 and "D-06" in res.json()["detail"]


def test_delete_clean_source_removes_its_queue(api):
    sid = api.add_source(title="Temporal", url="https://tmp.example.org")
    with api.db() as db:
        db.add(IngestJob(connector="fixture", source_id=sid, status="error"))
        db.commit()
    assert api.delete(f"/api/sources/{sid}").status_code == 204
    with api.db() as db:
        assert db.get(Source, sid) is None
        assert db.query(IngestJob).filter(IngestJob.source_id == sid).count() == 0


def test_scanning_a_retired_or_disabled_source_is_a_clear_409_not_a_500(api):
    # Bug: `enqueue` omite las retiradas y `jobs[0]` reventaba con IndexError (HTTP 500).
    retired = api.add_source(title="Retirada", url="https://r.example.org", retired=True, catalog_active=False)
    res = api.post(f"/api/scan/source/{retired}")
    assert res.status_code == 409
    disabled = api.add_source(title="Apagada", url="https://a.example.org", scrape_enabled=False)
    res = api.post(f"/api/scan/source/{disabled}")
    assert res.status_code == 409 and "deshabilitada" in res.json()["detail"]


def test_scan_one_fixture_source_end_to_end(api):
    sid = api.add_source()
    res = api.post(f"/api/scan/source/{sid}", role="evaluador_tecnico")
    assert res.status_code == 200
    assert res.json()["status"] == "ok" and res.json()["items_new"] == 1
    logs = api.get(f"/api/scan/logs?source_id={sid}").json()
    assert logs and logs[0]["source_id"] == sid


def test_bulk_run_enqueues_without_processing_in_the_request(api):
    sid = api.add_source()
    res = api.post("/api/ingest/run", json={"source_ids": [sid], "process_now": False})
    assert res.status_code == 200 and res.json()["queued"] == 1
    assert res.json()["jobs"][0]["status"] == "pendiente"
    assert api.kicks == ["kick"]


def test_export_csv_opens_in_excel(api):
    api.add_source(title="Fuente con tilde Bogotá")
    res = api.get("/api/sources/export")
    assert res.status_code == 200
    assert res.content.startswith(b"\xef\xbb\xbf")
    assert "Bogotá" in res.content.decode("utf-8-sig")


def test_catalog_reload_keeps_sources_added_by_the_team(api):
    # Bug: sync_catalog (que corre en cada arranque) retiraba toda fuente sin
    # codigo de catalogo, incluidas las registradas a mano desde /fuentes.
    from app.catalog_service import sync_catalog

    quick = api.post("/api/sources/quick", json={"title": "Local", "url": "https://local.example.org"}).json()
    full = api.post("/api/sources", json={"title": "Local 2", "url": "https://local2.example.org"}).json()
    legacy = api.add_source(title="Inventario viejo", url="https://viejo.example.org")
    with api.db() as db:
        sync_catalog(db, triggered_by="prueba")
    with api.db() as db:
        assert db.get(Source, quick["id"]).retired is False
        assert db.get(Source, full["id"]).retired is False
        assert db.get(Source, quick["id"]).scrape_enabled is True
        assert db.get(Source, legacy).retired is True


def test_preview_refuses_internal_addresses_in_production(monkeypatch):
    # Riesgo SSRF: la vista previa visita la URL desde el servidor.
    from app import scraper
    from app.config import settings

    assert scraper.is_internal_url("http://127.0.0.1:8000/api/health") is True
    assert scraper.is_internal_url("http://10.1.2.3/") is True
    monkeypatch.setattr(type(settings), "is_production", property(lambda self: True))
    called = []
    monkeypatch.setattr(scraper, "fetch_url", lambda *a, **k: called.append(a) or (200, "text/html", "", b""))
    out = scraper.preview_url("http://127.0.0.1:8000/")
    assert out["ok"] is False and "red interna" in out["message"] and not called
