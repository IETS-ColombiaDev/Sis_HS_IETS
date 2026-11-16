"""Protecciones para Render gratuito: la vigilancia no debe quedarse en 0."""
from datetime import datetime, timedelta, timezone

from frente_b_support import api  # noqa: F401  (fixture)

from app import firebase_db, ingest_service, worker
from app.models import IngestJob


def test_render_runs_one_source_at_a_time(monkeypatch):
    monkeypatch.delenv("INGEST_MAX_PARALLEL", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    assert ingest_service.max_parallel() == 3
    monkeypatch.setenv("RENDER", "true")
    assert ingest_service.max_parallel() == 1
    monkeypatch.setenv("INGEST_MAX_PARALLEL", "2")
    assert ingest_service.max_parallel() == 2
    monkeypatch.setenv("INGEST_MAX_PARALLEL", "no-es-numero")
    assert ingest_service.max_parallel() == 1


def test_parallel_jobs_respects_machine_cap(api, monkeypatch):
    monkeypatch.setenv("INGEST_MAX_PARALLEL", "1")
    with api.db() as db:
        assert ingest_service.parallel_jobs(db) == 1


def test_orphan_jobs_return_to_queue_on_startup(api, monkeypatch):
    sid = api.add_source(connector="html", connector_config={})
    now = datetime.now(timezone.utc)
    with api.db() as db:
        # Un job que corria cuando el proceso anterior murio (hace 2 minutos).
        db.add(IngestJob(source_id=sid, connector="html", status="ejecutando", attempts=1, max_attempts=3,
                         started_at=now - timedelta(minutes=2), scheduled_for=now - timedelta(minutes=2)))
        db.commit()
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    with api.db() as db:
        assert ingest_service.recover_stale(db, minutes=0) == 1
        job = db.query(IngestJob).filter(IngestJob.source_id == sid).one()
        assert job.status == "pendiente"


def test_firestore_copy_waits_longer_while_scanning(monkeypatch):
    monkeypatch.setattr(worker, "draining", lambda: False)
    assert firebase_db._min_interval() == firebase_db.PUSH_MIN_INTERVAL_S
    monkeypatch.setattr(worker, "draining", lambda: True)
    assert firebase_db._min_interval() == firebase_db.PUSH_MIN_INTERVAL_SCANNING_S
    assert firebase_db.PUSH_MIN_INTERVAL_SCANNING_S > firebase_db.PUSH_MIN_INTERVAL_S >= 60
