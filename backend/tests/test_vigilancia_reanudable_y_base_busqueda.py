"""Vigilancia que se reanuda sola y busqueda web que no depende de buscadores bloqueados.

Tres problemas reportados en el sistema desplegado (Render):

1. Una vigilancia quedo "en curso" durante dias: el servicio se reinicio, el
   trabajador regular no corre alli y nadie volvio a tomar la cola.
2. La busqueda web traia cero resultados y cada fuente perdia cerca de un minuto
   esperando a buscadores que bloquean las consultas hechas desde la nube.
3. La base de conocimiento de busqueda: paginas utiles de cada fuente que la
   vigilancia visita sin preguntar a un buscador, compartida por todos los ciclos.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from frente_b_support import api  # noqa: E402,F401  (fixture)

from app import (  # noqa: E402
    database,
    scraper,
    search_knowledge,
    sitemap_search,
    source_profile,
    web_search,
    worker,
)
from app.models import AuditLog, IngestJob, MethodologyParam, SearchKnowledge  # noqa: E402

SK = search_knowledge


def _src(url="https://www.fda.gov/", **kw):
    data = dict(id=None, url=url, title="FDA", tech_types=["DM"], entry_urls=[], access_path="", scan_profile={})
    data.update(kw)
    return SimpleNamespace(**data)


def _row(url, title="", **kw):
    return {"url": url, "title": title or url.rsplit("/", 1)[-1], "snippet": "", "query": "site:fda.gov x", "engine": "yahoo", **kw}


@pytest.fixture(autouse=True)
def _clean_engines():
    web_search.reset_cooldowns()
    yield
    web_search.reset_cooldowns()


# --------------------------------------------------------------------------- #
#  Base de conocimiento: guardar, servir, aprender
# --------------------------------------------------------------------------- #
def test_the_same_page_is_stored_once_whatever_the_scheme_www_or_trailing_slash(api):
    with api.db() as db:
        out = SK.remember(db, _src(), "fda.gov", [
            _row("https://www.fda.gov/news/a/"),
            _row("http://fda.gov/news/a"),
            _row("https://www.fda.gov/news/a#seccion"),
            _row("https://otro-sitio.com/x"),
            _row("javascript:void(0)"),
        ])
        assert out == {"added": 1, "refreshed": 0}
        assert db.query(SearchKnowledge).count() == 1
        again = SK.remember(db, _src(), "fda.gov", [_row("https://www.fda.gov/news/a")])
        assert again == {"added": 0, "refreshed": 1}


def test_pages_that_gave_signals_go_first_and_known_urls_are_left_out(api):
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [_row(f"https://www.fda.gov/p/{i}") for i in range(5)])
        good = db.query(SearchKnowledge).filter(SearchKnowledge.url.like("%/p/3")).one()
        good.signals, good.visits = 4, 1
        db.commit()
        pages = SK.pages_for(db, _src(), "fda.gov", limit=3, exclude={"https://www.fda.gov/p/0"})
    assert pages[0]["url"].endswith("/p/3") and pages[0]["engine"] == SK.ENGINE_LABEL
    assert len(pages) == 3 and all(not p["url"].endswith("/p/0") for p in pages)


def test_a_source_uses_its_own_pages_and_falls_back_to_the_ones_of_its_site(api):
    one = api.add_source(title="FDA dispositivos", url="https://www.fda.gov/devices")
    two = api.add_source(title="FDA medicamentos", url="https://www.fda.gov/drugs")
    with api.db() as db:
        SK.remember(db, _src(id=one), "fda.gov", [_row("https://www.fda.gov/devices/a")])
        assert [p["url"] for p in SK.pages_for(db, _src(id=one), "fda.gov")] == ["https://www.fda.gov/devices/a"]
        # La segunda fuente del mismo sitio no tiene paginas propias: usa las del dominio.
        assert [p["url"] for p in SK.pages_for(db, _src(id=two), "fda.gov")] == ["https://www.fda.gov/devices/a"]
        SK.remember(db, _src(id=two), "fda.gov", [_row("https://www.fda.gov/drugs/b")])
        assert [p["url"] for p in SK.pages_for(db, _src(id=two), "fda.gov")] == ["https://www.fda.gov/drugs/b"]


def test_a_page_without_signals_stops_being_visited_and_is_retried_later(api):
    page = {"url": "https://www.fda.gov/p/ruido", "text": "Pagina institucional sin tecnologias."}
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [_row(page["url"])])
        first = SK.record_visits(db, _src(), [page], [])
        assert first == {"visited": 1, "with_signals": 0, "silenced": 0}
        assert SK.pages_for(db, _src(), "fda.gov")  # una visita en blanco no basta
        second = SK.record_visits(db, _src(), [page], [])
        assert second["silenced"] == 1
        assert SK.pages_for(db, _src(), "fda.gov") == []
        # Pasado el plazo de reintento vuelve a ofrecerse, por si la fuente publico algo nuevo.
        row = db.query(SearchKnowledge).one()
        row.last_visit_at = datetime.now(timezone.utc) - timedelta(days=SK.RETRY_SILENT_DAYS + 1)
        db.commit()
        assert [p["url"] for p in SK.pages_for(db, _src(), "fda.gov")] == [page["url"]]


def test_a_signal_counts_for_the_page_by_url_or_by_title_and_reactivates_it(api):
    by_url = {"url": "https://www.fda.gov/drugs/zolgensma", "text": "Ficha del producto."}
    by_text = {"url": "https://www.fda.gov/news/lista", "text": "Aprobaciones: Lecanemab para Alzheimer temprano, y otras."}
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [_row(by_url["url"]), _row(by_text["url"])])
        for row in db.query(SearchKnowledge).all():
            row.status, row.visits = SK.STATUS_SILENT, 2
        db.commit()
        out = SK.record_visits(db, _src(), [by_url, by_text], [
            {"title": "Zolgensma", "url": "https://fda.gov/drugs/zolgensma/"},
            {"title": "Lecanemab para Alzheimer temprano", "url": "https://www.fda.gov/otra"},
            {"title": "Corta", "url": ""},
        ])
        assert out["with_signals"] == 2
        rows = {r.url: r for r in db.query(SearchKnowledge).all()}
    assert all(r.status == SK.STATUS_ACTIVE and r.signals == 1 and r.last_signal_at for r in rows.values())


def test_the_base_never_grows_past_the_cap_per_site(api, monkeypatch):
    monkeypatch.setattr(SK, "MAX_PER_DOMAIN", 3)
    with api.db() as db:
        out = SK.remember(db, _src(), "fda.gov", [_row(f"https://www.fda.gov/p/{i}") for i in range(10)])
        assert out["added"] == 3 and db.query(SearchKnowledge).count() == 3


# --------------------------------------------------------------------------- #
#  Paquete: exportar, cargar, sembrar el que viaja con el codigo
# --------------------------------------------------------------------------- #
def test_a_pack_only_adds_or_reinforces_and_never_lowers_what_the_server_learned(api):
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [_row("https://www.fda.gov/p/1"), _row("https://www.fda.gov/p/2")])
        mine = db.query(SearchKnowledge).filter(SearchKnowledge.url.like("%/p/1")).one()
        mine.signals, mine.visits = 9, 5
        silent = db.query(SearchKnowledge).filter(SearchKnowledge.url.like("%/p/2")).one()
        silent.status, silent.visits = SK.STATUS_SILENT, 2
        db.commit()
        out = SK.import_pack(db, {"pages": [
            {"domain": "fda.gov", "url": "https://www.fda.gov/p/1", "signals": 1, "visits": 1, "status": "sin_senal"},
            {"domain": "fda.gov", "url": "https://www.fda.gov/p/2", "signals": 3, "visits": 1},
            {"domain": "nice.org.uk", "url": "https://www.nice.org.uk/guidance/x", "title": "Guia", "signals": 2},
            {"domain": "nice.org.uk", "url": "https://sitio-ajeno.com/x"},
            "basura",
        ]})
        assert (out["added"], out["updated"], out["skipped"], out["total"]) == (1, 2, 2, 3)
        rows = {r.url.rsplit("/", 1)[-1]: r for r in db.query(SearchKnowledge).all()}
    assert (rows["1"].signals, rows["1"].visits, rows["1"].status) == (9, 5, SK.STATUS_ACTIVE)
    # Evidencia a favor: la pagina que aqui estaba en pausa vuelve a estar activa.
    assert (rows["2"].signals, rows["2"].status) == (3, SK.STATUS_ACTIVE)
    assert rows["x"].origin == SK.ORIGIN_PACK and rows["x"].signals == 2


def test_export_and_import_round_trip_keeps_pages_and_counts(api):
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [_row("https://www.fda.gov/p/1", title="Uno")])
        row = db.query(SearchKnowledge).one()
        row.signals, row.visits = 4, 2
        db.commit()
        pack = SK.export_pack(db)
        db.query(SearchKnowledge).delete()
        db.commit()
        SK.import_pack(db, json.loads(json.dumps(pack)))
        back = db.query(SearchKnowledge).one()
        assert (back.url, back.title, back.signals, back.visits) == ("https://www.fda.gov/p/1", "Uno", 4, 2)
        # El paquete lleva tambien los sitios buscados sin resultados: no se vuelven a buscar.
        SK.clear_searched(db)
        SK.import_pack(db, {**pack, "searched_domains": ["sin-paginas.example.org", 7, ""]})
        assert SK.searched_recently(db, "sin-paginas.example.org", 30) and SK.searched_recently(db, "fda.gov", 30)
        assert "sin-paginas.example.org" in SK.export_pack(db)["searched_domains"]
    with pytest.raises(ValueError):
        with api.db() as db:
            SK.import_pack(db, {"paginas": []})


def test_the_packaged_base_is_loaded_once_per_version_of_the_file(api, tmp_path):
    pack = tmp_path / "base.json"
    pack.write_text(json.dumps({"version": 1, "pages": [{"domain": "fda.gov", "url": "https://www.fda.gov/p/1"}]}), "utf-8")
    with api.db() as db:
        assert SK.seed_from_package(db, tmp_path / "no_existe.json") == {"status": "sin_paquete"}
        assert SK.seed_from_package(db, pack)["status"] == "cargado"
        db.query(SearchKnowledge).delete()  # el equipo la depuro: el arranque no la vuelve a traer
        db.commit()
        assert SK.seed_from_package(db, pack) == {"status": "vigente"}
        assert db.query(SearchKnowledge).count() == 0
        pack.write_text(json.dumps({"version": 1, "pages": [{"domain": "fda.gov", "url": "https://www.fda.gov/p/2"}]}), "utf-8")
        assert SK.seed_from_package(db, pack)["added"] == 1
        pack.write_text("esto no es json", "utf-8")
        assert SK.seed_from_package(db, pack)["status"] == "error"
        assert db.query(SearchKnowledge).count() == 1


def test_the_pack_shipped_with_the_code_is_valid_and_stays_inside_each_domain():
    if not SK.PACK_FILE.exists():
        pytest.skip("sin paquete en el repositorio")
    pack = json.loads(SK.PACK_FILE.read_text("utf-8"))
    assert pack["version"] == SK.PACK_VERSION and pack["pages"]
    seen = set()
    for item in pack["pages"]:
        assert SK.canonical_url(item["url"]), item
        assert SK.in_domain(item["url"], item["domain"]), item
        assert SK.url_hash(item["url"]) not in seen, item["url"]
        seen.add(SK.url_hash(item["url"]))


# --------------------------------------------------------------------------- #
#  Busqueda por fuente: la base primero, sin esperar a buscadores bloqueados
# --------------------------------------------------------------------------- #
def _no_engine(*a, **k):
    raise AssertionError("no debia consultarse ningun buscador")


def test_with_recent_pages_in_the_base_no_engine_and_no_ai_are_called(api, monkeypatch):
    monkeypatch.setattr(web_search, "search", _no_engine)
    monkeypatch.setattr(web_search, "ai_queries", _no_engine)
    monkeypatch.setattr(sitemap_search, "discover", _no_engine)
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [_row(f"https://www.fda.gov/p/{i}") for i in range(4)])
        SK.mark_searched(db, "fda.gov")
        out = web_search.search_for_source(db, _src())
    assert len(out["results"]) == 4 and out["from_knowledge"] == 4 and out["live"] is False
    assert all(r["engine"] == SK.ENGINE_LABEL for r in out["results"])
    assert any("base de conocimiento" in st["detail"] for st in out["steps"])


def test_blocked_engines_cost_no_time_the_base_answers_and_the_ai_is_not_asked(api, monkeypatch):
    for engine in source_profile.DEFAULT_SEARCH["engines"]:
        web_search._cool(engine, 20)
    monkeypatch.setattr(web_search, "search", _no_engine)
    monkeypatch.setattr(web_search, "ai_queries", _no_engine)
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [_row("https://www.fda.gov/p/1")])
        source_profile.save_search(db, {"sitemap_fallback": False})
        out = web_search.search_for_source(db, _src())
        # Nadie contesto: el dominio NO queda como buscado y se reintenta en la proxima corrida.
        assert SK.searched_recently(db, "fda.gov", 30) is False
    assert [r["url"] for r in out["results"]] == ["https://www.fda.gov/p/1"]
    assert any("en pausa" in st["detail"] for st in out["steps"])


def test_a_domain_is_searched_once_per_period_and_again_when_the_engines_change(api, monkeypatch):
    calls: list[str] = []

    def fake(q, cfg, brave_key="", domain=""):
        calls.append(q)
        return {"engine": "yahoo", "results": [], "attempts": [{"engine": "yahoo", "status": "sin_resultados", "ms": 1, "detail": ""}]}

    monkeypatch.setattr(web_search, "search", fake)
    monkeypatch.setattr(web_search, "ai_queries", lambda *a, **k: [])
    with api.db() as db:
        source_profile.save_search(db, {"pause_ms": 0, "max_queries": 1})
        web_search.search_for_source(db, _src())
        assert len(calls) == 1 and SK.searched_recently(db, "fda.gov", 30)
        out = web_search.search_for_source(db, _src())  # ya se busco: ni buscadores ni mapa
        assert len(calls) == 1 and out["live"] is False
        assert any("ya se buscó hace poco" in st["detail"] for st in out["steps"])
        assert SK.searched_recently(db, "fda.gov", 30) and not SK.searched_recently(db, "nice.org.uk", 30)
    # Cambiar los motores (o pegar una llave) hace que se vuelva a buscar de inmediato.
    assert api.put("/api/config/web-search", json={"engines": ["bing"]}).status_code == 200
    with api.db() as db:
        assert SK.searched_recently(db, "fda.gov", 30) is False
        web_search.search_for_source(db, _src())
    assert len(calls) == 2
    with api.db() as db:
        SK.import_pack(db, {"pages": [{"domain": "nice.org.uk", "url": "https://www.nice.org.uk/guidance/x"}]})
        assert SK.searched_recently(db, "nice.org.uk", 30)  # el paquete ya es una busqueda hecha


def test_without_engines_and_without_base_the_site_map_finds_pages_and_they_are_kept(api, monkeypatch):
    for engine in source_profile.DEFAULT_SEARCH["engines"]:
        web_search._cool(engine, 20)
    asked = {}

    def fake_discover(domain, words, **kw):
        asked.update(domain=domain, words=words, limit=kw.get("limit"))
        return {"results": [
            {"url": "https://www.fda.gov/drugs/novel-drug-approvals-2026", "title": "Novel drug approvals 2026", "snippet": "Mapa del sitio"},
            {"url": "https://otro-sitio.com/x", "title": "Ajena", "snippet": ""},
        ], "detail": "1 mapa(s) leídos", "ms": 12}

    monkeypatch.setattr(sitemap_search, "discover", fake_discover)
    with api.db() as db:
        out = web_search.search_for_source(db, _src())
        assert [r["url"] for r in out["results"]] == ["https://www.fda.gov/drugs/novel-drug-approvals-2026"]
        assert out["results"][0]["engine"] == "sitemap"
        assert asked["domain"] == "fda.gov" and asked["words"] and asked["limit"] == 6
        kept = db.query(SearchKnowledge).one()
        assert kept.engine == "sitemap" and kept.domain == "fda.gov"
        # La corrida siguiente ya no necesita ni el mapa: la base esta fresca... si alcanza.
        monkeypatch.setattr(sitemap_search, "discover", lambda *a, **k: {"results": [], "detail": "", "ms": 0})
        again = web_search.search_for_source(db, _src())
    assert again["from_knowledge"] == 1


def test_live_results_are_remembered_and_the_site_map_can_be_switched_off(api, monkeypatch):
    monkeypatch.setattr(web_search, "ai_queries", lambda *a, **k: [])
    monkeypatch.setattr(sitemap_search, "discover", _no_engine)
    monkeypatch.setattr(
        web_search, "search",
        lambda q, cfg, brave_key="", domain="": {
            "engine": "brave_api",
            "results": [{"url": "https://www.fda.gov/news/gene-therapy", "title": "Gene therapy", "snippet": "s"}],
            "attempts": [{"engine": "brave_api", "status": "ok", "ms": 1, "detail": ""}],
        },
    )
    with api.db() as db:
        source_profile.save_search(db, {"pause_ms": 0, "max_queries": 1, "sitemap_fallback": False})
        out = web_search.search_for_source(db, _src())
        assert out["live"] is True and out["from_knowledge"] == 0
        assert db.query(SearchKnowledge).one().engine == "brave_api"
        source_profile.save_search(db, {"knowledge_enabled": False})
        db.query(SearchKnowledge).delete()
        db.commit()
        web_search.search_for_source(db, _src())
        assert db.query(SearchKnowledge).count() == 0  # apagada: ni se consulta ni se llena


def test_once_every_engine_is_blocked_the_remaining_queries_are_skipped(api, monkeypatch):
    calls: list[str] = []

    def blocked(engine, query, *, cfg, brave_key):
        calls.append(engine)
        raise web_search.EngineBlocked("HTTP 429")

    monkeypatch.setattr(web_search, "_engine_call", blocked)
    monkeypatch.setattr(web_search, "ai_queries", lambda *a, **k: [])
    with api.db() as db:
        source_profile.save_search(db, {"pause_ms": 0, "max_queries": 4, "engines": ["yahoo", "bing"]})
        out = web_search.search_for_source(db, _src())
    # Una sola pasada por los motores: la consulta 2, 3 y 4 no vuelven a intentarlo.
    assert calls == ["yahoo", "bing"]
    assert any(st["status"] == "omitido" and "restantes" in st["detail"] for st in out["steps"])


def test_two_network_failures_in_a_row_pause_the_engine(monkeypatch):
    calls: list[str] = []

    def hang(engine, query, *, cfg, brave_key):
        calls.append(engine)
        raise httpx.ReadTimeout("agotado")

    monkeypatch.setattr(web_search, "_engine_call", hang)
    cfg = {**source_profile.DEFAULT_SEARCH, "engines": ["yahoo"]}
    web_search.search("site:fda.gov a", cfg=cfg)
    assert "yahoo" not in web_search.cooldown_status()
    web_search.search("site:fda.gov b", cfg=cfg)
    assert "yahoo" in web_search.cooldown_status()
    web_search.search("site:fda.gov c", cfg=cfg)
    assert calls == ["yahoo", "yahoo"]  # la tercera ya no espera el tiempo maximo


def test_an_engine_blocked_again_and_again_gets_a_long_pause():
    for _ in range(web_search.LONG_COOLDOWN_STRIKES):
        web_search._cool("yahoo", 20)
    assert web_search.cooldown_status()["yahoo"] <= 20 * 60
    web_search._cool("yahoo", 20)
    assert web_search.cooldown_status()["yahoo"] > (web_search.LONG_COOLDOWN_MINUTES - 1) * 60
    cfg = {**source_profile.DEFAULT_SEARCH, "engines": ["yahoo", "brave_api", "searxng"]}
    assert web_search.available_engines(cfg, "") == []          # sin llave ni URL no cuentan
    assert web_search.available_engines(cfg, "llave") == ["brave_api"]
    web_search._clear_strikes("yahoo")
    web_search.reset_cooldowns()
    assert web_search.available_engines(cfg, "") == ["yahoo"]


# --------------------------------------------------------------------------- #
#  Mapa del sitio
# --------------------------------------------------------------------------- #
def _site(pages: dict[str, str]):
    def fake_get(client, url):
        return pages.get(url, "")

    return fake_get


def test_the_site_map_is_read_through_robots_and_ranked_by_terms_and_recency(monkeypatch):
    today = datetime.now(timezone.utc).date()
    fresh = (today - timedelta(days=30)).isoformat()
    old = (today - timedelta(days=2000)).isoformat()
    index = f"""<sitemapindex>
      <sitemap><loc>https://www.demo.org/sitemap-news.xml</loc><lastmod>{fresh}</lastmod></sitemap>
      <sitemap><loc>https://www.demo.org/sitemap-horizon.xml</loc></sitemap></sitemapindex>"""
    horizon = f"""<urlset>
      <url><loc>https://www.demo.org/horizon-scanning/gene-therapy-report</loc><lastmod>{fresh}</lastmod></url>
      <url><loc>https://www.demo.org/horizon-scanning/old-gene-therapy</loc><lastmod>{old}</lastmod></url>
      <url><loc>https://www.demo.org/horizon-scanning/logo.png</loc></url>
      <url><loc>https://www.demo.org/careers/gene-therapy-jobs</loc></url>
      <url><loc><![CDATA[https://www.demo.org/reports/emerging-devices?id=1&amp;y=2]]></loc></url></urlset>"""
    news = "<urlset><url><loc>https://www.demo.org/about-us</loc></url></urlset>"
    monkeypatch.setattr(sitemap_search, "_get", _site({
        "https://www.demo.org/robots.txt": "User-agent: *\nSitemap: https://www.demo.org/sitemap_index.xml\n",
        "https://www.demo.org/sitemap_index.xml": index,
        "https://www.demo.org/sitemap-horizon.xml": horizon,
        "https://www.demo.org/sitemap-news.xml": news,
    }))
    words = sitemap_search.query_words(["site:demo.org gene therapy filetype:pdf"], ["Horizon"])
    assert words == ["gene", "therapy", "horizon"]
    out = sitemap_search.discover("demo.org", words, limit=5, base_url="https://www.demo.org/inicio")
    urls = [r["url"] for r in out["results"]]
    assert urls[0] == "https://www.demo.org/horizon-scanning/gene-therapy-report"
    assert "https://www.demo.org/horizon-scanning/old-gene-therapy" in urls
    assert "https://www.demo.org/reports/emerging-devices?id=1&y=2" in urls
    assert not any("logo.png" in u or "careers" in u or "about-us" in u for u in urls)
    assert out["results"][0]["title"] == "Gene therapy report" and fresh in out["results"][0]["snippet"]


