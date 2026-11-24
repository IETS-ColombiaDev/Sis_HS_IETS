"""Pendientes del Modulo 0 (24-11-2026).

1. RF-001: ubicar la senal exacta en su pagina y diagnosticar la matriz.
2. Sondas de todo el inventario en segundo plano y su informe en Excel.
3. Fuentes tipo E (consulta manual) por validar, visibles para el equipo tecnico.
4. Catalogo de fuentes en Excel.
5. RF-02-F: cruce de postulaciones con la vigilancia proactiva y con la web.
"""
from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

import pytest
from frente_b_support import api  # noqa: F401  (fixture)
from openpyxl import load_workbook

from app import link_resolver, manual_review, probe_service, signal_links, submission_crosscheck, web_search
from app.models import AuditLog, Finding, Source, Submission, Technology

PIPELINE_HTML = """
<html><head><title>Pipeline</title></head><body>
<nav><a href="/">Inicio</a><a href="/about">Quiénes somos</a></nav>
<table>
  <tr><td>Zanubrutinib</td><td>Linfoma</td><td>Fase III</td></tr>
  <tr><td><a href="/pipeline/novamab-melanoma">Novamab</a></td><td>Melanoma</td><td>Fase II</td></tr>
  <tr><td>Cardiovex XR</td><td>Insuficiencia cardiaca</td><td>Fase I</td></tr>
</table>
</body></html>
"""
QUERY = "https://pharma.example.org/pipeline"


def _source(api, **kw) -> int:  # noqa: F811
    data = {"title": "Pharma Demo · Pipeline", "url": QUERY, "connector": "html", "access_level": "D"}
    data.update(kw)
    return api.add_source(**data)


def _finding(api, sid: int, *, title: str, technology: str = "", url: str = QUERY) -> int:  # noqa: F811
    with api.db() as db:
        source = db.get(Source, sid)
        finding = Finding(source_id=sid, title=title, technology=technology or title, url=url, content_hash=f"h-{title}")
        signal_links.annotate(finding, source, query_url=QUERY)
        db.add(finding)
        db.flush()
        db.add(Technology(finding_id=finding.id, commercial_name=technology or title, url=url, source_id=sid,
                          status="capturada_no_asignada", source_channel="proactiva"))
        db.commit()
        return finding.id


# --------------------------------------------------------------------------- #
#  1. RF-001: senal exacta y diagnostico de la matriz
# --------------------------------------------------------------------------- #
def test_signal_with_its_own_link_on_the_page_becomes_exact(api):  # noqa: F811
    sid = _source(api)
    fid = _finding(api, sid, title="Novamab · Melanoma · Fase II", technology="Novamab")
    with api.db() as db:
        finding = db.get(Finding, fid)
        assert finding.link_type == "consulta"
        counts = link_resolver.resolve_with_pages(db, db.get(Source, sid), [finding], {QUERY: PIPELINE_HTML})
        db.commit()
        assert counts["enlace_en_pagina"] == 1
        finding = db.get(Finding, fid)
        assert finding.url == "https://pharma.example.org/pipeline/novamab-melanoma"
        assert finding.link_type == "exacto"
        assert finding.evidence["resolved"]["previous_url"] == QUERY
        # La tecnologia de la bandeja tambien abre la ficha exacta.
        assert db.query(Technology).filter(Technology.finding_id == fid).one().url == finding.url


def test_signal_in_a_table_without_links_opens_the_page_highlighted(api):  # noqa: F811
    sid = _source(api)
    fid = _finding(api, sid, title="Cardiovex XR · Insuficiencia cardiaca", technology="Cardiovex XR")
    with api.db() as db:
        finding = db.get(Finding, fid)
        link_resolver.resolve_with_pages(db, db.get(Source, sid), [finding], {QUERY: PIPELINE_HTML})
        db.commit()
        finding = db.get(Finding, fid)
        assert finding.link_type == "consulta"  # no se presenta como exacto lo que no lo es
        assert finding.url == QUERY
        assert finding.evidence["locator_url"] == QUERY + "#:~:text=Cardiovex%20XR"
        assert finding.evidence["resolved"]["method"] == "resaltado"


