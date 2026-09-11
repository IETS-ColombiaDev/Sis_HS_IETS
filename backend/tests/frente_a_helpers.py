"""Utilidades de las pruebas del frente A (flujo metodologico).

Levanta una aplicacion FastAPI minima con los routers bajo prueba, sobre una
base SQLite en memoria compartida entre peticiones, y sustituye la
autenticacion por un usuario elegido en la prueba. Asi se prueban los
contratos HTTP (codigos, cabeceras, mensajes) sin depender del login.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import methodology, rbac  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.models import Cluster, Cycle, CycleTechnology, TechType, Technology, User  # noqa: E402


class Harness:
    def __init__(self, *routers):
        self.engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        self.db: Session = self.Session()
        methodology.seed_catalogs(self.db)
        self.users: dict[str, User] = {}
        self.current = "superadmin"
        for role in rbac.ROLES:
            user = User(email=f"{role}@iets.org.co", name=role, role=role, is_active=True)
            self.db.add(user)
            self.users[role] = user
        self.db.commit()

        app = FastAPI()
        for module in routers:
            app.include_router(module.router)

        def _get_db():
            session = self.Session()
            try:
                yield session
            finally:
                session.close()

        def _user(db: Session = Depends(get_db)) -> User:
            return db.query(User).filter(User.email == f"{self.current}@iets.org.co").first()

        app.dependency_overrides[get_db] = _get_db
        app.dependency_overrides[get_current_user] = _user
        self.app = app
        self.client = TestClient(app)

    def as_role(self, role: str) -> "Harness":
        self.current = role
        return self

    # ------------------------------------------------------------------ #
    #  Fabricas de datos
    # ------------------------------------------------------------------ #
    def cycle(self, code: str = "Ciclo T", *, status: str = "en_priorizacion", year: int = 2031, weeks: int = 12) -> Cycle:
        opened = dt.date(year, 1, 5)
        cycle = Cycle(
            code=code,
            year=year,
            opened_on=opened,
            data_cutoff_on=opened + dt.timedelta(weeks=weeks - 2),
            bulletin_due_on=opened + dt.timedelta(weeks=weeks),
            status=status,
        )
        self.db.add(cycle)
        self.db.commit()
        return cycle

    def tech(self, name: str = "Alfamab", *, status: str = "capturada_no_asignada", **extra) -> Technology:
        cluster = self.db.query(Cluster).first()
        tech_type = self.db.query(TechType).first()
        tech = Technology(
            commercial_name=name,
            inn_name=extra.pop("inn_name", name.lower()),
            cluster_id=extra.pop("cluster_id", cluster.id),
            tech_type_id=extra.pop("tech_type_id", tech_type.id),
            status=status,
            **extra,
        )
        self.db.add(tech)
        self.db.commit()
        return tech

    def entry(self, cycle: Cycle, tech: Technology, status: str = "asignada_a_ciclo", **extra) -> CycleTechnology:
        entry = CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status=status, **extra)
        tech.status = status
        self.db.add(entry)
        self.db.commit()
        return entry

    def refresh(self, obj):
        self.db.expire_all()
        return self.db.get(type(obj), obj.id)

    def close(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()
