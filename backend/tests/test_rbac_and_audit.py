"""Pruebas del RBAC de cinco perfiles y de la bitacora inmutable (fase 0)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DatabaseError
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import audit, rbac  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import AuditLog, Finding, MethodologyParam, Source, User  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log "
                "BEGIN SELECT RAISE(ABORT, 'audit_log es de solo insercion'); END;"
            )
        )
        conn.execute(
            text(
                "CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log "
                "BEGIN SELECT RAISE(ABORT, 'audit_log es de solo insercion'); END;"
            )
        )
    audit.install_listeners()
    session = sessionmaker(bind=engine, autoflush=False)()
    yield session
    session.close()


def _source(db) -> Source:
    source = Source(title="Referente", url="https://referente.org")
    db.add(source)
    db.commit()
    return source


# --------------------------------------------------------------------------- #
#  Mapeo de roles heredados
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "legacy,expected",
    [
        ("admin", rbac.SUPERADMIN),
        ("editor", rbac.EVALUADOR_TECNICO),
        ("viewer", rbac.TOMADOR_DECISIONES),
        ("superadmin", rbac.SUPERADMIN),
        ("desconocido", rbac.TOMADOR_DECISIONES),
        ("", rbac.TOMADOR_DECISIONES),
        (None, rbac.TOMADOR_DECISIONES),
    ],
)
def test_legacy_roles_resolve_to_canonical_profiles(legacy, expected):
    assert rbac.canonical_role(legacy) == expected


def test_five_profiles_are_defined():
    assert len(rbac.ROLES) == 5
    assert set(rbac.ROLES) == set(rbac.ROLE_PERMISSIONS)


def test_decision_maker_cannot_write_technologies():
    user = User(email="msps@iets.org.co", role=rbac.TOMADOR_DECISIONES)
    assert rbac.has_permission(user, rbac.P_READ)
    assert not rbac.has_permission(user, rbac.P_TECHNOLOGY_WRITE)
    assert not rbac.has_permission(user, rbac.P_CYCLE_CLOSE)


def test_only_superadmin_closes_cycles_and_manages_users():
    for role in rbac.ROLES:
        user = User(email=f"{role}@iets.org.co", role=role)
        expected = role == rbac.SUPERADMIN
        assert rbac.has_permission(user, rbac.P_CYCLE_CLOSE) is expected
        assert rbac.has_permission(user, rbac.P_USER_MANAGE) is expected
        assert rbac.has_permission(user, rbac.P_AUDIT_READ) is expected


def test_peer_reviewer_has_minimal_surface():
    user = User(email="revisor@externo.org", role=rbac.REVISOR_PARES)
    assert rbac.has_permission(user, rbac.P_REVIEW_SUBMIT)
    assert not rbac.has_permission(user, rbac.P_TECHNOLOGY_WRITE)
    assert not rbac.has_permission(user, rbac.P_NOTE_WRITE)


# --------------------------------------------------------------------------- #
#  Bitacora inmutable
# --------------------------------------------------------------------------- #
def test_create_is_recorded_with_new_value(db):
    audit.set_user_context(User(id=1, email="tecnico@iets.org.co", role=rbac.EVALUADOR_TECNICO))
    db.add(Source(title="Fuente nueva", url="https://ejemplo.org"))
    db.commit()

    entry = db.query(AuditLog).filter(AuditLog.entity_type == "sources").one()
    assert entry.action == "create"
    assert entry.new_value["title"] == "Fuente nueva"
    assert entry.user_email == "tecnico@iets.org.co"
    assert entry.entity_id


def test_update_records_old_and_new_values(db):
    audit.set_user_context(User(id=1, email="tecnico@iets.org.co", role=rbac.EVALUADOR_TECNICO))
    source = Source(title="Antes", url="https://ejemplo.org")
    db.add(source)
    db.commit()

    source.title = "Despues"
    db.commit()

    entry = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "sources", AuditLog.action == "update")
        .one()
    )
    assert entry.old_value["title"] == "Antes"
    assert entry.new_value["title"] == "Despues"


def test_delete_is_recorded(db):
    audit.set_user_context(User(id=1, email="admin@iets.org.co", role=rbac.SUPERADMIN))
    source = Source(title="Temporal", url="https://ejemplo.org")
    db.add(source)
    db.commit()
    db.delete(source)
    db.commit()

    assert (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "sources", AuditLog.action == "delete")
        .count()
        == 1
    )


def test_audit_log_rejects_update_at_engine_level(db):
    audit.set_user_context(User(id=1, email="admin@iets.org.co", role=rbac.SUPERADMIN))
    db.add(Source(title="Fuente", url="https://ejemplo.org"))
    db.commit()

    with pytest.raises(DatabaseError):
        db.execute(text("UPDATE audit_log SET action = 'manipulado'"))
        db.commit()
    db.rollback()


def test_audit_log_rejects_delete_at_engine_level(db):
    audit.set_user_context(User(id=1, email="admin@iets.org.co", role=rbac.SUPERADMIN))
    db.add(Source(title="Fuente", url="https://ejemplo.org"))
    db.commit()

    with pytest.raises(DatabaseError):
        db.execute(text("DELETE FROM audit_log"))
        db.commit()
    db.rollback()


def test_business_action_is_recorded(db):
    audit.set_user_context(User(id=2, email="lider@iets.org.co", role=rbac.SUPERADMIN))
    audit.record_action(
        db,
        entity_type="cycles",
        entity_id=7,
        action="cycle:close",
        new_value={"frozen_entries": 12},
    )
    db.commit()

    entry = db.query(AuditLog).filter(AuditLog.action == "cycle:close").one()
    assert entry.entity_id == "7"
    assert entry.new_value["frozen_entries"] == 12


def test_findings_are_audited_as_the_acceptance_criteria_requires(db):
    """La fase 0 exige explicitamente trazabilidad sobre Source, Finding y User."""
    audit.set_user_context(User(id=1, email="tecnico@iets.org.co", role=rbac.EVALUADOR_TECNICO))
    source = _source(db)
    finding = Finding(
        source_id=source.id,
        title="Senal capturada",
        url="https://ejemplo.org/a",
        content_hash="hash-a",
        status="nuevo",
    )
    db.add(finding)
    db.commit()

    finding.status = "revisado"
    db.commit()

    entry = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "findings", AuditLog.action == "update")
        .one()
    )
    assert entry.old_value["status"] == "nuevo"
    assert entry.new_value["status"] == "revisado"


def test_methodology_parameter_changes_are_traceable(db):
    """Un umbral que gobierna un calculo oficial no puede cambiar sin dejar rastro."""
    audit.set_user_context(User(id=1, email="admin@iets.org.co", role=rbac.SUPERADMIN))
    param = MethodologyParam(key="priority.points_prioritized", value="4", value_type="int")
    db.add(param)
    db.commit()

    param.value = "5"
    db.commit()

    entry = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "methodology_params", AuditLog.action == "update")
        .one()
    )
    assert entry.entity_id == "priority.points_prioritized"
    assert entry.old_value["value"] == "4"
    assert entry.new_value["value"] == "5"


def test_sensitive_and_noisy_fields_never_reach_the_log(db):
    audit.set_user_context(User(id=1, email="tecnico@iets.org.co", role=rbac.EVALUADOR_TECNICO))
    source = _source(db)
    db.add(
        Finding(
            source_id=source.id,
            title="Con contenido crudo",
            url="https://ejemplo.org/b",
            content_hash="hash-b",
            raw_content="  ...miles de caracteres del scraping...  ",
        )
    )
    db.commit()

    entry = db.query(AuditLog).filter(AuditLog.entity_type == "findings").one()
    assert "raw_content" not in entry.new_value
    assert entry.new_value["title"] == "Con contenido crudo"


def test_user_context_survives_the_threadpool(db):
    """Reproduce como FastAPI ejecuta dependencias y endpoints declarados con `def`.

    Cada uno corre en un hilo con una *copia* del contexto de la peticion. Si
    `set_user_context` reasignara la variable en lugar de mutar el contenedor
    reservado por el middleware, el usuario resuelto en la dependencia no
    llegaria al endpoint y toda la bitacora quedaria atribuida a "sistema".
    """
    import contextvars
    from concurrent.futures import ThreadPoolExecutor

    audit.begin_request(ip="10.0.0.9", path="PUT /api/sources/1")
    user = User(id=7, email="tecnico@iets.org.co", role=rbac.EVALUADOR_TECNICO)

    with ThreadPoolExecutor(max_workers=2) as pool:
        # La dependencia resuelve el usuario en su propia copia del contexto.
        pool.submit(contextvars.copy_context().run, audit.set_user_context, user).result()
        # El endpoint corre en otra copia y debe ver al mismo usuario.
        visto = pool.submit(contextvars.copy_context().run, audit._context).result()

    assert visto["user_email"] == "tecnico@iets.org.co"
    assert visto["user_id"] == 7
    assert visto["ip_address"] == "10.0.0.9"
    audit.clear_context()


def test_writes_are_never_attributed_to_the_system_within_a_request(db):
    audit.begin_request(ip="10.0.0.9", path="POST /api/sources")
    audit.set_user_context(User(id=7, email="tecnico@iets.org.co", role=rbac.EVALUADOR_TECNICO))
    db.add(Source(title="Atribuida", url="https://ejemplo.org"))
    db.commit()

    entry = db.query(AuditLog).filter(AuditLog.entity_type == "sources").one()
    assert entry.user_email == "tecnico@iets.org.co"
    assert entry.user_id == 7
    audit.clear_context()


def test_context_is_captured(db):
    audit.set_request_context(ip="10.0.0.5", path="POST /api/sources", request_id="abc123")
    audit.set_user_context(User(id=3, email="quien@iets.org.co", role=rbac.EVALUADOR_TECNICO))
    db.add(Source(title="Con contexto", url="https://ejemplo.org"))
    db.commit()

    entry = db.query(AuditLog).filter(AuditLog.entity_type == "sources").one()
    assert entry.ip_address == "10.0.0.5"
    assert entry.request_path == "POST /api/sources"
    assert entry.request_id == "abc123"
    audit.clear_context()
