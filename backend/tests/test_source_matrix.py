"""Matriz EH de fuentes: parser del Excel, perfil del flujo, busqueda web y recorrido guiado."""
from __future__ import annotations

import base64
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from frente_b_support import api  # noqa: E402,F401  (fixture)

from app import source_matrix, source_profile, web_search  # noqa: E402

EXCEL = Path(__file__).resolve().parents[2] / "FUENTES DE INFORMACION PROACTIVA EH (1).xlsx"


# --------------------------------------------------------------------------- #
#  Parser
# --------------------------------------------------------------------------- #
def test_parse_helpers():
    assert source_matrix.parse_priority("Alta aplicabilidad para EH") == "alta"
    assert source_matrix.parse_priority("Revisar pertinencia") == "revisar"
    assert source_matrix.parse_priority("No permite acceso sin registro") == "revisar"
    assert source_matrix.parse_priority("") == ""
    assert source_matrix.parse_source_level("Fuente primaria") == "primaria"
    assert source_matrix.parse_source_level("Secundaria") == "secundaria"
    assert "SD" in source_matrix.parse_tech_types("SaMD, dispositivos médicos")
    assert source_matrix.clean_url("https://x.org/a?utm_source=y&id=2#top") == "https://x.org/a?id=2"


@pytest.mark.skipif(not EXCEL.exists(), reason="Excel de la matriz EH no disponible")
def test_excel_parses_all_rows_and_matches_packaged_json():
    parsed = source_matrix.parse_workbook(EXCEL)
    packaged = source_matrix.load_matrix()
    assert len(parsed["rows"]) == len(packaged["rows"]) == 89
    assert len(parsed["search_terms"]) == 11
    assert all(r["codes"] for r in parsed["rows"])
    assert [r["codes"] for r in parsed["rows"]] == [r["codes"] for r in packaged["rows"]]


def test_parse_workbook_rejects_garbage():
    with pytest.raises(ValueError):
        source_matrix.parse_workbook(b"no es un excel")


# --------------------------------------------------------------------------- #
#  Perfil del flujo
# --------------------------------------------------------------------------- #
def test_normalize_profile_defaults_and_bounds():
    prof = source_profile.normalize_profile({"ocr": False, "max_pages": 999, "follow_keywords": "a, b ,,c"})
    assert prof["ocr"] is False and prof["ai"] is True
    assert prof["max_pages"] == source_profile.MAX_PAGES_OVERRIDE
    assert prof["follow_keywords"] == ["a", "b", "c"]
    assert source_profile.normalize_profile(None) == source_profile.DEFAULT_SCAN_PROFILE


def test_effective_profile_derives_keywords_from_access_path():
    src = SimpleNamespace(
        url="https://www.medscape.com/",
        access_path="medscape → News & Perspective → *Cardiology *Neurology → search",
        entry_urls=["https://www.medscape.com/news"],
        scan_profile={"follow_keywords": ["oncology"]},
    )
    prof = source_profile.effective_profile(src)
    assert prof["follow_keywords"][0] == "oncology"
    assert "cardiology" in prof["follow_keywords"] and "neurology" in prof["follow_keywords"]
    assert "medscape" not in prof["follow_keywords"] and "search" not in prof["follow_keywords"]
    assert prof["entry_urls"] == ["https://www.medscape.com/news"]


def test_priority_rank_orders_alta_first():
    ranks = [source_profile.priority_rank(p) for p in ("alta", "media", "", "revisar", "baja")]
    assert ranks == sorted(ranks)


def test_save_options_validates(api):
    with api.db() as db:
        with pytest.raises(ValueError):
            source_profile.save_options(db, {"priority_level": [{"value": "¡!", "label": "X"}]})
        with pytest.raises(ValueError):
            source_profile.save_options(db, {"priority_level": []})
        with pytest.raises(ValueError):
            source_profile.save_options(db, {"priority_level": [{"value": "alta", "label": ""}]})
        with pytest.raises(ValueError):
            source_profile.save_options(db, {"tech_type": [{"value": "DM", "label": "a"}, {"value": "dm", "label": "b"}]})
        out = source_profile.save_options(
            db,
            {"priority_level": [{"value": "Muy urgente", "label": "Urgente", "rank": 1}, {"value": "alta", "label": "Alta", "rank": 2}]},
        )
        assert out["priority_level"][0]["value"] == "muy_urgente"
        assert source_profile.priority_rank("muy_urgente", out) < source_profile.priority_rank("alta", out)


