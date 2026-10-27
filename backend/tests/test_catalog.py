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
from app.models import AuditLog, Cycle, CycleTechnology, Source, Technology  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    yield session
    session.close()


def test_catalog_has_ninety_seven_unique_codes():
    rows = catalog.CATALOG_SOURCES
    codes = [r["catalog_code"] for r in rows]
    assert len(rows) == 97
    assert len(set(codes)) == 97
    urls = [catalog_service.normalize_url(r["url"]) for r in rows]
    assert len(set(urls)) == len(urls)
    stats = catalog.catalog_stats()
    assert stats["governors"] == stats["by_level"]["A"] + stats["by_level"]["B"]
    assert stats["by_level"]["A"] >= 5
    assert stats["by_block"][catalog.CAT_FABRICANTE] == 26
    assert stats["by_block"][catalog.CAT_NOTICIAS] == 15
    assert stats["from_matrix"] == 97


def test_every_matrix_row_maps_to_a_catalog_source():
    from app import source_matrix

    matrix = source_matrix.load_matrix()
    assert len(matrix["rows"]) == 93
    codes = {r["catalog_code"] for r in catalog.CATALOG_SOURCES}
    for row in matrix["rows"]:
        assert row["codes"], row["name"]
        assert set(row["codes"]) <= codes, row["name"]
    pcori = next(r for r in catalog.CATALOG_SOURCES if r["catalog_code"] == "FP-HT-01")
    assert pcori["priority_level"] in {"alta", "media", "baja", "revisar", ""}
    assert pcori["source_level"] in {"primaria", "secundaria", "terciaria", "por_definir"}
    assert pcori["matrix_ref"].startswith("MATRIZ FI EH fila")


def test_sync_keeps_admin_edits_of_matrix_fields(db):
    catalog_service.sync_catalog(db, triggered_by="test")
    src = db.query(Source).filter(Source.catalog_code == "FP-HT-01").one()
    # Edicion desde el panel (update_source registra el campo como editado).
    edit = {"priority_level": "baja", "access_path": "ruta editada"}
    catalog_service.mark_edited(src, edit)
    for key, value in edit.items():
        setattr(src, key, value)
    db.commit()
    catalog_service.sync_catalog(db, triggered_by="test")
    db.refresh(src)
    assert src.priority_level == "baja"
    assert src.access_path == "ruta editada"
    assert {"priority_level", "access_path"} <= set(src.edited_fields)


def test_sync_updates_matrix_urls_that_the_team_did_not_edit(db):
    # OBS-002: una URL nueva de la matriz debe llegar a una fuente ya cargada.
    catalog_service.sync_catalog(db, triggered_by="test")
    src = db.query(Source).filter(Source.catalog_code == "FP-HT-02").one()
    expected = list(src.entry_urls)
    src.entry_urls = expected[:1]
    db.commit()
    catalog_service.sync_catalog(db, triggered_by="test")
    db.refresh(src)
    assert src.entry_urls == expected


def test_first_sync_of_legacy_source_keeps_team_values_and_adds_new_urls(db):
    # Bases anteriores: sin registro de edicion (edited_fields None).
    catalog_service.sync_catalog(db, triggered_by="test")
    src = db.query(Source).filter(Source.catalog_code == "FP-HT-02").one()
    expected = list(src.entry_urls)
    src.edited_fields = None
    src.priority_level = "baja" if src.priority_level != "baja" else "media"
    team_value = src.priority_level
    # La bitacora generica guarda la edicion hecha desde el panel (PUT /api/sources/{id}).
    db.add(
        AuditLog(
            entity_type="sources", entity_id=str(src.id), action="update",
            new_value={"priority_level": team_value}, request_path=f"PUT /api/sources/{src.id}",
        )
    )
    # Un cambio de la sincronizacion (sin ruta del panel) no cuenta como edicion.
    src.material_type = "valor viejo de otra version de la matriz"
    # Una URL vieja del mismo sitio (sale) y una agregada por el equipo en otro sitio (se queda).
    src.entry_urls = [expected[0] + "vieja", "https://otro-sitio.example.org/lista"]
    db.commit()
    catalog_service.sync_catalog(db, triggered_by="test")
    db.refresh(src)
    assert src.priority_level == team_value
    assert src.entry_urls == expected + ["https://otro-sitio.example.org/lista"]
    assert src.material_type != "valor viejo de otra version de la matriz"
    assert set(src.edited_fields) == {"priority_level", "entry_urls"}


