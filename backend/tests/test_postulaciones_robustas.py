"""Postulaciones: radicado, consulta pública del estado, motivos de rechazo, reapertura, duplicados y exporte."""
from __future__ import annotations

import pytest

from frente_b_support import api  # noqa: F401  (fixture)

from app.models import AuditLog, Submission
from app.routers import submissions as sub_router


@pytest.fixture(autouse=True)
def _no_rate_limit():
    sub_router._hits.clear()
    yield
    sub_router._hits.clear()


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


def _send(api, **kw):
    res = api.client.post("/api/public/submissions", json=_payload(**kw))
    assert res.status_code == 201, res.text
    return res.json()


def _ids(api, url):
    return [r["id"] for r in api.get(url).json()]


def test_the_submitter_gets_a_tracking_code_and_can_check_the_status(api):
    ack = _send(api)
    code = ack["tracking_code"]
    assert code.startswith("POS-") and code.endswith(f"{ack['id']:05d}")

    ok = api.client.post("/api/public/submissions/status", json={"code": code.lower(), "email": "ANA@example.org"})
    assert ok.status_code == 200
    assert ok.json()["status"] == "recibida" and ok.json()["status_label"] == "En moderación"
    assert ok.json()["resolved_at"] is None

    # Radicado correcto con otro correo, o radicado inexistente: la misma respuesta.
    for body in (
        {"code": code, "email": "otra@example.org"},
        {"code": "POS-2026-99999", "email": "ana@example.org"},
        {"code": "x", "email": "ana@example.org"},
    ):
        res = api.client.post("/api/public/submissions/status", json=body)
        assert res.status_code == 404 and "radicado" in res.json()["detail"]

    api.post(f"/api/submissions/{ack['id']}/reject", json={"reason": "fuera_alcance", "note": "nota interna que no se publica"})
    done = api.client.post("/api/public/submissions/status", json={"code": code, "email": "ana@example.org"}).json()
    assert done["status"] == "rechazada" and done["resolved_at"]
    assert "Fuera del alcance" in done["message"] and "nota interna" not in done["message"]


def test_the_status_check_is_rate_limited(api, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "public_submissions_per_window", 2)
    body = {"code": "POS-2026-00001", "email": "a@b.co"}
    codes = [api.client.post("/api/public/submissions/status", json=body).status_code for _ in range(3)]
    assert codes == [404, 404, 429]


def test_reject_with_a_typified_reason_needs_no_note_but_other_does(api):
    sid = _send(api)["id"]
    assert api.post(f"/api/submissions/{sid}/reject", json={"reason": "inventado", "note": "x"}).status_code == 409
    assert api.post(f"/api/submissions/{sid}/reject", json={"reason": "otro", "note": " "}).status_code == 409
    res = api.post(f"/api/submissions/{sid}/reject", json={"reason": "duplicada"})
    assert res.status_code == 200
    assert res.json()["reject_reason"] == "duplicada" and res.json()["reject_reason_label"] == "Postulación duplicada"
    with api.db() as db:
        ev = db.query(AuditLog).filter(AuditLog.action == "submission_rejected").one()
        assert ev.new_value["reason"] == "duplicada"


def test_a_rejected_submission_can_be_reopened_with_a_note(api):
    sid = _send(api)["id"]
    api.post(f"/api/submissions/{sid}/reject", json={"reason": "datos_incompletos"})
    assert api.post(f"/api/submissions/{sid}/reopen", role="tomador_decisiones", json={"note": "x"}).status_code == 403
    assert api.post(f"/api/submissions/{sid}/reopen", json={"note": "  "}).status_code == 409
    res = api.post(f"/api/submissions/{sid}/reopen", json={"note": "El postulante envió el registro del ensayo."})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "recibida" and body["reject_reason"] == "" and body["reviewed_by"] == ""
    # Una aceptada no se reabre: ya creó una señal.
    api.post(f"/api/submissions/{sid}/accept", json={"note": ""})
    assert api.post(f"/api/submissions/{sid}/reopen", json={"note": "de nuevo"}).status_code == 409

    actions = [h["action"] for h in api.get(f"/api/submissions/{sid}/history").json()]
    assert [a for a in actions if a != "submission_cross_check"] == [
        "submission_received",
        "submission_rejected",
        "submission_reopened",
        "submission_accepted",
    ]


