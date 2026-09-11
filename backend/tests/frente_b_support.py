"""Utilidades compartidas por las pruebas del frente B (API sobre SQLite en memoria).

No es un archivo de pruebas: lo importan los `test_frente_b_*.py`. Levanta la
aplicacion real con `TestClient` (sin el `lifespan`, asi que no arranca el
worker ni sincroniza el catalogo) y sustituye la sesion de base de datos por una
en memoria. Nada toca la base real ni sale a internet.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import methodology, security  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.models import Source, User  # noqa: E402

ROLES = ("superadmin", "evaluador_tecnico", "evaluador_clinico", "tomador_decisiones", "revisor_pares")


def make_engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    return engine


class ApiEnv:
    """Cliente autenticado por perfil sobre una base aislada."""

    def __init__(self, engine, client):
        self.engine = engine
        self.Session = sessionmaker(bind=engine, autoflush=False)
        self.client = client
        self._tokens: dict[str, str] = {}

    def db(self):
        return self.Session()

    def user(self, role: str) -> User:
        email = f"{role}@iets.org.co"
        with self.Session() as db:
            row = db.query(User).filter(User.email == email).first()
            if row is None:
                row = User(email=email, name=role.replace("_", " ").title(), picture="", role=role, is_active=True)
                db.add(row)
                db.commit()
                db.refresh(row)
            db.expunge(row)
            return row

    def headers(self, role: str) -> dict:
        if role not in self._tokens:
            user = self.user(role)
            maker = getattr(security, "create_session_token", None)
            token = maker(user) if maker else security.create_access_token(user.email, {"role": user.role})
            self._tokens[role] = token
        return {"Authorization": f"Bearer {self._tokens[role]}"}

    def get(self, path, role="superadmin", **kw):
        return self.client.get(path, headers=self.headers(role), **kw)

    def post(self, path, role="superadmin", **kw):
        return self.client.post(path, headers=self.headers(role), **kw)

    def put(self, path, role="superadmin", **kw):
        return self.client.put(path, headers=self.headers(role), **kw)

    def delete(self, path, role="superadmin", **kw):
        return self.client.delete(path, headers=self.headers(role), **kw)

    def add_source(self, **kwargs) -> int:
        data = {
            "title": "Fuente de prueba",
            "url": "https://fuente.example.org",
            "connector": "fixture",
            "scrape_enabled": True,
            "access_level": "D",
            "category": "Agencias regulatorias",
            "connector_config": {"records": [fixture_record("EXT-1", "Trastuzumab demo")]},
        }
        data.update(kwargs)
        with self.Session() as db:
            row = Source(**data)
            db.add(row)
            db.commit()
            return row.id


def fixture_record(external_id: str, name: str, **extra) -> dict:
    row = {
        "external_id": external_id,
        "title": f"Senal {name}",
        "commercial_name": name,
        "inn_name": name.lower().split()[0],
        "manufacturer": "Laboratorio demo",
        "indication": "Cancer de mama",
        "technology_type": "medicamento",
        "horizon": "emergente",
        "raw": {"id": external_id},
    }
    row.update(extra)
    return row


@pytest.fixture()
def api(monkeypatch):
    """Aplicacion completa sobre SQLite en memoria, con el worker neutralizado."""
    from fastapi.testclient import TestClient

    import app.main as main
    from app import audit, worker
    from app.routers import config as config_router
    from app.routers import ingest as ingest_router
    from app.routers import scan as scan_router
    from app.routers import submissions as submissions_router

    engine = make_engine()
    Session = sessionmaker(bind=engine, autoflush=False)
    with Session() as db:
        methodology.seed_catalogs(db)
    audit.install_listeners()

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    # El `kick` real abre sesiones contra la base configurada: jamas en pruebas.
    calls: list[str] = []
    noop = lambda: calls.append("kick")  # noqa: E731
    monkeypatch.setattr(worker, "kick", noop)
    monkeypatch.setattr(scan_router, "kick", noop)
    monkeypatch.setattr(ingest_router, "kick", noop)
    monkeypatch.setattr(submissions_router, "_hits", type(submissions_router._hits)(list))
    main.app.dependency_overrides[get_db] = override
    client = TestClient(main.app)
    env = ApiEnv(engine, client)
    env.kicks = calls
    env.config_router = config_router
    try:
        yield env
    finally:
        main.app.dependency_overrides.pop(get_db, None)