def test_text_fragment_escapes_its_delimiters():
    index = link_resolver.PageIndex("<p>Anti-PD-1, lote A&B</p>", QUERY)
    url, text = link_resolver.text_locator(["Anti-PD-1, lote A&B"], index, QUERY)
    assert text == "Anti-PD-1, lote A&B"
    assert url.endswith("#:~:text=Anti%2DPD%2D1%2C%20lote%20A%26B")


def test_a_signal_not_on_the_page_is_not_invented(api):  # noqa: F811
    sid = _source(api)
    fid = _finding(api, sid, title="Producto Inexistente 2030")
    with api.db() as db:
        finding = db.get(Finding, fid)
        link_resolver.resolve_with_pages(db, db.get(Source, sid), [finding], {QUERY: PIPELINE_HTML})
        db.commit()
        finding = db.get(Finding, fid)
        assert finding.url == QUERY and "locator_url" not in finding.evidence
        assert finding.evidence["resolved"]["method"] == "sin_ubicar"
        assert "JavaScript" in finding.evidence["resolved"]["reason"]


def test_two_different_pages_with_the_same_name_are_not_guessed():
    html = '<a href="/a/novamab">Novamab</a><a href="/b/novamab">Novamab</a>'
    index = link_resolver.PageIndex(html, QUERY)
    assert link_resolver.match_anchor(["Novamab"], index, None, QUERY) is None


def test_menu_links_do_not_count_as_the_signal():
    html = '<a href="/productos">Ver todos los productos de oncología, hematología e inmunología de la compañía</a>'
    index = link_resolver.PageIndex(html, QUERY)
    assert link_resolver.match_anchor(["Novamab"], index, None, QUERY) is None


def test_background_resolution_downloads_each_page_once(api, monkeypatch):  # noqa: F811
    sid = _source(api)
    _finding(api, sid, title="Novamab", technology="Novamab")
    _finding(api, sid, title="Cardiovex XR", technology="Cardiovex XR")
    calls: list[list[str]] = []

    def fake_fetch_many(urls, timeout):
        calls.append(list(urls))
        return [(u, (200, "text/html", PIPELINE_HTML, b""), 10, "") for u in urls]

    from app import scraper

    monkeypatch.setattr(scraper, "fetch_many", fake_fetch_many)
    result = link_resolver.resolve_all(api.Session, actor="prueba")
    assert result["counts"] == {"enlace_en_pagina": 1, "resaltado": 1, "sin_ubicar": 0}
    assert calls == [[QUERY]]
    with api.db() as db:
        assert db.query(AuditLog).filter(AuditLog.action == "link_resolve").count() == 1


def test_diagnosis_tells_the_team_when_the_matrix_must_improve(api):  # noqa: F811
    home = _source(api, title="Portada", url="https://portal.example.org/")
    _finding(api, home, title="Señal de portada", url="https://portal.example.org/")
    with api.db() as db:
        for f in db.query(Finding).filter(Finding.source_id == home).all():
            f.evidence = {**(f.evidence or {}), "resolved": {"method": "sin_ubicar"}}
        db.commit()
    table = _source(api, title="Tabla sin enlaces")
    fid = _finding(api, table, title="Cardiovex XR")
    with api.db() as db:
        link_resolver.resolve_with_pages(db, db.get(Source, table), [db.get(Finding, fid)], {QUERY: PIPELINE_HTML})
        db.commit()
    data = api.get("/api/findings/links/diagnosis").json()
    by_id = {r["source_id"]: r for r in data["sources"]}
    assert by_id[home]["code"] == "portada" and by_id[home]["matrix_change"] is True
    assert by_id[table]["code"] == "sin_enlace_por_item" and by_id[table]["matrix_change"] is False
    res = api.get("/api/findings/links/diagnosis.xlsx")
    assert res.status_code == 200
    wb = load_workbook(io.BytesIO(res.content))
    assert wb.sheetnames[0] == "Diagnóstico por fuente"


# --------------------------------------------------------------------------- #
#  2. Sondas de todo el inventario
# --------------------------------------------------------------------------- #
@pytest.fixture(autouse=False)
def one_lane(monkeypatch):
    # La base de prueba es una sola conexion en memoria: no admite hilos en paralelo.
    monkeypatch.setattr(probe_service, "BULK_WORKERS", 1)


