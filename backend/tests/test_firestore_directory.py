from __future__ import annotations

import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import firestore_directory as directory  # noqa: E402
from app.database import Base  # noqa: E402
from app.firestore_directory import DirectoryProfile  # noqa: E402
from app.models import User  # noqa: E402
from app.routers.auth import _get_or_create_user, user_out  # noqa: E402


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    yield session
    session.close()


def test_firestore_name_beats_leftover_database(monkeypatch, db):
    monkeypatch.setattr(
        directory,
        "lookup",
        lambda email: DirectoryProfile(
            email=email,
            nombres="Andrea",
            apellidos="Gomez Diaz",
            nombre="Andrea Gomez Diaz",
        ),
    )
    leftover = User(
        email="andrea.gomez@iets.org.co",
        name="Administrador IETS",
        role="superadmin",
        is_active=True,
    )
    db.add(leftover)
    db.commit()

    user = _get_or_create_user(db, "andrea.gomez@iets.org.co", "Administrador IETS", "", dev=True)
    assert user.name == "Andrea Gomez Diaz"
    assert user.first_name == "Andrea"
    assert user.last_name == "Gomez Diaz"
    assert "Administrador" not in user.name

    shown = user_out(user)
    assert shown.name == "Andrea Gomez Diaz"
    assert shown.first_name == "Andrea"
    assert shown.last_name == "Gomez Diaz"


def test_placeholder_is_not_kept_when_directory_missing(monkeypatch, db):
    monkeypatch.setattr(directory, "lookup", lambda email: None)
    user = _get_or_create_user(db, "nuevo.tecnico@iets.org.co", "Administrador IETS", "", dev=True)
    assert user.name == "nuevo tecnico"
