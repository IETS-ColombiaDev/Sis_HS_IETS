"""Bandeja de entrada: confiabilidad de la senal (chequeos + dictamen de la IA)."""
from __future__ import annotations

import datetime as dt
import json

import pytest

from frente_a_helpers import Harness

from app import ai_service, reliability_service, scraper
from app.models import Finding, RawRecord, Source
from app.routers import technologies


@pytest.fixture()
def h():
    harness = Harness(technologies)
    yield harness
    harness.close()


@pytest.fixture()
def page(monkeypatch):
    """Pagina falsa: ninguna prueba sale a internet."""
    state = {"status": 200, "html": "<html><body><p>Alfamab recibe aprobacion de la FDA.</p></body></html>"}
    monkeypatch.setattr(scraper, "is_internal_url", lambda url: False)
    monkeypatch.setattr(
        scraper, "fetch_url", lambda url, timeout=None: (state["status"], "text/html", state["html"], b"")
    )
    monkeypatch.setattr(scraper, "extract_main_text", lambda html, url="": "Alfamab recibe aprobacion de la FDA.")
    return state


@pytest.fixture()
def no_ai(monkeypatch):
    monkeypatch.setattr(ai_service, "is_enabled", lambda: False)


def _fda_signal(h):
    source = Source(title="FDA Novel Drug Approvals", url="https://www.fda.gov/drugs", access_level="A",
                    entity_type="agencia_regulatoria")
    h.db.add(source)
    h.db.commit()
    tech = h.tech("Alfamab", source_id=source.id, url="https://www.fda.gov/drugs/alfamab",
                  indication="Psoriasis", fda_approval_date=dt.date(2026, 5, 1),
                  raw_payload={"origin": "connector", "brand_name": "Alfamab"})
    h.db.add(RawRecord(technology_id=tech.id, connector="openfda", external_id="BLA761234",
                       payload={"brand_name": "Alfamab"}, payload_hash="x"))
    h.db.commit()
    return tech


def test_an_official_signal_is_reliable_without_ai(h, page, no_ai):
    tech = _fda_signal(h)

    res = h.client.post(f"/api/technologies/{tech.id}/reliability")

    assert res.status_code == 200
    body = res.json()
    a = body["assessment"]
    assert body["url"] == "https://www.fda.gov/drugs/alfamab"
    assert a["verdict"] == "confiable" and a["score"] >= 70
    assert a["ai_used"] is False and "apagada" in a["note"]
    keys = {c["key"]: c["ok"] for c in a["checks"]}
    assert keys["fuente"] and keys["url"] and keys["pagina"] and keys["ids"] and keys["crudo"]
    # Se guarda: al reabrir la senal no se vuelve a gastar la IA.
    again = h.client.get(f"/api/technologies/{tech.id}/reliability").json()
    assert again["assessment"]["verdict"] == "confiable"
    listed = h.client.get(f"/api/technologies/{tech.id}").json()
    assert listed["reliability_verdict"] == "confiable"
    assert listed["signal_url"] == "https://www.fda.gov/drugs/alfamab"


def test_a_signal_without_origin_has_low_reliability(h, page, no_ai):
    tech = h.tech("Rumor", source_channel="proactiva")

    a = h.client.post(f"/api/technologies/{tech.id}/reliability").json()["assessment"]

    assert a["verdict"] == "baja"
    assert any("URL" in x for x in a["alerts"])


def test_the_url_falls_back_to_the_finding_and_a_dead_page_counts_against(h, page, no_ai):
    source = Source(title="Medio X", url="https://medio-x.com")
    h.db.add(source)
    h.db.commit()
    finding = Finding(source_id=source.id, title="Betanib", url="https://medio-x.com/betanib", content_hash="b")
    h.db.add(finding)
    h.db.commit()
    tech = h.tech("Betanib", source_id=source.id, finding_id=finding.id)
    page["status"] = 404

    body = h.client.post(f"/api/technologies/{tech.id}/reliability").json()

    assert body["url"] == "https://medio-x.com/betanib"
    pagina = next(c for c in body["assessment"]["checks"] if c["key"] == "pagina")
    assert pagina["ok"] is False and "404" in pagina["detail"]


def test_ai_verdict_replaces_the_base_and_reads_the_page(h, page, monkeypatch):
    tech = _fda_signal(h)
    prompts = []

    def fake_generate(prompt, **kw):
        prompts.append(prompt)
        return (
            json.dumps({
                "veredicto": "verificar",
                "puntaje": 61,
                "resumen": "La pagina habla de otra indicacion.",
                "a_favor": ["Fuente regulatoria oficial"],
                "alertas": ["La indicacion no coincide"],
                "verificar": ["Confirmar en Drugs@FDA"],
            }),
            "MiniMax-M3",
        )

    monkeypatch.setattr(ai_service, "is_enabled", lambda: True)
    monkeypatch.setattr(ai_service, "generate", fake_generate)

    a = h.client.post(f"/api/technologies/{tech.id}/reliability").json()["assessment"]

    assert a["ai_used"] is True and a["model"] == "MiniMax-M3"
    assert a["verdict"] == "verificar" and a["score"] == 61
    assert a["alerts"] == ["La indicacion no coincide"]
    assert a["base_score"] >= 70
    assert "Alfamab recibe aprobacion" in prompts[0] and "BLA761234" in prompts[0]


def test_a_broken_ai_answer_keeps_the_automatic_checks(h, page, monkeypatch):
    tech = _fda_signal(h)
    monkeypatch.setattr(ai_service, "is_enabled", lambda: True)
    monkeypatch.setattr(ai_service, "generate", lambda prompt, **kw: ("no se", "MiniMax-M3"))

    a = h.client.post(f"/api/technologies/{tech.id}/reliability").json()["assessment"]

    assert a["ai_used"] is False and a["verdict"] == "confiable"
    assert "no devolvió" in a["note"]


def test_google_news_links_are_neutral_and_reading_needs_no_write_permission(h, page, no_ai):
    tech = h.tech("Gamma", url="https://news.google.com/rss/articles/abc")
    a = reliability_service.assess(h.db, tech, use_ai=False)
    url_check = next(c for c in a["checks"] if c["key"] == "url")
    assert url_check["ok"] is None and "Google News" in url_check["detail"]

    h.as_role("tomador_decisiones")
    assert h.client.get(f"/api/technologies/{tech.id}/reliability").status_code == 200
    assert h.client.post(f"/api/technologies/{tech.id}/reliability").status_code == 403