def test_a_site_without_a_map_returns_nothing_and_says_so(monkeypatch):
    monkeypatch.setattr(sitemap_search, "_get", _site({}))
    out = sitemap_search.discover("demo.org", ["pipeline"], limit=5)
    assert out["results"] == [] and "no publica mapa" in out["detail"]
    assert sitemap_search.discover("", ["pipeline"])["results"] == []
    assert sitemap_search.discover("demo.org", [])["results"] == []


# --------------------------------------------------------------------------- #
#  El rastreador anota si cada pagina de busqueda aporto
# --------------------------------------------------------------------------- #
def test_the_crawl_records_which_search_pages_gave_signals_and_which_are_gone(api):
    sid = api.add_source(title="FDA", url="https://www.fda.gov/")
    with api.db() as db:
        source = db.get(scraper.Source, sid)
        SK.remember(db, source, "fda.gov", [
            _row("https://www.fda.gov/p/buena"), _row("https://www.fda.gov/p/vacia"), _row("https://www.fda.gov/p/borrada"),
        ])
        crawl = {
            "pages": [
                {"url": "https://www.fda.gov/", "role": "entrada", "text": "Lecanemab aprobado"},
                {"url": "https://www.fda.gov/p/buena", "role": "busqueda", "text": "Lecanemab aprobado para Alzheimer"},
                {"url": "https://www.fda.gov/p/vacia", "role": "busqueda", "text": "Nada que ver"},
            ],
            "steps": [{"action": "busqueda", "url": "https://www.fda.gov/p/borrada", "status": "http_404"}],
        }
        scraper._note_search_pages(db, source, crawl, [{"title": "Lecanemab aprobado", "url": "https://www.fda.gov/x"}])
        db.commit()
        rows = {r.url.rsplit("/", 1)[-1]: r for r in db.query(SearchKnowledge).all()}
        assert (rows["buena"].visits, rows["buena"].signals) == (1, 1)
        assert (rows["vacia"].visits, rows["vacia"].signals) == (1, 0)
        assert (rows["borrada"].visits, rows["borrada"].signals) == (1, 0)
        scraper._note_search_pages(db, source, None, [])  # sin recorrido: no hace nada
        scraper._note_search_pages(db, source, {"pages": []}, [])


