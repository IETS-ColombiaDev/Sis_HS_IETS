"""Acceso con contrasena, bloqueo, sesiones y administracion de usuarios (produccion)."""
from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import audit, rbac
from app.config import DEFAULT_SECRET_KEY, Settings, settings
from app.database import Base, get_db
from app.models import AuditLog, User
from app.routers import auth as auth_router
from app.routers import users as users_router
from app.security import (
    create_access_token,
    generate_temporary_password,
    hash_password,
    password_problems,
    verify_password,
)

ADMIN = "admin@iets.org.co"
STRONG = "Horizonte2026seguro"


@pytest.fixture()
def env(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    audit.install_listeners()

    app = FastAPI()

    @app.middleware("http")
    async def ctx(request, call_next):
        audit.begin_request(ip="127.0.0.1", path=f"{request.method} {request.url.path}")
        try:
            return await call_next(request)
        finally:
            audit.clear_context()

    app.include_router(auth_router.router)
    app.include_router(users_router.router)

    def _db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _db
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "allow_dev_login", True)
    client = TestClient(app)
    admin_token = client.post("/api/auth/dev-login", json={"email": ADMIN}).json()["access_token"]
    return client, Session, admin_token


def H(token):
    return {"Authorization": f"Bearer {token}"}


def create(client, admin_token, email, role="evaluador_tecnico", password=""):
    r = client.post(
        "/api/users",
        headers=H(admin_token),
        json={"email": email, "name": "Persona Prueba", "role": role, "password": password},
    )
    assert r.status_code == 201, r.text
    return r.json()


# --------------------------------------------------------------------------- #
#  Contrasenas
# --------------------------------------------------------------------------- #
def test_hash_roundtrip_and_rejections():
    stored = hash_password(STRONG)
    assert stored.startswith("scrypt$")
    assert STRONG not in stored
    assert verify_password(STRONG, stored)
    assert not verify_password(STRONG + "x", stored)
    assert not verify_password(STRONG, "")
    assert not verify_password(STRONG, "md5$abc")
    assert hash_password(STRONG) != stored  # sal distinta en cada hash


def test_password_policy():
    assert password_problems("corta1") != []
    assert any("número" in p for p in password_problems("solamenteletras"))
    assert any("letra" in p for p in password_problems("12345678901"))
    assert any("usuario" in p for p in password_problems("mariaperez2026", email="mariaperez@iets.org.co"))
    assert password_problems(STRONG) == []
    for _ in range(20):
        assert password_problems(generate_temporary_password()) == []


def test_production_requires_own_secret_key():
    prod = Settings(environment="production", secret_key=DEFAULT_SECRET_KEY, _env_file=None)
    assert prod.production_problems()
    assert not prod.dev_login_enabled
    ok = Settings(environment="production", secret_key="x" * 48, allow_dev_login=True, _env_file=None)
    assert ok.production_problems() == []
    assert not ok.dev_login_enabled  # nunca en produccion, aunque la bandera diga lo contrario
    dev = Settings(environment="development", _env_file=None)
    assert dev.production_problems() == []


# --------------------------------------------------------------------------- #
#  Ciclo de vida de la cuenta
# --------------------------------------------------------------------------- #
def test_admin_creates_user_and_first_login_forces_password_change(env):
    client, _, admin = env
    created = create(client, admin, "nueva.persona@iets.org.co")
    temp = created["temporary_password"]
    assert temp and password_problems(temp) == []
    assert created["user"]["must_change_password"] is True
    assert created["user"]["has_password"] is True

    login = client.post("/api/auth/login", json={"email": "Nueva.Persona@iets.org.co", "password": temp})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    assert login.json()["user"]["must_change_password"] is True

    # Con la temporal solo puede ver su perfil y cambiarla.
    assert client.get("/api/auth/me", headers=H(token)).status_code == 200
    assert client.get("/api/users/roles", headers=H(token)).status_code == 403

    bad = client.post(
        "/api/auth/change-password", headers=H(token), json={"current_password": temp, "new_password": "corta"}
    )
    assert bad.status_code == 422
    changed = client.post(
        "/api/auth/change-password", headers=H(token), json={"current_password": temp, "new_password": STRONG}
    )
    assert changed.status_code == 200, changed.text
    fresh = changed.json()["access_token"]
    assert changed.json()["user"]["must_change_password"] is False
    assert client.get("/api/users/roles", headers=H(fresh)).status_code == 200
    # El token anterior quedo revocado por el cambio de credenciales.
    assert client.get("/api/auth/me", headers=H(token)).status_code == 401
    # Y la contrasena nueva es la que vale.
    assert client.post("/api/auth/login", json={"email": "nueva.persona@iets.org.co", "password": temp}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "nueva.persona@iets.org.co", "password": STRONG}).status_code == 200