# --------------------------------------------------------------------------- #
#  Motores de busqueda (HTML simulado)
# --------------------------------------------------------------------------- #
def test_parse_yahoo_unwraps_redirect():
    html = """<div class="algo"><h3><a href="https://r.search.yahoo.com/_ylt=x/RU=https%3a%2f%2fwww.fda.gov%2fdoc.pdf/RK=2/RS=z">
    <span>www.fda.gov › doc</span>Breakthrough devices report</a></h3><div class="compText"><p>Lista 2026</p></div></div>"""
    rows = web_search.parse_yahoo(html)
    assert rows[0]["url"] == "https://www.fda.gov/doc.pdf"
    assert "Breakthrough" in rows[0]["title"] and rows[0]["snippet"] == "Lista 2026"


def test_parse_ddg_and_anomaly():
    html = """<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.ema.europa.eu%2Fen%2Fx&rut=1">EMA X</a>
    <a class="result__snippet">texto</a></div>"""
    rows = web_search.parse_ddg(html)
    assert rows == [{"url": "https://www.ema.europa.eu/en/x", "title": "EMA X", "snippet": "texto"}]
    with pytest.raises(web_search.EngineBlocked):
        web_search.parse_ddg('<div class="anomaly-modal__modal">captcha</div>')


def test_parse_bing_base64():
    target = "https://www.nice.org.uk/guidance/hs1"
    token = "a1" + base64.urlsafe_b64encode(target.encode()).decode().rstrip("=")
    html = f'<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&&p=1&u={token}&ntb=1">NICE HS</a></h2><div class="b_caption"><p>s</p></div></li>'
    assert web_search.parse_bing(html)[0]["url"] == target


def test_cascade_falls_back_and_cools_blocked_engine(monkeypatch):
    web_search.reset_cooldowns()
    calls: list[str] = []

    def fake_call(engine, query, *, cfg, brave_key):
        calls.append(engine)
        if engine == "yahoo":
            raise web_search.EngineBlocked("HTTP 500")
        return [{"url": "https://www.fda.gov/a", "title": "A", "snippet": ""}]

    monkeypatch.setattr(web_search, "_engine_call", fake_call)
    cfg = {**source_profile.DEFAULT_SEARCH, "engines": ["yahoo", "duckduckgo"]}
    first = web_search.search("site:fda.gov device", cfg=cfg)
    assert first["engine"] == "duckduckgo" and first["results"]
    assert "yahoo" in web_search.cooldown_status()
    calls.clear()
    web_search.search("site:fda.gov device", cfg=cfg)
    assert calls == ["duckduckgo"]
    web_search.reset_cooldowns()


def test_rule_queries_stay_in_domain():
    src = SimpleNamespace(url="https://www.fda.gov/devices", title="FDA", tech_types=["DM"], catalog_code="FP-RG-03")
    cfg = {**source_profile.DEFAULT_SEARCH, "max_queries": 3}
    queries = web_search.rule_queries(src, source_profile.normalize_profile({}), cfg)
    assert queries and all(q.startswith("site:fda.gov") for q in queries)
    assert len(queries) <= 3


def test_search_for_source_filters_foreign_domains(api, monkeypatch):
    web_search.reset_cooldowns()
    monkeypatch.setattr(web_search, "ai_queries", lambda *a, **k: [])
    monkeypatch.setattr(
        web_search,
        "search",
        lambda q, cfg, brave_key="": {
            "engine": "yahoo",
            "results": [
                {"url": "https://www.fda.gov/report.pdf", "title": "R", "snippet": ""},
                {"url": "https://otro-sitio.com/x", "title": "X", "snippet": ""},
                {"url": "https://www.fda.gov/news", "title": "N", "snippet": ""},
            ],
            "attempts": [{"engine": "yahoo", "status": "ok", "ms": 1, "detail": ""}],
        },
    )
    src = SimpleNamespace(url="https://www.fda.gov/", title="FDA", tech_types=["DM"], entry_urls=[], access_path="", scan_profile={})
    with api.db() as db:
        source_profile.save_search(db, {"pause_ms": 0, "max_queries": 1})
        out = web_search.search_for_source(db, src)
    urls = [r["url"] for r in out["results"]]
    assert "https://otro-sitio.com/x" not in urls
    assert urls[0].endswith(".pdf")
    assert out["query_origin"] == "reglas"


