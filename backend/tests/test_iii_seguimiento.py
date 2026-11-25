"""Ajustes del III seguimiento: RF-001, OBS-001, OBS-002, RF-005 y RF-006."""
from __future__ import annotations

import io
from pathlib import Path

import pytest
from frente_b_support import api, fixture_record  # noqa: F401  (fixture)

from app import ingest_service, signal_links, source_matrix, source_profile, tech_search, web_search
from app.models import AuditLog, Finding, Source, Technology

ROOT = Path(__file__).resolve().parents[2]
MATRIX_XLSX = ROOT / "FUENTES DE INFORMACION PROACTIVA EH.xlsx"


def _ingest(api, **source_kw) -> int:  # noqa: F811
    sid = api.add_source(**source_kw)
    with api.db() as db:
        source = db.get(Source, sid)
        job = ingest_service.enqueue(db, [source], triggered_by="prueba")[0]
        ingest_service.run_job(db, job.id)
    return sid


# --------------------------------------------------------------------------- #
#  RF-001
# --------------------------------------------------------------------------- #
class _Src:
    url = "https://agencia.example.org/listado"
    entry_urls = ["https://agencia.example.org/app#/es/resultados"]
    reference_urls: list = []


@pytest.mark.parametrize(
    "url,expected",
    [
        ("", "sin_enlace"),
        ("https://agencia.example.org/listado", "consulta"),  # se guardo el listado, no el item
        ("https://agencia.example.org/listado/", "consulta"),
        ("https://agencia.example.org/", "consulta"),  # portada
        ("https://agencia.example.org/buscar?q=stent", "consulta"),  # resultado de formulario
        ("https://agencia.example.org/app#/es/resultados", "consulta"),  # ruta SPA de la matriz
        ("https://agencia.example.org/app#/es/ficha/77", "exacto"),  # la ruta #/ del item se conserva
        ("https://agencia.example.org/listado#seccion-4", "exacto"),  # ancla al punto de la pagina
        ("https://agencia.example.org/dispositivos/k233864.pdf", "exacto"),
    ],
)
def test_link_classification(url, expected):
    assert signal_links.classify(url, _Src()) == expected


def test_capture_stores_query_url_link_type_and_evidence(api):  # noqa: F811
    sid = _ingest(
        api,
        url="https://registro.example.org/busqueda",
        connector_config={"records": [fixture_record("E1", "Stentix", url="https://registro.example.org/ficha/E1")]},
    )
    with api.db() as db:
        finding = db.query(Finding).filter(Finding.source_id == sid).one()
        assert finding.query_url == "https://registro.example.org/busqueda"
        assert finding.url == "https://registro.example.org/ficha/E1"
        assert finding.link_type == "exacto"
        assert finding.evidence["title"] and finding.evidence["captured_at"]
        tech = db.query(Technology).filter(Technology.finding_id == finding.id).one()
    out = api.get(f"/api/technologies/staging?limit=50").json()
    row = next(r for r in out if r["id"] == tech.id)
    assert row["link_type"] == "exacto" and row["query_url"].endswith("/busqueda")


def test_listing_url_is_not_presented_as_exact_and_keeps_evidence(api):  # noqa: F811
    sid = _ingest(
        api,
        url="https://pipeline.example.org/productos",
        connector_config={"records": [fixture_record("E2", "Monitor portatil de sueno", url="https://pipeline.example.org/productos")]},
    )
    body = api.get(f"/api/findings?source_id={sid}").json()
    assert body[0]["link_type"] == "consulta"
    assert body[0]["evidence"]["query_url"] == "https://pipeline.example.org/productos"
    report = api.get("/api/findings/links/report").json()
    row = next(r for r in report["sources"] if r["source_id"] == sid)
    assert row["consulta"] == 1 and row["exacto"] == 0
    csv = api.get("/api/findings/links/report.csv")
    assert csv.status_code == 200 and "pagina_de_consulta" in csv.text


