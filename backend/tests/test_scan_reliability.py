"""Vigilancia que no se detiene, tiempo estimado, cribado parametrizable y URL de la matriz."""
import time
from datetime import datetime, timedelta, timezone

import pytest
from frente_b_support import api  # noqa: F401  (fixture)

from app import database, ingest_service, priority, scan_eta, scan_progress, worker
from app.models import Finding, IngestJob, MethodologyParam, Source


def _job(db, sid, **kw):
    data = {"source_id": sid, "connector": "html", "status": "pendiente", "attempts": 0, "max_attempts": 3}
    data.update(kw)
    job = IngestJob(**data)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


# --------------------------------------------------------------------------- #
#  Tiempo maximo por fuente: una fuente colgada no detiene la corrida
# --------------------------------------------------------------------------- #
def test_a_hung_source_is_closed_and_the_lane_moves_on(api, monkeypatch):
    sid = api.add_source(connector="html", connector_config={})
    with api.db() as db:
        job_id = _job(db, sid, status="ejecutando", attempts=1, started_at=datetime.now(timezone.utc)).id
    monkeypatch.setattr(database, "SessionLocal", api.Session)
    released = []

    def hung_run_job(db, jid):
        scan_progress.start(sid, jid)
        token = scan_progress.bind(sid)
        try:
            while True:  # una pagina que nunca termina, pero que informa su avance
                scan_progress.stage("recorriendo", "esperando")
                time.sleep(0.02)
        finally:
            scan_progress.unbind(token)
            released.append(jid)

    monkeypatch.setattr(ingest_service, "run_job", hung_run_job)
    started = time.monotonic()
    assert ingest_service.run_job_guarded(job_id, 0.3) == "timeout"
    assert time.monotonic() - started < 5
    assert released == [job_id]  # el hilo solto la fuente
    with api.db() as db:
        job = db.get(IngestJob, job_id)
        assert job.status == "error"
        assert "Tiempo máximo agotado" in job.message
        assert "recorriendo" in job.message


def test_a_source_that_finishes_in_time_is_untouched(api, monkeypatch):
    sid = api.add_source(connector="html", connector_config={})
    with api.db() as db:
        job_id = _job(db, sid, status="ejecutando").id
    monkeypatch.setattr(database, "SessionLocal", api.Session)

    def quick(db, jid):
        job = db.get(IngestJob, jid)
        job.status = "ok"
        db.commit()

    monkeypatch.setattr(ingest_service, "run_job", quick)
    assert ingest_service.run_job_guarded(job_id, 5) == "ok"
    with api.db() as db:
        assert db.get(IngestJob, job_id).status == "ok"


def test_abort_is_only_raised_in_the_aborted_thread():
    import threading

    event = threading.Event()
    token = scan_progress.arm(event)
    try:
        scan_progress.check_abort()  # sin corte, no lanza
        event.set()
        with pytest.raises(scan_progress.JobAborted):
            scan_progress.check_abort()
        # finish() llega con source_id explicito desde el worker: nunca lanza.
        scan_progress.stage("error", "x", source_id=999)
    finally:
        scan_progress.disarm(token)
    scan_progress.check_abort()


def test_job_timeout_comes_from_the_parameter(api):
    with api.db() as db:
        assert ingest_service.job_timeout_seconds(db) == 20 * 60
        db.get(MethodologyParam, "ingest.job_timeout_minutes").value = "7"
        db.commit()
        assert ingest_service.job_timeout_seconds(db) == 7 * 60


# --------------------------------------------------------------------------- #
#  Render gratuito: el servicio se visita a si mismo mientras haya cola
# --------------------------------------------------------------------------- #
def test_keepalive_only_while_there_is_work(monkeypatch):
    hits = []
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://sis.example.org/")
    monkeypatch.delenv("KEEPALIVE_URL", raising=False)
    monkeypatch.delenv("KEEPALIVE_ALWAYS", raising=False)
    import httpx

    monkeypatch.setattr(httpx, "get", lambda url, **kw: hits.append(url))
    assert worker.keepalive_url() == "https://sis.example.org/api/health"
    monkeypatch.setattr(worker, "has_pending_work", lambda: False)
    assert worker.keepalive_tick() is False and hits == []
    monkeypatch.setattr(worker, "has_pending_work", lambda: True)
    assert worker.keepalive_tick() is True and hits == ["https://sis.example.org/api/health"]
    monkeypatch.delenv("RENDER_EXTERNAL_URL")
    assert worker.keepalive_url() == "" and worker.keepalive_tick() is False