def test_search_off_in_profile_is_skipped(api):
    src = SimpleNamespace(url="https://www.fda.gov/", title="FDA", tech_types=[], entry_urls=[], access_path="", scan_profile={"web_search": False})
    with api.db() as db:
        out = web_search.search_for_source(db, src)
    assert out["results"] == [] and out["steps"][0]["status"] == "omitido"


# --------------------------------------------------------------------------- #
#  Recorrido guiado
# --------------------------------------------------------------------------- #
def _site(monkeypatch):
    from app import prompt_store, scraper

    prompt_store.configure_runtime(pause_ms=0, retries=0)
    page = lambda title, body: (200, "text/html", f"<html><head><title>{title}</title></head><body><article><p>{body}</p></article></body></html>", b"")  # noqa: E731
    pages = {
        "https://site.test/": (200, "text/html", """<html><body>
            <a href="/about-us-company-history">About our company and history</a>
            <a href="/cardiology/new-valve-trial">New valve trial in cardiology shows results</a>
            </body></html>""", b""),
        "https://site.test/pipeline": page("Pipeline", "Pipeline de dispositivos en fase II."),
        "https://site.test/cardiology/new-valve-trial": page("Valve", "Ensayo de valvula percutanea."),
        "https://site.test/about-us-company-history": page("About", "Historia."),
        "https://site.test/doc.pdf": page("Doc", "Documento de horizonte."),
    }
    visited: list[str] = []

    def fake_fetch(url, timeout=25.0):
        visited.append(url)
        return pages.get(url, (404, "text/html", "", b""))

    monkeypatch.setattr(scraper, "fetch_url", fake_fetch)
    return scraper, pages, visited


def test_crawl_site_visits_entry_urls_search_results_and_keyword_links(monkeypatch):
    scraper, pages, visited = _site(monkeypatch)
    crawl = scraper.crawl_site(
        "https://site.test/",
        html=pages["https://site.test/"][2],
        max_pages=1,
        entry_urls=["https://site.test/pipeline"],
        follow_keywords=["cardiology"],
        search_results=[{"url": "https://site.test/doc.pdf", "title": "Doc", "snippet": "horizonte"}],
        fetch_results=2,
    )
    roles = {p["url"]: p["role"] for p in crawl["pages"]}
    assert roles["https://site.test/pipeline"] == "entrada_matriz"
    assert roles["https://site.test/doc.pdf"] == "busqueda"
    assert roles.get("https://site.test/cardiology/new-valve-trial") == "ficha"
    assert "https://site.test/about-us-company-history" not in visited
    assert "Resultados de busqueda web" in crawl["combined"]


def test_crawl_site_without_follow_links(monkeypatch):
    scraper, pages, visited = _site(monkeypatch)
    crawl = scraper.crawl_site("https://site.test/", html=pages["https://site.test/"][2], follow_links=False)
    assert crawl["pages_visited"] == 1
    assert any(s["action"] == "enlaces" and s["status"] == "omitido" for s in crawl["steps"])


def test_scrape_source_uses_entry_url_fallback_and_profile(api, monkeypatch):
    from app import scraper
    from app.models import Source

    _scraper, pages, visited = _site(monkeypatch)
    pages["https://site.test/pipeline"] = (200, "text/html", pages["https://site.test/"][2], b"")
    calls = {}

    def fake_enrich(findings, **kw):
        calls.update(kw)
        return findings

    monkeypatch.setattr(scraper, "_enrich_with_ai", fake_enrich)
    sid = api.add_source(
        url="https://site.test/caida",
        connector="html",
        connector_config={},
        priority_level="alta",
        entry_urls=["https://site.test/pipeline"],
        scan_profile={"web_search": False, "ocr": False, "max_pages": 1},
    )
    with api.db() as db:
        src = db.get(Source, sid)
        log = scraper.scrape_source(db, src, triggered_by="test")
        assert log.status in {"ok", "parcial"}
    assert visited[0] == "https://site.test/caida"
    assert "https://site.test/pipeline" in visited
    assert calls["allow_ocr"] is False and calls["allow_ai"] is True
    assert calls["source_url"] == "https://site.test/pipeline"
    assert "Prioridad" in calls["source_context"] or "prioridad" in calls["source_context"].lower()


