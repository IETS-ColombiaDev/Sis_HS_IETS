"""Diseminación: validación humana de los informes, origen, recorrido, paquete y exporte."""
from __future__ import annotations

import datetime as dt
import io
import zipfile

from frente_b_support import api  # noqa: F401  (fixture)

from app.models import AuditLog, Cycle, CycleTechnology, Finding, Technology

LONG = "## Síntesis\n" + "Recomendación de adopción condicionada para el sistema de salud colombiano. " * 3


def _signal_in_cycle(api, title="Señal Novamab") -> tuple[int, int, int]:
    sid = api.add_source()
    with api.db() as db:
        cycle = Cycle(code="Ciclo III - 2026", year=2026, opened_on=dt.date(2026, 9, 1), data_cutoff_on=dt.date(2026, 11, 1), status="en_evaluacion")
        db.add(cycle)
        db.flush()
        finding = Finding(source_id=sid, title=title, content_hash=title)
        db.add(finding)
        db.flush()
        tech = Technology(commercial_name="Novamab", inn_name="novamab", finding_id=finding.id, status="en_evaluacion")
        db.add(tech)
        db.flush()
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status="priorizada"))
        db.commit()
        return cycle.id, finding.id, tech.id


def _create(api, **extra) -> dict:
    payload = {"title": "Informe Novamab", "content": LONG, "impact": "alto", **extra}
    res = api.post("/api/recommendations", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_a_report_starts_as_a_draft_and_carries_its_origin(api):
    cycle_id, finding_id, tech_id = _signal_in_cycle(api)

    rec = _create(api, finding_id=finding_id)

    assert rec["status"] == "borrador" and rec["validated_by"] == ""
    assert rec["origin"] == "manual" and rec["edited"] is False and rec["words"] > 10
    assert rec["finding_title"] == "Señal Novamab"
    assert rec["technology_id"] == tech_id and rec["technology_name"] == "Novamab"

    loose = _create(api, title="Informe general")
    in_cycle = api.get("/api/recommendations", params={"cycle_id": cycle_id}).json()
    assert [r["id"] for r in in_cycle] == [rec["id"]]
    assert loose["finding_title"] == "" and loose["technology_id"] is None
    assert api.get("/api/recommendations", params={"status": "validado"}).json() == []
    assert api.get("/api/recommendations", params={"status": "otro"}).status_code == 422


def test_validation_needs_impact_and_content_and_is_undone_by_an_edit(api):
    thin = _create(api, content="Muy corto.", impact="")
    assert "impacto" in api.post(f"/api/recommendations/{thin['id']}/validate").json()["detail"]
    api.put(f"/api/recommendations/{thin['id']}", json={"impact": "bajo"})
    assert "corto" in api.post(f"/api/recommendations/{thin['id']}/validate").json()["detail"]

    rec = _create(api)
    done = api.post(f"/api/recommendations/{rec['id']}/validate", role="evaluador_clinico")
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "validado"
    assert done.json()["validated_by"] == "evaluador_clinico@iets.org.co" and done.json()["validated_at"]
    assert api.post(f"/api/recommendations/{rec['id']}/validate").status_code == 409

    # Un validado no se elimina, y editarlo lo devuelve a borrador.
    assert api.client.delete(f"/api/recommendations/{rec['id']}", headers=api.headers("superadmin")).status_code == 409
    same = api.put(f"/api/recommendations/{rec['id']}", json={"title": rec["title"]}).json()
    assert same["status"] == "validado" and same["edited"] is False
    edited = api.put(f"/api/recommendations/{rec['id']}", json={"content": LONG + " Ajuste."}).json()
    assert edited["status"] == "borrador" and edited["validated_by"] == ""
    assert edited["edited"] is True and edited["updated_by"] == "superadmin@iets.org.co"


def test_reopen_and_history(api):
    rec = _create(api)
    assert api.post(f"/api/recommendations/{rec['id']}/reopen").status_code == 409
    api.post(f"/api/recommendations/{rec['id']}/validate")

    res = api.post(f"/api/recommendations/{rec['id']}/reopen", json={"reason": "Falta el comparador."})
    assert res.status_code == 200 and res.json()["status"] == "borrador"
    api.put(f"/api/recommendations/{rec['id']}", json={"impact": "medio"})

    events = api.get(f"/api/recommendations/{rec['id']}/history").json()
    assert [e["kind"] for e in events] == ["created", "validated", "reopened", "edited"]
    assert events[2]["detail"] == "Falta el comparador."
    assert events[3]["detail"] == "Cambió: impacto"
    assert events[1]["by"] == "superadmin@iets.org.co"
    assert api.get("/api/recommendations/999999/history").status_code == 404


def test_only_writers_validate(api):
    rec = _create(api)

    assert api.post(f"/api/recommendations/{rec['id']}/validate", role="tomador_decisiones").status_code == 403
    assert api.post(f"/api/recommendations/{rec['id']}/reopen", role="revisor_pares").status_code == 403


def test_package_only_carries_validated_reports_and_can_be_previewed(api):
    cycle_id, finding_id, _ = _signal_in_cycle(api)
    draft = _create(api, finding_id=finding_id, title="Informe en borrador")
    ready = _create(api, finding_id=finding_id, title="Informe validado")
    api.post(f"/api/recommendations/{ready['id']}/validate")

    preview = api.get(f"/api/recommendations/package/{cycle_id}/preview", role="tomador_decisiones")
    assert preview.status_code == 200
    data = preview.json()
    assert data["recommendations"] == 1 and data["recommendations_skipped_draft"] == 1
    assert data["unique_list"] == 1 and "generated_by" not in data
    with api.db() as db:  # la vista previa no deja registro de descarga
        assert db.query(AuditLog).filter(AuditLog.action == "dissemination:package").count() == 0

    zf = zipfile.ZipFile(io.BytesIO(api.get(f"/api/recommendations/package/{cycle_id}").content))
    recs = [n for n in zf.namelist() if n.startswith("recomendaciones/") and n.endswith(".md")]
    assert len(recs) == 1 and "informe-validado" in recs[0]
    assert "validado por superadmin@iets.org.co" in zf.read(recs[0]).decode()
    assert "1 recomendación(es) en borrador" in zf.read("LEEME.txt").decode()

    with_drafts = api.get(f"/api/recommendations/package/{cycle_id}/preview", params={"include_drafts": True}).json()
    assert with_drafts["recommendations"] == 2 and with_drafts["recommendations_skipped_draft"] == 0
    assert api.get(f"/api/recommendations/package/{cycle_id}/preview", role="revisor_pares").status_code == 403
    assert api.get("/api/recommendations/package/9999/preview").status_code == 404
    assert draft["status"] == "borrador"


def test_export_is_csv_safe_and_audited(api):
    _create(api, title="=SUM(A1)")

    res = api.get("/api/recommendations/export.csv")

    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    lines = res.content.decode("utf-8-sig").strip().split("\n")
    assert lines[0].startswith("ID;Título;Estado;Impacto;Origen")
    assert ";'=SUM(A1);Borrador;Alto;manual;No;" in lines[1]
    with api.db() as db:
        logged = db.query(AuditLog).filter(AuditLog.action == "recommendation:export").one()
        assert logged.new_value["rows"] == 1