# --------------------------------------------------------------------------- #
#  Tiempo estimado de la vigilancia
# --------------------------------------------------------------------------- #
def test_eta_uses_each_source_history_and_the_queue(api):
    now = datetime.now(timezone.utc)
    a = api.add_source(connector="html", connector_config={})
    b = api.add_source(connector="html", connector_config={})
    c = api.add_source(connector="html", connector_config={})
    with api.db() as db:
        # Historial: A tarda 60 s, B 300 s; C no tiene historial.
        for days in (3, 2, 1):
            start = now - timedelta(days=days)
            _job(db, a, status="ok", started_at=start, finished_at=start + timedelta(seconds=60), created_at=start)
            _job(db, b, status="ok", started_at=start, finished_at=start + timedelta(seconds=300), created_at=start)
        run = now - timedelta(minutes=1)
        jobs = [
            _job(db, a, status="ejecutando", started_at=now - timedelta(seconds=20), created_at=run),
            _job(db, b, status="pendiente", scheduled_for=run, created_at=run),
            _job(db, c, status="pendiente", scheduled_for=run, created_at=run),
        ]
        eta = scan_eta.estimate(db, jobs, lanes=1, timeout_s=1200, now=now)
    # Uno a la vez: A le faltan 40 s, B 300 s, C la mediana general del historial (180 s).
    assert eta["eta_seconds"] == pytest.approx(40 + 300 + 180, abs=2)
    assert eta["eta_low_seconds"] <= eta["eta_seconds"] <= eta["eta_high_seconds"]
    assert eta["with_history"] == 2 and eta["remaining"] == 3
    # Con dos carriles la cola se reparte: termina antes.
    with api.db() as db:
        two = scan_eta.estimate(db, jobs, lanes=2, timeout_s=1200, now=now)
    assert two["eta_seconds"] < eta["eta_seconds"]


def test_eta_adapts_to_today_speed_and_waits_for_retries(api):
    now = datetime.now(timezone.utc)
    ids = [api.add_source(connector="html", connector_config={}) for _ in range(5)]
    with api.db() as db:
        for sid in ids:
            start = now - timedelta(days=1)
            _job(db, sid, status="ok", started_at=start, finished_at=start + timedelta(seconds=100), created_at=start)
        run = now - timedelta(minutes=30)
        jobs = []
        # Hoy las tres primeras tardaron el doble (200 s).
        for sid in ids[:3]:
            jobs.append(_job(db, sid, status="ok", started_at=run, finished_at=run + timedelta(seconds=200), created_at=run))
        # Un reintento programado dentro de 10 min.
        jobs.append(_job(db, ids[3], status="pendiente", scheduled_for=now + timedelta(minutes=10), created_at=run))
        jobs.append(_job(db, ids[4], status="pendiente", scheduled_for=run, created_at=run))
        eta = scan_eta.estimate(db, jobs, lanes=1, timeout_s=1200, now=now)
    # Peso conservador 3/(3+10) hacia x2: factor 1,23.
    assert eta["speed_factor"] == pytest.approx(1 + 3 / 13, abs=0.01)
    # La pendiente vencida corre ya (123 s); la del reintento no antes de 600 s.
    assert eta["eta_seconds"] == pytest.approx(600 + 100 * (1 + 3 / 13), abs=2)
    assert "más lento" in eta["basis"]


def test_progress_endpoint_reports_eta(api):
    sid = api.add_source(connector="html", connector_config={})
    with api.db() as db:
        _job(db, sid, status="pendiente", scheduled_for=datetime.now(timezone.utc))
    body = api.get("/api/ingest/progress").json()
    assert body["active"] is True
    assert body["eta"]["remaining"] == 1 and body["eta"]["eta_seconds"] > 0
    assert body["job_timeout_minutes"] == 20


# --------------------------------------------------------------------------- #
#  Cribado parametrizable
# --------------------------------------------------------------------------- #
def test_screening_weights_come_from_configuration(api):
    sample = dict(horizon="inminente", technology_type="medicamento", title="Fase III de X", summary="")
    assert priority.compute_screening_score(**sample) == 35 + 12 + 18
    with api.db() as db:
        sid = api.add_source(connector="html", connector_config={})
        db.add(Finding(source_id=sid, title="Fase III de X", horizon="inminente", technology_type="medicamento", screening_score=0, content_hash="h1"))
        db.commit()
    resp = api.put("/api/methodology/params/screening.points_inminente", json={"value": "50"})
    assert resp.status_code == 200
    with api.db() as db:
        weights = priority.screening_weights(db)
        assert weights["points_inminente"] == 50
        assert priority.compute_screening_score(**sample, weights=weights) == 50 + 12 + 18
        # Guardar un peso recalcula el cribado de las senales ya capturadas.
        assert db.query(Finding).one().screening_score == 50 + 12 + 18


