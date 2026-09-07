"""Configuracion de la base de datos.

El sistema opera sobre SQLite (despliegue actual) y sobre PostgreSQL 15+
(destino de la fase 0 del plan de actualizacion). Todo el modelo usa tipos
portables, de modo que el cambio de motor solo requiere `DATABASE_URL`.
"""
from __future__ import annotations

import logging
from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

log = logging.getLogger(__name__)

IS_SQLITE = settings.database_url.startswith("sqlite")
IS_POSTGRES = settings.database_url.startswith("postgres")

connect_args = {"check_same_thread": False} if IS_SQLITE else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------------------------------------------- #
#  Extensiones de PostgreSQL requeridas por el plan (fases 0, 3 y 6)
# --------------------------------------------------------------------------- #
PG_EXTENSIONS = ("pg_trgm", "unaccent")


def ensure_pg_extensions() -> None:
    if not IS_POSTGRES:
        return
    with engine.begin() as conn:
        for ext in PG_EXTENSIONS:
            try:
                conn.execute(text(f'CREATE EXTENSION IF NOT EXISTS "{ext}"'))
            except Exception as exc:  # noqa: BLE001
                log.warning("No se pudo crear la extension %s: %s", ext, exc)


# --------------------------------------------------------------------------- #
#  Inmutabilidad de la bitacora de auditoria
# --------------------------------------------------------------------------- #
_SQLITE_AUDIT_GUARDS = (
    """
    CREATE TRIGGER IF NOT EXISTS audit_log_no_update
    BEFORE UPDATE ON audit_log
    BEGIN
        SELECT RAISE(ABORT, 'audit_log es de solo insercion');
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
    BEFORE DELETE ON audit_log
    BEGIN
        SELECT RAISE(ABORT, 'audit_log es de solo insercion');
    END;
    """,
)


def harden_audit_log() -> None:
    """Impide UPDATE y DELETE sobre la bitacora a nivel de motor.

    En SQLite se implementa con disparadores; en PostgreSQL, revocando el
    privilegio al rol de la aplicacion, tal como exige la fase 0.
    """
    insp = inspect(engine)
    if "audit_log" not in insp.get_table_names():
        return
    try:
        with engine.begin() as conn:
            if IS_SQLITE:
                for stmt in _SQLITE_AUDIT_GUARDS:
                    conn.execute(text(stmt))
            elif IS_POSTGRES:
                conn.execute(text("REVOKE UPDATE, DELETE ON audit_log FROM CURRENT_USER"))
    except Exception as exc:  # noqa: BLE001
        log.warning("No se pudo blindar audit_log: %s", exc)


# --------------------------------------------------------------------------- #
#  Migraciones de esquema
# --------------------------------------------------------------------------- #
def _sqlite_columns(insp, table: str) -> set[str]:
    return {c["name"] for c in insp.get_columns(table)}