def test_import_matrix_overwrite_and_create(db):
    from app import source_matrix

    catalog_service.sync_catalog(db, triggered_by="test")
    src = db.query(Source).filter(Source.catalog_code == "FP-HT-01").one()
    catalog_service.mark_edited(src, {"priority_level": "baja"})
    src.priority_level = "baja"
    db.commit()
    parsed = {
        "sheet": "MATRIZ FI EH",
        "rows": [
            {**next(r for r in source_matrix.load_matrix()["rows"] if "FP-HT-01" in r["codes"]), "priority_level": "alta"},
            {
                "excel_row": 999, "matrix_ref": "MATRIZ FI EH fila 999", "codes": [], "name": "Portal nuevo de prueba",
                "entity_label": "Revista / portal de noticias", "source_level": "secundaria", "priority_level": "media",
                "tech_types": ["DM"], "consult_urls": ["https://portal-prueba.example.org/salud"], "methodology_urls": [],
                "origin": "", "country": "", "frequency": "semanal", "language": "Ingles",
            },
        ],
        "search_terms": [],
    }
    keep = catalog_service.import_matrix(db, parsed, overwrite=False, persist=False)
    db.refresh(src)
    assert src.priority_level == "baja"
    assert keep["created"] == 1
    summary = catalog_service.import_matrix(db, parsed, overwrite=True, persist=False)
    db.refresh(src)
    assert src.priority_level == "alta"
    assert summary["created"] == 0 and summary["updated"] == 2
    new = db.query(Source).filter(Source.title == "Portal nuevo de prueba").one()
    assert new.category == catalog.CAT_NOTICIAS
    assert new.verification_status == catalog_service.MATRIX_IMPORT_MARK
    catalog_service.sync_catalog(db, triggered_by="test")
    db.refresh(new)
    assert new.retired is False


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
    assert first["created"] >= 97
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


def test_ema_json_report_keeps_novel_human_medicines_newest_first(monkeypatch):
    from app.ingest import ema

    rows = [
        {"category": "Human", "name_of_medicine": "Viejo", "medicine_status": "Authorised", "marketing_authorisation_date": "29/06/2007", "european_commission_decision_date": "24/09/2026", "ema_product_number": "EMEA/H/C/1"},
        {"category": "Human", "name_of_medicine": "Foundayo", "international_non_proprietary_name_common_name": "orforglipron", "medicine_status": "Opinion", "opinion_adopted_date": "15/10/2026", "ema_product_number": "EMEA/H/C/2", "medicine_url": "https://www.ema.europa.eu/en/medicines/human/EPAR/foundayo"},
        {"category": "Human", "name_of_medicine": "Generico", "generic": "Yes", "marketing_authorisation_date": "01/10/2026", "ema_product_number": "EMEA/H/C/3"},
        {"category": "Veterinary", "name_of_medicine": "Vet", "marketing_authorisation_date": "02/10/2026", "ema_product_number": "EMEA/V/C/4"},
        {"category": "Human", "name_of_medicine": "Retirado", "medicine_status": "Withdrawn", "marketing_authorisation_date": "03/10/2026", "ema_product_number": "EMEA/H/C/5"},
    ]
    monkeypatch.setattr(ema, "request_json", lambda *a, **k: {"meta": {}, "data": rows})
    result = ema.EmaConnector().fetch(config={"page_size": 10})
    assert [r.title for r in result.records] == ["Foundayo", "Viejo"]
    first = result.records[0]
    assert first.inn_name == "orforglipron" and first.development_phase == "Opinion CHMP"
    assert first.url.endswith("/foundayo") and first.horizon == "inminente"


def test_ctis_posts_the_search_and_maps_current_fields(monkeypatch):
    from app.ingest import ctis

    sent = {}

    def fake(url, **kw):
        sent.update(kw)
        return {"pagination": {}, "data": [{"ctNumber": "2026-1-00", "ctTitle": "Ensayo X", "conditions": "melanoma", "trialPhase": "Therapeutic confirmatory (Phase III)", "product": "Xmab", "sponsor": "Acme", "decisionDateOverall": "16/10/2026"}]}

    monkeypatch.setattr(ctis, "request_json", fake)
    rec = CtisConnector().fetch(config={"page_size": 5}, url="https://euclinicaltrials.eu/ctis-public/search").records[0]
    assert sent["json_body"]["pagination"]["size"] == 5
    assert rec.title == "Ensayo X" and rec.indication == "melanoma" and rec.commercial_name == "Xmab"
    assert rec.horizon == "inminente" and rec.published_date == "16/10/2026"