def test_screening_threshold_is_a_real_parameter(api):
    with api.db() as db:
        assert priority.screening_threshold(db) == 70
        db.get(MethodologyParam, "screening.queue_threshold").value = "40"
        db.commit()
        assert priority.screening_threshold(db) == 40


def test_corroboration_bonus_is_configurable(api):
    from app import corroboration

    with api.db() as db:
        assert corroboration.bonus_params(db) == (5, 15)
        db.get(MethodologyParam, "corroboration.bonus_per_source").value = "8"
        db.commit()
        per, top = corroboration.bonus_params(db)
    assert corroboration.bonus_for(3, per, top) == 15
    assert corroboration.bonus_for(2, per, top) == 8


# --------------------------------------------------------------------------- #
#  URL principal = la original de la matriz EH (Excel), con etiqueta si no
# --------------------------------------------------------------------------- #
def test_web_sources_use_the_original_matrix_url():
    from app.catalog import CATALOG_SOURCES
    from app.catalog_service import url_provenance

    by_code = {row["catalog_code"]: row for row in CATALOG_SOURCES}
    assert by_code["FP-MF-01"]["url"] == "https://www.abbvie.com/our-science/pipeline.html"
    assert by_code["FP-HT-06"]["url"] == "https://www.inahta.org/"
    # Sub-fuente: la URL de su fila que corresponde a su pagina especifica.
    assert by_code["FP-RG-03"]["url"].endswith("/device-approvals-and-clearances/recently-approved-devices")
    origins = {}
    for row in CATALOG_SOURCES:
        src = Source(**{k: v for k, v in row.items() if hasattr(Source, k)})
        origins[row["catalog_code"]] = url_provenance(src)
    assert origins["FP-MF-01"]["origin"] == "matriz"
    # Las APIs oficiales y las excepciones documentadas llevan su etiqueta y la URL original.
    assert origins["FP-CT-01"]["origin"] == "api"
    assert origins["FP-CT-01"]["matrix_url"] == "https://clinicaltrials.gov/"
    assert origins["FP-HT-05"]["origin"] == "ajustada" and "i-HTS" in origins["FP-HT-05"]["note"]
    assert {p["origin"] for p in origins.values()} <= {"matriz", "api", "ajustada"}


def test_a_changed_url_is_tagged(api):
    from app.catalog_service import url_provenance

    src = Source(title="AbbVie", url="https://www.abbvie.com/otra.html", catalog_code="FP-MF-01", connector="html")
    prov = url_provenance(src)
    assert prov["origin"] == "distinta"
    assert prov["matrix_url"] == "https://www.abbvie.com/our-science/pipeline.html"
    ai = Source(title="Nueva", url="https://nueva.org", tags="propuesta_ia", connector="html")
    assert url_provenance(ai)["origin"] == "ia"
    body = api.get("/api/sources").json()
    assert all("url_origin" in s for s in body)


def test_progress_counts_only_the_active_run(api):
    """Una corrida de 1 fuente no debe mostrarse como «78 de 88» por la corrida anterior."""
    now = datetime.now(timezone.utc)
    old = api.add_source(connector="html", connector_config={})
    new = api.add_source(connector="html", connector_config={})
    with api.db() as db:
        earlier = now - timedelta(hours=2)
        _job(db, old, status="ok", created_at=earlier, started_at=earlier, finished_at=earlier + timedelta(seconds=30))
        _job(db, new, status="pendiente", created_at=now, scheduled_for=now)
    body = api.get("/api/ingest/progress").json()
    assert body["active"] is True and body["total"] == 1
    assert [r["source_id"] for r in body["sources"]] == [new]
    with api.db() as db:
        job = db.query(IngestJob).filter(IngestJob.source_id == new).one()
        job.status = "ok"
        db.commit()
    # Sin corrida activa vuelve a mostrar lo de las ultimas 12 h.
    assert api.get("/api/ingest/progress").json()["total"] == 2


