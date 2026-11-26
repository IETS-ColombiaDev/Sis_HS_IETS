"""Idioma de la interfaz: el asistente responde en el idioma que llega en X-UI-Language."""
from app import ai_service


def test_sin_instruccion_en_espanol_o_codigo_desconocido():
    assert ai_service.language_rule("es") == ""
    assert ai_service.language_rule(None) == ""
    assert ai_service.language_rule("fr") == ""
    assert ai_service._localized(ai_service.SYSTEM_ANALYST, "es") == ai_service.SYSTEM_ANALYST


def test_ingles_britanico_y_americano_son_instrucciones_distintas():
    gb = ai_service.language_rule("en-GB")
    us = ai_service.language_rule("en-US")
    assert "British English" in gb and "prioritise" in gb
    assert "American English" in us and "prioritize" in us
    assert gb != us


def test_la_instruccion_llega_al_modelo(monkeypatch):
    seen = {}

    def fake_generate(prompt, system=None, **_kwargs):
        seen["prompt"], seen["system"] = prompt, system
        return "ok", "modelo-de-prueba"

    monkeypatch.setattr(ai_service, "generate", fake_generate)
    ai_service.chat_answer("What is new?", "contexto", [], language="en-GB")
    assert "British English" in seen["prompt"] and "British English" in seen["system"]
    assert "Respondes en espanol" not in seen["system"]

    ai_service.chat_answer("¿Qué hay de nuevo?", "contexto", [])
    assert "English" not in seen["prompt"] and "Respondes en espanol" in seen["system"]
