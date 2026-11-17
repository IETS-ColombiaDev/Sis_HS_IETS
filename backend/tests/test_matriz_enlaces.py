"""Inventario por enlace (MATRIZ_FUENTES_ESCANEO_EH) y bandeja Legacy."""
from __future__ import annotations

import io
from pathlib import Path

import pytest
from frente_b_support import api  # noqa: F401  (fixture)

from app import catalog_service, ingest_service, link_matrix, source_matrix, source_profile
from app.models import AuditLog, Finding, Source, Technology

XLSX = Path(__file__).parent / "fixtures" / "matriz_fuentes_escaneo_eh.xlsx"


@pytest.fixture(scope="module")
def parsed():
    return source_matrix.parse_workbook(XLSX)


@pytest.fixture(scope="module")
def built(parsed):
    return {b["catalog_code"]: b for b in link_matrix.build_sources(parsed)}


# --------------------------------------------------------------------------- #
#  Lectura y validacion
# --------------------------------------------------------------------------- #
def test_first_sheet_is_read_as_one_link_per_row(parsed):
    assert parsed["format"] == "enlaces"
    assert parsed["sheet"].startswith("MATRIZ ESCANEO")
    v = link_matrix.validation_summary(parsed)
    assert (v["rows"], v["organizations"], v["urls"], v["sources"]) == (142, 85, 141, 141)
    assert (v["active_links"], v["general_links"]) == (123, 19)
    assert len(parsed["search_terms"]) == 11
    assert len(parsed["sources_without_search"]) == 9


def test_repeated_url_is_reported_and_loaded_once(parsed, built):
    issues = link_matrix.validation_summary(parsed)["issues"]
    rep = [i for i in issues if i["kind"] == "url_repetida"]
    assert len(rep) == 1 and rep[0]["link_id"] == 92  # RedETS repite la URL del ID 91
    assert "EH-091" in built and "EH-092" not in built


def test_row_fields_keep_the_link_context(parsed):
    row = next(r for r in parsed["rows"] if r["link_id"] == 3)
    assert row["code"] == "EH-003" and row["name"] == "Abbott"
    assert row["tech_types"] == ["MED", "DM"]
    assert row["material_type"] == "Información de tecnologias Innovadoras"
    assert "guiding" in row["access_path"]
    assert row["link_origin"] == link_matrix.ORIGIN_ACTIVE


def test_tech_type_variants_are_normalized(parsed):
    types = {r["link_id"]: r["tech_types"] for r in parsed["rows"]}
    assert types[73] == ["MED", "DM", "IA", "SD"]  # "MED-DM-IA- SD SaMD"
    assert types[141] == ["MED"]  # "MD" (WHO ATC/DDD) es medicamento
    assert types[14] == ["BIOM", "DM"]


# --------------------------------------------------------------------------- #
#  Fila -> fuente
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "code,connector",
    [("EH-102", "clinicaltrials"), ("EH-101", "pubmed"), ("EH-107", "ctis"),
     ("EH-099", "pcori_hs"), ("EH-061", "ema"), ("EH-056", "fda"), ("EH-065", "health_canada")],
)
def test_registries_with_official_api_inherit_the_adapter(built, code, connector):
    src = built[code]
    assert src["connector"] == connector and src["scrape_enabled"] is True
    assert src["reference_urls"], "la URL de la matriz queda como referencia"


def test_ictrp_without_public_api_is_crawled_as_a_page(built):
    # La API de ICTRP no es publica: heredar el adaptador dejaba la fuente en error.
    assert built["EH-103"]["connector"] == "html" and built["EH-103"]["scrape_enabled"] is True


def test_only_one_row_per_registry_gets_the_api(built):
    assert sum(1 for b in built.values() if b["connector"] == "fda") == 1
    assert built["EH-046"]["connector"] == "html"  # otra fila de FDA: su propia pagina


def test_restricted_and_manual_sites_are_not_crawled(built):
    for code in ("EH-016", "EH-017", "EH-059", "EH-060", "EH-115", "EH-117", "EH-119", "EH-123"):
        assert built[code]["connector"] == "manual" and built[code]["scrape_enabled"] is False, code


def test_general_links_stay_as_reference_without_ingest(built):
    general = [b for b in built.values() if b["resource_type"] == link_matrix.ORIGIN_GENERAL]
    assert len(general) == 18 and not any(b["scrape_enabled"] for b in general)


def test_web_search_runs_once_per_domain(built):
    hosts = [b["scan_profile"]["search_domain"] for b in built.values() if b["scan_profile"]["web_search"]]
    assert len(hosts) == len(set(hosts))
    assert built["EH-003"]["scan_profile"]["max_pages"] == link_matrix.LINK_MAX_PAGES


def test_scan_context_tells_the_ai_what_to_look_for(built):
    src = Source(**{k: v for k, v in built["EH-003"].items()})
    ctx = source_profile.source_context(src)
    assert "Organizacion: Abbott" in ctx and "Que consultar" in ctx and "pagina concreta" in ctx


# --------------------------------------------------------------------------- #
#  Reemplazo del inventario y bandeja Legacy
# --------------------------------------------------------------------------- #
@pytest.fixture()
def linked(api, parsed, monkeypatch, tmp_path):  # noqa: F811
    path = tmp_path / "matriz_enlaces_eh.json"
    monkeypatch.setattr(link_matrix, "DATA_FILE", path)
    link_matrix.write_packaged(parsed)
    yield api
    source_matrix._cache = None