def run_schema_migrations() -> None:
    """Migraciones incrementales sin Alembic.

    Se mantienen mientras la fase 0 no complete la adopcion de Alembic; son
    idempotentes y no destructivas.
    """
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    if "findings" in tables:
        cols = _sqlite_columns(insp, "findings")
        with engine.begin() as conn:
            # Fase 2: el puntaje heuristico deja de llamarse "priority_score",
            # nombre reservado para el indice oficial %P.
            if "screening_score" not in cols and "priority_score" in cols:
                try:
                    conn.execute(
                        text("ALTER TABLE findings RENAME COLUMN priority_score TO screening_score")
                    )
                except Exception:  # noqa: BLE001
                    conn.execute(
                        text("ALTER TABLE findings ADD COLUMN screening_score INTEGER DEFAULT 0")
                    )
                    conn.execute(text("UPDATE findings SET screening_score = priority_score"))
            elif "screening_score" not in cols:
                conn.execute(
                    text("ALTER TABLE findings ADD COLUMN screening_score INTEGER DEFAULT 0")
                )

    if "sources" in tables:
        cols = _sqlite_columns(insp, "sources")
        additions = {
            "connector": "ALTER TABLE sources ADD COLUMN connector VARCHAR(60) DEFAULT 'html'",
            "connector_config": "ALTER TABLE sources ADD COLUMN connector_config TEXT",
            "scan_interval_hours": "ALTER TABLE sources ADD COLUMN scan_interval_hours INTEGER DEFAULT 24",
            "failure_streak": "ALTER TABLE sources ADD COLUMN failure_streak INTEGER DEFAULT 0",
            "circuit_open_until": "ALTER TABLE sources ADD COLUMN circuit_open_until DATETIME",
            "last_error": "ALTER TABLE sources ADD COLUMN last_error TEXT DEFAULT ''",
            "catalog_code": "ALTER TABLE sources ADD COLUMN catalog_code VARCHAR(40) DEFAULT ''",
            "entity_type": "ALTER TABLE sources ADD COLUMN entity_type VARCHAR(60) DEFAULT ''",
            "access_level": "ALTER TABLE sources ADD COLUMN access_level VARCHAR(8) DEFAULT ''",
            "country": "ALTER TABLE sources ADD COLUMN country VARCHAR(80) DEFAULT ''",
            "sync_frequency": "ALTER TABLE sources ADD COLUMN sync_frequency VARCHAR(40) DEFAULT ''",
            "rate_limit_rpm": "ALTER TABLE sources ADD COLUMN rate_limit_rpm INTEGER",
            "requires_api_key": "ALTER TABLE sources ADD COLUMN requires_api_key BOOLEAN DEFAULT 0",
            "terms_url": "ALTER TABLE sources ADD COLUMN terms_url VARCHAR(1024) DEFAULT ''",
            "terms_accepted_at": "ALTER TABLE sources ADD COLUMN terms_accepted_at DATETIME",
            "robots_checked_at": "ALTER TABLE sources ADD COLUMN robots_checked_at DATETIME",
            "robots_allowed": "ALTER TABLE sources ADD COLUMN robots_allowed BOOLEAN",
            "health_status": "ALTER TABLE sources ADD COLUMN health_status VARCHAR(20) DEFAULT ''",
            "last_ok_at": "ALTER TABLE sources ADD COLUMN last_ok_at DATETIME",
            "schema_signature": "ALTER TABLE sources ADD COLUMN schema_signature VARCHAR(120) DEFAULT ''",
            "provides_fields": "ALTER TABLE sources ADD COLUMN provides_fields TEXT",
            "aliases": "ALTER TABLE sources ADD COLUMN aliases TEXT",
            "verification_status": "ALTER TABLE sources ADD COLUMN verification_status VARCHAR(40) DEFAULT ''",
            "catalog_note": "ALTER TABLE sources ADD COLUMN catalog_note TEXT DEFAULT ''",
            "is_contrast": "ALTER TABLE sources ADD COLUMN is_contrast BOOLEAN DEFAULT 0",
            "catalog_active": "ALTER TABLE sources ADD COLUMN catalog_active BOOLEAN DEFAULT 1",
            "retired": "ALTER TABLE sources ADD COLUMN retired BOOLEAN DEFAULT 0",
            "last_probe_at": "ALTER TABLE sources ADD COLUMN last_probe_at DATETIME",
            "last_probe_detail": "ALTER TABLE sources ADD COLUMN last_probe_detail TEXT",
            "next_review_due": "ALTER TABLE sources ADD COLUMN next_review_due DATETIME",
        }
        with engine.begin() as conn:
            for name, stmt in additions.items():
                if name not in cols:
                    conn.execute(text(stmt))

    if "raw_records" in tables:
        cols = _sqlite_columns(insp, "raw_records")
        raw_additions = {
            "adapter_version": "ALTER TABLE raw_records ADD COLUMN adapter_version VARCHAR(40) DEFAULT ''",
            "endpoint": "ALTER TABLE raw_records ADD COLUMN endpoint VARCHAR(1024) DEFAULT ''",
        }
        with engine.begin() as conn:
            for name, stmt in raw_additions.items():
                if name not in cols:
                    conn.execute(text(stmt))

    if "technologies" in tables:
        # create_all no altera tablas existentes: una base creada antes de la
        # fase 3 tiene la tabla pero no la columna de fusion.
        cols = _sqlite_columns(insp, "technologies")
        if "merged_into_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE technologies ADD COLUMN merged_into_id INTEGER"))

    if "users" in tables:
        from .rbac import LEGACY_ROLE_MAP

        with engine.begin() as conn:
            for legacy, canonical in LEGACY_ROLE_MAP.items():
                conn.execute(
                    text("UPDATE users SET role = :new WHERE role = :old"),
                    {"new": canonical, "old": legacy},
                )

    if "methodology_params" in tables:
        from .methodology import RETIRED_PARAMS

        # Un parametro visible en la interfaz que ningun calculo lee es peor que
        # no tenerlo: invita a ajustarlo y a creer que surtio efecto.
        with engine.begin() as conn:
            for key in RETIRED_PARAMS:
                conn.execute(
                    text("DELETE FROM methodology_params WHERE key = :key"), {"key": key}
                )

    if "chat_sessions" in tables:
        cols = _sqlite_columns(insp, "chat_sessions")
        chat_additions = {
            "scope": "ALTER TABLE chat_sessions ADD COLUMN scope VARCHAR(40) DEFAULT ''",
            "node_key": "ALTER TABLE chat_sessions ADD COLUMN node_key VARCHAR(120) DEFAULT ''",
            "cycle_id": "ALTER TABLE chat_sessions ADD COLUMN cycle_id INTEGER",
            "graph_id": "ALTER TABLE chat_sessions ADD COLUMN graph_id INTEGER",
        }
        with engine.begin() as conn:
            for name, stmt in chat_additions.items():
                if name not in cols:
                    conn.execute(text(stmt))
