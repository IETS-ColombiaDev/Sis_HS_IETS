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


def test_parse_items_accepts_trailing_comma_and_findings_wrapper():
    text = '{"findings": [{"title": "CAR-T BCMA en mieloma", "summary": "Fase II", "horizon": "transicional",},]}'
    items = ai_web._parse_items(text, "https://fuente.test", "Fuente")
    assert len(items) == 1
    assert "CAR-T" in items[0]["title"]


def test_parse_items_drops_nav_and_invented_nct():
    text = """[
      {"title": "Contacto", "summary": "menu"},
      {"title": "Lecanemab en Alzheimer", "summary": "Ensayo NCT99999999 fase III", "technology_type": "medicamento", "horizon": "inminente"}
    ]"""
    source = "Lecanemab muestra beneficio en Alzheimer en fase III. Sin identificador de ensayo."
    items = ai_web._parse_items(text, "https://fuente.test", "NICE", source_text=source)
    assert len(items) == 1
    assert items[0]["title"].startswith("Lecanemab")
    assert "NCT99999999" not in items[0]["summary"]


def test_default_scan_prompt_forbids_invention_and_keeps_placeholders():
    from app import prompt_store

    defaults = prompt_store.defaults()
    assert "NCT" in defaults["system"]
    assert "JSON" in defaults["system"]
    user = defaults["user"]
    for key in ("{source_title}", "{source_url}", "{pages_visited}", "{content}", "{ocr_note}", "{max_items}"):
        assert key in user
    assert "No inventes" in user or "invent" in user.lower() or "Prohibido inventar" in defaults["system"]


def test_extract_from_page_noop_when_ai_off():
    ai_service.configure_runtime(
        provider="minimax",
        ocr_enabled=False,
        web_enabled=False,
        minimax_api_key="",
    )
    assert ai_web.extract_from_page("Fuente", "https://ejemplo.test", html="<html><p>Hola</p></html>") == []


def test_collect_follow_urls_keeps_internal_article_links():
    from app import scraper

    html = """
    <html><body>
      <article><a href="/news/car-t-for-lymphoma">CAR-T for lymphoma in adults</a></article>
      <a href="https://otra.org/x">Externo</a>
      <a href="/login">Iniciar sesion</a>
      <a href="/style.css">css</a>
    </body></html>
    """
    urls = scraper.collect_follow_urls(html, "https://fuente.test/horizon")
    assert urls == ["https://fuente.test/news/car-t-for-lymphoma"]


def test_crawl_site_visits_child_pages(monkeypatch):
    from app import prompt_store, scraper

    prompt_store.configure_runtime(pause_ms=0, retries=0)

    pages = {
        "https://fuente.test/list": (
            200,
            "text/html",
            """<html><head><title>Listado</title></head><body>
            <article><a href="/news/vacuna-dengue-fase-iii">Vacuna dengue fase III en adultos</a></article>
            </body></html>""",
            b"",
        ),
        "https://fuente.test/news/vacuna-dengue-fase-iii": (
            200,
            "text/html",
            """<html><head><title>Vacuna dengue</title></head>
            <body><article><p>Ensayo de fase III de una vacuna tetravalente contra el dengue en adultos.
            La tecnologia esta en desarrollo clinico avanzado.</p></article></body></html>""",
            b"",
        ),
    }

    def fake_fetch(url, timeout=25.0):
        return pages[url]

    monkeypatch.setattr(scraper, "fetch_url", fake_fetch)
    monkeypatch.setattr(scraper, "extract_main_text", lambda html, url="": "Ensayo de fase III de una vacuna tetravalente contra el dengue en adultos." if "vacuna" in (url or html) else "Listado de horizon scanning")
    landing_html = pages["https://fuente.test/list"][2]
    crawl = scraper.crawl_site("https://fuente.test/list", html=landing_html, max_pages=4, max_chars=8000)
    assert crawl["pages_visited"] >= 2
    assert "fuente.test/news/vacuna-dengue-fase-iii" in crawl["combined"]
    findings = [{"title": "Vacuna dengue fase III en adultos", "url": "https://fuente.test/news/vacuna-dengue-fase-iii", "summary": "", "raw_content": ""}]
    filled = scraper.apply_crawled_text(findings, crawl)
    assert "fase III" in (filled[0]["raw_content"] or filled[0]["summary"])


def test_prompt_store_renders_placeholders_without_breaking_json():
    from app import prompt_store

    prompt_store.configure_runtime(user="Fuente {source_title} items {max_items} {content}")
    text = prompt_store.render_user_prompt(source_title="EMA", max_items=18, content="hola")
    assert text == "Fuente EMA items 18 hola"
    prompt_store.configure_runtime(user=prompt_store.DEFAULT_USER_PROMPT)


def test_usage_meter_accumulates_and_resets():
    from app import usage_meter

    usage_meter.reset()
    usage_meter.record(prompt_tokens=10, completion_tokens=5, total_tokens=15, model="MiniMax-M3")
    snap = usage_meter.snapshot()
    assert snap["calls"] == 1 and snap["total_tokens"] == 15 and snap["last_model"] == "MiniMax-M3"
    usage_meter.reset()
    assert usage_meter.snapshot()["calls"] == 0


def test_fetch_url_retries_then_succeeds(monkeypatch):
    from app import prompt_store, scraper

    prompt_store.configure_runtime(retries=2, pause_ms=0, fetch_timeout=5)
    monkeypatch.setattr(scraper.time, "sleep", lambda *_a, **_k: None)
    calls = {"n": 0}

    class FakeResp:
        def __init__(self, status, body=b""):
            self.status_code = status
            self.headers = {"content-type": "text/html; charset=utf-8"}
            self.content = body
            self.encoding = "utf-8"

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url):
            calls["n"] += 1
            if calls["n"] < 3:
                return FakeResp(503)
            return FakeResp(200, b"<html><p>ok</p></html>")

    monkeypatch.setattr(scraper.httpx, "Client", FakeClient)
    status, ctype, text, raw = scraper.fetch_url("https://fuente.test/x")
    assert status == 200 and calls["n"] == 3 and "ok" in text


def test_scan_trace_keeps_recent_steps():
    from app import scan_trace

    scan_trace.clear()
    scan_trace.record(
        {
            "kind": "scan",
            "source": "NICE",
            "ok": True,
            "status": "ok",
            "elapsed_ms": 1200,
            "pages_visited": 3,
            "steps": [{"action": "ficha", "status": "ok", "ms": 80, "detail": "texto"}],
        }
    )
    rows = scan_trace.list_traces()
    assert rows[0]["source"] == "NICE" and rows[0]["steps"][0]["action"] == "ficha"
    scan_trace.clear()