def test_bulk_probe_covers_every_active_source(api, monkeypatch, one_lane):  # noqa: F811
    ids = [_source(api, title=f"Fuente {i}", url=f"https://f{i}.example.org/x") for i in range(9)]
    retired = _source(api, title="Retirada", retired=True)
    seen: list[int] = []

    def fake_probe(db, source, persist=True):
        seen.append(source.id)
        status = "rojo" if source.title.endswith("3") else "verde"
        detail = {"url": source.url, "message": "prueba", "http_status": 200}
        probe_service._store(db, source, status, detail, True)
        return detail

    monkeypatch.setattr(probe_service, "probe_source", fake_probe)
    state = probe_service.start_bulk(api.Session, scope="all", actor="prueba", wait=True)
    assert sorted(seen) == sorted(ids) and retired not in seen
    final = probe_service.bulk_state()
    assert final["running"] is False and final["done"] == 9
    assert final["counts"] == {"verde": 8, "ambar": 0, "rojo": 1}
    assert state["total"] == 9
    status = api.get("/api/ingest/probe/status").json()
    assert status["done"] == 9
    res = api.get("/api/ingest/probe/report.xlsx")
    ws = load_workbook(io.BytesIO(res.content))["Sondas"]
    assert ws.cell(row=2, column=1).value == "Fuente"
    assert ws.cell(row=3, column=5).value == "Rojo"  # las rojas primero


def test_a_probe_that_crashes_marks_the_source_red_and_the_batch_goes_on(api, monkeypatch, one_lane):  # noqa: F811
    good = _source(api, title="Buena")
    bad = _source(api, title="Rara")

    def flaky(db, source, persist=True):
        if source.id == bad:
            raise RuntimeError("respuesta imposible")
        probe_service._store(db, source, "verde", {"url": source.url, "message": "ok"}, True)
        return {"status": "verde"}

    monkeypatch.setattr(probe_service, "probe_source", flaky)
    probe_service.start_bulk(api.Session, scope="all", wait=True)
    with api.db() as db:
        assert db.get(Source, good).health_status == "verde"
        assert db.get(Source, bad).health_status == "rojo"


# --------------------------------------------------------------------------- #
#  3. Fuentes tipo E por validar
# --------------------------------------------------------------------------- #
def _manual(api, title="Scopus", **kw) -> int:  # noqa: F811
    data = {"title": title, "url": "https://www.scopus.com/", "connector": "manual", "access_level": "E",
            "scrape_enabled": False, "sync_frequency": "semanal", "connector_config": {}}
    data.update(kw)
    return api.add_source(**data)


def test_type_e_sources_are_due_until_someone_validates_them(api):  # noqa: F811
    a = _manual(api, "Scopus")
    b = _manual(api, "Embase")
    _source(api, title="Automática")  # una fuente D no cuenta
    data = api.get("/api/sources/manual-review", role="evaluador_tecnico").json()
    assert data["total"] == 2 and data["due"] == 2
    assert all(i["never_reviewed"] for i in data["items"])

    res = api.post(f"/api/sources/{a}/manual-review", role="evaluador_tecnico",
                   json={"outcome": "con_senales", "signals": 2, "note": "Dos ensayos nuevos"})
    assert res.status_code == 200, res.text
    due = datetime.fromisoformat(res.json()["next_review_due"].replace("Z", "+00:00"))
    assert timedelta(days=6) < due - datetime.now(timezone.utc) <= timedelta(days=7)

    data = api.get("/api/sources/manual-review").json()
    assert data["due"] == 1
    item = next(i for i in data["items"] if i["id"] == a)
    assert item["due"] is False and item["last_review"]["signals"] == 2
    assert item["last_review"]["by"] == "evaluador_tecnico@iets.org.co"
    assert data["items"][0]["id"] == b  # las pendientes primero
    history = api.get(f"/api/sources/{a}/manual-review/history").json()
    assert history[0]["outcome"] == "con_senales"


