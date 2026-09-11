"""Frente A: evaluacion temprana, revision por pares y portal del revisor (RF13-RF16)."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import cycle_service, evaluation as catalog, evaluation_service, mailer
from app.config import settings
from app.models import CycleTechnology, EvaluationDoc, ReviewAssignment
from app.routers import evaluation, review_portal, technologies


@pytest.fixture()
def h():
    harness = Harness(evaluation, review_portal, technologies)
    yield harness
    harness.close()


def _prioritized(h, *, points=5, status="priorizada"):
    cycle = h.cycle(status="en_evaluacion")
    tech = h.tech("Lutecio-177 dotatate")
    entry = h.entry(cycle, tech, status, priority_points=points, priority_pct=round(points / 6 * 100, 2))
    return cycle, tech, entry


def _fill_and_sign(h, doc_id):
    h.client.post(f"/api/reports/{doc_id}/coi", json={"accepted": True})
    body = {key: f"Contenido de {key}" for key in catalog.required_fields("mini_hta")}
    res = h.client.put(f"/api/reports/{doc_id}", json={"body": body, "product_level": "ficha"})
    assert res.status_code == 200, res.text


# --------------------------------------------------------------------------- #
#  Bug: la pantalla abria expedientes sin mover la instancia a evaluacion
# --------------------------------------------------------------------------- #
def test_opening_a_dossier_moves_the_prioritized_entry_to_evaluation(h):
    cycle, tech, entry = _prioritized(h)

    res = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id})

    assert res.status_code == 200
    assert res.json()["product_level"] == "informe"
    assert h.refresh(entry).status == "en_evaluacion"


def test_opening_a_dossier_for_a_non_prioritized_entry_is_rejected(h):
    cycle = h.cycle()
    tech = h.tech()
    h.entry(cycle, tech, "bajo_vigilancia")
    loose = h.tech("Sin ciclo")

    watch = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id})
    missing = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": loose.id})

    assert watch.status_code == 409
    assert missing.status_code == 404
    assert h.db.query(EvaluationDoc).count() == 0


def test_send_to_evaluation_is_rejected_in_a_frozen_cycle(h):
    cycle, tech, entry = _prioritized(h)
    entry.frozen = True
    h.db.commit()

    res = h.client.post(f"/api/technologies/{tech.id}/cycles/{cycle.id}/to-evaluation")

    assert res.status_code == 409
    assert h.refresh(entry).status == "priorizada"


# --------------------------------------------------------------------------- #
#  Bug: publicar no marcaba la instancia del ciclo como publicada
# --------------------------------------------------------------------------- #
def test_publishing_marks_the_cycle_entry_as_published(h):
    cycle, tech, entry = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]
    _fill_and_sign(h, doc_id)
    invite = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Par", "reviewer_email": "par@universidad.edu"},
    ).json()
    h.client.post(f"/api/public/reviews/{invite['token']}/coi", json={"accepted": True})
    for target in ("revision_interna", "revision_externa", "aprobado_comite", "publicado"):
        res = h.client.post(f"/api/reports/{doc_id}/transition", json={"status": target})
        assert res.status_code == 200, (target, res.text)

    assert h.refresh(entry).status == "publicada"
    summary = cycle_service.cycle_summary(h.db, h.refresh(cycle))
    assert summary["published"] == 1 and summary["in_evaluation"] == 0


def test_transition_hints_explain_blocked_steps(h):
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]
    h.client.post(f"/api/reports/{doc_id}/coi", json={"accepted": True})

    doc = h.client.get(f"/api/reports/{doc_id}").json()
    assert "Complete los campos obligatorios" in doc["transition_hints"]["revision_interna"]

    clinic = h.as_role("tomador_decisiones").client.get(f"/api/reports/{doc_id}").json()
    assert "permiso" in clinic["transition_hints"]["revision_interna"]


def test_publish_hint_requires_both_reviewers(h):
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]
    _fill_and_sign(h, doc_id)
    for target in ("revision_interna", "revision_externa", "aprobado_comite"):
        h.client.post(f"/api/reports/{doc_id}/transition", json={"status": target})

    doc = h.client.get(f"/api/reports/{doc_id}").json()

    assert doc["transition_hints"]["publicado"].startswith("Falta un revisor externo")


# --------------------------------------------------------------------------- #
#  Invitacion, revocacion y portal
# --------------------------------------------------------------------------- #
def test_invite_validates_the_email(h):
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]

    res = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Par", "reviewer_email": "no-es-correo"},
    )

    assert res.status_code == 409
    assert "correo" in res.json()["detail"]


def test_revoked_invitation_closes_the_portal_and_does_not_count_for_publishing(h):
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]
    h.client.post(f"/api/reports/{doc_id}/coi", json={"accepted": True})
    invite = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Par", "reviewer_email": "par@universidad.edu"},
    ).json()
    token = invite["token"]
    h.client.post(f"/api/public/reviews/{token}/coi", json={"accepted": True})
    doc = h.db.get(EvaluationDoc, doc_id)
    assert evaluation_service.can_publish(h.db, doc)[0] is True

    revoked = h.client.post(f"/api/reports/{doc_id}/assignments/{invite['assignment']['id']}/revoke")
    portal = h.client.get(f"/api/public/reviews/{token}")

    assert revoked.status_code == 200
    assert portal.status_code == 401
    assert "revocada" in portal.json()["detail"]
    h.db.expire_all()
    doc = h.db.get(EvaluationDoc, doc_id)
    ok, reason = evaluation_service.can_publish(h.db, doc)
    assert ok is False and "externo" in reason


def test_submitted_review_cannot_be_revoked(h):
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]
    _fill_and_sign(h, doc_id)
    for target in ("revision_interna", "revision_externa"):
        h.client.post(f"/api/reports/{doc_id}/transition", json={"status": target})
    invite = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Par", "reviewer_email": "par@universidad.edu"},
    ).json()
    token = invite["token"]
    h.client.post(f"/api/public/reviews/{token}/coi", json={"accepted": True})
    assert h.client.post(f"/api/public/reviews/{token}/submit", json={"verdict": "aprobado"}).status_code == 200

    res = h.client.post(f"/api/reports/{doc_id}/assignments/{invite['assignment']['id']}/revoke")

    assert res.status_code == 409


def test_reviewer_cannot_submit_a_verdict_before_external_review(h):
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]
    invite = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Par", "reviewer_email": "par@universidad.edu"},
    ).json()
    token = invite["token"]
    access = h.client.post(f"/api/public/reviews/{token}/coi", json={"accepted": True}).json()

    res = h.client.post(f"/api/public/reviews/{token}/submit", json={"verdict": "aprobado"})

    assert access["can_submit"] is False
    assert access["status_label"] == catalog.EDITORIAL_STATUS_LABELS["borrador"]
    assert res.status_code == 409
    assert "revisión externa" in res.json()["detail"]
    comment = h.client.post(f"/api/public/reviews/{token}/comments", json={"body": "Revisar la PICO"})
    assert comment.status_code == 200


# --------------------------------------------------------------------------- #
#  P3-2: la invitacion viaja por correo cuando hay SMTP
# --------------------------------------------------------------------------- #
def test_invite_without_smtp_keeps_the_copy_link_flow(h, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]

    data = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Par", "reviewer_email": "par@universidad.edu"},
    ).json()

    assert data["email_sent"] is False
    assert "SMTP" in data["email_detail"]
    assert data["invite_path"].startswith("/revisar/")
    assert data["assignment"]["status"] == "invitado"


def test_invite_with_smtp_sends_the_absolute_link(h, monkeypatch):
    sent = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.iets.test")
    monkeypatch.setattr(settings, "public_base_url", "https://horizonte.iets.org.co/")
    monkeypatch.setattr(mailer, "_deliver", lambda msg: sent.append(msg))
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]

    data = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Ana Par", "reviewer_email": "ana@universidad.edu"},
    ).json()

    assert data["email_sent"] is True
    assert data["assignment"]["status"] == "invitacion_enviada"
    assert len(sent) == 1
    msg = sent[0]
    assert msg["To"] == "ana@universidad.edu"
    assert f"https://horizonte.iets.org.co{data['invite_path']}" in msg.get_body(("plain",)).get_content()
    row = h.db.get(ReviewAssignment, data["assignment"]["id"])
    evaluation_service.sign_coi(h.db, row, accepted=True)
    assert row.status == "en_lectura"


def test_internal_invite_never_sends_a_token(h, monkeypatch):
    sent = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.iets.test")
    monkeypatch.setattr(mailer, "_deliver", lambda msg: sent.append(msg))
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]

    data = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "interno", "reviewer_name": "Colega", "reviewer_email": "colega@iets.org.co"},
    ).json()

    assert data["token"] is None and data["email_sent"] is False
    assert sent == []
    assert h.db.query(CycleTechnology).count() == 1


def test_a_reader_without_editorial_role_does_not_count_as_internal_reviewer(h):
    """Abrir el expediente y firmar el COI no convierte a un tomador de decisiones en par."""
    cycle, tech, _ = _prioritized(h)
    doc_id = h.client.post("/api/reports", json={"cycle_id": cycle.id, "technology_id": tech.id}).json()["id"]
    invite = h.client.post(
        f"/api/reports/{doc_id}/invite",
        json={"kind": "externo", "reviewer_name": "Par", "reviewer_email": "par@universidad.edu"},
    ).json()
    h.client.post(f"/api/public/reviews/{invite['token']}/coi", json={"accepted": True})
    h.as_role("tomador_decisiones").client.post(f"/api/reports/{doc_id}/coi", json={"accepted": True})

    h.db.expire_all()
    doc = h.db.get(EvaluationDoc, doc_id)
    ok, reason = evaluation_service.can_publish(h.db, doc)
    assert ok is False and "interno" in reason

    h.as_role("evaluador_clinico").client.post(f"/api/reports/{doc_id}/coi", json={"accepted": True})
    h.db.expire_all()
    assert evaluation_service.can_publish(h.db, h.db.get(EvaluationDoc, doc_id))[0] is True
