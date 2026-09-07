"""IA MiniMax, OCR condicionado y fusion de hallazgos de sitios."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import ai_service, ai_web, minimax_service  # noqa: E402


def test_minimax_prefers_m3():
    chosen = minimax_service._pick_model(
        ["MiniMax-M2", "MiniMax-M2.7", "MiniMax-M3"],
        preferred="",
    )
    assert chosen == "MiniMax-M3"


def test_minimax_respects_preferred_model():
    chosen = minimax_service._pick_model(
        ["MiniMax-M3", "MiniMax-M2.7-highspeed"],
        preferred="MiniMax-M2.7-highspeed",
    )
    assert chosen == "MiniMax-M2.7-highspeed"


def test_minimax_strips_thinking_tags():
    text = minimax_service._extract_text(
        {"choices": [{"message": {"content": "<think>razon</think>OK"}}]}
    )
    assert text == "OK"


def test_ocr_off_without_key():
    ai_service.configure_runtime(
        provider="minimax",
        ocr_enabled=True,
        web_enabled=True,
        minimax_api_key="",
        minimax_model="",
    )
    assert ai_service.ocr_enabled() is False
    assert ai_service.web_assist_enabled() is False
    assert ai_service.is_enabled() is False


def test_web_assist_on_with_key():
    ai_service.configure_runtime(
        provider="minimax",
        ocr_enabled=False,
        web_enabled=True,
        minimax_api_key="sk-test-not-real",
        minimax_model="MiniMax-M3",
    )
    assert ai_service.is_enabled() is True
    assert ai_service.web_assist_enabled() is True
    assert ai_service.ocr_enabled() is False
    ai_service.configure_runtime(ocr_enabled=True)
    assert ai_service.ocr_enabled() is True
    ai_service.configure_runtime(minimax_api_key="", ocr_enabled=False, web_enabled=True)


def test_merge_findings_dedupes_titles():
    base = [{"title": "CAR-T demo", "url": "https://a"}]
    extra = [
        {"title": "CAR-T demo", "url": "https://b"},
        {"title": "Otra senal", "url": "https://c"},
    ]
    merged = ai_web.merge_findings(base, extra)
    assert [i["title"] for i in merged] == ["CAR-T demo", "Otra senal"]


def test_parse_items_from_model_json():
    text = """```json
    [{"title": "Vacuna X para dengue", "summary": "Fase III", "technology_type": "medicamento", "horizon": "inminente"}]
    ```"""
    items = ai_web._parse_items(text, "https://fuente.test", "Fuente")
    assert len(items) == 1
    assert items[0]["title"].startswith("Vacuna X")
    assert items[0]["technology_type"] == "medicamento"
    assert items[0]["horizon"] == "inminente"


def test_extract_from_page_noop_when_ai_off():
    ai_service.configure_runtime(
        provider="minimax",
        ocr_enabled=False,
        web_enabled=False,
        minimax_api_key="",
    )
    assert ai_web.extract_from_page("Fuente", "https://ejemplo.test", html="<html><p>Hola</p></html>") == []
