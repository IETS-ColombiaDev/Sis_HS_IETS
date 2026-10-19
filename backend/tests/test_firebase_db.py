from __future__ import annotations

import base64
import hashlib

import pytest

from app import firebase_db
from app.firestore_directory import _fetch_all
from app.models import User
from app.routers import backup as backup_router


@pytest.fixture(autouse=True)
def _production_collection(monkeypatch):
    """Las reglas de aislamiento se prueban sobre la coleccion de produccion."""
    from app.config import settings

    monkeypatch.setattr(settings, "environment", "production")


def test_non_production_never_uses_the_production_collection(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.delenv("RENDER", raising=False)
    assert firebase_db._collection() == "hs_iets_db_dev"
    # Render corre hoy con ENVIRONMENT=development: sigue usando la coleccion real.
    monkeypatch.setenv("RENDER", "true")
    assert firebase_db._collection() == "hs_iets_db"
    monkeypatch.delenv("RENDER")
    monkeypatch.setattr(settings, "firebase_db_share_with_production", True)
    assert firebase_db._collection() == "hs_iets_db"


def test_empty_rrhh_env_override_disables_the_sibling_lookup(monkeypatch):
    from app import firebase_auth

    monkeypatch.setenv("FIREBASE_RRHH_ENV_FILE", "")
    assert firebase_auth.sibling_rrhh_env() is None
    monkeypatch.delenv("FIREBASE_RRHH_ENV_FILE")
    assert firebase_auth.sibling_rrhh_env().name == ".env.local"


def test_disabled_during_pytest():
    assert firebase_db.enabled() is False
    assert firebase_db.push_now(force=True)["reason"] == "disabled"
    assert firebase_db.ensure_database()["reason"] == "pytest"


def test_named_database_is_isolated_from_rrhh(monkeypatch):
    firebase_db.reset_resolved()
    monkeypatch.setattr(firebase_db.firebase_auth, "project_id", lambda _info=None: "sistema-permisos-iets")
    url = firebase_db._base()
    assert "/documents/hs_iets_db" in url
    assert "/usuarios" not in url
    st = firebase_db.status()
    assert st["collection"] == "hs_iets_db"
    assert st["isolated"] is True


def test_rejects_rrhh_collection(monkeypatch):
    monkeypatch.setattr(firebase_db, "_collection", lambda: "usuarios")
    with pytest.raises(RuntimeError, match="RRHH"):
        firebase_db._assert_isolated()
    with pytest.raises(RuntimeError, match="RRHH"):
        firebase_db._base()


def test_cloud_should_win_rules():
    cloud = {"taken_at": "2026-10-14T12:00:00+00:00"}
    assert firebase_db._cloud_should_win(cloud, {"has_user_work": False}) is True
    assert firebase_db._cloud_should_win(
        cloud,
        {"has_user_work": True, "untouched_since_restore": False},
    ) is False
    assert firebase_db._cloud_should_win(
        cloud,
        {
            "has_user_work": True,
            "untouched_since_restore": True,
            "restored_snapshot_taken_at": "2026-10-01T00:00:00+00:00",
        },
    ) is True
    assert firebase_db._cloud_should_win(
        {"taken_at": "2026-09-01T00:00:00+00:00"},
        {
            "has_user_work": True,
            "untouched_since_restore": True,
            "restored_snapshot_taken_at": "2026-10-01T00:00:00+00:00",
        },
    ) is False


class _FakeResp:
    def __init__(self, status, payload=None, text=""):
        self.status_code = status
        self._payload = payload or {}
        self.text = text or str(payload or "")

    def json(self):
        return self._payload


@pytest.fixture()
def store(monkeypatch):
    docs: dict[str, dict] = {}
    urls: list[str] = []
    databases = {"hs-iets": False}
    create_status = {"code": 200}
    firebase_db.reset_resolved()

    def _guard(url: str) -> None:
        urls.append(url)
        assert "/usuarios" not in url
        if "/documents" in url:
            assert "/documents/hs_iets_db" in url

    def patch(url, **kwargs):
        _guard(url)
        doc_id = url.rstrip("/").rsplit("/", 1)[-1]
        fields = (kwargs.get("json") or {}).get("fields") or {}
        docs[doc_id] = fields
        return _FakeResp(200, {"fields": fields})

    def get(url, **kwargs):
        _guard(url)
        if "/documents" not in url and url.rstrip("/").endswith("/hs-iets"):
            if databases["hs-iets"]:
                return _FakeResp(200, {"name": "projects/x/databases/hs-iets"})
            return _FakeResp(404, text="missing database")
        if "pageSize" in (kwargs.get("params") or {}):
            documents = [
                {"name": f"projects/x/databases/hs-iets/documents/hs_iets_db/{k}"} for k in docs
            ]
            return _FakeResp(200, {"documents": documents})
        doc_id = url.rstrip("/").rsplit("/", 1)[-1]
        if doc_id not in docs:
            return _FakeResp(404, text="missing")
        return _FakeResp(200, {"fields": docs[doc_id]})

    def delete(url, **kwargs):
        _guard(url)
        doc_id = url.rstrip("/").rsplit("/", 1)[-1]
        docs.pop(doc_id, None)
        return _FakeResp(200)

    def post(url, **kwargs):
        _guard(url)
        if "databaseId=" in url:
            if create_status["code"] >= 400:
                return _FakeResp(create_status["code"], text="denied")
            databases["hs-iets"] = True
            return _FakeResp(200, {"name": "projects/x/databases/hs-iets", "done": True})
        doc_id = (kwargs.get("params") or {}).get("documentId") or url.split("documentId=")[-1]
        if "?" in url and "documentId=" in url:
            doc_id = url.split("documentId=")[-1]
        fields = (kwargs.get("json") or {}).get("fields") or {}
        docs[doc_id] = fields
        return _FakeResp(200, {"fields": fields})

    monkeypatch.setattr(firebase_db.requests, "patch", patch)
    monkeypatch.setattr(firebase_db.requests, "get", get)
    monkeypatch.setattr(firebase_db.requests, "delete", delete)
    monkeypatch.setattr(firebase_db.requests, "post", post)
    monkeypatch.setattr(firebase_db, "enabled", lambda: True)
    monkeypatch.setattr(firebase_db, "_in_pytest", lambda: False)
    monkeypatch.setattr(firebase_db.firebase_auth, "configured", lambda: True)
    monkeypatch.setattr(firebase_db.firebase_auth, "access_token", lambda: "tok")
    monkeypatch.setattr(firebase_db.firebase_auth, "project_id", lambda _info=None: "sistema-permisos-iets")
    return {"docs": docs, "urls": urls, "databases": databases, "create_status": create_status}


def test_ensure_database_creates_named_db(store):
    out = firebase_db.ensure_database()
    assert out["ok"] is True
    assert out["created"] is True
    assert out["named"] is True
    assert out["database"] == "hs-iets"
    assert out["probed"] is True
    again = firebase_db.ensure_database()
    assert again["created"] is False


def test_ensure_database_can_skip_probe(store, monkeypatch):
    firebase_db.reset_resolved()
    monkeypatch.setattr(firebase_db, "probe", lambda: (_ for _ in ()).throw(AssertionError("probe")))
    out = firebase_db.ensure_database(probe_write=False)
    assert out["ok"] is True
    assert out["probed"] is False


def test_ensure_falls_back_to_exclusive_collection(store):
    store["create_status"]["code"] = 403
    out = firebase_db.ensure_database()
    assert out["ok"] is True
    assert out["named"] is False
    assert out["database"] == "(default)"
    assert out["collection"] == "hs_iets_db"
    assert out["probed"] is True
    assert any("/databases/(default)/documents/hs_iets_db" in u for u in store["urls"])
    assert all("/usuarios" not in u for u in store["urls"])


def test_probe_roundtrip_on_project_collection(store):
    result = firebase_db.probe()
    assert result["ok"] is True
    assert result["collection"] == "hs_iets_db"
    assert "_probe" not in store["docs"]


def test_push_splits_and_roundtrip(store, monkeypatch):
    raw = b"hello-firestore-db" * 80
    gzipped = b"GZIP" + raw
    monkeypatch.setattr(
        firebase_db.browser_backup,
        "export_snapshot",
        lambda: (gzipped, {"epoch": "abc", "fingerprint": "fp", "taken_at": "2026-10-14T12:00:00+00:00", "raw_size": len(raw)}),
    )
    monkeypatch.setattr(firebase_db, "CHUNK_BYTES", 50)
    store["docs"]["c0099"] = {"n": {"integerValue": "99"}, "data": {"bytesValue": "old"}}

    out = firebase_db.push_now(force=True)
    assert out["ok"] is True
    assert out["chunk_count"] >= 2
    assert "meta" in store["docs"]
    assert "c0099" not in store["docs"]
    assert hashlib.sha256(gzipped).hexdigest() == out["sha256"]
    assert all("/documents/hs_iets_db" in u for u in store["urls"] if "/documents" in u)
    assert all("/usuarios" not in u for u in store["urls"])

    meta = firebase_db.fetch_meta()
    assert meta["epoch"] == "abc"
    payload = firebase_db._fetch_payload(meta)
    assert payload == gzipped

    skipped = firebase_db.push_now()
    assert skipped["skipped"] is True


def test_concurrent_pushes_never_leave_an_older_snapshot_in_the_cloud(store, monkeypatch):
    """La copia de arranque (lenta) no puede pisar a una mas nueva que termino antes."""
    import threading
    import time

    state = {"version": 0}
    first_upload_started = threading.Event()

    def export():
        state["version"] += 1
        payload = f"GZIP-v{state['version']}".encode()
        return payload, {"epoch": "e", "fingerprint": "f", "taken_at": f"v{state['version']}", "raw_size": 1}

    original_put = firebase_db._put_doc

    def slow_put(doc_id, fields):
        if not first_upload_started.is_set():
            first_upload_started.set()
            time.sleep(0.3)  # la primera subida tarda: antes, la segunda la adelantaba
        original_put(doc_id, fields)

    monkeypatch.setattr(firebase_db.browser_backup, "export_snapshot", export)
    monkeypatch.setattr(firebase_db, "_put_doc", slow_put)
    boot = threading.Thread(target=firebase_db.push_now, kwargs={"force": True})
    boot.start()
    first_upload_started.wait(2)
    state["version"] = 10  # llegan cambios mientras sube la copia de arranque
    firebase_db.push_now(force=True)
    boot.join(5)

    meta = firebase_db.fetch_meta()
    assert firebase_db._fetch_payload(meta) == b"GZIP-v11"


def test_a_commit_during_a_push_is_still_scheduled(store, monkeypatch):
    monkeypatch.setattr(firebase_db, "_autosync", True)
    monkeypatch.setattr(firebase_db, "_busy", True)
    firebase_db.schedule_push()
    try:
        assert firebase_db._timer is not None and firebase_db._timer.is_alive()
    finally:
        firebase_db.disable_autosync()


def test_fetch_rejects_corrupt_sha(store):
    store["docs"]["meta"] = {
        "sha256": {"stringValue": "deadbeef"},
        "chunk_count": {"integerValue": "1"},
    }
    store["docs"]["c0000"] = {"data": {"bytesValue": base64.b64encode(b"nope").decode()}}
    with pytest.raises(RuntimeError, match="SHA-256"):
        firebase_db._fetch_payload(firebase_db.fetch_meta())


def test_pull_restores_when_local_is_empty(store, monkeypatch):
    payload = b"GZIPDATA"
    store["docs"]["meta"] = {
        "epoch": {"stringValue": "e1"},
        "taken_at": {"stringValue": "2026-10-14T00:00:00+00:00"},
        "sha256": {"stringValue": hashlib.sha256(payload).hexdigest()},
        "chunk_count": {"integerValue": "1"},
        "raw_size": {"integerValue": "9"},
        "gzip_size": {"integerValue": str(len(payload))},
    }
    store["docs"]["c0000"] = {"n": {"integerValue": "0"}, "data": {"bytesValue": base64.b64encode(payload).decode()}}
    monkeypatch.setattr(
        firebase_db.browser_backup,
        "info",
        lambda: {"has_user_work": False, "epoch": "new", "epoch_created_at": "2026-10-14T12:00:00+00:00"},
    )
    seen = {}
    monkeypatch.setattr(
        firebase_db.browser_backup,
        "restore_snapshot",
        lambda data, force=False: seen.update({"data": data, "force": force}),
    )
    result = firebase_db.pull_if_needed()
    assert result["restored"] is True
    assert seen["data"] == payload
    assert seen["force"] is True


def test_pull_keeps_local_work(store, monkeypatch):
    store["docs"]["meta"] = {
        "epoch": {"stringValue": "old"},
        "taken_at": {"stringValue": "2026-01-01T00:00:00+00:00"},
        "sha256": {"stringValue": "x"},
        "chunk_count": {"integerValue": "1"},
    }
    monkeypatch.setattr(
        firebase_db.browser_backup,
        "info",
        lambda: {
            "has_user_work": True,
            "untouched_since_restore": False,
            "epoch": "local",
        },
    )
    monkeypatch.setattr(
        firebase_db.browser_backup,
        "restore_snapshot",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("no debe restaurar")),
    )
    result = firebase_db.pull_if_needed()
    assert result["kept_local"] is True
    assert result["restored"] is False