# --------------------------------------------------------------------------- #
#  Vigilante de la cola: la vigilancia se reanuda sola
# --------------------------------------------------------------------------- #
def _job(db, sid, **kw):
    data = {"source_id": sid, "connector": "html", "status": "pendiente", "attempts": 0, "max_attempts": 3}
    data.update(kw)
    job = IngestJob(**data)
    db.add(job)
    db.commit()
    return job


@pytest.fixture()
def queue(api, monkeypatch):
    monkeypatch.setattr(database, "SessionLocal", api.Session)
    monkeypatch.setattr(worker, "SessionLocal", api.Session)
    kicks: list[str] = []
    monkeypatch.setattr(worker, "kick", lambda: kicks.append("kick"))
    monkeypatch.setattr(worker, "draining", lambda: False)
    monkeypatch.setattr(worker, "is_running", lambda: False)
    api.kicks_seen = kicks
    return api


def test_pending_work_that_nobody_attends_is_resumed(queue):
    sid = queue.add_source(connector="html", connector_config={})
    assert worker.guardian_tick() == "" and queue.kicks_seen == []  # cola vacia: nada que hacer
    with queue.db() as db:
        _job(db, sid, scheduled_for=datetime.now(timezone.utc) - timedelta(hours=186))
    assert worker.guardian_tick() == "reanudada"
    assert queue.kicks_seen == ["kick"]


