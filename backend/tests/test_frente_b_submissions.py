"""Frente B: portal /postular con reCAPTCHA real (P2-3) y moderacion (RF02)."""
from __future__ import annotations

import pytest

from frente_b_support import api  # noqa: F401  (fixture)

from app.config import settings
from app.models import AuditLog, Technology
from app.routers import submissions as sub_router


def _payload(**kw):
    data = {
        "commercial_name": "Novamab",
        "inn_name": "novamab",
        "mechanism": "Anticuerpo monoclonal anti-X",
        "manufacturer": "Laboratorio Andino",
        "indication": "Melanoma avanzado",
        "development_phase": "Fase III",
        "evidence_links": ["https://clinicaltrials.gov/study/NCT01234567"],
        "has_conflict": False,
        "coi_accepted": True,
        "submitter_name": "Ana Perez",
        "submitter_email": "ana@example.org",
        "submitter_org": "Universidad",
    }
    data.update(kw)
    return data


class _Resp:
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


@pytest.fixture()
def keys(monkeypatch):
    monkeypatch.setattr(settings, "recaptcha_secret", "secreto-de-prueba")
    monkeypatch.setattr(settings, "recaptcha_site_key", "llave-sitio-prueba")


def test_without_keys_the_portal_declares_degraded_mode(api):
    cfg = api.client.get("/api/public/submissions/config").json()
    assert cfg["recaptcha_enabled"] is False and cfg["mode"] == "degradado"
    assert "degradado" in cfg["message"]
    res = api.client.post("/api/public/submissions", json=_payload())
    assert res.status_code == 201
    with api.db() as db:
        row = db.query(AuditLog).filter(AuditLog.action == "submission_received").one()
        assert row.new_value["captcha"] == "omitido"


def test_half_configured_keys_do_not_lock_the_form(api, monkeypatch):
    # Solo el secreto: antes el backend exigia token y el formulario jamas podia darlo.
    monkeypatch.setattr(settings, "recaptcha_secret", "solo-secreto")
    monkeypatch.setattr(settings, "recaptcha_site_key", "")
    cfg = api.client.get("/api/public/submissions/config").json()
    assert cfg["mode"] == "incompleto" and "RECAPTCHA_SITE_KEY" in cfg["message"]
    assert api.client.post("/api/public/submissions", json=_payload()).status_code == 201


def test_with_keys_a_token_is_mandatory_and_verified(api, keys, monkeypatch):
    cfg = api.client.get("/api/public/submissions/config").json()
    assert cfg == {**cfg, "recaptcha_enabled": True, "site_key": "llave-sitio-prueba", "mode": "activo"}
    assert "secreto" not in str(cfg)

    missing = api.client.post("/api/public/submissions", json=_payload())
    assert missing.status_code == 400

    seen = {}

    def ok(url, data, timeout):
        seen.update(data)
        return _Resp({"success": True, "score": 0.9, "action": "postulacion"})

    monkeypatch.setattr(sub_router.httpx, "post", ok)
    res = api.client.post("/api/public/submissions", json=_payload(recaptcha_token="tok-humano"))
    assert res.status_code == 201
    assert seen["secret"] == "secreto-de-prueba" and seen["response"] == "tok-humano"
    with api.db() as db:
        row = db.query(AuditLog).filter(AuditLog.action == "submission_received").one()
        assert row.new_value["captcha"] == "verificado"


@pytest.mark.parametrize(
    "answer",
    [
        {"success": False},
        {"success": True, "score": 0.1, "action": "postulacion"},
        {"success": True, "score": 0.9, "action": "login"},
    ],
)
def test_robots_and_replayed_tokens_are_rejected(api, keys, monkeypatch, answer):
    monkeypatch.setattr(sub_router.httpx, "post", lambda url, data, timeout: _Resp(answer))
    res = api.client.post("/api/public/submissions", json=_payload(recaptcha_token="tok"))
    assert res.status_code == 400
    with api.db() as db:
        assert db.query(AuditLog).filter(AuditLog.action == "submission_received").count() == 0


def test_verification_outage_is_a_503_without_internal_details(api, keys, monkeypatch):
    def boom(url, data, timeout):
        raise RuntimeError("connection reset by peer 10.0.0.7")

    monkeypatch.setattr(sub_router.httpx, "post", boom)
    res = api.client.post("/api/public/submissions", json=_payload(recaptcha_token="tok"))
    assert res.status_code == 503
    assert "10.0.0.7" not in res.json()["detail"]


def test_rate_limit_is_configurable_and_not_bypassed_by_forged_headers(api, monkeypatch):
    monkeypatch.setattr(settings, "public_submissions_per_window", 2)
    for i in range(2):
        assert api.client.post("/api/public/submissions", json=_payload()).status_code == 201
    third = api.client.post("/api/public/submissions", json=_payload())
    assert third.status_code == 429

    class _Req:
        def __init__(self, peer, xff):
            self.client = type("C", (), {"host": peer})()
            self.headers = {"x-forwarded-for": xff}

    # Un cliente directo desde internet no elige su IP con una cabecera...
    assert sub_router._client_ip(_Req("203.0.113.5", "1.2.3.4")) == "203.0.113.5"
    # ...pero detras del proxy inverso institucional si vale la cabecera.
    assert sub_router._client_ip(_Req("127.0.0.1", "198.51.100.7, 10.0.0.1")) == "198.51.100.7"
    assert sub_router._client_ip(_Req("10.1.2.3", "198.51.100.8")) == "198.51.100.8"


def test_invalid_links_and_email_are_explained(api):
    bad_link = api.client.post("/api/public/submissions", json=_payload(evidence_links=["www.sin-esquema.org"]))
    assert bad_link.status_code == 422 and "http" in bad_link.json()["detail"]
    bad_mail = api.client.post("/api/public/submissions", json=_payload(submitter_email="ana-arroba"))
    assert bad_mail.status_code == 422 and "correo" in bad_mail.json()["detail"]
    no_coi = api.client.post("/api/public/submissions", json=_payload(coi_accepted=False))
    assert no_coi.status_code == 422


def test_accepted_submission_reaches_the_inbox_as_reactive_with_its_coi(api):
    body = _payload(has_conflict=True, conflict_statement="Consultoria pagada por el fabricante en 2025.")
    sid = api.client.post("/api/public/submissions", json=body).json()["id"]
    assert api.post(f"/api/submissions/{sid}/accept", role="tomador_decisiones", json={"note": ""}).status_code == 403
    res = api.post(f"/api/submissions/{sid}/accept", role="evaluador_clinico", json={"note": "Pertinente"})
    assert res.status_code == 200 and res.json()["status"] == "aceptada"
    with api.db() as db:
        tech = db.get(Technology, res.json()["technology_id"])
        assert tech.source_channel == "reactiva" and tech.status == "capturada_no_asignada"
        assert tech.raw_payload["has_conflict"] is True
        assert "Consultoria" in tech.raw_payload["conflict_statement"]
    staging = api.get("/api/technologies/staging?channel=reactiva").json()
    items = staging["items"] if isinstance(staging, dict) else staging
    assert any(i.get("id") == tech.id for i in items)
    assert api.post(f"/api/submissions/{sid}/accept", json={"note": ""}).status_code == 409


def test_reject_requires_a_reason(api):
    sid = api.client.post("/api/public/submissions", json=_payload()).json()["id"]
    assert api.post(f"/api/submissions/{sid}/reject", json={"note": "  "}).status_code == 409
    res = api.post(f"/api/submissions/{sid}/reject", json={"note": "Fuera de alcance"})
    assert res.status_code == 200 and res.json()["status"] == "rechazada"
