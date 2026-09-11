"""Frente B: mapeo de openFDA (aprobacion frente a sometimiento) y filas de pipeline.

Los fixtures son crudos reales guardados en `raw_records` (openFDA ANDA215523 y
un 510(k)) y filas reales de los pipelines de Novartis y AstraZeneca.
"""
from __future__ import annotations

import copy
import datetime as dt
import json
from pathlib import Path

import pytest
from sqlalchemy.orm import sessionmaker

from frente_b_support import api, make_engine  # noqa: F401  (fixture)

from app import methodology, priority_engine
from app.ingest.fda import FdaConnector, device_regulatory, drug_regulatory
from app.ingest.pipeline_rows import ROW_PREFIX, parse_row
from app.models import Finding, RawRecord, Source, Technology
from app.reprocess_service import reprocess_fda, reprocess_pipelines

FIXTURES = Path(__file__).resolve().parent / "fixtures"
RAW = json.loads((FIXTURES / "openfda_raw.json").read_text(encoding="utf-8"))
ROWS = json.loads((FIXTURES / "pipeline_rows.json").read_text(encoding="utf-8"))


@pytest.fixture()
def db():
    engine = make_engine()
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


# --------------------------------------------------------------------------- #
#  Bug 1: openFDA
# --------------------------------------------------------------------------- #
def test_original_approval_not_the_latest_labeling_supplement():
    # ANDA215523: ORIG aprobada 2021-12-08; suplementos de etiquetado 2025 y 2026.
    # Antes se tomaba la ultima fecha (2026-08-20) como "aprobacion FDA".
    record = FdaConnector()._to_record(RAW["drug_anda215523"], "drug/drugsfda")
    assert record.fda_approval_date == dt.date(2021, 12, 8)
    assert record.regulatory_status == "Aprobado por FDA"


def test_pending_drug_goes_to_the_regulatory_status_not_to_the_approval_date():
    payload = copy.deepcopy(RAW["drug_anda215523"])
    for sub in payload["submissions"]:
        sub["submission_type"] = "ORIG"
        sub["submission_status"] = "PENDING"
    record = FdaConnector()._to_record(payload, "drug/drugsfda")
    assert record.fda_approval_date is None
    assert record.regulatory_status.startswith("Sometido a revision FDA")
    assert "2026-08-20" in record.regulatory_status
    tentative = drug_regulatory([{"submission_type": "ORIG", "submission_status": "TA", "submission_status_date": "20250301"}])
    assert tentative["approval_date"] == "" and "tentativa" in tentative["status"]


def test_device_submission_date_is_not_an_approval():
    cleared = FdaConnector()._to_record(RAW["device_510k"], "device/510k")
    assert cleared.fda_approval_date == dt.date.fromisoformat(RAW["device_510k"]["decision_date"])
    pending = copy.deepcopy(RAW["device_510k"])
    pending.pop("decision_date")
    pending.pop("decision_code")
    record = FdaConnector()._to_record(pending, "device/510k")
    assert record.fda_approval_date is None
    assert record.regulatory_status.startswith("Sometido a revision FDA (510(k)")
    denied = device_regulatory({"decision_code": "SN", "decision_date": "2026-01-02"}, "510(k)")
    assert denied["approval_date"] == "" and "desfavorable" in denied["status"]
    pma = device_regulatory({"decision_code": "APPR", "decision_date": "2026-02-03"}, "PMA")
    assert pma["approval_date"] == "2026-02-03"


def test_p6_reads_the_submission_and_p5_is_not_fooled():
    tech = Technology(commercial_name="X", regulatory_status="Sometido a revision FDA (2026-07-03)")
    suggestions = priority_engine.suggest_values(None, tech)
    assert suggestions["P6"]["value"] == 1
    assert suggestions["P5"]["value"] == 0
    approved = Technology(commercial_name="Y", regulatory_status="Aprobado por FDA", fda_approval_date=dt.date(2021, 12, 8))
    assert priority_engine.suggest_values(None, approved)["P6"]["value"] == 0


def _fda_tech(db, *, approval, status, payload):
    source = Source(title="openFDA", url="https://api.fda.gov", connector="fda")
    db.add(source)
    db.flush()
    finding = Finding(source_id=source.id, title="DEXMETHYLPHENIDATE HYDROCHLORIDE", content_hash="fda-1")
    db.add(finding)
    db.flush()
    tech = Technology(
        commercial_name="DEXMETHYLPHENIDATE HYDROCHLORIDE", finding_id=finding.id, source_id=source.id,
        fda_approval_date=approval, regulatory_status=status,
    )
    db.add(tech)
    db.flush()
    db.add(RawRecord(connector="fda", external_id="ANDA215523", source_id=source.id, finding_id=finding.id, payload=payload))
    db.commit()
    return tech


