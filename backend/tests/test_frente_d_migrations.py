"""Pruebas de la adopcion de Alembic (fase 0, P0-1) y del indice pg_trgm (P1-3).

Cubren los tres casos de `app.migrations.upgrade_database()` sobre SQLite:
base vacia, base anterior a Alembic (creada por create_all + migraciones
ligeras) y doble ejecucion idempotente. `upgrade_database` opera sobre la
DATABASE_URL de la aplicacion, asi que se ejecuta en un subproceso con una base
temporal: nunca toca backend/iets_horizonte.db.

Opcional: IETS_QA_DB=<ruta a una copia de una base real> agrega el ensayo sobre
esa base (se copia a un temporal; el archivo original no se modifica).
"""
from __future__ import annotations

import io
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import migrations, models  # noqa: E402,F401
from app.database import Base  # noqa: E402

TRGM_NAMES = {name for name, _t, _c in migrations._baseline_module().TRGM_INDEXES}


def _url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def _run_upgrade(db_path: Path) -> str:
    """Ejecuta `python -m app.migrations` contra `db_path` y devuelve la accion."""
    env = dict(os.environ)
    # UTF-8 fijo en los dos extremos: en Windows el hijo y el padre pueden
    # decodificar con codigos de pagina distintos y romper "Migración:".
    env.update(
        {"DATABASE_URL": _url(db_path), "INGEST_WORKER_ENABLED": "false", "PYTHONIOENCODING": "utf-8"}
    )
    proc = subprocess.run(
        [sys.executable, "-m", "app.migrations"],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    status = next((ln.split("=", 1)[1].strip() for ln in proc.stdout.splitlines() if ln.startswith("status=")), "")
    if status:
        return status
    line = next(ln for ln in proc.stdout.splitlines() if ln.startswith("Migración:") or ln.startswith("Migracion:"))
    return line.split(":", 1)[1].split(".", 1)[0].strip()


def _alembic_upgrade(db_path: Path) -> None:
    """Migra una base temporal con Alembic puro, sin pasar por el engine global."""
    engine = create_engine(_url(db_path))
    try:
        with engine.begin() as conn:
            command.upgrade(migrations.alembic_config(conn), "head")
    finally:
        engine.dispose()


def _versions(db_path: Path) -> list[str]:
    with sqlite3.connect(db_path) as conn:
        return [r[0] for r in conn.execute("SELECT version_num FROM alembic_version")]


def _structural_diffs(db_path: Path) -> list:
    """Diferencias de esquema entre la base y los modelos, sin los indices manuales."""
    engine = create_engine(_url(db_path))
    try:
        with engine.connect() as conn:
            ctx = MigrationContext.configure(conn, opts={"compare_type": True})
            diffs = compare_metadata(ctx, Base.metadata)
    finally:
        engine.dispose()
    flat = []
    for d in diffs:
        flat.extend(d if isinstance(d, list) else [d])
    return [
        d for d in flat
        if not (d[0] in {"add_index", "remove_index"} and getattr(d[1], "name", "") in TRGM_NAMES)
    ]


# --------------------------------------------------------------------------- #
#  Estructura del arbol de revisiones
# --------------------------------------------------------------------------- #
def test_revision_tree_has_single_head_rooted_at_baseline():
    script = ScriptDirectory.from_config(migrations.alembic_config())
    assert len(script.get_heads()) == 1, "hay ramas sin fusionar en alembic/versions"
    base = script.get_base()
    assert base == migrations.BASELINE_REVISION
    assert script.get_revision(base).down_revision is None


def test_alembic_schema_matches_models(tmp_path):
    """Guardia de deriva: lo que crea `upgrade head` coincide con los modelos.

    Si falla, alguien cambio app/models.py sin revision: cree una con
    `alembic revision --autogenerate` (o, solo antes del primer despliegue,
    ejecute alembic/regenerate_baseline.py).
    """
    db = tmp_path / "vacia.db"
    _alembic_upgrade(db)
    assert _structural_diffs(db) == []


def test_baseline_tables_constant_matches_revision(tmp_path):
    db = tmp_path / "vacia.db"
    engine = create_engine(_url(db))
    try:
        with engine.begin() as conn:
            command.upgrade(migrations.alembic_config(conn), migrations.BASELINE_REVISION)
        created = set(inspect(engine).get_table_names()) - {"alembic_version"}
    finally:
        engine.dispose()
    assert created == set(migrations._baseline_module().BASELINE_TABLES)


# --------------------------------------------------------------------------- #
#  P1-3: indice GIN pg_trgm solo en PostgreSQL
# --------------------------------------------------------------------------- #
def _offline_sql(url: str) -> str:
    buf = io.StringIO()
    cfg = migrations.alembic_config()
    cfg.output_buffer = buf
    cfg.attributes["database_url"] = url
    command.upgrade(cfg, "head", sql=True)
    return buf.getvalue()


def test_postgresql_sql_creates_trgm_gin_indexes_idempotently():
    sql = _offline_sql("postgresql+psycopg://iets:secreto@localhost:5432/iets")
    assert "CREATE EXTENSION IF NOT EXISTS pg_trgm" in sql
    assert (
        "CREATE INDEX IF NOT EXISTS ix_invima_records_producto_norm_trgm "
        "ON invima_records USING gin (producto_norm gin_trgm_ops)"
    ) in sql
    assert (
        "CREATE INDEX IF NOT EXISTS ix_invima_records_principio_norm_trgm "
        "ON invima_records USING gin (principio_norm gin_trgm_ops)"
    ) in sql
    # La extension va antes que los indices que la usan.
    assert sql.index("CREATE EXTENSION IF NOT EXISTS pg_trgm") < sql.index("gin_trgm_ops")
    assert "JSONB" in sql


def test_sqlite_sql_has_no_trgm():
    sql = _offline_sql("sqlite:///./no-se-usa.db")
    assert "gin_trgm_ops" not in sql
    assert "pg_trgm" not in sql


def test_ensure_trgm_indexes_is_noop_outside_postgresql(tmp_path):
    engine = create_engine(_url(tmp_path / "x.db"))
    try:
        assert migrations.ensure_trgm_indexes(engine) is False
    finally:
        engine.dispose()


# --------------------------------------------------------------------------- #
#  upgrade_database(): base vacia, base anterior a Alembic, idempotencia
# --------------------------------------------------------------------------- #
def test_upgrade_database_on_empty_db_twice(tmp_path):
    db = tmp_path / "vacia.db"
    assert _run_upgrade(db) == "created"
    head = migrations.head_revision()
    assert _versions(db) == [head]
    assert _structural_diffs(db) == []

    assert _run_upgrade(db) == "current"
    assert _versions(db) == [head]


def _legacy_db(path: Path) -> None:
    """Base como la dejaba la aplicacion antes de Alembic, con huecos tipicos.

    - Falta una columna que agregan las migraciones ligeras (merged_into_id).
    - Falta una tabla completa del esquema (bulletins).
    - Hay datos que deben sobrevivir.
    """
    engine = create_engine(_url(path))
    try:
        Base.metadata.create_all(bind=engine)
        with Session(engine) as session:
            # Rol heredado de la v1: las migraciones ligeras lo normalizan.
            session.add(models.User(email="ana@iets.org.co", name="Ana", role="admin"))
            session.commit()
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE bulletins"))
            conn.execute(text("DROP INDEX ix_technologies_merged_into_id"))
            conn.execute(text("ALTER TABLE technologies DROP COLUMN merged_into_id"))
    finally:
        engine.dispose()


def test_upgrade_database_stamps_legacy_db_and_is_idempotent(tmp_path):
    db = tmp_path / "heredada.db"
    _legacy_db(db)
    assert not _has_table(db, "alembic_version")

    assert _run_upgrade(db) == "stamped"
    assert _versions(db) == [migrations.head_revision()]

    # La base marcada quedo completa: tabla recreada, columna e indice agregados.
    assert _has_table(db, "bulletins")
    with sqlite3.connect(db) as conn:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(technologies)")}
        idx = {r[1] for r in conn.execute("PRAGMA index_list(technologies)")}
        users = conn.execute("SELECT email, role FROM users").fetchall()
    assert "merged_into_id" in cols
    assert "ix_technologies_merged_into_id" in idx
    # Los datos sobreviven; el rol heredado lo normalizan las migraciones ligeras.
    assert users == [("ana@iets.org.co", "superadmin")]
    _assert_only_legacy_tolerances(db)

    assert _run_upgrade(db) == "current"
    assert _versions(db) == [migrations.head_revision()]


def _has_table(db: Path, name: str) -> bool:
    with sqlite3.connect(db) as conn:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()
    return row is not None


def _assert_only_legacy_tolerances(db: Path) -> None:
    """Tras el stamp no faltan tablas, columnas ni indices de los modelos.

    Se toleran solo las diferencias propias de ALTER TABLE ADD COLUMN en SQLite:
    nulabilidad y TEXT frente a JSON (misma afinidad de almacenamiento).
    """
    missing = [
        d for d in _structural_diffs(db)
        if d[0] in {"add_table", "add_column", "add_index", "add_constraint"}
    ]
    assert missing == []


# --------------------------------------------------------------------------- #
#  Ensayo sobre una copia de una base real (opcional)
# --------------------------------------------------------------------------- #
QA_DB = os.environ.get("IETS_QA_DB", "")


@pytest.mark.skipif(not QA_DB or not Path(QA_DB).is_file(), reason="IETS_QA_DB no definido")
def test_upgrade_database_on_copy_of_real_db(tmp_path):
    source = Path(QA_DB).resolve()
    assert source.name != "iets_horizonte.db" or source.parent != BACKEND_DIR, (
        "use una copia, nunca backend/iets_horizonte.db"
    )
    db = tmp_path / "copia.db"
    shutil.copy2(source, db)

    def counts() -> dict[str, int]:
        with sqlite3.connect(db) as conn:
            names = [
                r[0] for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            ]
            return {n: conn.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0] for n in names}

    before = counts()
    first = _run_upgrade(db)
    assert first in {"stamped", "current", "upgraded"}
    after = counts()
    # Conteos de control por tabla (fase 0): ninguna tabla previa pierde filas.
    # (Las migraciones ligeras solo borran parametros metodologicos retirados.)
    for table, n in before.items():
        if table == "methodology_params":
            continue
        assert after.get(table, 0) >= n, f"{table}: {n} -> {after.get(table)}"
    assert _versions(db) == [migrations.head_revision()]
    _assert_only_legacy_tolerances(db)

    assert _run_upgrade(db) == "current"
    assert counts() == after
