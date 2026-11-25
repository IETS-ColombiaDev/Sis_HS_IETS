"""Busqueda a fondo y enlaces confiables (version 7.4.1).

- El rastreador lee lo que la pagina trae plegado u oculto (acordeones, pestanas,
  «ver mas») y las tablas, sin tomar menus ni avisos de cookies.
- La verificacion de enlaces distingue un enlace roto (404, pagina de «no
  encontrado») de un sitio que no contesto o que bloquea robots, y no castiga a
  un sitio por pedirle muchas paginas a la vez.
- Un enlace que ya no existe deja de presentarse como exacto: la senal pasa a su
  pagina consultada.
- CTIS enlaza la ficha del ensayo, no el buscador.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone

import pytest
from frente_b_support import api  # noqa: F401  (fixture)

from app import link_resolver, signal_links, worker
from app.config import settings
from app.models import AuditLog, Finding, Source, Technology
from app.scraper import _page_payload, folded_text

FILLER = "<p>" + "La agencia publica periodicamente sus evaluaciones de tecnologias sanitarias para el sistema de salud. " * 6 + "</p>"
PAGE = f"""<html><head><title>Evaluaciones</title></head><body>
<nav><a href="/">Inicio</a><div class="collapse menu"><p>MENUOCULTO enlaces de navegacion del sitio institucional completo</p></div></nav>
<main><article><h1>Evaluaciones en curso</h1>{FILLER}
<details><summary>Oncologia</summary><p>ACORDEONMAB (zetuximab) para cancer de pulmon, fase III, decision esperada en 2027.</p></details>
<div class="accordion"><button aria-expanded="false">Cardiologia</button>
  <div class="accordion-collapse collapse" aria-hidden="true"><p>PLEGADOVEX valvula transcateter en evaluacion.</p></div></div>