def test_a_job_left_running_by_a_dead_process_goes_back_to_the_queue(queue):
    sid = queue.add_source(connector="html", connector_config={})
    with queue.db() as db:
        db.get(MethodologyParam, "ingest.job_timeout_minutes").value = "20"
        db.commit()
        _job(db, sid, status="ejecutando", attempts=1, started_at=datetime.now(timezone.utc) - timedelta(hours=186))
    assert worker.guardian_tick() == "reanudada"
    with queue.db() as db:
        job = db.query(IngestJob).one()
        assert job.status == "pendiente" and "Interrumpido" in job.message


def test_the_guardian_does_not_touch_a_run_that_is_being_attended(queue, monkeypatch):
    sid = queue.add_source(connector="html", connector_config={})
    with queue.db() as db:
        _job(db, sid, status="ejecutando", attempts=1, started_at=datetime.now(timezone.utc) - timedelta(minutes=3))
    # Dentro de su tiempo maximo: sigue corriendo, no es huerfano.
    assert worker.guardian_tick() == "" and queue.kicks_seen == []
    with queue.db() as db:
        _job(db, sid, scheduled_for=datetime.now(timezone.utc))
    monkeypatch.setattr(worker, "draining", lambda: True)
    assert worker.guardian_tick() == "" and queue.kicks_seen == []
    monkeypatch.setattr(worker, "draining", lambda: False)
    monkeypatch.setattr(worker, "is_running", lambda: True)
    assert worker.guardian_tick() == "" and queue.kicks_seen == []