def test_backfill_classifies_old_signals_without_touching_the_url_and_is_audited(api):  # noqa: F811
    sid = api.add_source(url="https://vieja.example.org/lista")
    with api.db() as db:
        db.add(Finding(source_id=sid, title="Senal vieja", url="https://vieja.example.org/lista", content_hash="h1"))
        db.add(Finding(source_id=sid, title="Senal buena", url="https://vieja.example.org/item/9", content_hash="h2"))
        db.commit()
    assert api.post("/api/findings/links/classify", role="revisor_pares").status_code == 403
    out = api.post("/api/findings/links/classify").json()
    assert out["por_tipo"]["consulta"] >= 1 and out["por_tipo"]["exacto"] >= 1
    with api.db() as db:
        rows = {f.title: f for f in db.query(Finding).filter(Finding.source_id == sid)}
        assert rows["Senal vieja"].url == "https://vieja.example.org/lista"
        assert rows["Senal vieja"].link_type == "consulta" and rows["Senal vieja"].evidence
        assert db.query(AuditLog).filter(AuditLog.action == "link_classify").count() == 1


def test_link_check_marks_dead_links(api, monkeypatch):  # noqa: F811
    sid = api.add_source(url="https://chk.example.org/")
    with api.db() as db:
        db.add(Finding(source_id=sid, title="Viva", url="https://chk.example.org/ok", content_hash="c1"))
        db.add(Finding(source_id=sid, title="Caida", url="https://chk.example.org/404", content_hash="c2"))
        db.commit()
    monkeypatch.setattr(signal_links, "check_url", lambda url: ("caido", 404, url) if "404" in url else ("ok", 200, url))
    out = signal_links.check_links(api.Session, limit=50)
    assert out["por_estado"] == {"ok": 1, "caido": 1}
    with api.db() as db:
        dead = db.query(Finding).filter(Finding.title == "Caida").one()
        # Un 404 ya no se deja como enlace de la senal: pasa a la pagina de la fuente, que si abre,
        # y la direccion rota queda en la evidencia (version 7.4.1).
        assert dead.link_http == 404 and dead.link_checked_at
        assert dead.url == "https://chk.example.org/" and dead.link_status == "sin_verificar"
        assert dead.evidence["broken_url"] == "https://chk.example.org/404"


# --------------------------------------------------------------------------- #
#  OBS-001
# --------------------------------------------------------------------------- #
def test_source_priority_is_hidden_ignored_and_history_kept(api):  # noqa: F811
    sid = api.add_source(priority_level="alta")
    out = api.get(f"/api/sources/{sid}").json()
    assert out["priority_level"] == ""
    assert api.put(f"/api/sources/{sid}", json={"priority_level": "baja"}).status_code == 200
    with api.db() as db:
        assert db.get(Source, sid).priority_level == "alta"  # historico intacto
    csv = api.get("/api/sources/export").text.splitlines()[0]
    assert "prioridad" not in csv.lower()
    with api.db() as db:
        source_profile.settings_store.set_value(db, source_profile.SOURCE_PRIORITY_KEY, "true")
    assert api.get(f"/api/sources/{sid}").json()["priority_level"] == "alta"


def test_matrix_observations_are_never_read_as_priority():
    row = source_matrix.normalize_row(
        {"name": "Fuente X", "observations": "Prioridad alta para el proyecto", "consult_raw": "https://x.org/a"}
    )
    assert "priority_level" not in source_matrix.profile_fields(row)
    assert row["observations"] == "Prioridad alta para el proyecto"


def test_reload_catalog_works_and_keeps_signals(api):  # noqa: F811
    sid = _ingest(api)
    out = api.post("/api/ingest/sources/import")
    assert out.status_code == 200
    body = out.json()
    assert body["total"] >= 90 and body["created"] + body["updated"] == body["total"]
    with api.db() as db:
        assert db.query(Finding).filter(Finding.source_id == sid).count() >= 1


