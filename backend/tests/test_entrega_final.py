"""Entrega final: rutas de acceso a las fuentes, historial de vigilancias y ficha de los modelos.

Antes, un 403 en la sonda dejaba la fuente sin leer («Ingesta no arrancada»),
las vigilancias lanzadas a mano no quedaban en ningun historial y la pantalla
de Inteligencia no decia que modelo usaba el sistema ni como aprendia.
"""
from __future__ import annotations

import pytest
from frente_b_support import api  # noqa: F401  (fixture)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import access_routes, ingest_service, scan_progress, scheduler_service, scraper
from app.database import Base
from app.models import ScheduledRun, Source

PAGE = "<html><head><title>Pipeline</title></head><body><h2>New cancer drug trial phase 3</h2>" + "<p>texto</p>" * 400 + "</body></html>"


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    yield session
    session.close()


# --------------------------------------------------------------------------- #
#  Rutas de acceso
# --------------------------------------------------------------------------- #
def test_a_block_or_an_empty_shell_asks_for_the_browser_route():
    assert access_routes.looks_blocked(403, "text/html", "")
    assert access_routes.looks_blocked(0, "", "")
    assert access_routes.looks_blocked(200, "text/html", "<html><body>Loading...</body></html>")
    assert access_routes.looks_blocked(200, "text/html", "<html><title>Just a moment...</title>" + "x" * 3000)
    assert not access_routes.looks_blocked(200, "text/html", PAGE)
    assert not access_routes.looks_blocked(404, "text/html", "no existe")
    # Un PDF o un canal cortos no son un bloqueo.
    assert not access_routes.looks_blocked(200, "application/pdf", "")


def test_the_browser_route_is_off_until_the_team_turns_it_on(monkeypatch):
    calls = []
    monkeypatch.setattr(scraper, "_fetch_plain", lambda url, timeout=None, retries=None: (403, "text/html", "", b""))
    monkeypatch.setattr(access_routes, "browser_get", lambda url, timeout=25.0, quick=False: calls.append(url) or (200, "text/html", PAGE, b""))

    assert scraper._fetch_url("https://bloquea.test/")[0] == 403
    assert calls == [] and access_routes.last_via() == "directo"

    monkeypatch.setattr(access_routes, "available", lambda: True)
    status, _ctype, text, _raw = scraper._fetch_url("https://bloquea.test/")
    assert status == 200 and text == PAGE
    assert calls == ["https://bloquea.test/"] and access_routes.last_via() == "navegador"


def test_a_page_that_already_answers_is_not_fetched_twice(monkeypatch):
    calls = []
    monkeypatch.setattr(access_routes, "available", lambda: True)
    monkeypatch.setattr(scraper, "_fetch_plain", lambda url, timeout=None, retries=None: (200, "text/html", PAGE, b""))
    monkeypatch.setattr(access_routes, "browser_get", lambda *a, **k: calls.append(1) or (200, "text/html", PAGE, b""))
    assert scraper._fetch_url("https://abre.test/")[0] == 200
    assert calls == [] and access_routes.last_via() == "directo"


def test_the_switch_is_saved_with_the_source_parameters(api):
    assert api.get("/api/config/web-search").json()["browser_fetch"] is False
    body = api.put("/api/config/web-search", json={"browser_fetch": True}).json()
    assert body["browser_fetch"] is True
    with api.Session() as db:
        access_routes.configure_from_db(db)
    # El servidor de pruebas la prohibe (BROWSER_FETCH_ENABLED=false): la configuracion no la fuerza.
    assert access_routes.available() is False
    assert access_routes.status()["browser_allowed"] is False