def test_the_same_person_cannot_file_the_same_technology_twice_while_pending(api):
    first = _send(api)
    again = api.client.post("/api/public/submissions", json=_payload(commercial_name="NOVAMAB ", inn_name=""))
    assert again.status_code == 422 and first["tracking_code"] in again.json()["detail"]
    # Otra persona sí puede: queda señalada como posible duplicado para quien modera.
    other = _send(api, submitter_email="luis@example.org")
    rows = {r["id"]: r for r in api.get("/api/submissions").json()}
    assert [d["id"] for d in rows[other["id"]]["duplicates"]] == [first["id"]]
    assert rows[other["id"]]["duplicates"][0]["same_submitter"] is False
    # Resuelta la primera, la misma persona puede volver a postular.
    api.post(f"/api/submissions/{first['id']}/reject", json={"reason": "evidencia_insuficiente"})
    assert api.client.post("/api/public/submissions", json=_payload()).status_code == 201


def test_the_form_rejects_unusable_links_and_oversized_text(api):
    for bad in (
        {"evidence_links": [f"https://example.org/{i}" for i in range(11)]},
        {"evidence_links": ["https://sin-dominio"]},
        {"evidence_links": ["https://example.org/a b"]},
        {"indication": "x" * 4001},
    ):
        res = api.client.post("/api/public/submissions", json=_payload(**bad))
        assert res.status_code == 422, bad
    ok = _send(api, evidence_links=["https://example.org/a", "https://example.org/a", " https://example.org/b "])
    with api.db() as db:
        assert db.get(Submission, ok["id"]).evidence_links == ["https://example.org/a", "https://example.org/b"]


def test_search_filters_and_summary(api):
    a = _send(api)
    b = _send(
        api,
        commercial_name="Cardiostent",
        inn_name="",
        indication="Estenosis coronaria",
        submitter_email="luis@example.org",
        has_conflict=True,
        conflict_statement="Empleado del fabricante desde 2024.",
    )
    api.post(f"/api/submissions/{a['id']}/reject", json={"reason": "sin_novedad"})

    assert _ids(api, "/api/submissions?q=coronaria") == [b["id"]]
    assert _ids(api, f"/api/submissions?q={b['tracking_code']}") == [b["id"]]
    assert _ids(api, "/api/submissions?q=ana@example.org") == [a["id"]]
    assert _ids(api, "/api/submissions?conflict=true") == [b["id"]]
    assert _ids(api, "/api/submissions?status=recibida&conflict=false") == []
    assert _ids(api, "/api/submissions?order=antiguas") == [a["id"], b["id"]]
    assert _ids(api, "/api/submissions?stale=true") == []

    s = api.get("/api/submissions/summary").json()
    assert (s["total"], s["pending"], s["accepted"], s["rejected"]) == (2, 1, 0, 1)
    assert s["pending_with_conflict"] == 1 and s["pending_stale"] == 0
    assert s["reject_reasons"] == [
        {"code": "sin_novedad", "label": "Tecnología ya disponible en el país (sin novedad)", "count": 1}
    ]
    assert {r["code"] for r in s["reasons"]} >= {"otro", "duplicada", "fuera_alcance"}


def test_export_csv_is_for_moderators_and_neutralises_formulas(api):
    _send(api, commercial_name="=SUM(A1:A9)", inn_name="")
    assert api.get("/api/submissions/export.csv", role="tomador_decisiones").status_code == 403
    res = api.get("/api/submissions/export.csv")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    text = res.content.decode("utf-8-sig")
    assert text.splitlines()[0].startswith("Radicado;Estado;Recibida")
    assert ";'=SUM(A1:A9);" in text
    with api.db() as db:
        assert db.query(AuditLog).filter(AuditLog.action == "submission_export").count() == 1
