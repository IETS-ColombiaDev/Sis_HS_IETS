"""El sistema debe arrancar sobre una base vacia (primer despliegue en PostgreSQL).

Se ejecuta en un proceso aparte porque la URL de la base se fija al importar
`app.database`; asi la prueba no toca la base de desarrollo.
"""
from __future__ import annotations

import os
import subprocess
import sys
import textwrap
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

SCRIPT = textwrap.dedent(
    """
    import asyncio
    from app.main import app

    async def boot():
        async with app.router.lifespan_context(app):
            pass

    asyncio.run(boot())
    from app.migrations import current_revision, head_revision
    assert current_revision() == head_revision(), (current_revision(), head_revision())
    print("ARRANQUE_OK")
    """
)


def _boot(db_path: Path) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env.update(
        DATABASE_URL=f"sqlite:///{db_path.as_posix()}",
        INGEST_WORKER_ENABLED="false",
        ENVIRONMENT="development",
        PYTHONIOENCODING="utf-8",
    )
    return subprocess.run(
        [sys.executable, "-c", SCRIPT],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )


def test_boots_twice_on_an_empty_database(tmp_path):
    db = tmp_path / "vacia.db"
    first = _boot(db)
    assert "ARRANQUE_OK" in first.stdout, first.stderr[-2000:]
    # Segundo arranque sobre la misma base: idempotente.
    second = _boot(db)
    assert "ARRANQUE_OK" in second.stdout, second.stderr[-2000:]