def test_reprocess_fda_from_raw_records_is_idempotent(db):
    # Caso real (tecnologia 237 en QA): fecha 2026-07-03 y estado "Sometido a revision FDA".
    tech = _fda_tech(db, approval=dt.date(2026, 7, 3), status="Sometido a revision FDA", payload=RAW["drug_anda215523"])
    # Caso real (tecnologia 183 en QA): sin crudo de openFDA que respalde la fecha.
    orphan = Technology(commercial_name="ZYN002", fda_approval_date=dt.date(2026, 7, 3), regulatory_status="Sometido a revision FDA")
    approved_ema = Technology(commercial_name="Z", fda_approval_date=dt.date(2024, 1, 1), regulatory_status="Aprobado por FDA")
    db.add_all([orphan, approved_ema])
    db.commit()

    preview = reprocess_fda(db, apply=False)
    assert preview["changed"] == 2
    db.expire_all()
    assert db.get(Technology, tech.id).fda_approval_date == dt.date(2026, 7, 3)  # la simulacion no escribe

    result = reprocess_fda(db, apply=True)
    assert result["changed"] == 2
    db.expire_all()
    fixed = db.get(Technology, tech.id)
    assert fixed.fda_approval_date == dt.date(2021, 12, 8) and fixed.regulatory_status == "Aprobado por FDA"
    moved = db.get(Technology, orphan.id)
    assert moved.fda_approval_date is None and moved.regulatory_status == "Sometido a revision FDA (2026-07-03)"
    assert db.get(Technology, approved_ema.id).fda_approval_date == dt.date(2024, 1, 1)

    assert reprocess_fda(db, apply=True)["changed"] == 0  # idempotente
    assert db.query(RawRecord).count() == 1  # el crudo se conserva intacto


# --------------------------------------------------------------------------- #
#  Bug 2: filas de pipeline
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "row,name,inn,indication,phase,mechanism",
    [
        ("AMO959 AMO959 Prostate cancer Oncology: Solid Tumors Phase 1 DNA PK inhibitor Lead Indication",
         "AMO959", "", "Prostate cancer", "Phase 1", "DNA PK inhibitor"),
        ("ABL001 Scemblix® Chronic myeloid leukemia, pediatrics Oncology: Hematology Phase 2 2027 BCR-ABL inhibitor Supplementary Indication",
         "Scemblix (ABL001)", "", "Chronic myeloid leukemia, pediatrics", "Phase 2", "BCR-ABL inhibitor"),
        ("CYX082 farabursen Autosomal dominant polycystic kidney disease Cardiovascular, Renal and Metabolic Phase 1 MIR17 inhibitor Lead Indication",
         "CYX082", "farabursen", "Autosomal dominant polycystic kidney disease", "Phase 1", "MIR17 inhibitor"),
        ("AZD0754 prostate cancer AZD0754 - Phase I Close Mechanism: STEAP2 CAR-T Area under investigation:prostate cancer Molecule size: Large molecule",
         "AZD0754", "", "prostate cancer", "Phase I", "STEAP2 CAR-T"),
        ("Baxfendy (baxdrostat) BaxHTN Bax24 BaxAsia hypertension Baxfendy (baxdrostat) BaxHTN Bax24 BaxAsia - Phase III Close Mechanism: aldosterone synthase inhibitor Area under investigation:hypertension First Major Market Filing Status: Country Date Launched Molecule size: Small molecule",
         "Baxfendy (baxdrostat)", "baxdrostat", "hypertension", "Phase III", "aldosterone synthase inhibitor"),
    ],
)
def test_pipeline_row_is_split_into_fields(row, name, inn, indication, phase, mechanism):
    parsed = parse_row(row)
    assert parsed["name"] == name
    assert parsed["inn"] == inn
    assert parsed["indication"] == indication
    assert parsed["phase"] == phase
    assert parsed["mechanism"] == mechanism


def test_every_real_fixture_row_yields_a_short_product_name():
    for row in ROWS:
        parsed = parse_row(row)
        assert parsed, row
        assert len(parsed["name"]) <= 60, parsed["name"]
        assert parsed["name"].split()[0] in row


def test_non_pipeline_text_is_left_alone():
    assert parse_row("What do the phases of clinical trials mean?") is None
    assert parse_row("Download Pipeline Chart") is None
    assert parse_row("Phase (Under review, 3, 2, 1)") is None


