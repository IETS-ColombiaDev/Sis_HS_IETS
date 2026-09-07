"""Pruebas del catalogo verificado D-06: semilla, importacion, sonda y precedencia."""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import catalog, catalog_service, ingest, ingest_service, methodology  # noqa: E402
from app.coverage_service import coverage_gaps  # noqa: E402
from app.database import Base  # noqa: E402
from app.ingest.base import CanonicalRecord, SchemaChanged, json_path_exists, schema_signature  # noqa: E402
from app.ingest.ctis import CtisConnector  # noqa: E402
from app.ingest.fda import FdaConnector  # noqa: E402
from app.ingest.file_feed import FileFeedConnector  # noqa: E402
from app.ingest.health_canada import HealthCanadaConnector  # noqa: E402
from app.ingest.pcori_hs import PcoriHsConnector  # noqa: E402
from app.models import Cycle, CycleTechnology, Source, Technology  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


def test_catalog_has_fifty_three_unique_codes():
    rows = catalog.CATALOG_SOURCES
    codes = [r["catalog_code"] for r in rows]
    assert len(rows) == 53
    assert len(set(codes)) == 53
    stats = catalog.catalog_stats()
    assert stats["governors"] == stats["by_level"]["A"] + stats["by_level"]["B"]
    assert stats["by_level"]["A"] >= 5
    assert stats["by_block"][catalog.CAT_FABRICANTE] == 24


def test_cadth_is_alias_of_cda_amc_and_ahrq_is_inactive():
    cda = next(r for r in catalog.CATALOG_SOURCES if r["catalog_code"] == "FP-HT-03")
    ahrq = next(r for r in catalog.CATALOG_SOURCES if r["catalog_code"] == "FP-HT-12")
    assert "CADTH" in cda["aliases"]
    assert ahrq["catalog_active"] is False
    assert ahrq["scrape_enabled"] is False
    assert ahrq["connector"] == "manual"


def test_urls_have_no_tracking_params():
    for row in catalog.CATALOG_SOURCES:
        url = row["url"] or ""
        assert "utm_source" not in url
        sep = "&" if "?" in url else "?"
        assert catalog_service.normalize_url(url + sep + "utm_source=x") == catalog_service.normalize_url(url)


def test_import_is_idempotent_and_retires_legacy(db):
    db.add(Source(title="Sitio principal del IETS", url="https://iets.org.co/", scrape_enabled=True))
    db.commit()
    first = catalog_service.sync_catalog(db, triggered_by="test")
    assert first["created"] >= 53
    second = catalog_service.sync_catalog(db, triggered_by="test")
    assert second["created"] == 0
    assert db.query(Source).filter(Source.catalog_code == "FP-CT-01").count() == 1
    legacy = db.query(Source).filter(Source.title == "Sitio principal del IETS").one()
    assert legacy.retired is True
    assert legacy.scrape_enabled is False


def test_registry_includes_new_connectors():
    codes = {c.code for c in ingest.all_connectors()}
    assert {
        "clinicaltrials",
        "fda",
        "ema",
        "pubmed",
        "who_ictrp",
        "health_canada",
        "ctis",
        "file_feed",
        "pcori_hs",
        "manual",
        "fixture",
    } <= codes


def test_health_canada_maps_device_and_drug():
    device = HealthCanadaConnector()._device_record(
        {"id": "LIC-1", "device_name": "Valve X", "company_name": "MedCo"}
    )
    drug = HealthCanadaConnector()._drug_record(
        {"drug_code": "123", "brand_name": "Examplemab", "company_name": "Acme"}
    )
    assert device.external_id == "LIC-1"
    assert device.technology_type == "dispositivo"
    assert drug.commercial_name == "Examplemab"
    assert "Health Canada" in drug.regulatory_status


