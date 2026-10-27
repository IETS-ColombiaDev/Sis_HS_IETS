"""Deteccion de fuentes con IA y prioridad sugerida por senales (OBS-001).

Nada sale a internet ni llama a un proveedor de IA: buscador, IA y verificacion
de alcance se sustituyen con monkeypatch.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from frente_b_support import api  # noqa: F401  (fixture)

from app import ai_service, source_discovery, web_search
from app import source_signal_priority as ssp
from app.models import AuditLog, Cycle, CycleTechnology, Finding, Source, Technology


@pytest.fixture(autouse=True)
def _offline(monkeypatch):
    source_discovery.discovery_limiter.reset()
    monkeypatch.setattr(source_discovery, "check_reachable", lambda url: {"ok": True, "status": 200, "detail": "HTTP 200"})
    monkeypatch.setattr(source_discovery.time, "sleep", lambda s: None)
    yield
    source_discovery.discovery_limiter.reset()


def _fake_search(rows):
    def search(query, *, cfg, brave_key=""):
        return {"engine": "fake", "results": rows, "attempts": [{"engine": "fake", "status": "ok", "ms": 1, "detail": ""}]}

    return search


SEARCH_ROWS = [
    {"url": "https://clinicaltrials.gov/study/NCT1", "title": "ClinicalTrials.gov", "snippet": "registry"},
    {"url": "https://www.anvisa.gov.br/medicamentos/novos", "title": "Novos medicamentos | Anvisa", "snippet": "agência regulatória aprovação"},
    {"url": "https://news.example-pharma.com/pipeline", "title": "Pipeline | Example Pharma", "snippet": "our pipeline"},
    {"url": "https://es.wikipedia.org/wiki/Terapia_genica", "title": "Terapia génica", "snippet": "enciclopedia"},
    {"url": "https://www.local-hta.org/", "title": "Agencia local HTA", "snippet": "health technology assessment"},
]


# --------------------------------------------------------------------------- #
#  Deteccion
# --------------------------------------------------------------------------- #
def test_match_existing_rules():
    index = {"urls": [
        ("news.medtronic.com", "", 1, "Medtronic"),
        ("gov.uk", "/government/organisations/mhra", 2, "MHRA"),
        ("fda.gov", "", 3, "FDA"),
    ], "names": {"ema": (4, "EMA")}}
    assert source_discovery.match_existing(index, "https://www.medtronic.com/")["source_id"] == 1
    assert source_discovery.match_existing(index, "https://accessdata.fda.gov/x")["source_id"] == 3
    assert source_discovery.match_existing(index, "https://www.gov.uk/government/organisations/mhra/news")["source_id"] == 2
    assert source_discovery.match_existing(index, "https://www.gov.uk/government/organisations/nice") is None
    assert source_discovery.match_existing(index, "https://otra.org", "EMA")["reason"] == "nombre"
    assert source_discovery.match_existing(index, "https://nueva.org", "Nueva") is None


def test_discovery_filters_catalog_domains_without_ai(api, monkeypatch):
    monkeypatch.setattr(ai_service, "is_enabled", lambda: False)
    monkeypatch.setattr(web_search, "search", _fake_search(SEARCH_ROWS))
    api.add_source(title="Example Pharma", url="https://www.example-pharma.com")

    res = api.post("/api/sources/discover", json={"tech_types": ["MED"], "focus": "terapias génicas", "region": "Brasil"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ai_used"] is False and body["ai_calls"] == 0
    assert "IA no disponible" in body["message"]
    urls = [c["url"] for c in body["candidates"]]
    # clinicaltrials.gov esta en el catalogo empaquetado; example-pharma, en la base (subdominio).
    assert "https://www.anvisa.gov.br/" in urls and "https://www.local-hta.org/" in urls
    assert not any("clinicaltrials" in u or "example-pharma" in u or "wikipedia" in u for u in urls)
    existing = {e["source_title"] for e in body["already_in_catalog"]}
    assert "Example Pharma" in existing
    anvisa = next(c for c in body["candidates"] if "anvisa" in c["url"])
    assert anvisa["category"] == "Agencias regulatorias" and anvisa["country"] == "Brasil"
    assert anvisa["tech_types"] == ["MED"] and anvisa["access_level"] in "ABCDE"
    assert len(body["queries"]) <= source_discovery.MAX_QUERIES
    with api.db() as db:
        assert db.query(AuditLog).filter(AuditLog.action == "ai_source_discovery").count() == 1


def test_discovery_uses_ai_but_dedup_is_deterministic(api, monkeypatch):
    calls = []

    def fake_generate(prompt, **kw):
        calls.append(prompt)
        if len(calls) == 1:
            return '["horizon scanning gene therapy"]', "fake"
        return (
            '<think>x</think>[{"name": "ClinicalTrials.gov", "url": "https://clinicaltrials.gov", "category": "Registros de ensayos clinicos",'
            ' "tech_types": ["MED"], "access_level": "A", "source_level": "primaria", "justification": "dup", "origin": "ia"},'
            ' {"name": "Agencia local HTA", "url": "https://www.local-hta.org/", "country": "Chile",'
            ' "category": "Agencias de HTA y redes de EH", "tech_types": ["MED", "XX"], "access_level": "z",'
            ' "source_level": "terciaria", "justification": "Publica alertas tempranas.", "origin": "busqueda"}]'
        ), "fake"

    monkeypatch.setattr(ai_service, "is_enabled", lambda: True)
    monkeypatch.setattr(ai_service, "generate", fake_generate)
    monkeypatch.setattr(web_search, "search", _fake_search(SEARCH_ROWS))
    body = api.post("/api/sources/discover", json={"focus": "terapia génica"}).json()
    assert body["ai_used"] is True and body["ai_calls"] == 2 and body["query_origin"] == "ia"
    assert [c["name"] for c in body["candidates"]] == ["Agencia local HTA"]
    cand = body["candidates"][0]
    assert cand["tech_types"] == ["MED"] and cand["access_level"] == "D" and cand["country"] == "Chile"


def test_discovery_drops_unreachable_and_never_crashes(api, monkeypatch):
    monkeypatch.setattr(ai_service, "is_enabled", lambda: True)
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: ("[Error: sin cuota]", "fake"))
    monkeypatch.setattr(web_search, "search", _fake_search(SEARCH_ROWS))
    monkeypatch.setattr(
        source_discovery,
        "check_reachable",
        lambda url: {"ok": "anvisa" in url, "status": 0, "detail": "Sin conexión"},
    )
    body = api.post("/api/sources/discover", json={}).json()
    assert body["ai_used"] is False and "reglas" in body["message"]
    assert [c["url"] for c in body["candidates"]] == ["https://www.anvisa.gov.br/"]
    assert any("local-hta" in d["url"] for d in body["discarded"])


def test_discovery_requires_source_write_and_is_rate_limited(api, monkeypatch):
    monkeypatch.setattr(ai_service, "is_enabled", lambda: False)
    monkeypatch.setattr(web_search, "search", _fake_search([]))
    assert api.post("/api/sources/discover", role="tomador_decisiones", json={}).status_code == 403
    for _ in range(source_discovery.discovery_limiter.max_events):
        assert api.post("/api/sources/discover", json={}).status_code == 200
    assert api.post("/api/sources/discover", json={}).status_code == 429


def test_accept_discovered_source_marks_it_and_blocks_domain_duplicates(api):
    payload = {
        "name": "Agencia local HTA",
        "url": "https://www.local-hta.org/",
        "country": "Chile",
        "category": "Agencias de HTA y redes de EH",
        "tech_types": ["MED", "DM"],
        "access_level": "C",
        "source_level": "terciaria",
        "justification": "Publica alertas tempranas de tecnologías.",
        "entry_url": "https://www.local-hta.org/alertas",
    }
    res = api.post("/api/sources/discover/accept", json=payload)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["catalog_note"].startswith("Propuesta por IA")
    assert body["tags"] == "propuesta_ia" and body["verification_status"] == "agregada_localmente"
    assert body["priority_level"] == "revisar" and body["scrape_enabled"] is False
    assert body["tech_types"] == ["MED", "DM"] and body["access_level"] == "C"
    assert body["entry_urls"] == ["https://www.local-hta.org/alertas"]
    # Mismo dominio con otra ruta: duplicado por dominio, no solo por URL exacta.
    dup = api.post("/api/sources/discover/accept", json={**payload, "url": "https://local-hta.org/otra"})
    assert dup.status_code == 409 and "dominio" in dup.json()["detail"]
    catalog_dup = api.post("/api/sources/discover/accept", json={**payload, "name": "X", "url": "https://clinicaltrials.gov/"})
    assert catalog_dup.status_code == 409
    with api.db() as db:
        assert db.query(AuditLog).filter(AuditLog.action == "ai_source_accepted").count() == 1


# --------------------------------------------------------------------------- #
#  Prioridad sugerida
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("stats", "level"),
    [
        ({"signals": 0}, ""),
        ({"signals": 3, "prioritized": 1}, "alta"),
        ({"signals": 3, "in_cycle": 2}, "alta"),
        ({"signals": 9, "high_score": 5}, "alta"),
        ({"signals": 3, "in_cycle": 1}, "media"),
        ({"signals": 3, "high_score": 1}, "media"),
        ({"signals": 3, "avg_score": 45}, "media"),
        ({"signals": 3, "avg_score": 20}, "baja"),
    ],
)
def test_suggested_priority_rule(stats, level):
    assert ssp.classify(stats)[0] == level


def _seed_signals(api):
    rich = api.add_source(title="Rica", url="https://rica.example.org", priority_level="baja")
    weak = api.add_source(title="Debil", url="https://debil.example.org", priority_level="alta")
    quiet = api.add_source(title="Callada", url="https://callada.example.org")
    old_only = api.add_source(title="Antigua", url="https://antigua.example.org")
    now = datetime.now(timezone.utc)
    with api.db() as db:
        cycle = Cycle(code="C-test", year=2026, opened_on=date.today(), data_cutoff_on=date.today())
        db.add(cycle)
        db.flush()
        f1 = Finding(source_id=rich, title="A", content_hash="a", screening_score=80)
        db.add_all([f1, Finding(source_id=rich, title="B", content_hash="b", screening_score=30)])
        db.add(Finding(source_id=weak, title="C", content_hash="c", screening_score=10))
        db.add(Finding(source_id=old_only, title="D", content_hash="d", screening_score=95, created_at=now - timedelta(days=800)))
        db.flush()
        # Tecnologia sin source_id: se atribuye por su senal de origen.
        tech = Technology(commercial_name="T1", finding_id=f1.id)
        db.add(tech)
        db.flush()
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status="priorizada"))
        db.commit()
    return rich, weak, quiet, old_only


def test_priority_suggestions_endpoint_and_apply(api):
    rich, weak, quiet, old_only = _seed_signals(api)
    res = api.get("/api/sources/priority-suggestions", role="tomador_decisiones")
    assert res.status_code == 200
    data = res.json()
    assert "Alta" in data["rule"]
    items = {i["source_id"]: i for i in data["items"]}
    assert items[rich]["suggested"] == "alta" and items[rich]["differs"] is True
    assert items[rich]["stats"]["in_cycle"] == 1 and items[rich]["stats"]["high_score"] == 1
    assert items[weak]["suggested"] == "baja"
    assert items[quiet]["suggested"] == "" and items[quiet]["label"] == "Sin datos"
    assert items[old_only]["suggested"] == ""  # fuera de la ventana de 365 dias

    assert api.post(f"/api/sources/{rich}/priority-suggestion/apply", role="tomador_decisiones").status_code == 403
    applied = api.post(f"/api/sources/{rich}/priority-suggestion/apply")
    assert applied.status_code == 200 and applied.json()["priority_level"] == "alta"
    assert api.post(f"/api/sources/{quiet}/priority-suggestion/apply").status_code == 409
    with api.db() as db:
        log = db.query(AuditLog).filter(AuditLog.action == "priority_suggestion_applied").one()
        assert log.old_value == {"priority_level": "baja"} and log.new_value["priority_level"] == "alta"
        # La recarga del catalogo no la revierte: queda marcada como editada.
        assert "priority_level" in (db.get(Source, rich).edited_fields or [])
        # La oficial de las demas no se toca.
        assert db.get(Source, weak).priority_level == "alta"