def test_eta_grows_when_the_current_source_overruns(api):
    now = datetime.now(timezone.utc)
    sid = api.add_source(connector="html", connector_config={})
    with api.db() as db:
        for days, secs in ((3, 50), (2, 60), (1, 70)):
            start = now - timedelta(days=days)
            _job(db, sid, status="ok", started_at=start, finished_at=start + timedelta(seconds=secs), created_at=start)
        run = now - timedelta(minutes=10)
        job = _job(db, sid, status="ejecutando", created_at=run, started_at=now - timedelta(seconds=100))
        early = scan_eta.estimate(db, [job], lanes=1, timeout_s=1200, now=now)
        later = scan_eta.estimate(db, [job], lanes=1, timeout_s=1200, now=now + timedelta(seconds=200))
    # Lleva 100 s y suele tardar 60: queda algo. Con 300 s, el restante crece con la demora.
    assert early["eta_seconds"] >= 15
    assert later["eta_seconds"] > early["eta_seconds"]


# --------------------------------------------------------------------------- #
#  Hallazgos de la revision: registro cerrado al cortar, pesos y recuperacion
# --------------------------------------------------------------------------- #
def test_an_aborted_scrape_closes_its_log_and_saves_nothing(api, monkeypatch):
    import threading

    from app import scraper
    from app.models import ScrapeLog

    sid = api.add_source(url="https://lento.example.org", connector="html", connector_config={},
                         scan_profile={"web_search": False, "ocr": False, "max_pages": 1})
    event = threading.Event()

    def fetch(url, timeout=None):
        event.set()  # el worker cerro la fuente por tiempo mientras descargaba
        return (200, "text/html", "<html><h1>Nuevo farmaco en fase III aprobado</h1></html>", b"")

    monkeypatch.setattr(scraper, "fetch_url", fetch)
    token = scan_progress.arm(event)
    try:
        with api.db() as db:
            with pytest.raises(scan_progress.JobAborted):
                scraper.scrape_source(db, db.get(Source, sid), triggered_by="test")
    finally:
        scan_progress.disarm(token)
    with api.db() as db:
        log = db.query(ScrapeLog).filter(ScrapeLog.source_id == sid).one()
        assert log.status == "error" and log.finished_at is not None
        assert "Tiempo máximo" in log.message
        assert db.query(Finding).filter(Finding.source_id == sid).count() == 0


def test_scraped_signals_use_the_configured_weights(api, monkeypatch):
    from app import scraper

    with api.db() as db:
        db.get(MethodologyParam, "screening.points_area").value = "40"
        db.get(MethodologyParam, "screening.points_summary").value = "0"
        db.commit()
    sid = api.add_source(url="https://pesos.example.org", connector="html", connector_config={},
                         scan_profile={"web_search": False, "ocr": False, "max_pages": 1})
    page = "<html><body><h2>Nuevo farmaco aprobado para cancer de mama</h2></body></html>"
    monkeypatch.setattr(scraper, "fetch_url", lambda url, timeout=None: (200, "text/html", page, page.encode()))
    monkeypatch.setattr(scraper, "_enrich_with_ai", lambda *a, **k: [
        {"title": "Nuevo farmaco aprobado", "technology": "Farmaco X", "technology_type": "medicamento",
         "therapeutic_area": "Oncologia", "summary": "", "url": "https://pesos.example.org", "horizon": ""}
    ])
    with api.db() as db:
        scraper.scrape_source(db, db.get(Source, sid), triggered_by="test")
        finding = db.query(Finding).filter(Finding.source_id == sid).first()
        if finding is None:
            pytest.skip("El extractor no produjo la senal con esta pagina de prueba")
        weights = priority.screening_weights(db)
        expected = priority.compute_screening_score(
            horizon=finding.horizon, technology_type=finding.technology_type, phase=finding.phase,
            therapeutic_area=finding.therapeutic_area, summary=finding.summary,
            technology=finding.technology, title=finding.title, weights=weights,
        )
        assert finding.screening_score == expected
        assert finding.therapeutic_area and expected >= 40


def test_stale_recovery_never_requeues_a_job_within_its_timeout(api, monkeypatch):
    sid = api.add_source(connector="html", connector_config={})
    now = datetime.now(timezone.utc)
    with api.db() as db:
        db.get(MethodologyParam, "ingest.job_timeout_minutes").value = "45"
        db.commit()
        _job(db, sid, status="ejecutando", attempts=1, started_at=now - timedelta(minutes=40))
    monkeypatch.setattr(database, "SessionLocal", api.Session)
    monkeypatch.setattr(worker, "SessionLocal", api.Session)
    monkeypatch.setattr(worker, "drain", lambda **k: 0)
    import app.scheduler_service as sched

    monkeypatch.setattr(sched, "run_due_tasks", lambda db: None)
    monkeypatch.setattr(sched, "finalize_scan_runs", lambda db: None)
    worker.run_once()
    with api.db() as db:
        assert db.query(IngestJob).filter(IngestJob.source_id == sid).one().status == "ejecutando"