# --------------------------------------------------------------------------- #
#  OBS-002
# --------------------------------------------------------------------------- #
needs_matrix = pytest.mark.skipif(not MATRIX_XLSX.exists(), reason="Excel de la matriz no disponible")


@needs_matrix
def test_current_matrix_counts_and_known_inconsistencies():
    parsed = source_matrix.parse_workbook(MATRIX_XLSX)
    summary = source_matrix.validation_summary(parsed)
    assert (summary["rows"], summary["sources"], summary["urls"]) == (93, 97, 128)
    issues = {(i["excel_row"], i["kind"]) for i in summary["issues"]}
    assert (29, "url_repetida") in issues  # FDA repite pma.cfm
    assert (34, "cantidad_distinta") in issues  # Health Canada declara 1 y lista 2


def test_row_issues_detects_declared_count_and_repeated_urls():
    raw = {
        "name": "Agencia",
        "declared_url_count": "3",
        "consult_raw": "1. https://a.org/x\n2. https://a.org/y\n3. https://a.org/x",
    }
    row = source_matrix.normalize_row(raw)
    kinds = {i["kind"] for i in row["issues"]}
    assert kinds == {"url_repetida"}
    assert row["consult_urls"] == ["https://a.org/x", "https://a.org/y"]
    raw["declared_url_count"] = "1"
    assert {i["kind"] for i in source_matrix.normalize_row(raw)["issues"]} == {"url_repetida", "cantidad_distinta"}


def test_hidden_hyperlink_is_ignored_when_text_has_urls():
    assert source_matrix.extract_urls("https://texto.org/a", "https://oculto.org/b") == ["https://texto.org/a"]
    assert source_matrix.extract_urls("https://x.org/app#/en/risultati?x=1") == ["https://x.org/app#/en/risultati?x=1"]