def test_the_guardian_runs_where_this_process_is_the_only_one_that_can_drain(monkeypatch):
    assert worker.guardian_enabled() is False  # nunca dentro de las pruebas
    monkeypatch.setattr(worker.sys, "modules", {k: v for k, v in sys.modules.items() if k != "pytest"})
    monkeypatch.delenv("INGEST_GUARDIAN", raising=False)
    monkeypatch.setattr(worker, "IS_SQLITE", True)
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    assert worker.guardian_enabled() is True          # Render: SQLite y un proceso
    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    assert worker.guardian_enabled() is False
    monkeypatch.setattr(worker, "IS_SQLITE", False)
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    assert worker.guardian_enabled() is False         # PostgreSQL: la cola es del servicio worker
    monkeypatch.setenv("INGEST_GUARDIAN", "true")
    assert worker.guardian_enabled() is True
    monkeypatch.setattr(worker, "IS_SQLITE", True)
    monkeypatch.setenv("INGEST_GUARDIAN", "false")
    assert worker.guardian_enabled() is False


def test_the_drain_itself_requeues_orphans_when_there_is_no_regular_worker(queue, monkeypatch):
    sid = queue.add_source(connector="html", connector_config={})
    with queue.db() as db:
        _job(db, sid, status="ejecutando", attempts=1, started_at=datetime.now(timezone.utc) - timedelta(hours=5))
    monkeypatch.undo()
    monkeypatch.setattr(database, "SessionLocal", queue.Session)
    monkeypatch.setattr(worker, "SessionLocal", queue.Session)
    ran: list[int] = []

    def lanes(n):
        with queue.db() as db:
            pending = db.query(IngestJob).filter(IngestJob.status == "pendiente").all()
            for job in pending:
                job.status = "ok"
                ran.append(job.id)
            db.commit()
            return len(pending)

    monkeypatch.setattr(worker, "_run_lanes", lanes)
    from app import firebase_db

    monkeypatch.setattr(firebase_db, "push_soon", lambda *a, **k: None, raising=False)
    worker.drain(wait_retries=True, max_seconds=20)
    assert len(ran) == 1
    with queue.db() as db:
        assert db.query(IngestJob).one().status == "ok"


