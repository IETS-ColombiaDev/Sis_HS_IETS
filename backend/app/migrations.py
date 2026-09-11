"""Migraciones versionadas con Alembic y su adopcion sin romper bases existentes.

Cierra P0-1 de la fase 0. Hasta esta version el esquema se construia con
`Base.metadata.create_all` + `database.run_schema_migrations` (migraciones
ligeras idempotentes, sin version). A partir de aqui la fuente de verdad es
`backend/alembic/versions/`, y `upgrade_database()` resuelve los tres casos
posibles de una base al arrancar:

1. Base vacia                -> `alembic upgrade head` (la crea el baseline).
2. Base anterior a Alembic   -> se completa con create_all + migraciones
   (tablas del esquema, pero     ligeras, se marca (stamp) en el baseline sin
   sin `alembic_version`)        ejecutarlo y luego `alembic upgrade head`.
3. Base ya versionada        -> `alembic upgrade head` (no-op si esta al dia).

Es idempotente: ejecutarla dos veces seguidas deja la base igual. En
PostgreSQL se serializa con un candado consultivo (pg_advisory_lock), de modo
que varios procesos de uvicorn arrancando a la vez no migran en paralelo.

Uso desde el arranque (lifespan de main.py), antes de `create_all`:
    from .migrations import upgrade_database
    upgrade_database()

Uso desde la linea de comandos, en backend/:
    python -m app.migrations              # migra y muestra la revision
    python -m app.migrations --bootstrap  # migra y ejecuta una vez el arranque
                                          # completo (siembras) sin el worker
"""
from __future__ import annotations

import argparse
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection, Engine

from . import database

log = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
ALEMBIC_DIR = BACKEND_DIR / "alembic"

# Revision que representa el esquema creado por create_all + run_schema_migrations.
BASELINE_REVISION = "0001"

# Clave arbitraria, fija, del candado consultivo de PostgreSQL ("IETS" + 1).
_PG_LOCK_KEY = 0x49455453_0001


def alembic_config(connection: Connection | None = None) -> Config:
    """Configuracion de Alembic independiente del directorio de trabajo."""
    cfg = Config(str(ALEMBIC_INI))
    # ConfigParser interpreta '%': se escapa por si la ruta lo contiene.
    cfg.set_main_option("script_location", str(ALEMBIC_DIR).replace("%", "%%"))
    # Dentro de la aplicacion no se reconfigura el logging (ver alembic/env.py).
    cfg.attributes["configure_logger"] = False
    if connection is not None:
        cfg.attributes["connection"] = connection
    return cfg


def head_revision() -> str:
    return ScriptDirectory.from_config(alembic_config()).get_current_head() or ""


def current_revision(engine: Engine | None = None) -> str:
    engine = engine or database.engine
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision() or ""


def _baseline_module():
    """Modulo de la revision baseline (fuente unica del SQL de los indices trigram)."""
    script = ScriptDirectory.from_config(alembic_config())
    return script.get_revision(BASELINE_REVISION).module


def _app_tables() -> set[str]:
    from . import models  # noqa: F401  registra las tablas en Base.metadata

    return set(database.Base.metadata.tables)


@contextmanager
def _migration_lock(engine: Engine) -> Iterator[None]:
    """Serializa la migracion entre procesos en PostgreSQL.

    En SQLite no hay candado entre procesos: el despliegue con SQLite es de un
    solo proceso (start-prod.ps1) y el contenedor migra antes de lanzar los
    workers de uvicorn (ver deploy/docker-entrypoint.sh).
    """
    if engine.dialect.name != "postgresql":
        yield
        return
    with engine.connect() as lock_conn:
        lock_conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _PG_LOCK_KEY})
        lock_conn.commit()
        try:
            yield
        finally:
            lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _PG_LOCK_KEY})
            lock_conn.commit()