def _pipeline_capture(db, row):
    source = Source(title="Novartis — pipeline", url="https://www.novartis.com/research-development/novartis-pipeline",
                    connector="html", category="Fabricantes de I+D")
    db.add(source)
    db.flush()
    finding = Finding(source_id=source.id, title=row, technology=row, url=source.url, content_hash=f"h-{len(row)}",
                      therapeutic_area="oncologia", summary="texto de toda la tabla")
    db.add(finding)
    db.flush()
    tech = Technology(commercial_name=row, finding_id=finding.id, source_id=source.id, indication="oncologia",
                      raw_payload={"origin": "finding", "title": row})
    db.add(tech)
    db.commit()
    return finding, tech


def test_reprocess_pipelines_keeps_the_raw_row_and_is_idempotent(db):
    row = ROWS[0]
    finding, tech = _pipeline_capture(db, row)
    result = reprocess_pipelines(db, apply=True)
    assert result["changed"] == 1
    db.expire_all()
    tech = db.get(Technology, tech.id)
    finding = db.get(Finding, finding.id)
    parsed = parse_row(row)
    assert tech.commercial_name == parsed["name"]
    assert tech.indication == parsed["indication"] and tech.mechanism == parsed["mechanism"]
    assert tech.development_phase == parsed["phase"]
    assert tech.raw_payload["pipeline"]["row"] == row  # trazabilidad: la fila original se conserva
    assert finding.raw_content.startswith(ROW_PREFIX + row)
    assert finding.content_hash == f"h-{len(row)}"  # la huella no cambia: un nuevo rastreo no duplica
    assert reprocess_pipelines(db, apply=True)["changed"] == 0


def test_dedup_still_proposes_the_same_compound_after_the_split(db):
    from app import dedup

    a_row = "AZD0120 multiple myeloma AZD0120 - Phase II Close Mechanism: CD19/BCMA CAR-T Area under investigation:multiple myeloma Molecule size: Large molecule"
    b_row = "AZD0120 systemic lupus erythematosus AZD0120 - Phase I Close Mechanism: CD19/BCMA CAR-T Area under investigation:systemic lupus erythematosus Molecule size: Large molecule"
    _pipeline_capture(db, a_row)
    source = db.query(Source).first()
    finding = Finding(source_id=source.id, title=b_row, url=source.url, content_hash="h-b")
    db.add(finding)
    db.flush()
    db.add(Technology(commercial_name=b_row, finding_id=finding.id, source_id=source.id, raw_payload={"origin": "finding"}))
    db.commit()
    reprocess_pipelines(db, apply=True)
    pairs = dedup.find_duplicates(db)
    assert len(pairs) == 1 and pairs[0]["score"] >= dedup.threshold(db)


def test_scraper_splits_pipeline_rows_at_capture(db, monkeypatch):
    from app import scraper

    source = Source(title="Novartis — pipeline", url="https://www.novartis.com/research-development/novartis-pipeline",
                    connector="html", category="Fabricantes de I+D", scrape_enabled=True)
    db.add(source)
    db.commit()
    row = ROWS[0]
    monkeypatch.setattr(scraper, "fetch_url", lambda url, timeout=25.0: (200, "text/html", "<html></html>", b""))
    monkeypatch.setattr(
        scraper,
        "extract_candidates",
        lambda src, html: [{"title": row, "url": source.url, "summary": "tabla", "raw_content": "", "technology": row,
                            "technology_type": "medicamento", "horizon": "", "phase": "", "therapeutic_area": "oncologia",
                            "published_date": ""}],
    )
    monkeypatch.setattr(scraper, "_enrich_with_ai", lambda data, **kw: data)
    log = scraper.scrape_source(db, source)
    assert log.items_new == 1
    tech = db.query(Technology).one()
    assert tech.commercial_name == parse_row(row)["name"]
    assert tech.raw_payload["pipeline"]["row"] == row
    # Un segundo rastreo con la misma fila no crea otra senal.
    assert scraper.scrape_source(db, source).items_new == 0


def test_reprocess_endpoint_is_superadmin_only_and_simulates_by_default(api):
    assert api.post("/api/ingest/reprocess", role="evaluador_tecnico").status_code == 403
    res = api.post("/api/ingest/reprocess?target=all")
    assert res.status_code == 200
    body = res.json()
    assert {r["target"] for r in body} == {"fda", "pipeline"} and all(r["applied"] is False for r in body)
