"""Vigilancia: estado por fuente, cola en paralelo y canales RSS/XML.

Antes, cuando un sitio bloqueaba al robot, el respaldo de Google News traia todo
lo publicado en el dominio (empleos, resultados financieros) y un canal vacio se
leia como HTML: el titulo del canal o su XML terminaban como senal.
"""
from __future__ import annotations

import pytest
from frente_b_support import api  # noqa: F401  (fixture)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import ingest_service, scan_progress, scraper
from app.database import Base
from app.models import Finding, IngestJob, Source


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    yield session
    session.close()

GNEWS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>"site:pfizer.com when:90d" - Google News</title>
<item><title>AI Engineer job in North Chicago, IL - Pfizer</title><link>https://news.google.com/rss/articles/a</link>
<description>Careers</description><source url="https://www.pfizer.com">Pfizer</source></item>
<item><title>Pfizer's Third-Quarter Results Reflect Confidence and Momentum - Pfizer</title>
<link>https://news.google.com/rss/articles/b</link><source url="https://www.pfizer.com">Pfizer</source></item>
<item><title>FDA approves new gene therapy for hemophilia B - Pfizer</title><link>https://news.google.com/rss/articles/c</link>
<description>&lt;a href="x"&gt;FDA approves&lt;/a&gt; phase 3 trial results</description>
<source url="https://www.pfizer.com">Pfizer</source><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>"""

EMPTY_GNEWS = """<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<title>"site:reutershealth.com when:90d" - Google News</title><link>https://news.google.com</link></channel></rss>"""

STYLED_FEED = (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<?xml-stylesheet type="text/xsl" href="/rss.xsl"?>\n'
    + "<!-- " + ("comentario largo " * 60) + "-->\n"
    + "<rss version='2.0'><channel><title>Canal</title>"
    "<item><title>New drug trial for cancer</title><link>https://x.test/a</link></item></channel></rss>"
)

SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://x.test/a</loc></url></urlset>"""