<div class="tab-pane" style="display:none"><p>PESTANAGEN terapia genica para hemofilia B aprobada.</p></div>
<div hidden><p>OCULTOSTAT inhibidor oral en fase II.</p></div>
<div class="cookie-consent" hidden><p>COOKIEBANNER usamos cookies para mejorar su experiencia en el sitio.</p></div>
<table><tr><th>Producto</th><th>Fase</th></tr><tr><td>TABLAZUMAB</td><td>Fase II</td></tr></table>
<ul><li>LISTAPRIL nuevo antihipertensivo, opinion positiva CHMP.</li></ul>
</article></main><footer><div class="collapse"><p>PIEOCULTO datos de contacto y redes sociales de la entidad.</p></div></footer></body></html>"""


# --------------------------------------------------------------------------- #
#  1. Contenido plegado y tablas
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("name", ["ACORDEONMAB", "PLEGADOVEX", "PESTANAGEN", "OCULTOSTAT", "TABLAZUMAB", "LISTAPRIL"])
def test_the_crawler_reads_what_the_page_keeps_folded(name):
    text = _page_payload("https://agencia.example.org/evaluaciones", PAGE)["text"]
    assert text.count(name) == 1  # se lee, y una sola vez


@pytest.mark.parametrize("name", ["MENUOCULTO", "COOKIEBANNER", "PIEOCULTO"])
def test_menus_cookie_notices_and_footers_are_not_taken_as_content(name):
    assert name not in _page_payload("https://agencia.example.org/evaluaciones", PAGE)["text"]


def test_folded_text_is_bounded_and_skips_what_is_already_read():
    assert folded_text("") == ""
    already = "ACORDEONMAB (zetuximab) para cancer de pulmon, fase III, decision esperada en 2027."
    extra = folded_text(PAGE, already)
    assert "ACORDEONMAB" not in extra and "PLEGADOVEX" in extra and "TABLAZUMAB | Fase II" in extra
    big = "<html><body>" + "".join(
        f"<details><p>Tecnologia numero {i} con descripcion suficientemente larga para contar.</p></details>" for i in range(900)
    ) + "</body></html>"
    assert len(folded_text(big)) <= 6000
    rows = "".join(f"<tr><td>Producto {i}</td><td>Fase II</td></tr>" for i in range(200))
    assert folded_text(f"<html><body><table>{rows}</table></body></html>").count("Producto") == 80


def test_a_blocked_page_is_still_discarded():
    html = "<html><head><title>Just a moment...</title></head><body>Checking your browser before accessing</body></html>"
    assert _page_payload("https://x.example.org/", html)["text"] == ""


# --------------------------------------------------------------------------- #
#  2. Verificacion de enlaces
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("html", "expected"),
    [
        ("<html><head><title>Page not found | FDA</title></head></html>", True),
        ("<title>Agencia</title><h1>Error 404</h1>", True),
        ("<title>Página no encontrada</title>", True),
        ("<title>ABECMA | FDA</title><h1>ABECMA</h1>", False),
        ("<title>Estudio</title><p>El tratamiento no se encontró eficaz (not found).</p>", False),  # solo titulo y encabezado
        ("<title>" + "Ensayo con 404 pacientes " * 8 + "</title>", False),  # un titulo largo es un articulo
        ("", False),
    ],
)
def test_soft_404_pages_are_recognised_by_their_title(html, expected):
    assert signal_links.soft_404(html) is expected


@pytest.fixture()
def web(monkeypatch):
    """Sitios simulados: {url: (codigo, url_final, cuerpo) | Exception}."""
    pages: dict = {}
    calls: list[str] = []

    def fake_get(url):
        calls.append(url)
        answer = pages.get(url, (404, url, ""))
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(signal_links, "_get", fake_get)
    monkeypatch.setattr(signal_links, "CHECK_HOST_PAUSE_S", 0)
    monkeypatch.setattr(signal_links, "CHECK_RETRY_PAUSE_S", 0)
    pages["calls"] = calls
    return pages


def test_each_kind_of_answer_gets_its_own_status(web):
    base = "https://agencia.example.org"
    web[f"{base}/ok"] = (200, f"{base}/ok", "<title>Ficha</title>")
    web[f"{base}/blando"] = (200, f"{base}/blando", "<title>Page not found</title>")
    web[f"{base}/gone"] = (410, f"{base}/gone", "")
    web[f"{base}/bots"] = (403, f"{base}/bots", "")
    web[f"{base}/mucho"] = (429, f"{base}/mucho", "")
    web[f"{base}/caida-servidor"] = (503, f"{base}/caida-servidor", "")
    web[f"{base}/vieja/ficha"] = (200, f"{base}/", "<title>Inicio</title>")
    web[f"{base}/lenta"] = TimeoutError("sin respuesta")
    assert signal_links.check_url(f"{base}/ok") == ("ok", 200, f"{base}/ok")
    assert signal_links.check_url(f"{base}/blando")[:2] == ("caido", 404)
    assert signal_links.check_url(f"{base}/gone")[:2] == ("caido", 410)
    assert signal_links.check_url(f"{base}/no-existe")[:2] == ("caido", 404)
    assert signal_links.check_url(f"{base}/bots")[:2] == ("bloqueado", 403)
    assert signal_links.check_url(f"{base}/mucho")[:2] == ("bloqueado", 429)
    # Un 400 es rechazo a la visita automatica (asi responde la FDA cuando bloquea), no una pagina inexistente.
    web[f"{base}/rechazo"] = (400, f"{base}/rechazo", "")
    assert signal_links.check_url(f"{base}/rechazo")[:2] == ("bloqueado", 400)
    assert signal_links.check_url(f"{base}/caida-servidor")[:2] == ("sin_respuesta", 503)
    assert signal_links.check_url(f"{base}/vieja/ficha")[0] == "redirigido"
    # Un sitio que no contesta no es un enlace roto, y se intenta dos veces.
    assert signal_links.check_url(f"{base}/lenta") == ("sin_respuesta", 0, "")
    assert web["calls"].count(f"{base}/lenta") == 2
    # El resaltado no viaja al servidor.
    assert signal_links.check_url(f"{base}/ok#:~:text=Cardiovex")[0] == "ok"
    assert signal_links.check_url("ftp://x/y")[0] == "caido"


def _signal(api, sid, title, url, query_url):  # noqa: F811
    with api.db() as db:
        finding = Finding(source_id=sid, title=title, technology=title, url=url, content_hash=f"h-{title}")
        signal_links.annotate(finding, db.get(Source, sid), query_url=query_url)
        db.add(finding)
        db.flush()
        db.add(Technology(finding_id=finding.id, commercial_name=title, url=url, source_id=sid,
                          status="capturada_no_asignada", source_channel="proactiva"))
        db.commit()
        return finding.id


def test_a_link_that_no_longer_exists_stops_being_the_exact_link(api, web):  # noqa: F811
    listing = "https://agencia.example.org/novedades"
    sid = api.add_source(title="Agencia", url=listing)
    good = _signal(api, sid, "Vigente", "https://agencia.example.org/ficha/vigente", listing)
    gone = _signal(api, sid, "Retirada", "https://agencia.example.org/ficha/retirada", listing)
    slow = _signal(api, sid, "Lenta", "https://lento.example.org/ficha", listing)
    bots = _signal(api, sid, "Protegida", "https://agencia.example.org/ficha/protegida", listing)
    web["https://agencia.example.org/ficha/vigente"] = (200, "https://agencia.example.org/ficha/vigente", "<title>Vigente</title>")
    web["https://lento.example.org/ficha"] = TimeoutError("x")
    web["https://agencia.example.org/ficha/protegida"] = (403, "https://agencia.example.org/ficha/protegida", "")

    out = signal_links.check_links(api.Session, actor="prueba")
    assert out == {"checked": 4, "por_estado": {"ok": 1, "caido": 1, "sin_respuesta": 1, "bloqueado": 1}, "moved": 1}
    with api.db() as db:
        f = db.get(Finding, gone)
        # La senal ahora abre su pagina consultada, que si existe; lo capturado se conserva.
        assert f.url == listing and f.link_type == "consulta" and f.link_status == "sin_verificar"
        assert f.evidence["broken_url"] == "https://agencia.example.org/ficha/retirada"
        assert db.query(Technology).filter(Technology.finding_id == gone).one().url == listing
        assert (db.get(Finding, good).link_status, db.get(Finding, good).link_type) == ("ok", "exacto")
        assert db.get(Finding, slow).link_status == "sin_respuesta" and db.get(Finding, slow).link_type == "exacto"
        assert db.get(Finding, bots).link_status == "bloqueado"
        log = db.query(AuditLog).filter(AuditLog.action == "link_check").one()
        assert log.new_value["pasadas_a_pagina_consultada"] == 1
        # Queda lista para que el sistema la ubique dentro de su pagina consultada.
        assert gone in next(iter(link_resolver.pending_groups(db, untried=True).values()))
    row = next(t for t in api.get("/api/technologies/staging").json() if t["commercial_name"] == "Retirada")
    assert row["signal_url"].startswith(listing) and row["link_type"] == "consulta" and row["evidence"]["broken_url"]


def test_one_site_is_visited_one_page_at_a_time(api, monkeypatch):  # noqa: F811
    sid = api.add_source()
    active = {"a.example.org": 0, "b.example.org": 0}
    worst = dict(active)
    lock = threading.Lock()

    def fake_check(url):
        host = url.split("/")[2]
        with lock:
            active[host] += 1
            worst[host] = max(worst[host], active[host])
        time.sleep(0.01)
        with lock:
            active[host] -= 1
        return "ok", 200, url

    monkeypatch.setattr(signal_links, "check_url", fake_check)
    monkeypatch.setattr(signal_links, "CHECK_HOST_PAUSE_S", 0)
    for i in range(6):
        _signal(api, sid, f"A{i}", f"https://a.example.org/f/{i}", "https://a.example.org/")
        _signal(api, sid, f"B{i}", f"https://b.example.org/f/{i}", "https://b.example.org/")
    assert signal_links.check_links(api.Session)["checked"] == 12
    assert worst == {"a.example.org": 1, "b.example.org": 1}


def test_links_are_verified_alone_and_silent_sites_are_retried_later(api, web, monkeypatch):  # noqa: F811
    from app import database

    sid = api.add_source()
    ok = "https://agencia.example.org/ficha/ok"
    slow = "https://lento.example.org/ficha"
    a = _signal(api, sid, "Vigente", ok, "https://agencia.example.org/novedades")
    b = _signal(api, sid, "Lenta", slow, "https://agencia.example.org/novedades")
    web[ok] = (200, ok, "<title>Vigente</title>")
    web[slow] = TimeoutError("x")
    monkeypatch.setattr(database, "SessionLocal", api.Session)
    monkeypatch.setattr(worker, "SessionLocal", api.Session)
    monkeypatch.setattr(worker, "draining", lambda: False)
    monkeypatch.setattr(worker, "is_running", lambda: False)

    # La tanda automatica corre en este mismo hilo, para poder comprobarla.
    monkeypatch.setattr(signal_links, "_spawn", lambda target, kwargs: target(**kwargs))
    assert worker.guardian_tick() != "verificando"  # apagado en pruebas y con LINK_AUTO_CHECK=false
    settings.link_auto_check = True
    assert worker.guardian_tick() == "verificando"
    with api.db() as db:
        assert db.get(Finding, a).link_status == "ok" and db.get(Finding, b).link_status == "sin_respuesta"
        log = db.query(AuditLog).filter(AuditLog.action == "link_check").one()
        assert log.new_value["ejecutado_por"] == signal_links.AUTO_CHECK_ACTOR
    # Nada pendiente: el que no contesto se reintenta al dia siguiente, no en cada revision.
    assert worker.guardian_tick() != "verificando"
    with api.db() as db:
        db.get(Finding, b).link_checked_at = datetime.now(timezone.utc) - timedelta(hours=25)
        db.commit()
    web[slow] = (200, slow, "<title>Lenta</title>")
    assert worker.guardian_tick() == "verificando"
    with api.db() as db:
        assert db.get(Finding, b).link_status == "ok"


# --------------------------------------------------------------------------- #
#  3. CTIS: la ficha del ensayo
# --------------------------------------------------------------------------- #
def test_ctis_links_the_trial_record_and_repairs_what_was_captured(api):  # noqa: F811
    from app.ingest.ctis import CTIS_HOME, trial_url

    assert trial_url("2024-512342-42-01") == "https://euclinicaltrials.eu/ctis-public/view/2024-512342-42-01?lang=en"
    assert trial_url("") == CTIS_HOME
    assert signal_links.classify(CTIS_HOME) == "consulta"
    assert signal_links.classify(trial_url("2024-512342-42-01")) == "exacto"

    old = "https://euclinicaltrials.eu/search-for-clinical-trials/?lang=en&EUCT=2024-512342-42-01"
    sid = api.add_source(title="CTIS", url=CTIS_HOME, connector="ctis")
    fid = _signal(api, sid, "Ensayo PSMAcTION", old, CTIS_HOME)
    with api.db() as db:
        tech = db.query(Technology).filter(Technology.finding_id == fid).one()
        tech.raw_payload = {"origin": "connector", "connector": "ctis", "external_id": "2024-512342-42-01", "payload": {}}
        db.commit()
        assert link_resolver.repair_registry_links(db)["fixed"] == 1
        f = db.get(Finding, fid)
        assert f.url == trial_url("2024-512342-42-01") and f.link_type == "exacto"
        assert f.evidence["resolved"]["previous_url"] == old
        assert link_resolver.repair_registry_links(db) == {"fixed": 0, "reclassified": 0}


# --------------------------------------------------------------------------- #
#  4. La vigilancia no se queda: tope por sitio, escrituras cortas y jobs que no quedan colgados
# --------------------------------------------------------------------------- #
def test_all_sources_together_open_at_most_two_pages_of_one_site(monkeypatch):
    from app import scraper

    assert scraper._host_slot("https://www.fda.gov/a") is scraper._host_slot("https://accessdata.fda.gov/b")
    assert scraper._host_slot("https://www.fda.gov/a") is not scraper._host_slot("https://www.ema.europa.eu/a")
    assert scraper._host_slot("https://www.gov.uk/a") is not scraper._host_slot("https://www.nice.org.uk/a")
    active = 0
    worst = 0
    lock = threading.Lock()

    def slow(url, timeout=None, retries=None):
        nonlocal active, worst
        with lock:
            active += 1
            worst = max(worst, active)
        time.sleep(0.03)
        with lock:
            active -= 1
        return 200, "text/html", "<html></html>", b""

    monkeypatch.setattr(scraper, "_fetch_url", slow)
    threads = [threading.Thread(target=scraper.fetch_url, args=(f"https://www.fda.gov/ficha/{i}",)) for i in range(12)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert worst == scraper.HOST_MAX_CONCURRENT == 2


def test_a_write_transaction_left_open_is_reported(caplog):
    from app import database

    class FakeSession:
        info: dict = {}
        new = {object()}
        dirty: set = set()
        deleted: set = set()

    session = FakeSession()
    database._write_started(session, None)
    assert "write_since" in session.info
    session.info["write_since"] -= 30
    with caplog.at_level("WARNING", logger="app.database"):
        database._write_finished(session)
    assert "Transaccion de escritura abierta" in caplog.text and "write_since" not in session.info
    caplog.clear()
    # Una escritura corta no avisa, y una sesion que solo lee no cuenta.
    database._write_started(session, None)
    with caplog.at_level("WARNING", logger="app.database"):
        database._write_finished(session)
    reader = FakeSession()
    reader.info, reader.new = {}, set()
    database._write_started(reader, None)
    assert caplog.text == "" and reader.info == {}


def test_a_job_whose_thread_fails_does_not_stay_running(api, monkeypatch):  # noqa: F811
    from app import database, ingest_service
    from app.models import IngestJob

    monkeypatch.setattr(database, "SessionLocal", api.Session)
    sid = api.add_source()
    with api.db() as db:
        for attempts in (1, 3):
            db.add(IngestJob(connector="html", source_id=sid, status="ejecutando", attempts=attempts, max_attempts=3,
                             scheduled_for=datetime.now(timezone.utc), started_at=datetime.now(timezone.utc),
                             triggered_by="prueba", origin="manual"))
        db.commit()
        first, last = [j.id for j in db.query(IngestJob).order_by(IngestJob.id).all()]
    ingest_service._abandon_job(first, "PendingRollbackError: base ocupada")
    ingest_service._abandon_job(last, "PendingRollbackError: base ocupada")
    with api.db() as db:
        retry, final = db.get(IngestJob, first), db.get(IngestJob, last)
        assert retry.status == "pendiente" and "se reintentará" in retry.message and retry.finished_at
        assert final.status == "error"  # ya agoto sus intentos
        # Un job que ya tiene desenlace no se toca.
        final.message = "desenlace propio"
        db.commit()
    ingest_service._abandon_job(last, "otro")
    with api.db() as db:
        assert db.get(IngestJob, last).message == "desenlace propio"


def test_a_scan_that_hits_a_broken_session_ends_with_an_outcome(api, monkeypatch):  # noqa: F811
    """Base ocupada a mitad de la fuente: el job queda para reintento, no «en curso»."""
    from sqlalchemy.exc import OperationalError

    from app import ingest_service
    from app.models import IngestJob

    sid = api.add_source(connector="html", connector_config={})

    def locked(db, source, triggered_by):
        source.last_error = "a medio escribir"
        db.flush()
        raise OperationalError("UPDATE app_meta", {}, Exception("database is locked"))

    monkeypatch.setattr(ingest_service, "_run_html", locked)
    with api.db() as db:
        job = ingest_service.enqueue(db, [db.get(Source, sid)], triggered_by="prueba")[0]
        out = ingest_service.run_job(db, job.id)
        assert out.status == "pendiente" and "database is locked" in out.message
        assert db.get(IngestJob, job.id).status == "pendiente"


def test_a_site_that_refuses_is_left_alone_and_retried_the_next_day(api, web, monkeypatch):  # noqa: F811
    """La FDA respondio 400 a todo tras muchas visitas: insistir empeora el bloqueo."""
    sid = api.add_source()
    ids = [_signal(api, sid, f"Ficha {i}", f"https://registro.example.org/f/{i}", "https://registro.example.org/") for i in range(8)]
    for i in range(8):
        web[f"https://registro.example.org/f/{i}"] = (400, f"https://registro.example.org/f/{i}", "")
    out = signal_links.check_links(api.Session, pending_only=True)
    # Tres rechazos seguidos y se detiene: las demas quedan para despues, sin visitarlas.
    assert len(web["calls"]) == signal_links.CHECK_HOST_GIVE_UP == 3
    assert out["por_estado"] == {"bloqueado": 3, "sin_respuesta": 5} and out["moved"] == 0
    with api.db() as db:
        assert all(db.get(Finding, i).link_type == "exacto" for i in ids)  # nada se marca como roto
    # En la revision siguiente no se vuelve a tocar el sitio.
    assert signal_links.check_links(api.Session, pending_only=True)["checked"] == 0
    assert len(web["calls"]) == 3


def test_one_batch_asks_a_site_for_a_bounded_number_of_pages(api, web, monkeypatch):  # noqa: F811
    monkeypatch.setattr(signal_links, "CHECK_MAX_PER_HOST", 4)
    sid = api.add_source()
    for i in range(7):
        url = f"https://registro.example.org/f/{i}"
        _signal(api, sid, f"Ficha {i}", url, "https://registro.example.org/")
        web[url] = (200, url, "<title>Ficha</title>")
    out = signal_links.check_links(api.Session, pending_only=True)
    assert out["por_estado"] == {"ok": 4, "sin_respuesta": 3} and len(web["calls"]) == 4


def test_what_a_scan_captures_after_the_baseline_counts_as_a_later_signal(api):  # noqa: F811
    from app import intelligence
    from app.models import SignalKnowledge

    def tech(name, when):
        with api.db() as db:
            t = Technology(commercial_name=name, summary="x", status="capturada_no_asignada", source_channel="proactiva", captured_at=when)
            db.add(t)
            db.commit()
            return t.id

    old = tech("Anterior", datetime.now(timezone.utc) - timedelta(days=2))
    with api.db() as db:
        first = intelligence.ensure_baseline(db)  # arranque del sistema
        assert intelligence.ensure_baseline(db) == first  # no se mueve en los arranques siguientes
    new = tech("De la vigilancia reanudada", datetime.now(timezone.utc) + timedelta(seconds=5))
    with api.db() as db:
        intelligence.sync(db)  # la primera sincronizacion ocurre despues de esa vigilancia
        rows = {r.technology_id: r.origin for r in db.query(SignalKnowledge).all()}
    assert rows == {old: "historica", new: "vigilancia"}
