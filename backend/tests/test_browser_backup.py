"""Copia de la base en el navegador: exportar, perder el disco y restaurar.

Cada escenario corre en un proceso aparte porque `app.database` fija la URL de
la base al importarse.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

EXPORT = textwrap.dedent(
    """
    import json, sys
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as c:
        tok = c.post("/api/auth/dev-login", json={"email": "admin@iets.org.co", "name": "Admin"}).json()["access_token"]
        H = {"Authorization": f"Bearer {tok}"}
        info = c.get("/api/backup/info", headers=H).json()
        r = c.get("/api/backup/export", headers=H)
        assert r.status_code == 200, r.text
        open(sys.argv[1], "wb").write(r.content)
        print(json.dumps({"epoch": info["epoch"], "header_epoch": r.headers["x-backup-epoch"],
                          "sources": len(c.get("/api/sources", headers=H).json())}))
    """
)

RESTORE = textwrap.dedent(
    """
    import json, sys
    from fastapi.testclient import TestClient
    from app.main import app

    snap = open(sys.argv[1], "rb").read()
    with_work = sys.argv[2] == "work"
    with TestClient(app) as c:
        tok = c.post("/api/auth/dev-login", json={"email": "admin@iets.org.co", "name": "Admin"}).json()["access_token"]
        H = {"Authorization": f"Bearer {tok}"}
        before = c.get("/api/backup/info", headers=H).json()
        if with_work:
            from app import audit
            from app.database import SessionLocal
            from app.models import User
            db = SessionLocal()
            audit.set_user_context(db.query(User).first())
            audit.record_action(db, entity_type="findings", entity_id="1", action="edit")
            db.commit(); db.close()
        out = {"before_epoch": before["epoch"]}
        r = c.post("/api/backup/restore", headers=H, content=snap)
        out["first"] = r.status_code
        if r.status_code == 200:
            H = {"Authorization": f"Bearer {r.json()['access_token']}"}
            out["me"] = c.get("/api/auth/me", headers=H).status_code
            after = c.get("/api/backup/info", headers=H).json()
            out["after_epoch"] = after["epoch"]
            out["untouched"] = after["untouched_since_restore"]
            out["again"] = c.post("/api/backup/restore", headers=H, content=snap).status_code
        else:
            out["forced"] = c.post("/api/backup/restore?force=true", headers=H, content=snap).status_code
        print(json.dumps(out))
    """
)


def _run(script: str, db: Path, *args: str) -> dict:
    env = dict(os.environ)
    env.update(
        DATABASE_URL=f"sqlite:///{db.as_posix()}",
        INGEST_WORKER_ENABLED="false",
        ENVIRONMENT="development",
        ALLOW_DEV_LOGIN="true",
        PYTHONIOENCODING="utf-8",
    )
    proc = subprocess.run(
        [sys.executable, "-c", script, *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    assert proc.returncode == 0, proc.stderr[-3000:]
    return json.loads(proc.stdout.strip().splitlines()[-1])


def test_snapshot_restores_a_wiped_server_and_never_overwrites_work(tmp_path):
    snap = tmp_path / "snap.db.gz"
    exported = _run(EXPORT, tmp_path / "original.db", str(snap))
    assert exported["epoch"] and exported["epoch"] == exported["header_epoch"]
    assert snap.stat().st_size > 0

    # Servidor reiniciado con disco vacio: la copia se aplica y la sesion sigue.
    wiped = _run(RESTORE, tmp_path / "wiped.db", str(snap), "clean")
    assert wiped["before_epoch"] != exported["epoch"]
    assert wiped["first"] == 200
    assert wiped["me"] == 200
    assert wiped["after_epoch"] == exported["epoch"]
    assert wiped["untouched"] is True
    # La misma copia no se vuelve a aplicar sobre si misma.
    assert wiped["again"] == 409

    # Base nueva con trabajo de una persona: solo con restauracion forzada.
    busy = _run(RESTORE, tmp_path / "busy.db", str(snap), "work")
    assert busy["first"] == 409
    assert busy["forced"] == 200
