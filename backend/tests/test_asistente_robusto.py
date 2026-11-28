"""Asistente: lista con conteo y búsqueda, renombrar, exportar, reintentar, límites y borrado general."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import ai_service
from app.models import ChatMessage, ChatSession
from app.routers import chat


@pytest.fixture()
def h(monkeypatch):
    harness = Harness(chat)
    # Sin IA: el asistente responde con lo que encuentra en el sistema.
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ("", ""))
    yield harness
    harness.close()


def _ask(h, message, role="superadmin", **extra):
    res = h.as_role(role).client.post("/api/chat/send", json={"message": message, **extra})
    assert res.status_code == 200, res.text
    return res.json()


def test_sessions_list_counts_previews_and_searches_inside_messages(h):
    first = _ask(h, "Qué hay de oncología pediátrica")
    _ask(h, "Y de terapias génicas", session_id=first["session"]["id"])
    second = _ask(h, "Dispositivos de diagnóstico")
    _ask(h, "Pregunta ajena", role="tomador_decisiones")

    sessions = h.as_role("superadmin").client.get("/api/chat/sessions").json()
    assert [s["id"] for s in sessions] == [second["session"]["id"], first["session"]["id"]]
    by_id = {s["id"]: s for s in sessions}
    assert by_id[first["session"]["id"]]["message_count"] == 4
    assert by_id[second["session"]["id"]]["message_count"] == 2 and by_id[second["session"]["id"]]["preview"]
    assert first["session"]["message_count"] == 2  # la respuesta de enviar ya trae el conteo

    # Busca en el título y dentro de los mensajes.
    found = h.client.get("/api/chat/sessions", params={"q": "GÉNICAS"}).json()
    assert [s["id"] for s in found] == [first["session"]["id"]]
    assert h.client.get("/api/chat/sessions", params={"q": "ajena"}).json() == []


def test_rename_validates_and_is_only_for_the_owner(h):
    sid = _ask(h, "Pregunta inicial")["session"]["id"]
    ok = h.client.put(f"/api/chat/sessions/{sid}", json={"title": "  Oncología   2026  "})
    assert ok.status_code == 200 and ok.json()["title"] == "Oncología 2026"
    assert h.client.put(f"/api/chat/sessions/{sid}", json={"title": "   "}).status_code == 422
    assert h.client.put(f"/api/chat/sessions/{sid}", json={"title": "t" * 121}).status_code == 422
    assert h.as_role("revisor_pares").client.put(f"/api/chat/sessions/{sid}", json={"title": "Ajeno"}).status_code == 404


def test_export_gives_the_conversation_as_markdown_only_to_its_owner(h):
    sid = _ask(h, "Qué fuentes hay")["session"]["id"]
    res = h.client.get(f"/api/chat/sessions/{sid}/export")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/markdown")
    assert f'conversacion-{sid}.md' in res.headers["content-disposition"]
    text = res.text
    assert text.startswith("# Qué fuentes hay") and "## Pregunta" in text and "## Respuesta" in text
    assert "verifique cada dato en la fuente" in text
    assert h.as_role("revisor_pares").client.get(f"/api/chat/sessions/{sid}/export").status_code == 404


def test_message_limit_and_retry_replaces_the_last_answer(h):
    assert h.client.post("/api/chat/send", json={"message": "x" * 4001}).status_code == 422
    sent = _ask(h, "Pregunta para reintentar")
    sid = sent["session"]["id"]

    again = h.client.post(f"/api/chat/sessions/{sid}/retry")
    assert again.status_code == 200
    assert again.json()["answer"]["content"]
    detail = h.client.get(f"/api/chat/sessions/{sid}").json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"] and detail["message_count"] == 2
    assert h.as_role("revisor_pares").client.post(f"/api/chat/sessions/{sid}/retry").status_code == 404


def test_a_failed_answer_keeps_the_question_and_can_be_retried(h, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("proveedor caído")

    monkeypatch.setattr(ai_service, "chat_answer", boom)
    res = h.as_role("superadmin").client.post("/api/chat/send", json={"message": "Pregunta que falla"})
    assert res.status_code == 502 and "Reintentar" in res.json()["detail"]
    h.db.expire_all()
    session = h.db.query(ChatSession).one()
    assert [m.role for m in h.db.query(ChatMessage).filter_by(session_id=session.id)] == ["user"]

    monkeypatch.undo()
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ("", ""))
    ok = h.client.post(f"/api/chat/sessions/{session.id}/retry")
    assert ok.status_code == 200 and ok.json()["answer"]["content"]
    assert h.client.get(f"/api/chat/sessions/{session.id}").json()["message_count"] == 2


def test_delete_all_removes_only_my_general_conversations(h):
    _ask(h, "Una")
    _ask(h, "Dos")
    _ask(h, "Del grafo", scope="grafo")
    _ask(h, "Ajena", role="tomador_decisiones")

    res = h.as_role("superadmin").client.delete("/api/chat/sessions")
    assert res.status_code == 200 and res.json() == {"deleted": 2}
    assert h.client.get("/api/chat/sessions").json() == []
    assert len(h.client.get("/api/chat/sessions", params={"scope": "grafo"}).json()) == 1
    assert len(h.as_role("tomador_decisiones").client.get("/api/chat/sessions").json()) == 1
