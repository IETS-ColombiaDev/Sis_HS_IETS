"""II seguimiento del Modulo 0 (25-11-2026): pendientes de RF-001-A.

- La Bandeja de entrada abre siempre: con una vigilancia en curso no recalcula
  la corroboracion en cada consulta y, si la base esta ocupada, sirve el ultimo
  calculo en lugar de fallar (la pantalla quedaba vacia con un error del servidor).
- Las senales se ubican solas en su pagina, sin que nadie pulse
  (Ubicar señales exactas), una sola vez cada una y por lotes de paginas.
- Sin cita textual, el enlace de la senal pide resaltar el nombre de la tecnologia.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from frente_b_support import api  # noqa: F401  (fixture)
from sqlalchemy.exc import OperationalError

from app import corroboration, database, evidence_locator, link_resolver, signal_links, worker
from app.config import settings
from app.models import AuditLog, Finding, IngestJob, Source, Technology

QUERY = "https://pharma.example.org/pipeline"
PIPELINE_HTML = """
<html><body><table>
  <tr><td><a href="/pipeline/novamab-melanoma">Novamab</a></td><td>Melanoma</td></tr>
  <tr><td>Cardiovex XR</td><td>Insuficiencia cardiaca</td></tr>
</table></body></html>
"""


def _source(api, **kw) -> int:  # noqa: F811
    data = {"title": "Pharma Demo · Pipeline", "url": QUERY, "connector": "html", "access_level": "D"}
    data.update(kw)
    return api.add_source(**data)


def _signal(api, sid: int, title: str, *, url: str = QUERY, query_url: str = QUERY) -> int:  # noqa: F811
    with api.db() as db:
        finding = Finding(source_id=sid, title=title, technology=title, url=url, content_hash=f"h-{title}-{url}")
        signal_links.annotate(finding, db.get(Source, sid), query_url=query_url)
        db.add(finding)
        db.flush()
        db.add(Technology(finding_id=finding.id, commercial_name=title, url=url, source_id=sid,
                          status="capturada_no_asignada", source_channel="proactiva"))
        db.commit()
        return finding.id


def _running_job(api, sid: int) -> None:  # noqa: F811
    with api.db() as db:
        db.add(IngestJob(connector="html", source_id=sid, status="ejecutando", attempts=1,
                         scheduled_for=datetime.now(timezone.utc), started_at=datetime.now(timezone.utc),
                         triggered_by="prueba", origin="manual"))
        db.commit()


# --------------------------------------------------------------------------- #
#  1. La Bandeja de entrada abre siempre
# --------------------------------------------------------------------------- #
def test_inbox_opens_when_the_database_is_busy(api, monkeypatch):  # noqa: F811
    sid = _source(api)
    _signal(api, sid, "Cardiovex XR")

    def locked(db, *, force=False):
        raise OperationalError("UPDATE technologies", {}, Exception("database is locked"))

    monkeypatch.setattr(corroboration, "_refresh", locked)
    listing = api.get("/api/technologies/staging")
    assert listing.status_code == 200
    assert [t["commercial_name"] for t in listing.json()] == ["Cardiovex XR"]
    stats = api.get("/api/technologies/staging/stats")
    assert stats.status_code == 200 and stats.json()["unassigned"] == 1


def test_inbox_does_not_recalculate_on_every_visit_during_a_scan(api, monkeypatch):  # noqa: F811
    sid = _source(api)
    _signal(api, sid, "Cardiovex XR")
    calls: list[int] = []
    real = corroboration._refresh

    def counting(db, *, force=False):
        calls.append(1)
        return real(db, force=force)

    monkeypatch.setattr(corroboration, "_refresh", counting)
    assert api.get("/api/technologies/staging").status_code == 200
    assert len(calls) == 1  # sin vigilancia: se calcula al consultar
    assert api.get("/api/technologies/staging").status_code == 200
    assert len(calls) == 1  # nada cambio: no se repite

    _running_job(api, sid)
    for i in range(3):
        _signal(api, sid, f"Senal nueva {i}", url=f"https://pharma.example.org/n/{i}")
        assert api.get("/api/technologies/staging").status_code == 200
        assert api.get("/api/technologies/staging/stats").status_code == 200
    # Tres senales nuevas y seis consultas durante la vigilancia: ningun recalculo
    # (el ultimo fue hace menos de BUSY_REFRESH_SECONDS).
    assert len(calls) == 1
    with api.db() as db:
        assert corroboration.scan_in_progress(db) is True
        assert corroboration.refresh_for_read(db) == {"refreshed": False, "staging": 0, "corroborated": 0, "stale": True}
        # Pasado el plazo se vuelve a calcular, una vez.
        monkeypatch.setattr(corroboration, "_last_refresh", float("-inf"))
        assert corroboration.refresh_for_read(db)["refreshed"] is True
    assert api.get("/api/technologies/staging").status_code == 200
    assert len(calls) == 2


def test_a_second_reader_does_not_wait_for_the_calculation_during_a_scan(api, monkeypatch):  # noqa: F811
    sid = _source(api)
    _signal(api, sid, "Cardiovex XR")
    _running_job(api, sid)
    assert corroboration._refresh_lock.acquire(blocking=False)
    try:
        with api.db() as db:
            out = corroboration.refresh_for_read(db)
        assert out["refreshed"] is False and out["stale"] is True
    finally:
        corroboration._refresh_lock.release()


def test_corroboration_is_brought_up_to_date_when_the_scan_ends(api):  # noqa: F811
    a = _source(api, title="Agencia A", url="https://agencia-a.example.org/novedades")
    b = _source(api, title="Agencia B", url="https://agencia-b.example.com/noticias")
    _signal(api, a, "Zanubrutinib", url="https://agencia-a.example.org/z", query_url="https://agencia-a.example.org/novedades")
    _signal(api, b, "Zanubrutinib", url="https://agencia-b.example.com/z", query_url="https://agencia-b.example.com/noticias")
    out = corroboration.refresh_after_scan(api.Session)
    assert out["refreshed"] is True and out["corroborated"] == 2
    with api.db() as db:
        assert {t.corroboration_count for t in db.query(Technology).all()} == {2}


# --------------------------------------------------------------------------- #
#  2. Las senales se ubican solas en su pagina
# --------------------------------------------------------------------------- #
@pytest.fixture()
def pages(api, monkeypatch):  # noqa: F811
    """Paginas simuladas: las descargas quedan anotadas y no salen a la red."""
    from app import scraper

    calls: list[list[str]] = []
    html: dict[str, str] = {QUERY: PIPELINE_HTML}

    def fake_fetch_many(urls, timeout):
        calls.append(list(urls))
        return [
            (u, (200, "text/html", html[u], b""), 10, "") if u in html else (u, None, 10, "sin respuesta")
            for u in urls
        ]

    monkeypatch.setattr(scraper, "fetch_many", fake_fetch_many)
    monkeypatch.setattr(database, "SessionLocal", api.Session)
    monkeypatch.setattr(worker, "SessionLocal", api.Session)
    monkeypatch.setattr(worker, "draining", lambda: False)
    monkeypatch.setattr(worker, "is_running", lambda: False)
    # La corrida automatica se hace en este mismo hilo, para poder comprobarla.
    monkeypatch.setattr(link_resolver, "start", lambda factory, **kw: link_resolver.resolve_all(factory, **kw))
    api.fetches = calls
    api.html = html
    return api


def test_signals_are_located_without_pressing_any_button(pages):
    sid = _source(pages)
    table = _signal(pages, sid, "Cardiovex XR")
    linked = _signal(pages, sid, "Novamab")
    missing = _signal(pages, sid, "Tecnologia que no esta en la pagina")

    # Apagado (pruebas y LINK_AUTO_RESOLVE=false): no hace nada.
    assert worker.guardian_tick() == "" and pages.fetches == []

    settings.link_auto_resolve = True
    assert worker.guardian_tick() == "ubicando"
    assert pages.fetches == [[QUERY]]
    with pages.db() as db:
        f = db.get(Finding, table)
        assert f.link_type == "consulta"
        assert f.evidence["locator_url"] == f"{QUERY}#:~:text=Cardiovex%20XR"
        assert db.get(Finding, linked).link_type == "exacto"
        assert db.get(Finding, linked).url == "https://pharma.example.org/pipeline/novamab-melanoma"
        assert db.get(Finding, missing).evidence["resolved"]["method"] == "sin_ubicar"
        log = db.query(AuditLog).filter(AuditLog.action == "link_resolve").one()
        assert log.new_value["ejecutado_por"] == link_resolver.AUTO_ACTOR

    # Cada senal se intenta una sola vez: la que quedo sin ubicar no se descarga de nuevo sola.
    assert worker.guardian_tick() == ""
    assert pages.fetches == [[QUERY]]
    # El boton (Ubicar señales exactas) si la reintenta.
    with pages.db() as db:
        assert list(link_resolver.pending_groups(db, untried=True)) == []
        assert link_resolver.pending_groups(db) == {(sid, QUERY): [missing]}


def test_the_bandeja_row_carries_the_link_that_highlights_the_signal(pages):
    sid = _source(pages)
    _signal(pages, sid, "Cardiovex XR")
    settings.link_auto_resolve = True
    assert worker.guardian_tick() == "ubicando"
    row = pages.get("/api/technologies/staging").json()[0]
    assert row["link_type"] == "consulta"
    assert row["evidence"]["locator_url"] == f"{QUERY}#:~:text=Cardiovex%20XR"
    assert row["evidence"]["locator_text"] == "Cardiovex XR"


def test_automatic_location_waits_while_a_scan_is_running(pages):
    sid = _source(pages)
    _signal(pages, sid, "Cardiovex XR")
    _running_job(pages, sid)
    settings.link_auto_resolve = True
    assert link_resolver.auto_start(pages.Session) is False
    assert pages.fetches == []


def test_automatic_location_gives_up_after_a_few_runs_per_process(pages, monkeypatch):
    sid = _source(pages)
    _signal(pages, sid, "Cardiovex XR")
    settings.link_auto_resolve = True
    # Una corrida que se cae no deja las senales marcadas: sin tope, se repetiria cada minuto.
    monkeypatch.setattr(link_resolver, "start", lambda factory, **kw: None)
    results = [link_resolver.auto_start(pages.Session) for _ in range(link_resolver.AUTO_MAX_RUNS + 2)]
    assert results == [True] * link_resolver.AUTO_MAX_RUNS + [False, False]


def test_pages_are_downloaded_in_batches_and_each_one_once(pages, monkeypatch):
    monkeypatch.setattr(link_resolver, "PAGE_BATCH", 2)
    sid = _source(pages)
    urls = [f"https://pharma.example.org/lista/{i}" for i in range(5)]
    for i, url in enumerate(urls):
        pages.html[url] = f"<html><body><p>Producto Lote{i} en estudio</p></body></html>"
        _signal(pages, sid, f"Producto Lote{i}", url=url, query_url=url)
        _signal(pages, sid, f"Ausente Lote{i}", url=url, query_url=url)
    out = link_resolver.resolve_all(pages.Session, actor="prueba")
    assert out["counts"] == {"enlace_en_pagina": 0, "resaltado": 5, "sin_ubicar": 5}
    assert [len(batch) for batch in pages.fetches] == [2, 2, 1]
    assert sorted(u for batch in pages.fetches for u in batch) == urls
    assert link_resolver.state()["done"] == 10


def test_a_page_that_does_not_answer_is_reported_and_not_retried_alone(pages):
    sid = _source(pages)
    gone = "https://pharma.example.org/caida"
    fid = _signal(pages, sid, "Cardiovex XR", url=gone, query_url=gone)
    settings.link_auto_resolve = True
    assert worker.guardian_tick() == "ubicando"
    with pages.db() as db:
        resolved = db.get(Finding, fid).evidence["resolved"]
        assert resolved["method"] == "sin_ubicar" and "no respondió" in resolved["reason"]
    assert worker.guardian_tick() == ""
    assert pages.fetches == [[gone]]


# --------------------------------------------------------------------------- #
#  3. El enlace de la senal resalta su texto
# --------------------------------------------------------------------------- #
def test_without_a_quote_the_link_highlights_the_technology_name():
    link = evidence_locator.signal_link("https://agencia.example.org/ficha/123", "", "Cardiovex XR")
    assert link == "https://agencia.example.org/ficha/123#:~:text=Cardiovex%20XR"


def test_the_quote_wins_over_the_name():
    raw = "Resumen. Cita de la fuente: «Cardiovex XR recibió la aprobación» fin"
    link = evidence_locator.signal_link("https://agencia.example.org/ficha/123", raw, "Cardiovex XR")
    assert link == "https://agencia.example.org/ficha/123#:~:text=Cardiovex%20XR%20recibi%C3%B3%20la%20aprobaci%C3%B3n"


@pytest.mark.parametrize(
    ("url", "name"),
    [
        ("https://agencia.example.org/doc.pdf", "Cardiovex XR"),  # un PDF no admite el resaltado
        ("https://agencia.example.org/app#/ficha/1", "Cardiovex XR"),  # ruta de aplicacion: no se toca
        ("https://agencia.example.org/ficha/1", "XR"),  # nombre demasiado corto
        ("https://agencia.example.org/ficha/1", "x" * 81),  # un titulo largo no es un nombre
        ("https://agencia.example.org/ficha/1", ""),
    ],
)
def test_the_link_is_left_alone_when_highlighting_does_not_apply(url, name):
    assert evidence_locator.signal_link(url, "", name) == url


def test_no_url_no_link():
    assert evidence_locator.signal_link("", "", "Cardiovex XR") == ""


# --------------------------------------------------------------------------- #
#  4. Registros oficiales: la ficha del producto, no el buscador
# --------------------------------------------------------------------------- #
DPD = "https://health-products.canada.ca/dpd-bdpp/"
K510 = "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPMN/pmn.cfm"
DRUGS = "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm"


def test_registry_connectors_link_each_product_to_its_own_record():
    from app.ingest import fda
    from app.ingest.health_canada import HealthCanadaConnector

    # Un generico (ANDA) quedaba como ApplNo=A214272 y abria una pagina vacia.
    assert fda.drug_url("ANDA214272") == f"{DRUGS}?event=overview.process&ApplNo=214272"
    assert fda.drug_url("NDA021144") == f"{DRUGS}?event=overview.process&ApplNo=021144"
    assert fda.drug_url("") == DRUGS
    assert fda.device_url({"k_number": "K260132"}, "device/510k") == f"{K510}?ID=K260132"
    assert fda.device_url({"k_number": "DEN200040"}, "device/510k").endswith("/cfPMN/denovo.cfm?id=DEN200040")
    assert fda.device_url({}, "device/510k") == K510
    assert fda.device_url({"pma_number": "P900056", "supplement_number": "S230"}, "device/pma").endswith("pma.cfm?id=P900056S230")
    # Una PMA sin suplemento no tiene ficha que abra: se deja el buscador y no se inventa.
    assert fda.device_url({"pma_number": "P900056"}, "device/pma").endswith("/pma.cfm")
    assert HealthCanadaConnector.drug_url(107582) == f"{DPD}info?lang=eng&code=107582"
    assert HealthCanadaConnector.drug_url(None) == DPD

    record = HealthCanadaConnector()._drug_record({"drug_code": 107582, "brand_name": "OCREVUS SC"})
    assert record.url == f"{DPD}info?lang=eng&code=107582"
    device = fda.FdaConnector()._device_record({"k_number": "K260132", "device_name": "Jason membrane"}, "device/510k")
    assert device.url == f"{K510}?ID=K260132"


@pytest.mark.parametrize(
    ("url", "kind"),
    [
        (DPD, "consulta"),
        (f"{DPD}info?lang=eng&code=107582", "exacto"),
        ("https://health-products.canada.ca/mdall-limh/", "consulta"),
        (K510, "consulta"),
        (f"{K510}?ID=K260132", "exacto"),
        (DRUGS, "consulta"),
        (f"{DRUGS}?event=overview.process&ApplNo=214272", "exacto"),
        ("https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm", "consulta"),
    ],
)
def test_a_registry_search_form_is_not_an_exact_link(url, kind):
    assert signal_links.classify(url) == kind


def _registry_signal(api, sid, title, url, connector, external_id, row) -> int:  # noqa: F811
    fid = _signal(api, sid, title, url=url)
    with api.db() as db:
        tech = db.query(Technology).filter(Technology.finding_id == fid).one()
        tech.raw_payload = {"origin": "connector", "connector": connector, "external_id": external_id, "payload": row}
        # Asi quedaron en la base: clasificadas como exactas por la forma de la URL.
        db.get(Finding, fid).link_type = "exacto"
        db.commit()
    return fid


def test_signals_already_captured_get_the_link_to_their_own_record(api):  # noqa: F811
    hc = _source(api, title="Health Canada", url="https://www.canada.ca/en/health-canada.html", connector="health_canada")
    fda_src = _source(api, title="FDA", url="https://www.fda.gov/", connector="fda")
    drug = _registry_signal(api, hc, "OCREVUS SC", DPD, "health_canada", "107582", {"drug_code": 107582})
    k510 = _registry_signal(api, fda_src, "Jason membrane", K510, "fda", "K260132", {"k_number": "K260132"})
    generic = _registry_signal(api, fda_src, "ATOVAQUONE", f"{DRUGS}?event=overview.process&ApplNo=A214272", "fda",
                               "ANDA214272", {"application_number": "ANDA214272"})
    good = _registry_signal(api, fda_src, "COSENTYX", f"{DRUGS}?event=overview.process&ApplNo=761349", "fda",
                            "BLA761349", {"application_number": "BLA761349"})
    pma = _registry_signal(api, fda_src, "Valvula", "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm",
                           "fda", "P900056", {"pma_number": "P900056"})

    with api.db() as db:
        assert link_resolver.repair_registry_links(db) == {"fixed": 3, "reclassified": 1}
        f = db.get(Finding, drug)
        assert f.url == f"{DPD}info?lang=eng&code=107582" and f.link_type == "exacto"
        assert f.evidence["resolved"]["method"] == "enlace_del_registro"
        assert f.evidence["resolved"]["previous_url"] == DPD  # lo capturado no se pierde
        assert db.query(Technology).filter(Technology.finding_id == drug).one().url == f.url
        assert db.get(Finding, k510).url == f"{K510}?ID=K260132"
        assert db.get(Finding, generic).url == f"{DRUGS}?event=overview.process&ApplNo=214272"
        assert db.get(Finding, good).evidence.get("resolved") is None  # ya estaba bien: no se toca
        # Sin ficha propia: deja de presentarse como enlace exacto.
        assert db.get(Finding, pma).link_type == "consulta"
        assert db.query(AuditLog).filter(AuditLog.action == "link_registry_repair").count() == 1
        # Idempotente: en el siguiente arranque no hay nada que corregir ni que anotar.
        assert link_resolver.repair_registry_links(db) == {"fixed": 0, "reclassified": 0}
        assert db.query(AuditLog).filter(AuditLog.action == "link_registry_repair").count() == 1
    row = next(t for t in api.get("/api/technologies/staging").json() if t["commercial_name"] == "OCREVUS SC")
    assert row["link_type"] == "exacto" and row["signal_url"].startswith(f"{DPD}info?lang=eng&code=107582")


def test_cross_check_links_to_the_510k_record_with_the_case_the_site_expects():
    import inspect

    from app import submission_crosscheck

    source = inspect.getsource(submission_crosscheck)
    assert "cfPMN/pmn.cfm?ID=" in source and "cfpmn/pmn.cfm?ID=" not in source


def test_a_name_with_a_clarification_in_brackets_highlights_the_brand():
    link = evidence_locator.signal_link("https://www.fda.gov/x/tecelra", "", "TECELRA (afamitresgene autoleucel)")
    assert link == "https://www.fda.gov/x/tecelra#:~:text=TECELRA"
    finding = Finding(title="TECELRA (afamitresgene autoleucel)", technology="TECELRA (afamitresgene autoleucel)")
    assert "TECELRA" in link_resolver.signal_names(finding)