def _old_source_with_signal(api, title="Fuente vieja") -> tuple[int, int]:  # noqa: F811
    sid = api.add_source(title=title, url=f"https://{title.replace(' ', '').lower()}.example.org")
    with api.db() as db:
        ingest_service.run_job(db, ingest_service.enqueue(db, [db.get(Source, sid)], triggered_by="t")[0].id)
        tech = db.query(Technology).filter(Technology.source_id == sid).one()
        return sid, tech.id


def test_replacement_retires_old_sources_and_keeps_their_signals(linked):
    sid, tid = _old_source_with_signal(linked)
    local = linked.add_source(title="Registrada a mano", url="https://mano.example.org",
                              verification_status=catalog_service.LOCAL_SOURCE_MARK)
    with linked.db() as db:
        before = db.query(Finding).count()
        out = catalog_service.sync_catalog(db, triggered_by="prueba")
        assert out["created"] == 141 and out["total"] == 141
        old = db.get(Source, sid)
        assert old.retired and not old.scrape_enabled and old.verification_status == link_matrix.LEGACY_MARK
        assert not db.get(Source, local).retired  # lo registrado a mano se conserva
        assert db.query(Finding).count() == before  # no se borra ninguna senal
        assert db.get(Technology, tid).legacy is True
        assert db.query(Source).filter(Source.catalog_code.like("EH-%"), Source.retired.isnot(True)).count() == 141
        assert db.query(AuditLog).filter(AuditLog.action == "matrix_links_apply").count() == 1
        again = catalog_service.sync_catalog(db, triggered_by="prueba")
        assert (again["created"], again["updated"], again["retired"]) == (0, 0, 0)


def test_legacy_tray_lists_and_recovers_signals(linked):
    _sid, tid = _old_source_with_signal(linked, "Fuente legacy")
    with linked.db() as db:
        catalog_service.sync_catalog(db, triggered_by="prueba")
    pending = [r["id"] for r in linked.get("/api/technologies/staging").json()]
    legacy = [r["id"] for r in linked.get("/api/technologies/staging", params={"view": "legacy"}).json()]
    assert tid not in pending and tid in legacy
    assert linked.get("/api/technologies/staging/stats").json()["legacy"] >= 1
    assert linked.post("/api/technologies/staging/recover", role="revisor_pares", json={"technology_ids": [tid]}).status_code == 403
    out = linked.post("/api/technologies/staging/recover", json={"technology_ids": [tid]}).json()
    assert out["affected"] == 1
    assert tid in [r["id"] for r in linked.get("/api/technologies/staging").json()]
    with linked.db() as db:
        catalog_service.sync_catalog(db, triggered_by="prueba")  # otro arranque
        assert db.get(Technology, tid).legacy is False  # lo recuperado no vuelve a Legacy
        assert db.query(AuditLog).filter(AuditLog.action == "staging:recover_legacy").count() == 1


def test_upload_new_format_previews_and_applies(linked):
    _old_source_with_signal(linked, "Fuente previa")
    content = XLSX.read_bytes()
    files = {"file": ("MATRIZ_FUENTES_ESCANEO_EH.xlsx", io.BytesIO(content), "application/octet-stream")}
    res = linked.post("/api/sources/matrix/compare", files=files, data={"use_ai": "false", "check_reach": "false"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["format"] == "enlaces" and body["summary"]["nuevas"] == 141
    assert body["summary"]["legacy"] >= 1 and body["validation"]["sources"] == 141
    applied = linked.post(
        "/api/sources/matrix/apply",
        json={"token": body["token"], "create": [{"key": r["key"]} for r in body["new"]], "update": [], "overwrite": False, "persist": False},
    ).json()
    assert applied["created"] == 141 and applied["legacy_sources"] >= 1


def test_team_edits_survive_the_next_sync(linked):
    with linked.db() as db:
        catalog_service.sync_catalog(db, triggered_by="prueba")
        sid = db.query(Source).filter(Source.catalog_code == "EH-003").one().id
    assert linked.put(f"/api/sources/{sid}", json={"consult_info": "Ajuste del equipo"}).status_code == 200
    with linked.db() as db:
        catalog_service.sync_catalog(db, triggered_by="prueba")
        assert db.get(Source, sid).consult_info == "Ajuste del equipo"


def test_missing_packaged_matrix_never_falls_back_to_the_old_catalog(linked, monkeypatch, tmp_path):
    sid, _tid = _old_source_with_signal(linked, "Fuente retirada")
    with linked.db() as db:
        catalog_service.sync_catalog(db, triggered_by="prueba")
    monkeypatch.setattr(link_matrix, "DATA_FILE", tmp_path / "borrado.json")
    with linked.db() as db:
        out = catalog_service.sync_catalog(db, triggered_by="prueba")
        assert out["version"] == "matriz_enlaces_eh" and out["created"] == 0
        assert db.get(Source, sid).retired is True  # lo legacy no se reactiva
        assert db.query(Source).filter(Source.catalog_code.like("FP-%"), Source.retired.isnot(True)).count() == 0


def test_startup_survives_a_failing_sync(monkeypatch):
    import app.main as main

    def boom(db, **kw):
        raise RuntimeError("fallo simulado")

    monkeypatch.setattr(main, "sync_catalog", boom)
    main.seed_sources_if_empty()  # no lanza
