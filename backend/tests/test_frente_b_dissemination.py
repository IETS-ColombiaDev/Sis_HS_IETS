"""Frente B: paquete de diseminacion por ciclo en ZIP (backlog P5-4)."""
from __future__ import annotations

import datetime as dt
import io
import zipfile

from frente_b_support import api  # noqa: F401  (fixture)

from app.models import Cycle, CycleTechnology, EvaluationDoc, Finding, Note, Recommendation, Technology


def _seed_cycle(api) -> int:
    sid = api.add_source()
    with api.db() as db:
        cycle = Cycle(code="Ciclo II - 2026", year=2026, opened_on=dt.date(2026, 5, 4), data_cutoff_on=dt.date(2026, 7, 1), status="en_evaluacion")
        db.add(cycle)
        db.flush()
        finding = Finding(source_id=sid, title="Senal Novamab", content_hash="nv1")
        db.add(finding)
        db.flush()
        tech = Technology(commercial_name="Novamab", inn_name="novamab", finding_id=finding.id, status="en_evaluacion")
        other = Technology(commercial_name="Confimab", inn_name="confimab", status="en_evaluacion")
        draft = Technology(commercial_name="Borramab", inn_name="borramab", status="en_evaluacion")
        db.add_all([tech, other, draft])
        db.flush()
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status="priorizada"))
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=other.id, status="en_evaluacion"))
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=draft.id, status="en_evaluacion"))
        db.add(EvaluationDoc(cycle_id=cycle.id, technology_id=tech.id, title="Ficha Novamab", status="publicado", body={"resumen": "Texto"}))
        db.add(EvaluationDoc(cycle_id=cycle.id, technology_id=other.id, title="Ficha Confimab", status="publicado", confidential=True))
        db.add(EvaluationDoc(cycle_id=cycle.id, technology_id=draft.id, title="Ficha Borramab", status="borrador"))
        rec = Recommendation(finding_id=finding.id, title="Recomendacion Novamab", content="Adoptar con condiciones", impact="alto", model_used="manual")
        db.add(rec)
        db.flush()
        db.add(Note(entity_type="finding", entity_id=finding.id, content="Nota de la senal", author_email="a@iets.org.co"))
        db.add(Note(entity_type="recommendation", entity_id=rec.id, content="Nota del informe", author_email="a@iets.org.co"))
        db.add(Note(entity_type="general", content="Nota ajena al ciclo", author_email="a@iets.org.co"))
        db.commit()
        return cycle.id


def _zip(res) -> zipfile.ZipFile:
    return zipfile.ZipFile(io.BytesIO(res.content))


def test_package_bundles_reports_notes_and_unique_list(api):
    cid = _seed_cycle(api)
    res = api.get(f"/api/recommendations/package/{cid}", role="tomador_decisiones")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/zip"
    assert "paquete_diseminacion_ciclo-ii-2026.zip" in res.headers["content-disposition"]
    zf = _zip(res)
    names = zf.namelist()
    assert "LEEME.txt" in names and "notas.csv" in names
    assert any(n.startswith("listado_unico_") for n in names)
    assert "Novamab" in zf.read(next(n for n in names if n.startswith("listado_unico_"))).decode("utf-8-sig")
    docs = [n for n in names if n.startswith("informes_evaluacion/") and n.endswith(".html")]
    assert len(docs) == 1 and "novamab" in docs[0]
    recs = [n for n in names if n.startswith("recomendaciones/") and n.endswith(".md")]
    assert len(recs) == 1 and "Adoptar con condiciones" in zf.read(recs[0]).decode()
    notes = zf.read("notas.csv").decode("utf-8-sig")
    assert "Nota de la senal" in notes and "Nota del informe" in notes
    assert "Nota ajena al ciclo" not in notes
    readme = zf.read("LEEME.txt").decode()
    assert "1 informe(s) marcados como confidenciales" in readme
    assert "1 informe(s) aún en redacción" in readme


def test_confidential_never_travels_even_with_drafts(api):
    cid = _seed_cycle(api)
    zf = _zip(api.get(f"/api/recommendations/package/{cid}?include_drafts=true"))
    docs = [n for n in zf.namelist() if n.startswith("informes_evaluacion/") and n.endswith(".html")]
    assert len(docs) == 2
    assert not any("confimab" in n for n in docs)


def test_package_permissions_and_missing_cycle(api):
    cid = _seed_cycle(api)
    denied = api.get(f"/api/recommendations/package/{cid}", role="revisor_pares")
    assert denied.status_code == 403
    assert api.get(f"/api/recommendations/package/{cid}", role="evaluador_clinico").status_code == 200
    assert api.get("/api/recommendations/package/9999").status_code == 404
