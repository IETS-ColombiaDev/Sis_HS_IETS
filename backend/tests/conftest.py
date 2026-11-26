"""Configuracion comun de pruebas: aisla la suite de servicios externos."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import firebase_db, firestore_directory, invima  # noqa: E402
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


@pytest.fixture(autouse=True)
def _hermetic_invima(monkeypatch):
    """La busqueda INVIMA no consulta datos.gov.co en vivo durante las pruebas."""
    monkeypatch.setattr(invima, "_original_live_lookup", invima.live_lookup, raising=False)
    monkeypatch.setattr(invima, "live_lookup", lambda db, term, **kw: 0)
    yield


@pytest.fixture(autouse=True)
def _hermetic_link_auto_resolve(monkeypatch):
    """Las senales no se ubican solas en red durante las pruebas (lo enciende la prueba que lo cubre)."""
    from app import corroboration, link_resolver
    from app.config import settings

    monkeypatch.setattr(settings, "link_auto_resolve", False)
    monkeypatch.setattr(settings, "link_auto_check", False)
    monkeypatch.setattr(link_resolver, "_auto_runs", 0)
    monkeypatch.setattr(corroboration, "_last_refresh", float("-inf"))
    yield


@pytest.fixture(autouse=True)
def _hermetic_ai_provider(monkeypatch):
    """Ninguna prueba llama al proveedor de IA real, aunque el equipo tenga una llave valida en su .env.

    Con una llave vencida las pruebas pasaban porque el proveedor respondia con error; con una
    llave valida, una prueba de captura consulto a la IA real, gasto cupo y fallo. Aqui el
    proveedor responde siempre como «no disponible». La prueba que cubre la IA simula
    `ai_service.generate` (o el `generate` del proveedor) con su propia respuesta.
    """
    from app import gemini_service, minimax_service

    monkeypatch.setattr(minimax_service, "generate", lambda *a, **k: ("[Error MiniMax: IA apagada en las pruebas]", "prueba"))
    monkeypatch.setattr(gemini_service, "_generate", lambda *a, **k: ("", ""))
    yield


@pytest.fixture(autouse=True)
def _hermetic_intelligence(monkeypatch):
    """La sugerencia de clasificacion y la analitica no consultan a la IA en red durante las pruebas.

    La prueba que cubre la IA vuelve a encender `intelligence.ai_available` y simula `ai_service.generate`.
    """
    from app import intelligence

    monkeypatch.setattr(intelligence, "ai_available", lambda: False)
    intelligence._invalidate()
    yield
    intelligence._invalidate()


@pytest.fixture(autouse=True)
def _hermetic_web_search(monkeypatch):
    """Los buscadores (Yahoo, Bing, DuckDuckGo) no se consultan en red durante las pruebas.

    Una prueba que necesite resultados vuelve a simular `_engine_call`.
    """
    from app import web_search

    monkeypatch.setattr(web_search, "_engine_call", lambda engine, query, *, cfg, brave_key: [])
    monkeypatch.setattr(web_search, "ENGINE_MIN_INTERVAL_S", 0.0)
    # El respaldo por mapa del sitio tampoco sale a la red: sin mapa por defecto.
    from app import sitemap_search

    monkeypatch.setattr(sitemap_search, "_get", lambda client, url: "")


@pytest.fixture(autouse=True)
def _hermetic_browser_fetch(monkeypatch):
    """La ruta de navegador no sale a la red en las pruebas (la enciende la prueba que la cubre)."""
    from app import access_routes
    from app.config import settings

    monkeypatch.setattr(settings, "browser_fetch_enabled", False)
    access_routes.configure(False)
    access_routes.forget_hosts()
    yield
    access_routes.forget_hosts()