def test_a_journal_behind_a_challenge_is_read_from_its_pubmed_index():
    nejm = Source(title="NEJM", url="https://www.nejm.org/")
    routes = scraper.fallback_urls(nejm)
    index = access_routes.journal_index_url(nejm.url)
    assert index and access_routes.is_journal_index(index)
    # El indice oficial se prueba antes que Google News.
    assert routes.index(index) < routes.index(scraper.news_feed_url(nejm))
    assert scraper.access_route(nejm, index) == "indice_pubmed"
    assert access_routes.journal_term("https://innovations.bmj.com/pages/x") == '"BMJ Innov"[jour]'
    assert access_routes.journal_index_url("https://www.pfizer.com/pipeline") == ""

    feed = access_routes._rss('"N Engl J Med"[jour]', index, [
        {"title": "Gene therapy for hemophilia B: phase 3 trial", "link": "https://pubmed.ncbi.nlm.nih.gov/123/", "summary": "Results & safety", "date": "2026 Nov 2"},
    ])
    assert scraper.is_feed(feed)
    items = scraper.feed_items(feed)
    assert items[0]["url"] == "https://pubmed.ncbi.nlm.nih.gov/123/" and items[0]["summary"] == "Results & safety"
    assert scan_progress.access_outcome({"accessed": True, "items_found": 2, "access_via": "indice_pubmed"}) == "entro_respaldo"
    assert scan_progress.access_outcome({"accessed": True, "items_found": 2, "access_via": "navegador"}) == "entro_directo"


def test_a_red_probe_no_longer_stops_a_web_source(db, monkeypatch):
    """La sonda informaba 403 y la fuente quedaba «Ingesta no arrancada» sin probar ninguna ruta."""
    from app import probe_service

    scan_progress.clear()
    src = Source(title="Agencia", url="https://agencia.test/novedades", connector="html", scrape_enabled=True,
                 access_level="A", catalog_code="EH-900", category="Agencias regulatorias", language="en")
    db.add(src)
    db.commit()
    monkeypatch.setattr(probe_service, "probe_source", lambda db, source, **kw: {"status": "rojo", "message": "HTTP 403 (se esperaba 200)."})
    monkeypatch.setattr(scraper, "fetch_url", lambda url, timeout=None, retries=None: (200, "text/html", PAGE, PAGE.encode()))
    monkeypatch.setattr(scraper, "_crawl_with_profile", lambda *a, **k: {"pages": [], "pages_visited": 1, "steps": []})
    monkeypatch.setattr(scraper, "_enrich_with_ai", lambda data, **kw: data)

    job = ingest_service.run_job(db, ingest_service.enqueue(db, [src], triggered_by="test")[0].id)
    assert job.status in ("ok", "parcial"), job.message
    assert "no arrancada" not in (job.message or "")
    assert scan_progress.get(src.id)["accessed"] is True


def test_the_report_names_the_browser_route(db, monkeypatch):
    scan_progress.clear()
    src = Source(title="Fabricante", url="https://fabricante.test/pipeline", connector="html", scrape_enabled=True,
                 access_level="D", category="Fabricantes de I+D", language="en")
    db.add(src)
    db.commit()

    def fetch(url, timeout=None, retries=None):
        access_routes.set_via("navegador")
        return 200, "text/html", PAGE, PAGE.encode()

    monkeypatch.setattr(scraper, "fetch_url", fetch)
    monkeypatch.setattr(scraper, "_crawl_with_profile", lambda *a, **k: {"pages": [], "pages_visited": 1, "steps": []})
    monkeypatch.setattr(scraper, "_enrich_with_ai", lambda data, **kw: data)
    job = ingest_service.run_job(db, ingest_service.enqueue(db, [src], triggered_by="test")[0].id)
    state = scan_progress.get(src.id)
    assert state["access_via"] == "navegador"
    assert state["access_attempts"][0]["route"] == "navegador"
    assert "cliente compatible con navegador" in job.message