# --------------------------------------------------------------------------- #
#  API
# --------------------------------------------------------------------------- #
def test_source_options_endpoint_and_dropdown_validation(api):
    body = api.get("/api/sources/options", role="evaluador_tecnico").json()
    values = {o["value"] for o in body["options"]["priority_level"]}
    assert {"alta", "media", "baja", "revisar"} <= values
    sid = api.add_source(connector="html", connector_config={})
    assert api.put(f"/api/sources/{sid}", json={"priority_level": "altisima"}).status_code == 422
    assert api.put(f"/api/sources/{sid}", json={"tech_types": ["XX"]}).status_code == 422
    assert api.put(f"/api/sources/{sid}", json={"entry_urls": ["ftp://x"]}).status_code == 422
    ok = api.put(
        f"/api/sources/{sid}",
        json={
            "priority_level": "alta",
            "source_level": "primaria",
            "tech_types": ["dm", "IA", "DM"],
            "entry_urls": ["https://fuente.example.org/pipeline"],
            "scan_profile": {"ocr": False, "max_pages": 3},
        },
    )
    assert ok.status_code == 200
    out = ok.json()
    assert out["tech_types"] == ["DM", "IA"]
    assert out["scan_profile"]["ocr"] is False and out["scan_profile"]["max_pages"] == 3
    assert out["scan_profile"]["web_search"] is True
    listed = api.get("/api/sources?priority_level=alta&tech_type=IA").json()
    assert [s["id"] for s in listed] == [sid]
    assert api.put(f"/api/sources/{sid}", role="revisor_pares", json={"priority_level": "baja"}).status_code == 403


def test_config_source_options_and_web_search_rbac(api):
    assert api.get("/api/config/source-options", role="evaluador_tecnico").status_code == 403
    opts = api.get("/api/config/source-options").json()
    opts["priority_level"].append({"value": "urgente", "label": "Urgente", "rank": 1})
    assert api.put("/api/config/source-options", json=opts).status_code == 200
    assert "urgente" in {o["value"] for o in api.get("/api/sources/options").json()["options"]["priority_level"]}
    reset = api.post("/api/config/source-options/reset").json()
    assert "urgente" not in {o["value"] for o in reset["priority_level"]}

    cfg = api.get("/api/config/web-search").json()
    assert cfg["engines"] and cfg["terms_by_category"]
    assert api.put("/api/config/web-search", json={"max_queries": 99}).status_code == 422
    assert api.put("/api/config/web-search", json={"engines": []}).status_code == 422
    saved = api.put("/api/config/web-search", json={"max_queries": 2, "brave_api_key": "BSA-1234567890"}).json()
    assert saved["max_queries"] == 2 and saved["brave_api_key_set"] is True
    assert "1234567890" not in saved["brave_api_key_masked"]
    assert api.post("/api/config/web-search/reset").json()["max_queries"] == source_profile.DEFAULT_SEARCH["max_queries"]


def test_matrix_import_endpoint(api, monkeypatch):
    from app import catalog_service

    seen = {}

    def fake_import(db, parsed, *, overwrite, persist, triggered_by):
        seen.update(rows=len(parsed["rows"]), overwrite=overwrite, persist=persist)
        return {"rows": len(parsed["rows"]), "updated": 0, "created": 0, "unmatched": []}

    monkeypatch.setattr(catalog_service, "import_matrix", fake_import)
    assert api.post("/api/sources/matrix/import", role="revisor_pares").status_code == 403
    res = api.post("/api/sources/matrix/import", data={"overwrite": "false"})
    assert res.status_code == 200 and seen == {"rows": 89, "overwrite": False, "persist": False}
    bad = api.post("/api/sources/matrix/import", files={"file": ("x.txt", b"hola", "text/plain")})
    assert bad.status_code == 422
    if EXCEL.exists():
        up = api.post("/api/sources/matrix/import", files={"file": (EXCEL.name, EXCEL.read_bytes(), "application/vnd.ms-excel")})
        assert up.status_code == 200 and seen["persist"] is True and seen["rows"] == 89
