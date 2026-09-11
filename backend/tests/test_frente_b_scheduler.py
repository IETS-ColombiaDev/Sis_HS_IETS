"""Frente B: vigilancia programada (P0-4) y barrido de duplicados programado (P1-4).

El worker corre `scheduler_service.run_due_tasks`; aqui se ejercita esa funcion
directamente sobre SQLite en memoria, con el conector `fixture`, que no sale a
la red.
"""
from __future__ import annotations

import datetime as dt
import threading
import time

import pytest

from frente_b_support import api, fixture_record, make_engine  # noqa: F401  (fixture)

from sqlalchemy.orm import sessionmaker

from app import ingest_service, methodology, scheduler_service, settings_store, worker
from app.models import AlertEvent, Cycle, CycleTechnology, IngestJob, ScheduledRun, Source, Technology, User


@pytest.fixture()
def db():
    engine = make_engine()
    session = sessionmaker(bind=engine, autoflush=False)()
    methodology.seed_catalogs(session)
    for role in ("superadmin", "evaluador_tecnico", "tomador_decisiones"):
        session.add(User(email=f"{role}@iets.org.co", name=role, picture="", role=role, is_active=True))
    session.commit()
    yield session
    session.close()


def _source(db, **kw) -> Source:
    data = {
        "title": "Fixture programada",
        "url": "https://fixture.example.org",
        "connector": "fixture",
        "scrape_enabled": True,
        "scan_interval_hours": 24,
        "connector_config": {"records": [fixture_record("EXT-P1", "Pembrolizumab demo")]},
    }
    data.update(kw)
    row = Source(**data)
    db.add(row)
    db.commit()
    return row


def test_defaults_are_on_with_sane_intervals(db):
    cfg = settings_store.load_schedule(db)
    assert cfg == {"scan_enabled": True, "scan_interval_hours": 6, "dedup_enabled": True, "dedup_interval_hours": 24}


def test_interval_is_validated(db):
    with pytest.raises(ValueError):
        settings_store.save_schedule(db, scan_interval_hours=0)
    with pytest.raises(ValueError):
        settings_store.save_schedule(db, dedup_interval_hours=10_000)
    cfg = settings_store.save_schedule(db, scan_interval_hours=12, dedup_enabled=False)
    assert cfg["scan_interval_hours"] == 12 and cfg["dedup_enabled"] is False


def test_scheduled_scan_enqueues_runs_and_reports_to_the_inbox(db):
    source = _source(db)
    settings_store.save_schedule(db, dedup_enabled=False)
    runs = scheduler_service.run_due_tasks(db)
    assert [r.task for r in runs] == ["vigilancia"]
    run = runs[0]
    assert run.status == "en_curso" and run.origin == "programado"
    assert db.query(IngestJob).filter(IngestJob.source_id == source.id, IngestJob.origin == "programado").count() == 1

    # No vuelve a correr antes de que venza su intervalo.
    assert scheduler_service.run_due_tasks(db) == []

    # El worker procesa la cola y consolida la corrida.
    ingest_service.tick(db)
    assert scheduler_service.finalize_scan_runs(db) == 1
    db.refresh(run)
    assert run.status == "ok" and run.items_new == 1 and run.finished_at is not None

    # Aviso en la bandeja solo para quien puede asignar al ciclo.
    alerts = db.query(AlertEvent).filter(AlertEvent.kind == scheduler_service.ALERT_KIND_SCAN).all()
    owners = {db.get(User, a.user_id).role for a in alerts}
    assert owners == {"superadmin", "evaluador_tecnico"}
    assert "1 señal" in alerts[0].title


def test_scan_runs_again_once_its_interval_elapses(db):
    _source(db)
    settings_store.save_schedule(db, dedup_enabled=False, scan_interval_hours=6)
    first = scheduler_service.run_due_tasks(db)[0]
    later = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=6, minutes=1)
    again = scheduler_service.run_due_tasks(db, now=later)
    assert len(again) == 1 and again[0].id != first.id
    # La fuente ya se rastreo: la segunda corrida no la vuelve a encolar.
    ingest_service.tick(db)
    scheduler_service.finalize_scan_runs(db)