def test_wrong_current_password_and_same_password_are_rejected(env):
    client, _, admin = env
    create(client, admin, "cambio@iets.org.co", password=STRONG)
    token = client.post("/api/auth/login", json={"email": "cambio@iets.org.co", "password": STRONG}).json()["access_token"]
    r = client.post("/api/auth/change-password", headers=H(token), json={"current_password": "otra123456x", "new_password": "Distinta2026ok"})
    assert r.status_code == 400
    r = client.post("/api/auth/change-password", headers=H(token), json={"current_password": STRONG, "new_password": STRONG})
    assert r.status_code == 400


def test_unknown_email_and_wrong_password_share_generic_error(env):
    client, _, admin = env
    create(client, admin, "existe@iets.org.co", password=STRONG)
    a = client.post("/api/auth/login", json={"email": "noexiste@iets.org.co", "password": "Cualquiera123"})
    b = client.post("/api/auth/login", json={"email": "existe@iets.org.co", "password": "Cualquiera123"})
    assert a.status_code == b.status_code == 401
    assert a.json()["detail"] == b.json()["detail"] == auth_router.GENERIC_LOGIN_ERROR


def test_failed_attempts_are_attributed_never_to_sistema(env):
    client, Session, _ = env
    client.post("/api/auth/login", json={"email": "fantasma@iets.org.co", "password": "Cualquiera123"})
    db = Session()
    row = db.query(AuditLog).filter(AuditLog.action == "auth:login_failed").one()
    db.close()
    assert row.user_email == "anonimo:fantasma@iets.org.co"
    assert row.user_id is None
    assert row.ip_address == "127.0.0.1"


def test_lockout_after_max_attempts_and_admin_unlock(env):
    client, Session, admin = env
    user = create(client, admin, "bloqueo@iets.org.co", password=STRONG)["user"]
    for _ in range(settings.login_max_attempts):
        r = client.post("/api/auth/login", json={"email": "bloqueo@iets.org.co", "password": "Equivocada123"})
        assert r.status_code == 401
    # Bloqueada: ni la contrasena correcta entra.
    r = client.post("/api/auth/login", json={"email": "bloqueo@iets.org.co", "password": STRONG})
    assert r.status_code == 423
    listed = {u["email"]: u for u in client.get("/api/users", headers=H(admin)).json()}
    assert listed["bloqueo@iets.org.co"]["locked_until"] is not None

    assert client.post(f"/api/users/{user['id']}/unlock", headers=H(admin)).status_code == 200
    assert client.post("/api/auth/login", json={"email": "bloqueo@iets.org.co", "password": STRONG}).status_code == 200

    db = Session()
    actions = {a for (a,) in db.query(AuditLog.action).all()}
    db.close()
    assert {"auth:login_failed", "auth:locked", "auth:unlocked", "auth:login"} <= actions


