"""Configuracion comun de pruebas: aisla la suite de servicios externos."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import firebase_db, firestore_directory  # noqa: E402
from app.ratelimit import login_limiter  # noqa: E402


@pytest.fixture(autouse=True)
def _hermetic_firebase_db(monkeypatch):
    """Las pruebas no suben ni restauran la base contra Firestore real."""
    monkeypatch.setattr(firebase_db, "enabled", lambda: False)
    monkeypatch.setattr(firebase_db, "enable_autosync", lambda: None)
    monkeypatch.setattr(firebase_db, "flush_on_shutdown", lambda: None)
    yield


@pytest.fixture(autouse=True)
def _hermetic_directory(monkeypatch):
    """El directorio Firestore nunca se consulta en red durante las pruebas.

    Las pruebas que necesitan un perfil del directorio parchean `lookup`
    directamente; el resto ve un directorio vacio.
    """
    monkeypatch.setattr(firestore_directory, "_fetch_all", lambda: {})
    firestore_directory._cache["at"] = 0.0
    firestore_directory._cache["by_email"] = {}
    yield


@pytest.fixture(autouse=True)
def _fresh_login_limiter():
    login_limiter.reset()
    yield
    login_limiter.reset()
