"""Asistente de navegacion: responde con el mapa que envia la interfaz."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import ai_service
from app.routers import chat

MAP = "- Bandeja de entrada (/bandeja-entrada): «Clasificar»\n- Priorizacion (/priorizacion)"


@pytest.fixture()
def h():
    harness = Harness(chat)
    yield harness
    harness.close()


def test_without_ai_the_interface_answers_locally(h, monkeypatch):
    monkeypatch.setattr(ai_service, "is_enabled", lambda: False)
    res = h.client.post("/api/chat/navigate", json={"question": "como clasifico", "context": MAP})
    assert res.status_code == 200 and res.json()["ai_used"] is False


def test_ai_answer_keeps_only_routes_from_the_map(h, monkeypatch):
    monkeypatch.setattr(ai_service, "is_enabled", lambda: True)
    monkeypatch.setattr(
        ai_service,
        "generate",
        lambda prompt, **kw: ('{"answer": "Abra la Bandeja y pulse «Clasificar».", "routes": ["/bandeja-entrada", "/inventada"]}', "MiniMax-M3"),
    )
    body = h.client.post(
        "/api/chat/navigate", json={"question": "como clasifico", "context": MAP, "path": "/"}
    ).json()
    assert body["ai_used"] is True
    assert body["routes"] == ["/bandeja-entrada"]
    assert "Clasificar" in body["answer"]


def test_an_empty_question_is_rejected(h):
    assert h.client.post("/api/chat/navigate", json={"question": " "}).status_code == 422