def test_manual_review_rules(api):  # noqa: F811
    e = _manual(api)
    d = _source(api, title="Web")
    bad = [
        ({"outcome": "con_senales", "signals": 0}, "cuántas señales"),
        ({"outcome": "no_accesible", "note": ""}, "motivo"),
    ]
    for body, text in bad:
        res = api.post(f"/api/sources/{e}/manual-review", json=body)
        assert res.status_code == 422 and text in res.json()["detail"]
    assert api.post(f"/api/sources/{d}/manual-review", json={"outcome": "sin_novedades"}).status_code == 422
    # Sin permiso de la bandeja no se valida.
    assert api.post(f"/api/sources/{e}/manual-review", role="tomador_decisiones", json={"outcome": "sin_novedades"}).status_code == 403
    # Si no se pudo consultar, vuelve a quedar pendiente al dia siguiente.
    res = api.post(f"/api/sources/{e}/manual-review", json={"outcome": "no_accesible", "note": "Licencia vencida"})
    due = datetime.fromisoformat(res.json()["next_review_due"].replace("Z", "+00:00"))
    assert due - datetime.now(timezone.utc) <= timedelta(hours=24)


def test_the_technical_team_sees_the_counter_on_its_work_tray(api):  # noqa: F811
    _manual(api, "Scopus")
    _manual(api, "Synapse")
    work = api.get("/api/dashboard/my-work", role="evaluador_tecnico").json()
    item = next(i for i in work["items"] if i["key"] == "manual_sources")
    assert item["count"] == 2 and item["severity"] == "accion"
    assert item["to"].startswith("/bandeja-entrada")
    assert {s["name"] for s in item["samples"]} == {"Scopus", "Synapse"}


def test_a_due_date_in_the_past_puts_the_source_back_in_the_list(api):  # noqa: F811
    sid = _manual(api)
    with api.db() as db:
        manual_review.record(db, db.get(Source, sid), outcome="sin_novedades", actor="x",
                             now=datetime.now(timezone.utc) - timedelta(days=8))
        data = manual_review.overview(db)
    assert data["due"] == 1 and data["items"][0]["overdue_days"] >= 1


# --------------------------------------------------------------------------- #
#  4. Catalogo en Excel
# --------------------------------------------------------------------------- #
def test_catalog_downloads_as_a_formatted_excel_workbook(api):  # noqa: F811
    sid = _source(api, title="=HYPERLINK(\"malicioso\")", catalog_code="EH-001", tech_types=["MED", "DM"])
    _manual(api, "Scopus")
    _source(api, title="Antigua", retired=True)
    res = api.get("/api/sources/export.xlsx")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert "catalogo_fuentes_iets_" in res.headers["content-disposition"]
    wb = load_workbook(io.BytesIO(res.content))
    assert wb.sheetnames == ["Fuentes", "Consulta manual (tipo E)", "Resumen", "Retiradas", "Información"]
    ws = wb["Fuentes"]
    headers = [c.value for c in ws[2]]
    assert headers[:3] == ["Código", "Fuente", "URL de consulta"]
    assert ws.freeze_panes == "B3" and ws.auto_filter.ref.startswith("A2:")
    titles = [ws.cell(row=r, column=2).value for r in range(3, ws.max_row + 1)]
    assert "'=HYPERLINK(\"malicioso\")" in titles  # sin inyeccion de formulas
    row = titles.index("'=HYPERLINK(\"malicioso\")") + 3
    assert ws.cell(row=row, column=3).hyperlink.target == QUERY
    assert ws.cell(row=row, column=7).value == "Medicamentos, Dispositivos médicos"
    assert "Antigua" not in titles
    assert wb["Consulta manual (tipo E)"].cell(row=3, column=1).value == "Scopus"
    # El CSV sigue disponible.
    assert api.get("/api/sources/export").status_code == 200


# --------------------------------------------------------------------------- #
#  5. RF-02-F: cruce de postulaciones
# --------------------------------------------------------------------------- #
def _payload(**kw):
    data = {
        "commercial_name": "Novamab",
        "inn_name": "novamab",
        "mechanism": "Anticuerpo monoclonal anti-X",
        "manufacturer": "Laboratorio Andino",
        "indication": "Melanoma avanzado",
        "development_phase": "Fase III",
        "evidence_links": ["https://clinicaltrials.gov/study/NCT01234567"],
        "has_conflict": False,
        "coi_accepted": True,
        "submitter_name": "Ana Perez",
        "submitter_email": "ana@example.org",
    }
    data.update(kw)
    return data


