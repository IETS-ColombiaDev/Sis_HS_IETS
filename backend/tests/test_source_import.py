"""Importacion comparada de la matriz EH: Excel o Google Sheets, diferencias y deteccion sugerida."""
from __future__ import annotations

import io

import openpyxl
import pytest
from frente_b_support import api  # noqa: F401  (fixture)

from app import ai_service, source_import, source_matrix
from app.models import Source

HEADERS = [
    "Tipo de Entidad", "Nivel de fuente", "Fuentes verificada manual", "Sitio / Organización", "País",
    "Tipo de tecnología", "URL / sitio a consultar", "Información general y documentos metodológicos",
    "Tipo de material", "Ruta de acceso", "Información a consultar", "Observaciones",
    "Estructura de publicación", "Formato", "Frecuencia", "Idioma", "Interfaz", "Restricciones",
]


def _workbook(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "MATRIZ FI EH"
    ws.append(HEADERS)
    for row in rows:
        ws.append(row + [""] * (len(HEADERS) - len(row)))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _row(name, url, *, entity="Agencia de HTA", access="", restrictions="", observations="Prioridad alta"):
    return [entity, "Terciaria", "AGREGADA", name, "Internacional", "MED, DM", url, "", "Informes",
            access, "Tecnologías emergentes", observations, "", "HTML", "Mensual", "Inglés", "", restrictions]


@pytest.fixture(autouse=True)
def _no_network(monkeypatch, tmp_path):
    """Sin IA ni GET reales en la comparacion."""
    monkeypatch.setattr(ai_service, "is_enabled", lambda: False)
    monkeypatch.setattr(
        "app.source_discovery.check_reachable", lambda url: {"ok": True, "status": 200, "detail": "HTTP 200"}
    )
    # La matriz empaquetada (y su copia .prev) no se toca desde las pruebas.
    monkeypatch.setattr(source_matrix, "DATA_FILE", tmp_path / "matriz_fuentes_eh.json")
    monkeypatch.setattr(source_matrix, "write_data_file", lambda parsed, path=None: path)


def _compare(api, content: bytes, **form):
    files = {"file": ("FUENTES DE INFORMACION PROACTIVA EH.xlsx", content,
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    return api.post("/api/sources/matrix/compare", files=files, data={"use_ai": "true", **form})


def test_google_sheet_urls_become_xlsx_exports():
    edit = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit#gid=0"
    assert source_import.google_sheet_export_url(edit) == (
        "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/export?format=xlsx"
    )
    pub = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQabcdefghij/pubhtml"
    assert source_import.google_sheet_export_url(pub).endswith("/d/e/2PACX-1vQabcdefghij/pub?output=xlsx")
    assert source_import.google_sheet_export_url("https://evil.test/spreadsheets/d/xx") == ""


def test_a_private_google_sheet_explains_how_to_share_it(monkeypatch):
    import httpx

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, headers=None):
            return httpx.Response(200, content=b"<html>Sign in</html>")

    monkeypatch.setattr(httpx, "Client", FakeClient)
    with pytest.raises(ValueError, match="Cualquier persona con el enlace"):
        source_import.fetch_google_sheet("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit")


def test_compare_finds_new_changed_and_missing_sources(api):
    with api.Session() as db:
        db.add(Source(title="Observatorio Existente", url="https://obs.example.org/", connector="html",
                      scrape_enabled=True, source_level="secundaria", matrix_ref="MATRIZ FI EH fila 9"))
        db.add(Source(title="Fuente vieja de la matriz", url="https://vieja.example.org/", connector="html",
                      matrix_ref="MATRIZ FI EH fila 50"))
        db.commit()
    content = _workbook([
        _row("Observatorio Existente", "https://obs.example.org/"),
        _row("Agencia Nueva de HTA", "https://nueva-hta.test/informes", access="Inicio → Horizon scanning → Reports"),
        _row("Revista con suscripción", "https://revista-paga.test/", restrictions="Acceso con suscripción paga"),
    ])
    res = _compare(api, content)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["summary"] == {"nuevas": 2, "cambios": 1, "sin_cambios": 0, "ausentes": 1}
    changed = body["changed"][0]
    assert changed["source_title"] == "Observatorio Existente" and changed["match_reason"] == "url"
    assert {c["field"] for c in changed["changes"]} >= {"source_level", "tech_types"}
    new = {n["name"]: n for n in body["new"]}
    hta = new["Agencia Nueva de HTA"]["suggestion"]
    assert hta["connector"] == "html" and hta["detection"] == "html_recorrido" and hta["enable_ingest"] is True
    assert "horizon scanning" in hta["follow_keywords"]
    paid = new["Revista con suscripción"]["suggestion"]
    assert paid["connector"] == "manual" and paid["enable_ingest"] is False
    assert "IA no disponible" in body["ai_note"]
    assert body["missing"][0]["title"] == "Fuente vieja de la matriz"


def test_known_api_domains_are_suggested_with_their_adapter(api):
    content = _workbook([_row("Registro de ensayos", "https://clinicaltrials.gov/search?cond=cancer", entity="Registro de ensayos")])
    sug = _compare(api, content).json()["new"][0]["suggestion"]
    assert sug["connector"] == "clinicaltrials" and sug["access_level"] == "A" and sug["detection"] == "api"


def test_a_blocking_site_warns_about_the_news_fallback(api, monkeypatch):
    monkeypatch.setattr(
        "app.source_discovery.check_reachable", lambda url: {"ok": True, "status": 403, "detail": "HTTP 403"}
    )
    sug = _compare(api, _workbook([_row("Sitio bloqueado", "https://bloqueado.test/")])).json()["new"][0]["suggestion"]
    assert "Google News" in sug["rationale"]


def test_ai_review_adjusts_the_rule_suggestion(api, monkeypatch):
    monkeypatch.setattr(ai_service, "is_enabled", lambda: True)
    answer = (
        '[{"index": 0, "connector": "html", "detection": "rss", "access_level": "B", "enable_ingest": true,'
        ' "follow_keywords": ["news", "approvals"], "search_terms": ["horizon scanning report"],'
        ' "entry_url": "https://nueva-hta.test/rss", "rationale": "Publica un RSS oficial de informes."}]'
    )
    monkeypatch.setattr(ai_service, "generate", lambda *a, **k: (answer, "test-model"))
    body = _compare(api, _workbook([_row("Agencia Nueva de HTA", "https://nueva-hta.test/")])).json()
    sug = body["new"][0]["suggestion"]
    assert sug["origin"] == "ia" and sug["detection"] == "rss" and sug["access_level"] == "B"
    assert sug["entry_urls"][0] == "https://nueva-hta.test/rss"
    assert "approvals" in sug["follow_keywords"]
    assert "La IA revisó 1 de 1" in body["ai_note"]


def test_apply_creates_and_updates_only_what_was_chosen(api):
    with api.Session() as db:
        db.add(Source(title="Observatorio Existente", url="https://obs.example.org/", connector="html",
                      scrape_enabled=True, source_level="secundaria"))
        db.commit()
    content = _workbook([
        _row("Observatorio Existente", "https://obs.example.org/"),
        _row("Agencia Nueva de HTA", "https://nueva-hta.test/informes"),
        _row("Otra nueva", "https://otra-nueva.test/"),
    ])
    body = _compare(api, content).json()
    new = {n["name"]: n for n in body["new"]}
    chosen = {**new["Agencia Nueva de HTA"]["suggestion"], "key": new["Agencia Nueva de HTA"]["key"],
              "connector": "html", "access_level": "C"}
    res = api.post("/api/sources/matrix/apply", json={
        "token": body["token"], "create": [chosen], "update": [body["changed"][0]["key"]], "overwrite": True,
    })
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["created"] == 1 and out["updated"] == 1
    with api.Session() as db:
        created = db.query(Source).filter(Source.title == "Agencia Nueva de HTA").one()
        assert created.access_level == "C" and created.scrape_enabled is True
        assert created.verification_status == "matriz_importada"
        assert "Detección sugerida" in created.catalog_note
        assert db.query(Source).filter(Source.title == "Otra nueva").count() == 0
        assert db.query(Source).filter(Source.title == "Observatorio Existente").one().source_level == "terciaria"
    # Una comparacion vencida no se aplica.
    gone = api.post("/api/sources/matrix/apply", json={"token": "no-existe", "update": ["2"]})
    assert gone.status_code == 410


def test_compare_requires_a_file_or_a_sheet_url_and_write_permission(api):
    assert api.post("/api/sources/matrix/compare", data={}).status_code == 422
    bad = api.post("/api/sources/matrix/compare", data={"sheet_url": "https://example.org/hoja"})
    assert bad.status_code == 422 and "Google Sheets" in bad.json()["detail"]
    denied = _compare_as(api, "revisor_pares")
    assert denied.status_code == 403


def _compare_as(api, role):
    files = {"file": ("m.xlsx", _workbook([_row("X", "https://x-fuente.test/")]), "application/octet-stream")}
    return api.post("/api/sources/matrix/compare", role=role, files=files)