@needs_matrix
def test_upload_matrix_preview_shows_validation_and_conflicts(api, monkeypatch, tmp_path):  # noqa: F811
    from app import link_matrix

    # Matriz anterior (una fila por organizacion) sobre el catalogo D-06.
    monkeypatch.setattr(link_matrix, "DATA_FILE", tmp_path / "sin_matriz_enlaces.json")
    source_matrix._cache = None
    api.post("/api/ingest/sources/import")
    with api.db() as db:
        fda = db.query(Source).filter(Source.catalog_code == "FP-RG-01").one()
        fda_id = fda.id
    api.put(f"/api/sources/{fda_id}", json={"access_path": "Ruta ajustada por el equipo"})
    content = MATRIX_XLSX.read_bytes()
    files = {"file": ("MATRIZ_FUENTES_ESCANEO_EH.xlsx", io.BytesIO(content), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    assert api.post("/api/sources/matrix/compare", role="revisor_pares", files=files, data={"use_ai": "false", "check_reach": "false"}).status_code == 403
    files = {"file": ("MATRIZ_FUENTES_ESCANEO_EH.xlsx", io.BytesIO(content), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    res = api.post("/api/sources/matrix/compare", files=files, data={"use_ai": "false", "check_reach": "false"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["validation"]["rows"], body["validation"]["sources"], body["validation"]["urls"]) == (93, 97, 128)
    assert len(body["validation"]["issues"]) >= 2
    fda_row = next(r for r in body["changed"] if r["source_id"] == fda_id)
    conflict = next(c for c in fda_row["changes"] if c["field"] == "access_path")
    assert conflict["conflict"] is True and body["summary"]["conflictos"] >= 1
    applied = api.post(
        "/api/sources/matrix/apply",
        json={"token": body["token"], "create": [], "update": [fda_row["key"]], "overwrite": False, "persist": False},
    ).json()
    assert applied["updated"] >= 1 and applied["validation"]["rows"] == 93
    with api.db() as db:
        assert db.get(Source, fda_id).access_path == "Ruta ajustada por el equipo"  # se respeta la edicion
        assert db.query(AuditLog).filter(AuditLog.action == "matrix_import_compare").count() == 1


# --------------------------------------------------------------------------- #
#  RF-005
# --------------------------------------------------------------------------- #
def test_search_is_partial_accent_and_case_insensitive(api):  # noqa: F811
    _ingest(api, connector_config={"records": [fixture_record("S1", "Monitor Portátil de Sueño")]})
    for q in ("portatil", "PORTÁTIL", "sueno", "monitor port"):
        body = api.get("/api/technologies/search", params={"q": q}, role="revisor_pares").json()
        assert body["total"] >= 1, q
    hit = api.get("/api/technologies/search", params={"q": "laboratorio demo"}).json()["results"][0]
    assert "fabricante" in hit["matched_on"]
    assert hit["module"] and hit["stage"] == "Bandeja de entrada" and hit["status_label"] == "Capturada / no asignada"
    assert hit["link"].startswith("/bandeja-entrada?tecnologia=")
    assert hit["last_change_at"] and hit["responsible"]
    empty = api.get("/api/technologies/search", params={"q": "zzqqxx"}).json()
    assert empty["total"] == 0 and "No se encontraron" in empty["message"]


def test_recently_classified_technology_shows_its_stage_and_history(api):  # noqa: F811
    _ingest(api, connector_config={"records": [fixture_record("S2", "Clasificatumab")]})
    with api.db() as db:
        tech = db.query(Technology).filter(Technology.commercial_name == "Clasificatumab").one()
        tid = tech.id
    assert api.post("/api/technologies/staging/discard", json={"technology_ids": [tid], "reason": "Tecnología ya conocida: prueba"}).status_code == 200
    hit = api.get("/api/technologies/search", params={"q": "clasificatumab"}).json()["results"][0]
    assert hit["status_label"] == "Descartada en la bandeja"
    steps = api.get(f"/api/technologies/{tid}/history").json()["steps"]
    assert any(s["action"] == "staging:discard" for s in steps)


def test_fold_handles_spanish_and_english():
    assert tech_search.fold("Señal ÁCIDA-Ñandú") == "senal acida nandu"


# --------------------------------------------------------------------------- #
#  RF-006
# --------------------------------------------------------------------------- #
def test_only_medicines_and_devices_are_active_by_default(api):  # noqa: F811
    with api.db() as db:
        cfg = source_profile.load_search(db)
    active = [c["category"] for c in cfg["terms_by_category"] if c["active"]]
    assert sorted(active) == ["Dispositivos médicos", "Medicamentos"]
    assert len(cfg["terms_by_category"]) == 11  # las demas siguen ahi, inactivas


def test_scan_terms_use_only_active_categories(api):  # noqa: F811
    with api.db() as db:
        cfg = source_profile.load_search(db)
    source = type("S", (), {"url": "https://x.org", "tech_types": ["MT"]})()
    pool = {t.lower() for t in web_search.term_pool(source, {}, cfg)}
    inactive_terms = {t.lower() for c in cfg["terms_by_category"] if not c["active"] for t in c["terms"]}
    active_terms = {t.lower() for c in cfg["terms_by_category"] if c["active"] for t in c["terms"]}
    assert active_terms <= pool
    assert not (inactive_terms - active_terms) & pool


def test_categories_are_activated_from_configuration(api):  # noqa: F811
    cfg = api.get("/api/config/web-search").json()
    cats = cfg["terms_by_category"]
    target = next(c for c in cats if c["category"] == "Wearables")
    assert target["active"] is False
    target["active"] = True
    assert api.put("/api/config/web-search", json={"terms_by_category": cats}).status_code == 200
    again = api.get("/api/config/web-search").json()["terms_by_category"]
    assert next(c for c in again if c["category"] == "Wearables")["active"] is True
    with api.db() as db:
        log = db.query(AuditLog).filter(AuditLog.action == "config:web_search").one()
        old = {c["category"]: c["active"] for c in log.old_value["terms_by_category"]}
        new = {c["category"]: c["active"] for c in log.new_value["terms_by_category"]}
        assert old["Wearables"] is False and new["Wearables"] is True