def test_nothing_due_is_recorded_as_sin_trabajo(db):
    _source(db, last_scraped_at=dt.datetime.now(dt.timezone.utc))
    settings_store.save_schedule(db, dedup_enabled=False)
    run = scheduler_service.run_due_tasks(db)[0]
    assert run.status == "sin_trabajo" and run.finished_at is not None


def test_disabled_tasks_never_run(db):
    _source(db)
    settings_store.save_schedule(db, scan_enabled=False, dedup_enabled=False)
    assert scheduler_service.run_due_tasks(db) == []
    assert scheduler_service.next_due(db, "vigilancia") is None
    assert db.query(ScheduledRun).count() == 0


def test_dedup_sweep_calls_the_screening_engine_and_warns_reviewers(db):
    cycle = Cycle(code="Ciclo P1-4", year=2026, opened_on=dt.date(2026, 2, 1), data_cutoff_on=dt.date(2026, 4, 1), status="en_filtrado")
    db.add(cycle)
    db.flush()
    for name in ("Keytruda", "Pembrolizumab MSD"):
        tech = Technology(commercial_name=name, inn_name="pembrolizumab", nct_ids=["NCT09990001"], status="asignada_a_ciclo")
        db.add(tech)
        db.flush()
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id))
    db.commit()
    settings_store.save_schedule(db, scan_enabled=False)

    run = scheduler_service.run_due_tasks(db)[0]
    assert run.task == "duplicados" and run.status == "ok"
    assert run.items_new == 1 and "Ciclo P1-4" in run.message
    alerts = db.query(AlertEvent).filter(AlertEvent.kind == scheduler_service.ALERT_KIND_DEDUP).all()
    assert {db.get(User, a.user_id).role for a in alerts} == {"superadmin", "evaluador_tecnico"}

    # Barrer otra vez no crea propuestas nuevas ni otro aviso sin leer.
    again = scheduler_service.run_task(db, "duplicados", origin="manual", triggered_by="x@iets.org.co")
    assert again.items_new == 0
    assert db.query(AlertEvent).filter(AlertEvent.kind == scheduler_service.ALERT_KIND_DEDUP).count() == len(alerts)


def test_dedup_sweep_uses_the_existing_function_unchanged(db, monkeypatch):
    from app import screening_service

    calls = []

    def fake(session, *, cycle_id=None, actor=""):
        calls.append((cycle_id, actor))
        return {"detected": 0, "created": 0, "refreshed": 0, "pending": 0, "threshold": 85}

    monkeypatch.setattr(screening_service, "scan_duplicates", fake)
    run = scheduler_service.run_task(db, "duplicados", origin="programado", triggered_by="programador")
    assert calls == [(None, "programador")]
    assert run.status == "ok" and "todo el acervo" in run.message


def test_tick_claims_each_job_once(db):
    source = _source(db)
    ingest_service.enqueue(db, [source], triggered_by="t")
    job = db.query(IngestJob).first()
    # Simula que otro hilo ya lo tomo: este tick no debe volver a correrlo.
    db.query(IngestJob).filter(IngestJob.id == job.id).update({IngestJob.status: "ejecutando"})
    db.commit()
    assert ingest_service.tick(db) == []


def test_orphan_running_job_returns_to_the_queue(db):
    source = _source(db)
    old = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)
    db.add(IngestJob(connector="fixture", source_id=source.id, status="ejecutando", attempts=1, started_at=old))
    db.commit()
    assert ingest_service.recover_stale(db) == 1
    job = db.query(IngestJob).first()
    assert job.status == "pendiente" and "Interrumpido" in job.message
    # Y la fuente vuelve a poder encolarse y procesarse.
    assert ingest_service.tick(db)[0].status == "ok"