def test_fda_maps_510k_device():
    rec = FdaConnector()._device_record(
        {
            "k_number": "K123456",
            "device_name": "AI Diagnostic",
            "applicant": "Acme Devices",
            "decision_date": "20260501",
        },
        "device/510k",
    )
    assert rec.external_id == "K123456"
    assert rec.technology_type == "dispositivo"
    assert rec.fda_approval_date == dt.date(2026, 5, 1)


def test_ctis_shuts_down_on_schema_change():
    connector = CtisConnector()
    with pytest.raises(SchemaChanged):
        connector.fetch(config={"schema_signature": "old-fingerprint", "records": []})
    rec = connector._to_record({"ctNumber": "2024-500001-01-00", "title": "Study EU", "sponsorName": "EU Lab"})
    assert rec.external_id == "2024-500001-01-00"


def test_file_feed_and_pcori_from_local_batch():
    feed = FileFeedConnector().fetch(
        config={
            "records": [{"ARTG ID": "123", "Product Name": "Widget", "Sponsor": "TGA Co"}],
            "column_map": {
                "external_id": ["ARTG ID"],
                "title": ["Product Name"],
                "commercial_name": ["Product Name"],
                "manufacturer": ["Sponsor"],
            },
        }
    )
    assert feed.records[0].manufacturer == "TGA Co"
    pcori = PcoriHsConnector().fetch(
        config={"records": [{"id": "HS-1", "title": "CAR-T demo", "area": "Cancer"}]}
    )
    assert pcori.records[0].indication == "Cancer"


def test_level_d_does_not_overwrite_level_a_fields(db):
    source_a = Source(title="FDA", catalog_code="FP-RG-01", access_level="A", connector="fda", url="https://api.fda.gov/")
    source_d = Source(title="Novartis", catalog_code="FP-MF-12", access_level="D", connector="html", url="https://www.novartis.com/")
    db.add_all([source_a, source_d])
    db.commit()
    tech = Technology(
        commercial_name="Examplemab",
        inn_name="examplemab",
        manufacturer="Acme",
        raw_payload={"access_level": "A", "catalog_code": "FP-RG-01"},
    )
    db.add(tech)
    db.commit()
    rec_d = CanonicalRecord(
        external_id="NOV-1",
        title="Examplemab pipeline",
        commercial_name="Examplemab pipeline",
        inn_name="otro-nombre",
        manufacturer="Novartis Marketing",
        raw={"id": "NOV-1"},
    )
    ingest_service._apply_canonical(tech, rec_d, source_d)
    assert tech.inn_name == "examplemab"
    assert tech.manufacturer == "Acme"


def test_coverage_detects_gap(db):
    cycle = Cycle(
        code="Ciclo I - 2026",
        year=2026,
        opened_on=dt.date(2026, 1, 1),
        data_cutoff_on=dt.date(2026, 4, 1),
        status="en_filtrado",
    )
    contrast = Source(title="PCORI", catalog_code="FP-HT-01", is_contrast=True, access_level="C")
    db.add_all([cycle, contrast])
    db.commit()
    missing = Technology(commercial_name="Molecula Hueco", inn_name="huecomab", source_id=contrast.id)
    present = Technology(commercial_name="Ya en ciclo", inn_name="ciclomab")
    db.add_all([missing, present])
    db.commit()
    db.add(CycleTechnology(cycle_id=cycle.id, technology_id=present.id, status="asignada_a_ciclo"))
    db.commit()
    result = coverage_gaps(db, cycle.id)
    assert result["gap_count"] == 1
    assert result["gaps"][0]["commercial_name"] == "Molecula Hueco"


def test_json_path_and_signature():
    payload = {"studies": [{"protocolSection": {"identificationModule": {"nctId": "NCT1"}}}]}
    assert json_path_exists(payload, "studies.0.protocolSection.identificationModule.nctId")
    assert schema_signature(payload) == schema_signature(payload)
    assert schema_signature(payload) != schema_signature({"other": 1})