def test_directory_stays_on_default_usuarios(monkeypatch):
    seen = {}

    def fake_get(url, **kwargs):
        seen["url"] = url
        class R:
            status_code = 200

            def json(self):
                return {"documents": []}

        return R()

    monkeypatch.setattr("app.firestore_directory.requests.get", fake_get)
    monkeypatch.setattr("app.firestore_directory._load_service_account", lambda: {"project_id": "sistema-permisos-iets"})
    monkeypatch.setattr("app.firestore_directory._project_id", lambda _info: "sistema-permisos-iets")
    monkeypatch.setattr("app.firestore_directory._access_token", lambda _info: "tok")
    _fetch_all()
    assert "/databases/(default)/documents/usuarios" in seen["url"]
    assert "/databases/hs-iets/" not in seen["url"]


def test_backup_api_uses_named_database_status(store, monkeypatch):
    user = User(email="admin@iets.org.co", name="Admin", role="superadmin", is_active=True)
    info = backup_router.firebase_info(user=user)
    assert info["database"] == "hs-iets"
    assert info["isolated"] is True

    monkeypatch.setattr(
        firebase_db.browser_backup,
        "export_snapshot",
        lambda: (b"GZIP", {"epoch": "e", "fingerprint": "f", "taken_at": "2026-10-14T00:00:00+00:00", "raw_size": 4}),
    )
    pushed = backup_router.firebase_push(user=user)
    assert pushed["ok"] is True
    assert "meta" in store["docs"]