def _bring_legacy_schema_to_baseline(engine: Engine) -> None:
    """Deja una base anterior a Alembic exactamente en el esquema del baseline.

    Solo se crean las tablas que existen en el baseline (las de revisiones
    posteriores las creara su propia revision al hacer upgrade) y se aplican las
    migraciones ligeras de `database.py`, que agregan las columnas que
    `create_all` no agrega a tablas ya existentes.
    """
    baseline_tables = set(_baseline_module().BASELINE_TABLES)
    metadata = database.Base.metadata
    tables = [t for t in metadata.sorted_tables if t.name in baseline_tables]
    metadata.create_all(bind=engine, tables=tables)
    database.run_schema_migrations()
    # Las columnas agregadas por ALTER TABLE no traen el indice que declara el
    # modelo (index=True); se crean aqui para que la base marcada sea de verdad
    # equivalente al baseline.
    for table in tables:
        for index in table.indexes:
            index.create(bind=engine, checkfirst=True)


def ensure_trgm_indexes(engine: Engine | None = None) -> bool:
    """Crea (si faltan) los indices GIN pg_trgm del indice de INVIMA (P1-3).

    Solo aplica a PostgreSQL. Una base marcada con stamp no ejecuto el baseline,
    asi que los indices se crean aqui con el mismo SQL idempotente.
    """
    engine = engine or database.engine
    if engine.dialect.name != "postgresql":
        return False
    try:
        with engine.begin() as conn:
            for stmt in _baseline_module().trgm_statements():
                conn.execute(text(stmt))
        return True
    except Exception as exc:  # noqa: BLE001
        # Sin el indice la busqueda sigue funcionando (LIKE), solo mas lenta.
        log.warning("No se pudieron crear los indices pg_trgm de INVIMA: %s", exc)
        return False


def upgrade_database() -> str:
    """Lleva la base configurada (DATABASE_URL) a la ultima revision.

    Devuelve la accion realizada: "created" (base vacia creada por Alembic),
    "stamped" (base anterior a Alembic marcada en el baseline y actualizada),
    "upgraded" (se aplicaron revisiones pendientes) o "current" (ya al dia).
    """
    engine = database.engine
    head = head_revision()
    with _migration_lock(engine):
        with engine.connect() as conn:
            heads = MigrationContext.configure(conn).get_current_heads()
            existing = set(inspect(conn).get_table_names())

        if heads:
            action = "current" if head in heads and len(heads) == 1 else "upgraded"
        elif existing & _app_tables():
            action = "stamped"
            log.info("Base sin alembic_version: se completa y se marca en %s.", BASELINE_REVISION)
            _bring_legacy_schema_to_baseline(engine)
            with engine.begin() as conn:
                command.stamp(alembic_config(conn), BASELINE_REVISION)
            ensure_trgm_indexes(engine)
        else:
            action = "created"
            log.info("Base vacia: se crea el esquema con Alembic.")

        with engine.begin() as conn:
            command.upgrade(alembic_config(conn), "head")

    log.info("Esquema en la revision %s (%s).", head, action)
    return action


def _bootstrap() -> None:
    """Ejecuta una vez el arranque completo de la aplicacion, sin el worker.

    Con varios workers de uvicorn, cada proceso ejecuta el lifespan (siembras de
    catalogos, ciclos, parametros). Correrlo antes, en un solo proceso, evita
    que la primera siembra ocurra N veces en paralelo sobre una base vacia.
    """
    import asyncio

    from .config import settings

    settings.ingest_worker_enabled = False
    from .main import app

    async def _run() -> None:
        async with app.router.lifespan_context(app):
            pass

    asyncio.run(_run())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.migrations",
        description="Migra la base configurada en DATABASE_URL a la última revisión de Alembic.",
    )
    parser.add_argument(
        "--bootstrap",
        action="store_true",
        help="Además de migrar, ejecuta una vez el arranque completo (siembras) sin el worker.",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")

    action = upgrade_database()
    print(f"status={action}")
    print(f"Migración: {action}. Revisión actual: {current_revision()} (head {head_revision()}).")
    if args.bootstrap:
        _bootstrap()
        print("Arranque inicial completado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
