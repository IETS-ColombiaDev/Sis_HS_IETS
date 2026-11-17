"""Avance de la vigilancia que llega a 100 % y copia a Firestore que no borra datos."""
from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from frente_b_support import api  # noqa: F401  (fixture)
from test_firebase_db import _production_collection, store  # noqa: F401  (fixtures)

from app import firebase_db, scan_progress
from app.models import IngestJob
from app.routers.ingest import run_percent, source_fraction


# --------------------------------------------------------------------------- #
#  Avance
# --------------------------------------------------------------------------- #
def test_running_source_counts_partially_and_never_reaches_one():
    assert source_fraction({"job_status": "pendiente"}) == 0.0
    assert source_fraction({"job_status": "ok"}) == 1.0
    assert source_fraction({"job_status": "error"}) == 1.0
    early = source_fraction({"job_status": "ejecutando", "stage": "conectando"})
    crawl = source_fraction({"job_status": "ejecutando", "stage": "recorriendo", "pages_visited": 5, "pages_planned": 10})
    late = source_fraction({"job_status": "ejecutando", "stage": "guardando"})
    assert 0 < early < crawl < late < 1


def test_run_percent_is_100_only_when_nothing_is_left():
    rows = [{"job_status": "ok"}, {"job_status": "ejecutando", "stage": "guardando"}]
    assert 50 < run_percent(rows, active=True) <= 99
    assert run_percent([{"job_status": "ok"}, {"job_status": "ok"}], active=True) == 99.0
    assert run_percent([{"job_status": "ok"}, {"job_status": "error"}], active=False) == 100.0
    assert run_percent([], active=False) == 0.0


def test_progress_follows_the_run_until_100_percent(api):  # noqa: F811
    scan_progress.clear()
    old = api.add_source(title="Corrida anterior", url="https://vieja.example.org")
    api.post("/api/ingest/run", json={"source_ids": [old]})
    with api.db() as db:
        job = db.query(IngestJob).filter(IngestJob.source_id == old).one()
        job.status = "ok"
        job.created_at = datetime.now(timezone.utc) - timedelta(hours=2)
        db.commit()

    first = api.add_source(title="Primera", url="https://primera.example.org")
    second = api.add_source(title="Segunda", url="https://segunda.example.org")
    assert api.post("/api/ingest/run", json={"source_ids": [first, second]}).status_code == 200
    body = api.get("/api/ingest/progress").json()
    assert body["active"] is True and body["total"] == 2 and body["percent"] == 0

    with api.db() as db:
        jobs = {j.source_id: j for j in db.query(IngestJob).filter(IngestJob.source_id.in_([first, second]))}
        jobs[first].status = "ok"
        jobs[second].status = "ejecutando"
        db.commit()
        scan_progress.start(second, jobs[second].id)
    scan_progress.stage("extrayendo", source_id=second)
    body = api.get("/api/ingest/progress").json()
    assert body["active"] is True
    assert 50 < body["percent"] < 100
    assert body["finished"] == 1

    with api.db() as db:
        db.query(IngestJob).filter(IngestJob.source_id == second).one().status = "ok"
        db.commit()
    body = api.get("/api/ingest/progress").json()
    # Al terminar sigue mostrando ESA corrida (no las ultimas 12 h) y cierra en 100 %.
    assert body["active"] is False
    assert body["total"] == 2
    assert body["percent"] == 100.0
    assert body["run_started_at"]


# --------------------------------------------------------------------------- #
#  Firestore
# --------------------------------------------------------------------------- #
def _snap(payload: bytes, raw_size: int):
    return lambda: (payload, {"epoch": "e", "fingerprint": "f", "taken_at": datetime.now(timezone.utc).isoformat(), "raw_size": raw_size})


@pytest.fixture()
def fresh(monkeypatch):
    monkeypatch.setattr(firebase_db, "_pull_ok", True)
    monkeypatch.setattr(firebase_db, "_last_sha", "")