# --------------------------------------------------------------------------- #
#  Historial de vigilancias
# --------------------------------------------------------------------------- #
def test_a_manual_scan_is_kept_in_the_history_with_date_duration_and_summary(api):
    one = api.add_source(title="Fuente uno")
    api.add_source(title="Fuente dos", url="https://dos.example.org")
    assert api.get("/api/ingest/runs").json()["runs"] == []

    done = api.post("/api/ingest/run", json={"source_ids": [], "process_now": True}).json()
    assert done["processed"] == 2

    body = api.get("/api/ingest/runs").json()
    run = body["runs"][0]
    assert run["origin"] == "manual" and run["scope"] == "todas" and run["status"] == "ok"
    assert run["started_at"] and run["finished_at"] and run["duration_seconds"] >= 0
    assert run["sources_total"] == 2 and run["counts"]["ok"] == 2 and run["sources_pending"] == 0
    assert run["outcomes"]["entro_directo"] == 2 and run["outcomes"]["no_entro"] == 0
    assert run["items_new"] >= 1 and "2 fuente(s) procesadas" in run["message"]
    assert run["triggered_by"]
    assert body["last_finished"]["id"] == run["id"]

    # Rastrear una sola fuente tambien queda, como «seleccion».
    api.post(f"/api/scan/source/{one}")
    runs = api.get("/api/ingest/runs").json()["runs"]
    assert len(runs) == 2 and runs[0]["scope"] == "seleccion" and runs[0]["sources_total"] == 1
    assert runs[0]["status"] in ("ok", "parcial")


def test_manual_scans_do_not_move_the_scheduled_clock(api):
    api.add_source(title="Fuente uno")
    with api.Session() as db:
        before = scheduler_service.next_due(db, scheduler_service.TASK_SCAN)
    api.post("/api/ingest/run", json={"source_ids": [], "process_now": True})
    with api.Session() as db:
        assert db.query(ScheduledRun).filter(ScheduledRun.task == "vigilancia").count() == 1
        # La tarea programada sigue «sin correr»: la corrida manual no cuenta para su reloj.
        assert scheduler_service.last_run(db, scheduler_service.TASK_SCAN) is None
        assert scheduler_service.last_run(db, scheduler_service.TASK_SCAN, any_scope=True) is not None
        after = scheduler_service.next_due(db, scheduler_service.TASK_SCAN)
    assert (before is None) == (after is None)


def test_the_history_counts_the_sources_it_could_not_enter(api, monkeypatch):
    bad = api.add_source(title="Bloqueada", url="https://bloqueada.example.org", connector="html", connector_config={})
    monkeypatch.setattr(scraper, "fetch_url", lambda url, timeout=None, retries=None: (403, "text/html", "", b""))
    with api.Session() as db:
        source = db.get(Source, bad)
        jobs = ingest_service.enqueue(db, [source], triggered_by="t")
        jobs[0].max_attempts = 1
        db.commit()
        scheduler_service.record_manual_scan(db, jobs, triggered_by="t@iets.org.co", scope=scheduler_service.SCOPE_SELECTION)
        ingest_service.run_job(db, jobs[0].id)
    run = api.get("/api/ingest/runs").json()["runs"][0]
    assert run["status"] == "error" and run["outcomes"]["no_entro"] == 1
    assert run["failed"][0]["title"] == "Bloqueada" and "HTTP 403" in run["failed"][0]["message"]
    assert "no se pudo entrar a 1" in run["message"]


# --------------------------------------------------------------------------- #
#  Ficha de los modelos
# --------------------------------------------------------------------------- #
def test_intelligence_status_says_which_models_run_and_how_they_learn(api):
    body = api.get("/api/intelligence/status").json()
    card = body["model_card"]
    by_key = {c["key"]: c for c in card["components"]}
    assert list(by_key) == ["reglas", "aprendizaje", "calibracion", "ia"]
    assert "k-NN" in by_key["aprendizaje"]["type"] and "TF-IDF" in by_key["aprendizaje"]["type"]
    assert "No se entrena" in by_key["ia"]["learning"]
    for component in card["components"]:
        assert component["type"] and component["role"] and component["learning"] and component["facts"]
    facts = {f["label"]: f["value"] for f in by_key["aprendizaje"]["facts"]}
    assert facts["Vecinos que votan (k)"] == body["config"]["neighbors"]
    assert len(card["decision_rule"]) == 4
    assert isinstance(body["trace"], list)
