"""Entorno de Alembic del Sistema de Escaneo de Horizonte del IETS.

El esquema de referencia es `app.database.Base.metadata` (todos los modelos de
`app.models`) y la base de destino es la `DATABASE_URL` de
`app.config.settings`, la misma que usa la aplicacion. Hay tres formas de fijar
la conexion, en este orden de prioridad:

1. `config.attributes["connection"]`: conexion abierta que entrega
   `app.migrations.upgrade_database()` al migrar durante el arranque.
2. `-x url=...` en la linea de comandos (ensayos sobre copias de la base).
3. `settings.database_url` (backend/.env o variable de entorno DATABASE_URL).
"""
from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import models  # noqa: E402,F401  registra todas las tablas en Base.metadata
from app.config import settings  # noqa: E402
from app.database import Base  # noqa: E402

config = context.config

# Desde la linea de comandos se usa el logging de alembic.ini. Cuando migra la
# propia aplicacion no se toca: reconfigurarlo apagaria los logs de uvicorn.
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

# Indices que existen solo en PostgreSQL y se crean con SQL explicito en las
# migraciones (GIN + pg_trgm, P1-3). No estan en los modelos porque estos son
# portables a SQLite; sin esta exclusion el autogenerate propondria borrarlos.
MANUAL_INDEXES = frozenset(
    {
        "ix_invima_records_producto_norm_trgm",
        "ix_invima_records_principio_norm_trgm",
    }
)


def include_object(obj, name, type_, reflected, compare_to):  # noqa: ANN001
    if type_ == "index" and name in MANUAL_INDEXES:
        return False
    # Una tabla que existe en la base pero no en los modelos (restos de versiones
    # antiguas, tablas de otras herramientas) nunca se borra por autogenerate:
    # si hay que eliminarla, se escribe la operacion a mano en la revision.
    if type_ == "table" and reflected and compare_to is None:
        return False
    return True


def _database_url() -> str:
    x_args = context.get_x_argument(as_dictionary=True)
    return x_args.get("url") or config.attributes.get("database_url") or settings.database_url


def _configure(**kwargs) -> None:
    context.configure(
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
        **kwargs,
    )


def run_migrations_offline() -> None:
    """Genera el SQL sin conectarse (alembic upgrade head --sql)."""
    url = _database_url()
    _configure(
        url=url,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def _run_with_connection(connection) -> None:  # noqa: ANN001
    # SQLite no soporta ALTER TABLE completo: el modo batch recrea la tabla.
    _configure(connection=connection, render_as_batch=connection.dialect.name == "sqlite")
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run_with_connection(connection)
        return

    engine = create_engine(_database_url(), poolclass=pool.NullPool)
    try:
        with engine.connect() as connection:
            _run_with_connection(connection)
            connection.commit()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
