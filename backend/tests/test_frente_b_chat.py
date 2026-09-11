"""Frente B: asistente de chat en modo degradado (sin IA) y aislamiento por usuario."""
from __future__ import annotations

from frente_b_support import api  # noqa: F401  (fixture)


def test_chat_works_without_ai_and_sessions_are_private(api, monkeypatch):
    from app import ai_service

    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ("", ""))
    api.add_source(title="Observatorio de oncologia", description="Vigilancia de oncologia")
    res = api.post("/api/chat/send", role="revisor_pares", json={"message": "Que hay de oncologia?"})
    assert res.status_code == 200
    body = res.json()
    assert body["model_used"] == "fallback (sin IA)"
    assert "Modo sin IA" in body["answer"]["content"]
    sid = body["session"]["id"]

    assert api.get(f"/api/chat/sessions/{sid}", role="revisor_pares").status_code == 200
    # Otra persona no ve ni borra la conversacion ajena.
    assert api.get(f"/api/chat/sessions/{sid}", role="tomador_decisiones").status_code == 404
    assert api.delete(f"/api/chat/sessions/{sid}", role="tomador_decisiones").status_code == 404
    assert api.delete(f"/api/chat/sessions/{sid}", role="revisor_pares").status_code == 204
    assert api.post("/api/chat/send", json={"message": "   "}).status_code == 400