def test_pcori_api_hits_skip_archived_and_strip_markup(monkeypatch):
    from app.ingest import pcori_hs

    hits = [
        {"originalId": 1, "documentType": "topics", "title": "Intismeran (<span class=\"abbrv\">mRNA</span>-4157)", "recordStatus": "Active", "developmentPhase": "Phase 3", "interventionClass": [{"title": "Pharmaceutical"}], "updatedDate": "2026-09-01"},
        {"originalId": 2, "documentType": "topics", "title": "Viejo", "recordStatus": "Archived", "updatedDate": "2026-10-01"},
    ]
    monkeypatch.setattr(pcori_hs, "request_json", lambda *a, **k: {"response": {"hits": hits}})
    result = PcoriHsConnector().fetch(config={})
    assert len(result.records) == 1
    rec = result.records[0]
    assert rec.title == "Intismeran (mRNA-4157)" and rec.technology_type == "medicamento"
    assert rec.url == "https://horizonscandb.pcori.org/report/topics/1" and rec.horizon == "inminente"


def test_health_canada_licences_keep_high_risk_newest_first(monkeypatch):
    from app.ingest import health_canada

    licences = [
        {"original_licence_no": 1, "appl_risk_class": 2, "licence_name": "SYRINGE", "first_licence_status_dt": "2026-10-16", "company_id": 9},
        {"original_licence_no": 2, "appl_risk_class": 4, "licence_name": "VALVE X", "first_licence_status_dt": "2026-10-01", "company_id": 9},
        {"original_licence_no": 3, "appl_risk_class": 3, "licence_name": "PUMP Y", "first_licence_status_dt": "2026-10-10", "company_id": 9},
    ]
    monkeypatch.setattr(health_canada, "request_json", lambda *a, **k: licences)
    monkeypatch.setattr(health_canada, "_company_name", lambda cid: "MedCo")
    result = HealthCanadaConnector().fetch(config={"page_size": 5}, url=health_canada.MDALL_URL)
    assert [r.external_id for r in result.records] == ["MDL-3", "MDL-2"]
    assert result.records[0].manufacturer == "MedCo"


def test_health_canada_drugs_skip_generics_and_repeated_strengths(monkeypatch):
    from app.ingest import health_canada

    products = [
        {"drug_code": 30, "class_name": "Human", "brand_name": "MYQORZO", "company_name": "Cytokinetics"},
        {"drug_code": 29, "class_name": "Human", "brand_name": "MYQORZO", "company_name": "Cytokinetics"},
        {"drug_code": 28, "class_name": "Human", "brand_name": "BISOPROLOL TABLETS", "company_name": "Sanis"},
        {"drug_code": 27, "class_name": "Human", "brand_name": "HAND SOAP", "company_name": "Clean"},
        {"drug_code": 26, "class_name": "Disinfectant", "brand_name": "NUGEN", "company_name": "Arxada"},
    ]
    names = {30: ["AFICAMTEN"], 28: ["BISOPROLOL FUMARATE"]}
    monkeypatch.setattr(health_canada, "request_json", lambda *a, **k: products)
    monkeypatch.setattr(health_canada, "_ingredients", lambda code: names.get(code, []))
    result = HealthCanadaConnector().fetch(config={"page_size": 10}, url=health_canada.DPD_URL)
    assert [(r.title, r.inn_name) for r in result.records] == [("MYQORZO", "AFICAMTEN")]


def test_clean_text_accepts_numeric_codes():
    from app.ingest.base import clean_text

    assert clean_text(21855) == "21855" and clean_text(None) == ""


def test_json_path_and_signature():
    payload = {"studies": [{"protocolSection": {"identificationModule": {"nctId": "NCT1"}}}]}
    assert json_path_exists(payload, "studies.0.protocolSection.identificationModule.nctId")
    assert schema_signature(payload) == schema_signature(payload)
    assert schema_signature(payload) != schema_signature({"other": 1})