def test_kick_does_not_block_the_request(monkeypatch):
    # Bug: `kick` corria `tick` dentro del hilo de la peticion.
    started = threading.Event()

    def slow_tick(session, **kw):
        started.set()
        time.sleep(1.0)
        return []

    monkeypatch.setattr(ingest_service, "tick", slow_tick)
    monkeypatch.setattr(scheduler_service, "finalize_scan_runs", lambda session: 0)
    monkeypatch.setattr(worker, "SessionLocal", lambda: _Dummy())
    t0 = time.monotonic()
    worker.kick()
    assert time.monotonic() - t0 < 0.5
    assert started.wait(2.0)


class _Dummy:
    def close(self):
        pass


# --------------------------------------------------------------------------- #
#  API de /configuracion
# --------------------------------------------------------------------------- #
def test_schedule_api_reads_updates_and_runs(api):
    out = api.get("/api/config/schedule", role="tomador_decisiones")
    assert out.status_code == 200
    body = out.json()
    assert {t["task"] for t in body["tasks"]} == {"vigilancia", "duplicados"}

    bad = api.put("/api/config/schedule", json={"scan_interval_hours": 0})
    assert bad.status_code == 422 and "entre 1 y 720" in bad.json()["detail"]
    ok = api.put("/api/config/schedule", json={"scan_interval_hours": 3, "dedup_enabled": False})
    assert ok.status_code == 200
    assert ok.json()["scan_interval_hours"] == 3 and ok.json()["dedup_enabled"] is False

    api.add_source()
    run = api.post("/api/config/schedule/vigilancia/run", role="evaluador_tecnico")
    assert run.status_code == 200
    assert run.json()["origin"] == "manual" and run.json()["jobs_total"] == 1
    assert api.kicks == ["kick"]

    assert api.post("/api/config/schedule/vigilancia/run", role="tomador_decisiones").status_code == 403
    assert api.post("/api/config/schedule/duplicados/run", role="revisor_pares").status_code == 403
    assert api.post("/api/config/schedule/inventada/run").status_code == 404

    runs = api.get("/api/config/schedule/runs", role="revisor_pares").json()
    assert runs[0]["task"] == "vigilancia" and runs[0]["jobs_pending"] == 1


def test_rf01_scheduled_run_brings_three_connectors_to_staging_and_a_failure_does_not_block(db):
    # Criterio de aceptacion de la fase 4 (RF01), sin red: tres adaptadores
    # distintos que leen lotes locales y uno roto que no frena a los demas.
    settings_store.save_schedule(db, dedup_enabled=False)
    fixture = _source(db, title="Fixture", url="https://a.example.org")
    manual = _source(
        db, title="Curaduria", url="https://b.example.org", connector="manual",
        connector_config={"records": [{"external_id": "MAN-1", "title": "Terapia curada", "commercial_name": "Curamab"}]},
    )
    feed = _source(
        db, title="Feed", url="https://c.example.org", connector="file_feed",
        connector_config={
            "records": [{"id": "TGA-1", "name": "Feedmab"}],
            "column_map": {"external_id": ["id"], "title": ["name"], "commercial_name": ["name"]},
        },
    )
    broken = _source(db, title="Rota", url="", connector="file_feed", connector_config={})

    run = scheduler_service.run_due_tasks(db)[0]
    assert run.status == "en_curso" and len(run.detail["job_ids"]) == 4
    for _ in range(3):
        ingest_service.tick(db)

    jobs = {j.source_id: j for j in db.query(IngestJob).all()}
    assert jobs[fixture.id].status == "ok" and jobs[manual.id].status == "ok" and jobs[feed.id].status == "ok"
    assert jobs[broken.id].status in {"pendiente", "error"}
    staged = db.query(Technology).filter(Technology.status == "capturada_no_asignada").all()
    assert {t.source_id for t in staged} >= {fixture.id, manual.id, feed.id}
