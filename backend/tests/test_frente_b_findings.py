"""Frente B: senales capturadas (listar, contar, editar, eliminar)."""
from __future__ import annotations

import datetime as dt

from frente_b_support import api  # noqa: F401  (fixture)

from app.models import Cycle, CycleTechnology, Finding, Note, Technology


def _finding(api, source_id, title="Senal", **kw):
    res = api.post("/api/findings", json={"source_id": source_id, "title": title, **kw})
    assert res.status_code == 201, res.text
    return res.json()


def test_stats_count_the_whole_filtered_set_not_the_visible_page(api):
    # Bug: la pantalla contaba "nuevas / priorizadas" sobre las 200 que traia la
    # lista, no sobre el total. Ahora hay un endpoint de conteo.
    sid = api.add_source()
    for i in range(5):
        _finding(api, sid, title=f"Senal {i}")
    fid = _finding(api, sid, title="Otra cosa")["id"]
    api.put(f"/api/findings/{fid}", json={"status": "priorizado"})
    page = api.get("/api/findings?limit=2").json()
    assert len(page) == 2
    stats = api.get("/api/findings/stats").json()
    assert stats["total"] == 6
    assert stats["by_status"]["nuevo"] == 5 and stats["by_status"]["priorizado"] == 1
    assert api.get("/api/findings/stats?q=otra").json()["total"] == 1


def test_update_rejects_values_outside_the_catalog(api):
    sid = api.add_source()
    fid = _finding(api, sid)["id"]
    assert api.put(f"/api/findings/{fid}", json={"status": "archivado"}).status_code == 422
    assert api.put(f"/api/findings/{fid}", json={"horizon": "lejano"}).status_code == 422
    assert api.put(f"/api/findings/{fid}", json={"title": "  "}).status_code == 422
    ok = api.put(f"/api/findings/{fid}", json={"status": "revisado", "horizon": "inminente"})
    assert ok.status_code == 200 and ok.json()["status"] == "revisado"


def test_delete_unassigned_signal_removes_its_staging_technology_and_notes(api):
    sid = api.add_source()
    fid = _finding(api, sid)["id"]
    api.post("/api/notes", json={"entity_type": "finding", "entity_id": fid, "content": "ruido"})
    with api.db() as db:
        tech = db.query(Technology).filter(Technology.finding_id == fid).first()
        assert tech is not None and tech.status == "capturada_no_asignada"
        tech_id = tech.id
    assert api.delete(f"/api/findings/{fid}").status_code == 204
    with api.db() as db:
        assert db.get(Finding, fid) is None
        assert db.get(Technology, tech_id) is None
        assert db.query(Note).filter(Note.entity_type == "finding", Note.entity_id == fid).count() == 0


def test_delete_is_refused_once_the_technology_entered_a_cycle(api):
    sid = api.add_source()
    fid = _finding(api, sid)["id"]
    with api.db() as db:
        tech = db.query(Technology).filter(Technology.finding_id == fid).first()
        cycle = Cycle(code="Ciclo prueba", year=2026, opened_on=dt.date(2026, 1, 5), data_cutoff_on=dt.date(2026, 3, 1))
        db.add(cycle)
        db.flush()
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id))
        tech.status = "asignada_a_ciclo"
        db.commit()
    res = api.delete(f"/api/findings/{fid}")
    assert res.status_code == 409
    assert "descartada" in res.json()["detail"]


def test_enhance_without_ai_is_explicit(api, monkeypatch):
    from app import ai_service

    monkeypatch.setattr(ai_service, "is_enabled", lambda: False)
    sid = api.add_source()
    fid = _finding(api, sid)["id"]
    res = api.post(f"/api/findings/{fid}/enhance-ai")
    assert res.status_code == 400
    assert "IA no configurada" in res.json()["detail"]