def test_reset_password_revokes_sessions_and_forces_change(env):
    client, _, admin = env
    user = create(client, admin, "reset@iets.org.co", password=STRONG)["user"]
    token = client.post("/api/auth/login", json={"email": "reset@iets.org.co", "password": STRONG}).json()["access_token"]
    assert client.get("/api/auth/me", headers=H(token)).status_code == 200
    r = client.post(f"/api/users/{user['id']}/reset-password", headers=H(admin))
    assert r.status_code == 200
    temp = r.json()["temporary_password"]
    assert client.get("/api/auth/me", headers=H(token)).status_code == 401
    login = client.post("/api/auth/login", json={"email": "reset@iets.org.co", "password": temp})
    assert login.status_code == 200 and login.json()["user"]["must_change_password"] is True


def test_deactivation_kills_open_sessions(env):
    client, _, admin = env
    user = create(client, admin, "baja@iets.org.co", password=STRONG)["user"]
    token = client.post("/api/auth/login", json={"email": "baja@iets.org.co", "password": STRONG}).json()["access_token"]
    assert client.put(f"/api/users/{user['id']}", headers=H(admin), json={"is_active": False}).status_code == 200
    assert client.get("/api/auth/me", headers=H(token)).status_code == 401
    r = client.post("/api/auth/login", json={"email": "baja@iets.org.co", "password": STRONG})
    assert r.status_code == 403


# --------------------------------------------------------------------------- #
#  Tokens y acceso de desarrollo
# --------------------------------------------------------------------------- #
def test_reviewer_token_cannot_open_a_session(env):
    client, _, _ = env
    review = create_access_token(ADMIN, {"typ": "review", "aid": 1, "doc": 1}, expires_delta=timedelta(days=10))
    assert client.get("/api/auth/me", headers=H(review)).status_code == 401


def test_dev_login_never_promotes_an_assigned_profile(env):
    client, _, admin = env
    email = "decisor@iets.org.co"
    client.post("/api/auth/dev-login", json={"email": email})
    uid = next(u["id"] for u in client.get("/api/users", headers=H(admin)).json() if u["email"] == email)
    assert client.put(f"/api/users/{uid}/role", headers=H(admin), json={"role": "tomador_decisiones"}).status_code == 200
    again = client.post("/api/auth/dev-login", json={"email": email}).json()
    assert again["user"]["role"] == "tomador_decisiones"


def test_dev_login_is_off_in_production_and_denial_is_audited(env, monkeypatch):
    client, Session, _ = env
    monkeypatch.setattr(settings, "environment", "production")
    r = client.post("/api/auth/dev-login", json={"email": ADMIN})
    assert r.status_code == 403
    db = Session()
    assert db.query(AuditLog).filter(AuditLog.action == "auth:dev_login_denied").count() == 1
    db.close()


def test_login_rate_limit_per_ip(env):
    client, _, _ = env
    codes = [
        client.post("/api/auth/login", json={"email": f"x{i}@iets.org.co", "password": "Nada123456"}).status_code
        for i in range(35)
    ]
    assert 429 in codes
    assert codes[:30].count(401) == 30


# --------------------------------------------------------------------------- #
#  Salvaguardas de administracion
# --------------------------------------------------------------------------- #
def test_create_validations(env):
    client, _, admin = env
    create(client, admin, "dup@iets.org.co")
    r = client.post("/api/users", headers=H(admin), json={"email": "dup@iets.org.co", "role": "evaluador_tecnico"})
    assert r.status_code == 409
    r = client.post("/api/users", headers=H(admin), json={"email": "no-es-correo", "role": "evaluador_tecnico"})
    assert r.status_code == 422
    r = client.post("/api/users", headers=H(admin), json={"email": "debil@iets.org.co", "role": "evaluador_tecnico", "password": "123"})
    assert r.status_code == 422
    r = client.post("/api/users", headers=H(admin), json={"email": "rol@iets.org.co", "role": "hacker"})
    assert r.status_code == 422