def test_a_submission_is_crossed_with_proactive_surveillance_on_arrival(api):  # noqa: F811
    sid = _source(api)
    fid = _finding(api, sid, title="Novamab · Melanoma · Fase II", technology="Novamab")
    with api.db() as db:
        link_resolver.resolve_with_pages(db, db.get(Source, sid), [db.get(Finding, fid)], {QUERY: PIPELINE_HTML})
        db.commit()
    _source(api, title="Otra fuente")
    res = api.client.post("/api/public/submissions", json=_payload())
    assert res.status_code == 201
    rows = api.get("/api/submissions").json()
    cross = rows[0]["cross_check"]
    assert cross["proactive"]["count"] == 1
    match = cross["proactive"]["matches"][0]
    assert match["source_title"] == "Pharma Demo · Pipeline"
    assert match["url"] == "https://pharma.example.org/pipeline/novamab-melanoma"
    assert match["link_type"] == "exacto"
    assert "ya la detectó" in cross["summary"]["text"]


def test_a_new_technology_is_reported_as_new(api):  # noqa: F811
    api.client.post("/api/public/submissions", json=_payload(commercial_name="Inventadol", inn_name="inventadol"))
    cross = api.get("/api/submissions").json()[0]["cross_check"]
    assert cross["proactive"]["count"] == 0
    assert "no la ha detectado" in cross["summary"]["text"]


def test_cross_check_with_the_web_uses_registries_and_drops_unrelated_results(api, monkeypatch):  # noqa: F811
    _source(api, title="FDA", url="https://www.fda.gov/drugs")
    api.client.post("/api/public/submissions", json=_payload())
    sub_id = api.get("/api/submissions").json()[0]["id"]
    queries = []

    def fake_registries(submission):
        return (
            [{"title": "A Study of Novamab", "url": "https://clinicaltrials.gov/study/NCT01234567",
              "snippet": "NCT01234567 · RECRUITING", "registry": "ClinicalTrials.gov", "total": 4}],
            [{"engine": "ClinicalTrials.gov", "query": "Novamab", "status": "ok", "detail": "1 resultado(s)"}],
        )

    def fake_search(query, *, cfg, brave_key="", domain=""):
        queries.append(query)
        return {
            "engine": "prueba",
            "attempts": [],
            "results": [
                {"url": "https://www.fda.gov/news/novamab", "title": "FDA aprueba Novamab", "snippet": "..."},
                # Basura que algunos buscadores devuelven ante consultas que no reconocen.
                {"url": "https://inmobiliaria.example.com/casa-302", "title": "Casa en venta", "snippet": "3 habitaciones"},
                {"url": "https://blog.example.com/novamab-review", "title": "Reseña", "snippet": ""},
            ],
        }

    monkeypatch.setattr(submission_crosscheck, "registry_matches", fake_registries)
    monkeypatch.setattr(web_search, "search", fake_search)
    res = api.post(f"/api/submissions/{sub_id}/cross-check", role="evaluador_tecnico")
    assert res.status_code == 200, res.text
    web = res.json()["cross_check"]["web"]
    assert queries == ["Novamab Laboratorio Andino"]
    assert web["discarded"] == 1
    urls = [r["url"] for r in web["results"]]
    assert "https://inmobiliaria.example.com/casa-302" not in urls
    registry, fda, blog = web["results"]
    assert registry["kind"] == "registro" and registry["official"] and registry["cited_by_submitter"]
    assert fda["kind"] == "web" and fda["official"] and fda["catalog_source"] == "FDA"
    assert not blog["official"] and not blog["catalog_source"]
    assert web["registries"] == 1
    assert "Registros oficiales: 1" in res.json()["cross_check"]["summary"]["text"]
    with api.db() as db:
        assert db.query(AuditLog).filter(AuditLog.action == "submission_cross_check").count() == 2


def test_a_registry_that_fails_does_not_break_the_cross_check(monkeypatch):
    def boom(name):
        raise RuntimeError("caido")

    monkeypatch.setattr(submission_crosscheck, "REGISTRIES", (("Caído", boom),))
    sub = Submission(commercial_name="Novamab", inn_name="novamab")
    rows, attempts = submission_crosscheck.registry_matches(sub)
    assert rows == [] and attempts[0]["status"] == "error"


def test_relevance_requires_the_whole_name():
    names = ["Zilovertamab vedotin"]
    assert submission_crosscheck.is_relevant({"title": "Zilovertamab Vedotin in DLBCL", "url": "https://x.org"}, names)
    assert not submission_crosscheck.is_relevant({"title": "Vedotin conjugates review", "url": "https://x.org"}, names)
    assert not submission_crosscheck.is_relevant({"title": "anime", "url": "https://adult.example.com/anime"}, names)