# --------------------------------------------------------------------------- #
#  API
# --------------------------------------------------------------------------- #
def test_every_profile_can_query_the_base_and_only_config_admins_change_it(api):
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [
            _row("https://www.fda.gov/p/gene-therapy", title="Terapia génica aprobada"),
            _row("https://www.fda.gov/p/device", title="Dispositivo cardiaco"),
        ])
    body = api.get("/api/search-knowledge", role="evaluador_tecnico", params={"q": "terapia genica"}).json()
    assert body["stats"]["pages"] == 2 and [i["title"] for i in body["items"]] == ["Terapia génica aprobada"]
    assert api.get("/api/search-knowledge/coverage", role="evaluador_tecnico").status_code == 200
    assert api.get("/api/search-knowledge/export", role="evaluador_tecnico").status_code == 403
    assert api.post("/api/search-knowledge/import", role="evaluador_tecnico", json={"pages": []}).status_code == 403

    exported = api.get("/api/search-knowledge/export")
    assert exported.status_code == 200 and "base_busqueda_eh.json" in exported.headers["content-disposition"]
    pack = exported.json()
    assert len(pack["pages"]) == 2
    pack["pages"].append({"domain": "nice.org.uk", "url": "https://www.nice.org.uk/guidance/mib1", "title": "MIB"})
    out = api.post("/api/search-knowledge/import", json=pack).json()
    assert (out["added"], out["updated"]) == (1, 2) and out["stats"]["pages"] == 3
    assert api.post("/api/search-knowledge/import", json={"otra": "cosa"}).status_code == 422
    with api.db() as db:
        assert db.query(AuditLog).filter(AuditLog.action == "search_knowledge:import").count() == 1


def test_coverage_counts_the_active_sources_that_have_known_pages(api):
    api.add_source(title="FDA", url="https://www.fda.gov/devices")
    api.add_source(title="NICE", url="https://www.nice.org.uk/")
    with api.db() as db:
        SK.remember(db, _src(), "fda.gov", [_row("https://www.fda.gov/p/1")])
    body = api.get("/api/search-knowledge/coverage").json()
    assert (body["total"], body["covered"]) == (2, 1)
    assert {r["title"]: r["pages"] for r in body["sources"]} == {"FDA": 1, "NICE": 0}


def test_the_progress_and_the_report_say_who_attends_the_queue_and_where_search_came_from(api):
    progress = api.get("/api/ingest/progress").json()
    assert progress["guardian_running"] is False and "worker_running" in progress
    health = api.get("/api/ingest/access-report").json()["search_health"]
    assert health["knowledge"]["pages"] == 0 and health["sources_from_knowledge"] == 0