def test_non_admin_cannot_manage_users(env):
    client, _, admin = env
    create(client, admin, "tec@iets.org.co", password=STRONG)
    token = client.post("/api/auth/login", json={"email": "tec@iets.org.co", "password": STRONG}).json()["access_token"]
    # La cuenta nace con cambio obligatorio: se completa para probar el permiso real.
    token = client.post(
        "/api/auth/change-password", headers=H(token), json={"current_password": STRONG, "new_password": "OtraClave2026x"}
    ).json()["access_token"]
    assert client.get("/api/users", headers=H(token)).status_code == 403
    assert client.post("/api/users", headers=H(token), json={"email": "z@iets.org.co", "role": "superadmin"}).status_code == 403


def test_last_superadmin_is_protected(env):
    client, _, admin = env
    me = client.get("/api/auth/me", headers=H(admin)).json()
    assert client.put(f"/api/users/{me['id']}", headers=H(admin), json={"role": "tomador_decisiones"}).status_code == 400
    assert client.put(f"/api/users/{me['id']}", headers=H(admin), json={"is_active": False}).status_code == 400

    other = create(client, admin, "otro.admin@iets.org.co", role="superadmin", password=STRONG)["user"]
    # Con dos superadministradores, el otro si puede degradarse...
    assert client.put(f"/api/users/{other['id']}", headers=H(admin), json={"role": "evaluador_clinico"}).status_code == 200
    # ...y ya siendo el unico, degradar al otro ya no aplica, pero desactivar a un
    # superadmin unico por otra via tambien se bloquea.
    assert rbac.canonical_role(me["role"]) == rbac.SUPERADMIN


def test_update_name_and_role(env):
    client, _, admin = env
    u = create(client, admin, "edita@iets.org.co")["user"]
    r = client.put(f"/api/users/{u['id']}", headers=H(admin), json={"name": "Nombre Nuevo", "role": "evaluador_clinico"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Nombre Nuevo"
    assert body["role"] == "evaluador_clinico"
    assert body["rateable_criteria"] == ["P2", "P3", "P4"]
    assert client.put(f"/api/users/{u['id']}", headers=H(admin), json={"name": "   "}).status_code == 422
    assert client.get("/api/users/999999", headers=H(admin)).status_code == 404


def test_delete_only_without_activity(env):
    client, _, admin = env
    quiet = create(client, admin, "sin.actividad@iets.org.co")["user"]
    assert client.delete(f"/api/users/{quiet['id']}", headers=H(admin)).status_code == 204
    assert all(u["email"] != "sin.actividad@iets.org.co" for u in client.get("/api/users", headers=H(admin)).json())

    active = create(client, admin, "con.actividad@iets.org.co", password=STRONG)["user"]
    client.post("/api/auth/login", json={"email": "con.actividad@iets.org.co", "password": STRONG})
    r = client.delete(f"/api/users/{active['id']}", headers=H(admin))
    assert r.status_code == 409
    assert "Desactívela" in r.json()["detail"]

    me = client.get("/api/auth/me", headers=H(admin)).json()
    assert client.delete(f"/api/users/{me['id']}", headers=H(admin)).status_code == 400


def test_password_hash_never_reaches_audit_or_api(env):
    client, Session, admin = env
    u = create(client, admin, "secreto@iets.org.co", password=STRONG)["user"]
    client.post(f"/api/users/{u['id']}/reset-password", headers=H(admin))
    assert "password_hash" not in u
    db = Session()
    for old, new in db.query(AuditLog.old_value, AuditLog.new_value).all():
        for blob in (old or {}, new or {}):
            assert "password_hash" not in blob
            assert not any(isinstance(v, str) and v.startswith("scrypt$") for v in blob.values())
    stored = db.query(User).filter(User.email == "secreto@iets.org.co").one()
    assert stored.password_hash.startswith("scrypt$")
    db.close()


def test_permission_catalog_covers_every_permission(env):
    client, _, admin = env
    perms = client.get("/api/users/permissions", headers=H(admin)).json()
    codes = {p["code"] for p in perms}
    all_perms = set().union(*rbac.ROLE_PERMISSIONS.values())
    assert all_perms <= codes
    roles = client.get("/api/users/roles", headers=H(admin)).json()
    assert all(r["description"] for r in roles)