def test_a_submitted_name_contained_in_the_signal_name_is_a_match(api):  # noqa: F811
    # Caso real: "Lutathera" postulada y "Lutathera (AAA601)" en el pipeline de Novartis.
    sid = _source(api)
    _finding(api, sid, title="Lutathera (AAA601) · GEPNET", technology="Lutathera (AAA601)")
    api.client.post("/api/public/submissions", json=_payload(commercial_name="Lutathera", inn_name=""))
    cross = api.get("/api/submissions").json()[0]["cross_check"]
    assert cross["proactive"]["count"] == 1
    assert cross["proactive"]["matches"][0]["matched_on"] == ["nombre_contenido"]


def test_generic_words_alone_do_not_match(api):  # noqa: F811
    sid = _source(api)
    _finding(api, sid, title="Insulin pump system", technology="Insulin pump system")
    api.client.post("/api/public/submissions", json=_payload(commercial_name="Pump", inn_name=""))
    assert api.get("/api/submissions").json()[0]["cross_check"]["proactive"]["count"] == 0


def test_accepting_keeps_what_the_evaluator_saw(api):  # noqa: F811
    api.client.post("/api/public/submissions", json=_payload(commercial_name="Inventadol", inn_name="inventadol"))
    sub_id = api.get("/api/submissions").json()[0]["id"]
    assert api.post(f"/api/submissions/{sub_id}/accept", json={"note": "ok"}).status_code == 200
    with api.db() as db:
        tech = db.get(Technology, db.get(Submission, sub_id).technology_id)
        assert tech.raw_payload["cross_check"]["proactive_count"] == 0


def test_the_accepted_submission_is_not_matched_against_itself(api):  # noqa: F811
    api.client.post("/api/public/submissions", json=_payload(commercial_name="Inventadol", inn_name="inventadol"))
    sub_id = api.get("/api/submissions").json()[0]["id"]
    api.post(f"/api/submissions/{sub_id}/accept", json={"note": "ok"})
    with api.db() as db:
        result = submission_crosscheck.run(db, db.get(Submission, sub_id), web=False)
    assert result["proactive"]["count"] == 0


@pytest.mark.parametrize(
    "url,shape",
    [("https://x.org/", "portada"), ("https://x.org/search?q=a", "buscador"), ("https://x.org/news", "")],
)
def test_url_shape(url, shape):
    assert link_resolver._url_shape(url) == shape  # noqa: SLF001


JSONLD_PAGE = """
<html><head><script type="application/ld+json">
{"@graph": [
  {"@type": "WebPage", "name": "Pipeline", "url": "https://pharma.example.org/pipeline"},
  {"@type": "Drug", "name": "AAA601 – Lutathera™",
   "url": "https://pharma.example.org/pipeline#AAA601-Gastroenteropancreaticneuroendocrinetumors"},
  {"@type": "Drug", "name": "AAA601 – Lutathera™", "url": "https://pharma.example.org/pipeline#AAA601-GEPNETpediatrics"}
]}
</script></head><body><div id="app"></div></body></html>
"""


def test_structured_data_gives_each_product_its_own_url_and_the_indication_breaks_ties(api):  # noqa: F811
    # Caso real (Novartis): la tabla carga con JavaScript, pero el HTML trae la URL
    # oficial de cada producto en JSON-LD, con una fila por indicacion.
    sid = _source(api)
    fid = _finding(api, sid, title="Lutathera (AAA601) · Gastroenteropancreatic neuroendocrine tumors (Phase 3)",
                   technology="Lutathera (AAA601)")
    with api.db() as db:
        link_resolver.resolve_with_pages(db, db.get(Source, sid), [db.get(Finding, fid)], {QUERY: JSONLD_PAGE})
        db.commit()
        finding = db.get(Finding, fid)
        assert finding.link_type == "exacto"
        assert finding.url == "https://pharma.example.org/pipeline#AAA601-Gastroenteropancreaticneuroendocrinetumors"


def test_same_name_without_distinguishing_context_is_not_guessed():
    index = link_resolver.PageIndex(JSONLD_PAGE, QUERY)
    assert link_resolver.match_anchor(["Lutathera (AAA601)"], index, None, QUERY, title="Lutathera (AAA601)") is None
