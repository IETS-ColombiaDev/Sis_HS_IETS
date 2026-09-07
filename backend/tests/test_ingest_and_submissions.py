"""Pruebas de la fase 4: conectores, cola, crudo y canal reactivo."""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import ingest, ingest_service, methodology, submission_service  # noqa: E402
from app.database import Base  # noqa: E402
from app.ingest.base import CanonicalRecord  # noqa: E402
from app.models import IngestJob, RawRecord, Source, Technology  # noqa: E402
from app.submission_service import SubmissionRuleError  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


def _source(db, **kwargs) -> Source:
    data = {
        "title": "Fuente de prueba",
        "url": "https://example.org",
        "connector": "fixture",
        "scrape_enabled": True,
        "connector_config": {
            "records": [
                {
                    "external_id": "NCT00000001",
                    "title": "Anticuerpo anti-HER2 de prueba",
                    "commercial_name": "Trastuzumab demo",
                    "inn_name": "trastuzumab",
                    "manufacturer": "Laboratorio demo",
                    "indication": "Cancer de mama",
                    "nct_ids": ["NCT00000001"],
                    "technology_type": "medicamento",
                    "horizon": "emergente",
                    "raw": {"nct": "NCT00000001", "phase": "PHASE3"},
                }
            ]
        },
    }
    data.update(kwargs)
    row = Source(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_registry_includes_the_planned_connectors():
    codes = {c.code for c in ingest.all_connectors()}
    assert {"clinicaltrials", "fda", "ema", "pubmed", "who_ictrp", "fixture", "health_canada", "ctis"} <= codes


def test_clinicaltrials_maps_phase3_completion():
    from app.ingest.clinicaltrials import ClinicalTrialsConnector

    study = {
        "protocolSection": {
            "identificationModule": {"nctId": "NCT12345678", "briefTitle": "Study of X"},
            "statusModule": {
                "overallStatus": "RECRUITING",
                "primaryCompletionDateStruct": {"date": "2027-04"},
                "lastUpdatePostDateStruct": {"date": "2026-01-15"},
            },
            "designModule": {"phases": ["PHASE3"]},
            "armsInterventionsModule": {
                "interventions": [{"name": "Molecule X", "type": "DRUG", "description": "mAb"}]
            },
            "conditionsModule": {"conditions": ["Melanoma"]},
            "sponsorCollaboratorsModule": {"leadSponsor": {"name": "Acme"}},
            "descriptionModule": {"briefSummary": "A phase 3 trial."},
        }
    }
    rec = ClinicalTrialsConnector()._to_record(study)
    assert rec.external_id == "NCT12345678"
    assert rec.phase3_completion_date == dt.date(2027, 4, 1)
    assert rec.technology_type == "medicamento"
    assert rec.raw["protocolSection"]["identificationModule"]["nctId"] == "NCT12345678"


def test_fda_maps_application_number():
    from app.ingest.fda import FdaConnector

    rec = FdaConnector()._to_record(
        {
            "application_number": "NDA210365",
            "openfda": {
                "brand_name": ["Examplemab"],
                "generic_name": ["examplemab"],
                "manufacturer_name": ["Acme Biologics"],
            },
            "products": [{"active_ingredients": [{"name": "examplemab"}], "dosage_form": "INJECTION"}],
            "submissions": [{"submission_status_date": "20260501"}],
        },
        "drug/drugsfda",
    )
    assert rec.external_id == "NDA210365"
    assert rec.fda_approval_date == dt.date(2026, 5, 1)
    assert rec.inn_name == "examplemab"


def test_ema_parses_rss_items():
    from app.ingest.ema import _parse_rss

    xml = """<?xml version="1.0"?>
    <rss><channel>
      <item><title>CHMP positive opinion</title><link>https://ema.europa.eu/x</link>
      <guid>ema-1</guid><description>A medicine</description></item>
    </channel></rss>"""
    items = _parse_rss(xml)
    assert items[0]["title"] == "CHMP positive opinion"


def test_who_maps_a_local_batch():
    from app.ingest.who_ictrp import WhoIctprConnector

    rec = WhoIctprConnector()._to_record(
        {
            "TrialID": "NCT87654321",
            "Public_title": "Vaccine trial",
            "Primary_sponsor": "WHO",
            "Condition": "Dengue",
            "Phase": "Phase 3",
        }
    )
    assert rec.nct_ids == ["NCT87654321"]
    assert rec.manufacturer == "WHO"


def test_a_failed_connector_does_not_block_the_next(db):
    good = _source(db, title="Buena", url="https://good.example")
    bad = _source(
        db,
        title="Mala",
        url="https://bad.example",
        connector="who_ictrp",
        connector_config={},
    )
    jobs = ingest_service.enqueue(db, [bad, good], triggered_by="test")
    results = [ingest_service.run_job(db, j.id) for j in jobs]
    statuses = {r.source_id: r.status for r in results}
    assert statuses[bad.id] in {"error", "pendiente"}
    assert statuses[good.id] == "ok"
    techs = db.query(Technology).all()
    assert any(t.commercial_name == "Trastuzumab demo" for t in techs)


def test_raw_payload_survives_and_can_rebuild_the_signal(db):
    source = _source(db)
    jobs = ingest_service.enqueue(db, [source], triggered_by="test")
    ingest_service.run_job(db, jobs[0].id)
    raw = db.query(RawRecord).one()
    assert raw.payload["nct"] == "NCT00000001"
    tech = db.query(Technology).one()
    assert tech.raw_payload["origin"] == "connector"
    assert tech.raw_payload["payload"]["nct"] == "NCT00000001"
    assert tech.nct_ids == ["NCT00000001"]


def test_reprocessing_the_same_external_id_does_not_duplicate(db):
    source = _source(db)
    jobs = ingest_service.enqueue(db, [source], triggered_by="test")
    ingest_service.run_job(db, jobs[0].id)
    jobs2 = ingest_service.enqueue(db, [source], triggered_by="test")
    second = ingest_service.run_job(db, jobs2[0].id)
    assert second.items_new == 0
    assert db.query(Technology).count() == 1
    assert db.query(RawRecord).count() == 1
    assert db.query(RawRecord).one().reprocessed_count == 1


def test_circuit_opens_after_repeated_failures(db):
    source = _source(db, connector="who_ictrp", connector_config={})
    for _ in range(3):
        jobs = ingest_service.enqueue(db, [source], triggered_by="test")
        ingest_service.run_job(db, jobs[0].id)
        db.refresh(source)
    assert source.circuit_open_until is not None
    jobs = ingest_service.enqueue(db, [source], triggered_by="test")
    blocked = ingest_service.run_job(db, jobs[0].id)
    assert "Circuito abierto" in blocked.message


def test_submission_requires_coi_and_lands_as_reactive(db):
    with pytest.raises(SubmissionRuleError):
        submission_service.create_submission(
            db,
            {
                "commercial_name": "X",
                "inn_name": "x",
                "mechanism": "mAb",
                "manufacturer": "Acme",
                "indication": "Asma",
                "development_phase": "Fase III",
                "evidence_links": ["https://example.org"],
                "submitter_name": "Ana",
                "submitter_email": "ana@iets.org.co",
                "coi_accepted": False,
            },
        )

    row = submission_service.create_submission(
        db,
        {
            "commercial_name": "Molecula Z",
            "inn_name": "zumab",
            "mechanism": "Anticuerpo monoclonal",
            "manufacturer": "Acme",
            "indication": "Asma grave",
            "development_phase": "Fase III",
            "evidence_links": ["https://clinicaltrials.gov/study/NCT99999999"],
            "submitter_name": "Ana Perez",
            "submitter_email": "ana@iets.org.co",
            "submitter_org": "Universidad",
            "has_conflict": True,
            "conflict_statement": "La postulante es investigadora principal del ensayo citado.",
            "coi_accepted": True,
        },
    )
    tech = submission_service.accept_submission(db, row, reviewer="coord@iets.org.co")
    assert tech.source_channel == "reactiva"
    assert tech.raw_payload["has_conflict"] is True
    assert tech.status == "capturada_no_asignada"


def test_canonical_hash_uses_external_id_not_title():
    a = CanonicalRecord(external_id="NCT1", title="Uno")
    b = CanonicalRecord(external_id="NCT1", title="Uno corregido")
    assert a.content_hash("clinicaltrials") == b.content_hash("clinicaltrials")