def _source(db, **kw) -> Source:
    data = dict(title="Pfizer — pipeline", url="https://www.pfizer.com/science/pipeline", connector="html",
                category="Fabricantes de I+D", scrape_enabled=True, language="en")
    data.update(kw)
    row = Source(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# --------------------------------------------------------------------------- #
#  Canales RSS / XML
# --------------------------------------------------------------------------- #
def test_feed_detection_looks_past_stylesheets_and_comments():
    assert scraper.is_feed(STYLED_FEED)
    assert not scraper.is_feed("<html><body><p>rss</p></body></html>")
    assert scraper.is_plain_xml(SITEMAP)
    assert not scraper.is_plain_xml(GNEWS)
    assert not scraper.is_plain_xml('<?xml version="1.0"?><!DOCTYPE html><html></html>')


def test_an_empty_feed_is_never_read_as_html():
    src = Source(title="Reuters Health", url="https://www.reutershealth.com/")
    assert scraper.extract_candidates(src, EMPTY_GNEWS) == []
    assert scraper.extract_candidates(src, SITEMAP) == []


def test_google_news_titles_drop_the_publisher_suffix():
    titles = [i["title"] for i in scraper.feed_items(GNEWS)]
    assert "FDA approves new gene therapy for hemophilia B" in titles
    assert not any(t.endswith(" - Pfizer") for t in titles)


def test_news_fallback_keeps_only_technology_items():
    src = Source(title="Pfizer", url="https://www.pfizer.com/")
    kept = [c["title"] for c in scraper.extract_candidates(src, GNEWS, only_relevant=True)]
    assert kept == ["FDA approves new gene therapy for hemophilia B"]
    # Sin el filtro (canal oficial de la fuente) se conserva todo.
    assert len(scraper.extract_candidates(src, GNEWS)) == 3


def test_feed_crawl_gives_the_ai_clean_text_not_xml():
    crawl = scraper.feed_crawl("https://news.google.com/rss/search?q=x", GNEWS, only_relevant=True)
    assert "FDA approves new gene therapy" in crawl["combined"]
    assert "<rss" not in crawl["combined"] and "<item>" not in crawl["combined"]
    assert "job" not in crawl["combined"].lower()


def test_a_blocked_site_reads_google_news_as_a_partial_run(db, monkeypatch):
    src = _source(db)

    def fetch(url, timeout=None):
        if "news.google.com" in url:
            return (200, "application/xml; charset=utf-8", GNEWS, GNEWS.encode())
        return (403, "text/html", "", b"")

    monkeypatch.setattr(scraper, "fetch_url", fetch)
    monkeypatch.setattr(scraper, "_unreachable_until", {})
    monkeypatch.setattr(scraper, "_enrich_with_ai", lambda data, **kw: data)
    monkeypatch.setattr(scraper, "_crawl_with_profile", lambda *a, **k: (_ for _ in ()).throw(AssertionError("no se rastrea Google News")))
    log = scraper.scrape_source(db, src, triggered_by="test")
    assert log.status == "parcial"
    assert "Google News" in log.message
    titles = [f.title for f in db.query(Finding).filter(Finding.source_id == src.id)]
    assert titles == ["FDA approves new gene therapy for hemophilia B"]


def test_an_empty_google_news_fallback_creates_no_signal(db, monkeypatch):
    src = _source(db, title="Reuters Health", url="https://www.reutershealth.com/")

    def fetch(url, timeout=None):
        if "news.google.com" in url:
            return (200, "application/xml", EMPTY_GNEWS, EMPTY_GNEWS.encode())
        return (401, "text/html", "", b"")

    monkeypatch.setattr(scraper, "fetch_url", fetch)
    monkeypatch.setattr(scraper, "_unreachable_until", {})
    monkeypatch.setattr(scraper, "_enrich_with_ai", lambda data, **kw: data)
    log = scraper.scrape_source(db, src, triggered_by="test")
    assert log.items_found == 0
    assert db.query(Finding).filter(Finding.source_id == src.id).count() == 0


def test_access_route_names_where_the_content_came_from():
    src = Source(title="BMJ", url="https://www.bmj.com/")
    assert scraper.access_route(src, "https://www.bmj.com") == "sitio"
    assert scraper.access_route(src, "https://www.bmj.com/rss/recent.xml") == "rss_oficial"
    assert scraper.access_route(src, scraper.news_feed_url(src)) == "google_news"
    assert scraper.access_route(src, "https://www.bmj.com/research", ["https://www.bmj.com/research"]) == "ruta_matriz"


# --------------------------------------------------------------------------- #
#  Estado por fuente
# --------------------------------------------------------------------------- #
def test_run_job_reports_each_stage_of_the_source(db, monkeypatch):
    scan_progress.clear()
    src = _source(db, url="https://ok.test/pipeline", title="Fuente OK")
    page = "<html><head><title>Pipeline</title></head><body><h2>New cancer drug trial phase 3</h2></body></html>"
    monkeypatch.setattr(scraper, "fetch_url", lambda url, timeout=None: (200, "text/html", page, page.encode()))
    monkeypatch.setattr(scraper, "_crawl_with_profile", lambda *a, **k: {"pages": [], "pages_visited": 1, "steps": []})
    monkeypatch.setattr(scraper, "_enrich_with_ai", lambda data, **kw: data)
    job = ingest_service.run_job(db, ingest_service.enqueue(db, [src], triggered_by="test")[0].id)

    state = scan_progress.get(src.id)
    assert state["job_id"] == job.id
    assert state["stage"] == "terminada"
    assert state["accessed"] is True and state["access_via"] == "sitio" and state["http_status"] == 200
    stages = [e["stage"] for e in state["events"]]
    for expected in ("conectando", "accedida", "extrayendo", "guardando", "terminada"):
        assert expected in stages


def test_a_failed_source_shows_the_retry_in_its_state(db, monkeypatch):
    scan_progress.clear()
    src = _source(db, url="https://caido.test/", title="Caída")
    monkeypatch.setattr(scraper, "fetch_url", lambda url, timeout=None: (503, "text/html", "", b""))
    job = ingest_service.run_job(db, ingest_service.enqueue(db, [src], triggered_by="test")[0].id)
    assert job.status == "pendiente"  # vuelve a la cola
    state = scan_progress.get(src.id)
    assert state["stage"] == "en_cola" and "reintento" in state["detail"]
    assert state["accessed"] is False


def test_progress_endpoint_lists_every_queued_source(api):
    scan_progress.clear()
    first = api.add_source(title="Primera")
    second = api.add_source(title="Segunda", url="https://segunda.example.org")
    run = api.post("/api/ingest/run", json={"source_ids": [first, second]})
    assert run.status_code == 200
    body = api.get("/api/ingest/progress").json()
    assert body["active"] is True
    rows = {r["source_id"]: r for r in body["sources"]}
    assert rows[first]["stage"] == "en_cola" and rows[first]["stage_label"] == "En cola"
    assert body["counts"]["pendiente"] >= 2


def test_cancel_stops_what_is_still_queued(api):
    src = api.add_source(title="Por cancelar")
    api.post("/api/ingest/run", json={"source_ids": [src]})
    assert api.post("/api/ingest/cancel", role="revisor_pares").status_code == 403
    out = api.post("/api/ingest/cancel")
    assert out.status_code == 200 and out.json()["cancelled"] >= 1
    body = api.get("/api/ingest/progress").json()
    row = next(r for r in body["sources"] if r["source_id"] == src)
    assert row["stage"] == "cancelada" and body["active"] is False


def test_claim_next_hands_each_job_to_one_lane(db):
    a = _source(db, url="https://a.test/", title="A")
    b = _source(db, url="https://b.test/", title="B")
    ingest_service.enqueue(db, [a, b], triggered_by="test")
    first, second = ingest_service.claim_next(db), ingest_service.claim_next(db)
    assert first and second and first != second
    assert ingest_service.claim_next(db) is None
    assert {j.status for j in db.query(IngestJob).all()} == {"ejecutando"}


def test_job_postings_from_the_news_fallback_are_dropped():
    assert not scraper.news_item_relevant("Oncology Field Medical Director, Thoracic (non-MD)")
    assert not scraper.news_item_relevant("Internal Medicine Health & Science System Specialist - Erie, PA")
    assert not scraper.news_item_relevant("Medication Guide")
    assert scraper.news_item_relevant("Pfizer's TUKYSA Regimen Receives FDA Approval for HER2+ Breast Cancer")
    assert scraper.news_item_relevant("Medical Director comments on phase 3 trial of new vaccine")


# --------------------------------------------------------------------------- #
#  Cursor de ClinicalTrials.gov
# --------------------------------------------------------------------------- #
def test_an_expired_clinicaltrials_cursor_restarts_from_the_first_page(monkeypatch):
    from app.ingest import clinicaltrials
    from app.ingest.base import ConnectorError

    calls = []

    def fake(url, *, params, **kw):
        calls.append(dict(params))
        if params.get("pageToken"):
            raise ConnectorError("HTTP 400: The data have probably changed while you were paginating.")
        return {"studies": [], "totalCount": 0}

    monkeypatch.setattr(clinicaltrials, "request_json", fake)
    result = clinicaltrials.ClinicalTrialsConnector().fetch(config={"pageToken": "viejo"}, url="")
    assert len(calls) == 2 and "pageToken" not in calls[1]
    assert result.next_cursor is None


def test_the_saved_cursor_is_cleared_when_there_are_no_more_pages(db, monkeypatch):
    from app.ingest.base import ConnectorResult

    src = _source(db, url="https://clinicaltrials.gov/api/v2/studies", connector="fixture",
                  connector_config={"records": [], "pageToken": "viejo"})

    class Adapter:
        label = "Prueba"
        adapter_version = "1"

        def fetch(self, config, url):
            return ConnectorResult(records=[], message="ok", next_cursor=None)

    monkeypatch.setattr(ingest_service.ingest, "get_connector", lambda code: Adapter())
    ingest_service.run_job(db, ingest_service.enqueue(db, [src], triggered_by="test")[0].id)
    db.refresh(src)
    assert "pageToken" not in (src.connector_config or {})


# --------------------------------------------------------------------------- #
#  Busqueda web, verificacion de la IA e informe de acceso
# --------------------------------------------------------------------------- #
def test_an_engine_that_ignores_site_does_not_stop_the_cascade(monkeypatch):
    from app import source_profile, web_search

    web_search.reset_cooldowns()

    def fake_call(engine, query, *, cfg, brave_key):
        if engine == "bing":  # ignora site: y trae portadas ajenas
            return [{"url": "https://dictionary.example.com/x", "title": "x", "snippet": ""}]
        return [{"url": "https://www.fda.gov/devices/a", "title": "A", "snippet": ""}]

    monkeypatch.setattr(web_search, "_engine_call", fake_call)
    cfg = {**source_profile.DEFAULT_SEARCH, "engines": ["bing", "yahoo"]}
    out = web_search.search("site:fda.gov device", cfg=cfg, domain="fda.gov")
    assert out["engine"] == "yahoo"
    assert out["attempts"][0]["status"] == "fuera_de_dominio"


def test_ai_signals_must_appear_in_the_visited_text():
    from app import ai_web

    page = "Pfizer's ELREXFIO meets primary endpoint in phase 3 study in relapsed multiple myeloma."
    real = {"title": "ELREXFIO cumple el objetivo primario en mieloma múltiple", "technology": "ELREXFIO"}
    invented = {"title": "Nueva vacuna contra el dengue aprobada por la FDA", "technology": "Dengvaxia Plus"}
    assert ai_web.is_grounded(real, page)
    assert not ai_web.is_grounded(invented, page)
    report = {}
    raw = (
        '[{"title": "ELREXFIO cumple el objetivo primario", "technology": "ELREXFIO", "summary": "mieloma",'
        ' "url": "https://inventada.test/x"},'
        ' {"title": "Nueva vacuna contra el dengue aprobada", "technology": "Dengvaxia Plus"}]'
    )
    items = ai_web._parse_items(raw, "https://www.pfizer.com/news", "Pfizer", source_text=page, report=report)
    assert [i["technology"] for i in items] == ["ELREXFIO"]
    assert items[0]["url"] == "https://www.pfizer.com/news"  # URL inventada: se usa la de la fuente
    assert report["returned"] == 2 and report["kept"] == 1 and len(report["ungrounded"]) == 1


def test_a_failed_source_says_every_route_it_tried(db, monkeypatch):
    scan_progress.clear()
    src = _source(db, url="https://bloqueado.test/", title="Bloqueado")

    def fetch(url, timeout=None):
        if "news.google.com" in url:
            return (0, "", "", b"")
        return (403, "text/html", "", b"")

    monkeypatch.setattr(scraper, "fetch_url", fetch)
    monkeypatch.setattr(scraper, "_unreachable_until", {})
    job = ingest_service.run_job(db, ingest_service.enqueue(db, [src], triggered_by="test")[0].id)
    assert "sitio: HTTP 403" in job.message and "Google News: sin respuesta" in job.message
    state = scan_progress.get(src.id)
    assert [a["route"] for a in state["access_attempts"]] == ["sitio", "google_news"]


def test_access_report_lists_every_active_source_with_its_outcome(api, monkeypatch):
    from app import scan_progress as sp
    from app.database import get_db  # noqa: F401

    ok = api.add_source(title="Entra")
    never = api.add_source(title="Nunca rastreada", url="https://nunca.example.org")
    with api.Session() as db:
        job = ingest_service.run_job(db, ingest_service.enqueue(db, [db.get(Source, ok)], triggered_by="t")[0].id)
        assert job.status == "ok"
    body = api.get("/api/ingest/access-report").json()
    rows = {r["source_id"]: r for r in body["sources"]}
    assert rows[ok]["outcome"] == "entro_directo" and rows[ok]["access_via"] == "api"
    assert body["search_health"]["enabled"] is True and "cooling" in body["search_health"]
    assert rows[never]["outcome"] == "sin_ejecutar"
    assert body["counts"]["sin_ejecutar"] >= 1
    sp.clear()
    # Tras un "reinicio" el progreso sigue mostrando el detalle guardado.
    prog = api.get("/api/ingest/progress").json()
    row = next(r for r in prog["sources"] if r["source_id"] == ok)
    assert row["access_via"] == "api" and row["access_attempts"] and row["attempts"] == 1


def test_a_blocked_site_still_searches_the_web_and_the_ai_reads_the_snippets(db, monkeypatch):
    from app import web_search

    scan_progress.clear()
    src = _source(db)

    def fetch(url, timeout=None):
        if "news.google.com" in url:
            return (200, "application/xml", EMPTY_GNEWS, EMPTY_GNEWS.encode())
        return (403, "text/html", "", b"")

    found = [{"url": "https://www.pfizer.com/news/elrexfio", "title": "ELREXFIO phase 3", "snippet": "meets endpoint",
              "query": "site:pfizer.com pipeline", "engine": "yahoo"}]
    monkeypatch.setattr(scraper, "fetch_url", fetch)
    monkeypatch.setattr(scraper, "_unreachable_until", {})
    monkeypatch.setattr(web_search, "search_for_source", lambda *a, **k: {"results": found, "steps": []})
    seen = {}

    def fake_ai(data, **kw):
        seen["corpus"] = (kw.get("crawl") or {}).get("combined", "")
        return data

    monkeypatch.setattr(scraper, "_enrich_with_ai", fake_ai)
    scraper.scrape_source(db, src, triggered_by="test")
    assert "ELREXFIO phase 3" in seen["corpus"] and "pfizer.com/news/elrexfio" in seen["corpus"]


def test_a_translated_ai_signal_is_kept_when_its_quote_is_in_the_page():
    from app import ai_web

    page = "Gene therapy for adults with phenylketonuria (PKU) restored phenylalanine levels in a phase 1/2 trial."
    raw = (
        '[{"title": "Terapia génica para fenilcetonuria en adultos", "technology": "Terapia génica para PKU",'
        ' "evidencia": "Gene therapy for adults with phenylketonuria (PKU)"},'
        ' {"title": "Vacuna contra el dengue aprobada", "technology": "Dengue",'
        ' "evidencia": "The dengue vaccine was approved by the FDA"}]'
    )
    report = {}
    items = ai_web._parse_items(raw, "https://www.nejm.org/x", "NEJM", source_text=page, report=report)
    assert [i["title"] for i in items] == ["Terapia génica para fenilcetonuria en adultos"]
    assert items[0]["raw_content"].startswith("Cita de la fuente: «Gene therapy for adults")
    assert report["with_evidence"] == 1 and len(report["ungrounded"]) == 1


def test_boolean_ai_queries_are_simplified_for_html_engines():
    from app import web_search

    q = "site:pfizer.com (drug pipeline OR investigational drug OR new molecular entity) medicines innovation"
    assert web_search._sanitize_query(q, "pfizer.com") == "site:pfizer.com drug pipeline medicines innovation"
    pdf = web_search._sanitize_query("filetype:pdf (pipeline OR medicines) (report OR deck)", "pfizer.com")
    assert pdf == "site:pfizer.com pipeline report filetype:pdf"


def test_an_engine_with_zero_rows_is_not_a_success_and_one_block_is_short(monkeypatch):
    from app import source_profile, web_search

    web_search.reset_cooldowns()

    def fake_call(engine, query, *, cfg, brave_key):
        if engine == "yahoo":
            raise web_search.EngineBlocked("HTTP 999")
        if engine == "duckduckgo":
            return []
        return [{"url": "https://www.fda.gov/a", "title": "A", "snippet": ""}]

    monkeypatch.setattr(web_search, "_engine_call", fake_call)
    cfg = {**source_profile.DEFAULT_SEARCH, "engines": ["yahoo", "duckduckgo", "bing"], "cooldown_minutes": 20}
    out = web_search.search("site:fda.gov x", cfg=cfg, domain="fda.gov")
    assert [a["status"] for a in out["attempts"]] == ["bloqueado", "sin_resultados", "ok"] and out["engine"] == "bing"
    assert web_search.cooldown_status()["yahoo"] <= 2 * 60  # primer bloqueo: 2 min, no 20
    web_search.reset_cooldowns()