def test_push_keeps_the_previous_copy_and_a_cut_upload_never_corrupts(store, monkeypatch, fresh):  # noqa: F811
    monkeypatch.setattr(firebase_db, "CHUNK_BYTES", 8)
    monkeypatch.setattr(firebase_db.browser_backup, "export_snapshot", _snap(b"GZIP-version-uno", 1000))
    firebase_db.push_now(force=True)
    first = firebase_db.fetch_meta()

    monkeypatch.setattr(firebase_db.browser_backup, "export_snapshot", _snap(b"GZIP-version-dos!", 1000))
    firebase_db.push_now(force=True)
    meta = firebase_db.fetch_meta()
    assert meta["gen"] != first["gen"]
    assert meta["prev_gen"] == first["gen"]
    assert firebase_db._fetch_payload(meta) == b"GZIP-version-dos!"
    assert firebase_db._fetch_payload(firebase_db._previous_meta(meta)) == b"GZIP-version-uno"

    # Corte a mitad de la tercera subida: el meta sigue apuntando a una copia completa.
    calls = {"n": 0}
    original = firebase_db._put_doc

    def flaky(doc_id, fields):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("se cayo la red")
        original(doc_id, fields)

    monkeypatch.setattr(firebase_db, "_put_doc", flaky)
    monkeypatch.setattr(firebase_db.browser_backup, "export_snapshot", _snap(b"GZIP-version-tres", 1000))
    with pytest.raises(RuntimeError):
        firebase_db.push_now(force=True)
    assert firebase_db._fetch_payload(firebase_db.fetch_meta()) == b"GZIP-version-dos!"


def test_shrink_guard_refuses_to_overwrite_a_bigger_cloud_copy(store, monkeypatch, fresh):  # noqa: F811
    monkeypatch.setattr(firebase_db.browser_backup, "export_snapshot", _snap(b"GZIP-grande", 5_000_000))
    assert firebase_db.push_now(force=True)["ok"] is True
    monkeypatch.setattr(firebase_db.browser_backup, "export_snapshot", _snap(b"GZIP-vacia", 400_000))
    out = firebase_db.push_now(force=True)
    assert out["ok"] is False and out["reason"] == "shrink_guard"
    assert firebase_db._fetch_payload(firebase_db.fetch_meta()) == b"GZIP-grande"
    assert firebase_db.push_now(force=True, allow_shrink=True)["ok"] is True


def test_no_push_until_the_cloud_was_read(store, monkeypatch):  # noqa: F811
    monkeypatch.setattr(firebase_db, "_pull_ok", False)
    monkeypatch.setattr(firebase_db, "fetch_meta", lambda: (_ for _ in ()).throw(RuntimeError("sin red")))
    monkeypatch.setattr(firebase_db.browser_backup, "export_snapshot", _snap(b"GZIP-sembrada", 10))
    out = firebase_db.push_now(force=True)
    assert out == {"ok": False, "reason": "pull_pending"}
    assert not any(k.startswith(("g", "c")) for k in store["docs"])


def test_pull_falls_back_to_the_previous_copy(store, monkeypatch):  # noqa: F811
    good = b"GZIP-anterior"
    store["docs"]["meta"] = {
        "taken_at": {"stringValue": "2026-11-01T00:00:00+00:00"},
        "sha256": {"stringValue": "roto"},
        "chunk_count": {"integerValue": "1"},
        "gen": {"stringValue": "nueva"},
        "prev_gen": {"stringValue": "vieja"},
        "prev_sha256": {"stringValue": hashlib.sha256(good).hexdigest()},
        "prev_chunk_count": {"integerValue": "1"},
        "prev_taken_at": {"stringValue": "2026-10-31T00:00:00+00:00"},
    }
    store["docs"]["gviejac0000"] = {"data": {"bytesValue": base64.b64encode(good).decode()}}
    monkeypatch.setattr(firebase_db.browser_backup, "info", lambda: {"has_user_work": False})
    seen = {}
    monkeypatch.setattr(firebase_db.browser_backup, "restore_snapshot", lambda data, force=False: seen.update(data=data))
    result = firebase_db.pull_if_needed()
    assert result["restored"] is True and seen["data"] == good
    assert firebase_db._pull_ok is True


def test_chunk_ids_roundtrip():
    assert firebase_db._chunk_owner(firebase_db._chunk_id("abc123", 7)) == ("abc123", 7)
    assert firebase_db._chunk_owner(firebase_db._chunk_id("", 3)) == ("", 3)
    assert firebase_db._chunk_owner("meta") is None
    assert firebase_db._chunk_owner("_probe") is None
