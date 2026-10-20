"""Sonda de salud: rutas de respaldo, fuentes manuales y deriva de esquema."""
from __future__ import annotations

import sys
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import probe_service, scraper  # noqa: E402
from app.database import Base  # noqa: E402
from app.ingest import base as ingest_base  # noqa: E402
from app.models import Source  # noqa: E402

FEED = """<?xml version="1.0"?><rss><channel>
<item><title>Nuevo anticuerpo aprobado</title><link>https://news.google.com/rss/articles/x</link>
<description>Resumen</description><pubDate>Mon, 19 Oct 2026 07:00:00 GMT</pubDate></item>
</channel></rss>"""


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False)()
    yield session
    session.close()


def _source(db, **kwargs) -> Source:
    data = {"title": "Fuente", "url": "https://www.thelancet.com/", "connector": "html", "scrape_enabled": True}
    data.update(kwargs)
    row = Source(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _fake_get(routes):
    """tls_get falso: la primera clave contenida en la URL decide la respuesta."""

    def get(url, *, timeout, headers, params=None):
        for key, answer in routes.items():
            if key in url:
                if isinstance(answer, Exception):
                    raise answer
                status, text = answer
                return httpx.Response(status, text=text, headers={"content-type": "text/xml"})
        return httpx.Response(404, text="")

    return get


def test_every_web_source_gets_a_google_news_fallback():
    src = Source(title="Lancet", url="https://www.thelancet.com/", language="en")
    urls = scraper.fallback_urls(src, [])
    assert urls[-1].startswith("https://news.google.com/rss/search?q=site%3Athelancet.com")
    spanish = scraper.news_feed_url(Source(title="X", url="https://www.minsalud.gov.co/x", language="es"))
    assert "ceid=CO:es-419" in spanish


def test_a_blocked_site_is_green_through_the_news_feed(db, monkeypatch):
    src = _source(db)
    monkeypatch.setattr(ingest_base, "tls_get", _fake_get({"news.google.com": (200, FEED), "thelancet": (403, "")}))
    detail = probe_service.probe_source(db, src)
    assert detail["status"] == "verde"
    assert "Google News" in detail["message"]


def test_a_site_that_times_out_is_green_through_the_news_feed(db, monkeypatch):
    src = _source(db, url="https://www.tga.gov.au/resources/artg")
    monkeypatch.setattr(
        ingest_base,
        "tls_get",
        _fake_get({"news.google.com": (200, FEED), "tga.gov.au": httpx.ReadTimeout("lento")}),
    )
    assert probe_service.probe_source(db, src)["status"] == "verde"


def test_a_dead_url_stays_amber_even_with_a_fallback(db, monkeypatch):
    src = _source(db, url="https://aihta.at/page/old")
    monkeypatch.setattr(ingest_base, "tls_get", _fake_get({"news.google.com": (200, FEED), "aihta.at": (404, "")}))
    detail = probe_service.probe_source(db, src)
    assert detail["status"] == "ambar"
    assert "Actualice la URL" in detail["message"]


def test_an_empty_news_feed_does_not_count_as_fallback(db, monkeypatch):
    src = _source(db)
    empty = "<?xml version='1.0'?><rss><channel></channel></rss>"
    monkeypatch.setattr(ingest_base, "tls_get", _fake_get({"news.google.com": (200, empty), "thelancet": (403, "")}))
    assert probe_service.probe_source(db, src)["status"] == "rojo"


def test_a_manual_source_behind_login_is_online(db, monkeypatch):
    src = _source(db, url="https://www.scopus.com/pages/home", connector="manual")
    monkeypatch.setattr(ingest_base, "tls_get", _fake_get({"scopus.com": (403, "")}))
    detail = probe_service.probe_source(db, src)
    assert detail["status"] == "verde"
    assert "consulta manual" in detail["message"]


def test_a_silent_site_is_skipped_on_the_next_scan(db, monkeypatch):
    src = _source(db, url="https://www.tga.gov.au/resources/artg")
    calls = []

    def fetch(url, timeout=None):
        calls.append(url)
        if "news.google.com" in url:
            return (200, "text/xml", FEED, FEED.encode())
        return (0, "", "", b"")  # sin respuesta tras los reintentos

    monkeypatch.setattr(scraper, "fetch_url", fetch)
    monkeypatch.setattr(scraper, "_unreachable_until", {})
    assert scraper.scrape_source(db, src, triggered_by="test").status != "error"
    assert calls[0] == src.url
    calls.clear()
    assert scraper.scrape_source(db, src, triggered_by="test").status != "error"
    assert src.url not in calls  # la segunda corrida va directo al respaldo


def test_optional_field_drift_neither_warns_nor_suspends(db, monkeypatch):
    src = _source(
        db,
        url="https://api.example.org/studies",
        connector="clinicaltrials",
        schema_signature="huella-anterior",
        connector_config={"probe": {"expect_json_path": "studies.0.id"}},
        scrape_enabled=False,
        last_probe_detail={"ingestion_suspended": True},
    )

    def get(url, *, timeout, headers, params=None):
        return httpx.Response(200, json={"studies": [{"id": "NCT1", "nuevo": 1}]})

    monkeypatch.setattr(ingest_base, "tls_get", get)
    detail = probe_service.probe_source(db, src)
    db.refresh(src)
    assert detail["status"] == "verde"
    assert src.scrape_enabled is True  # la suspension automatica se levanta sola
