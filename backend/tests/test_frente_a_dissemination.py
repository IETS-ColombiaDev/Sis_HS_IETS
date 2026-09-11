"""Frente A: boletines (RF19), alertas (RF20) y canal de correo (P3-2, P4-2)."""
from __future__ import annotations

import pytest

from frente_a_helpers import Harness

from app import mailer, strategy_service
from app.config import settings
from app.models import AlertEvent, AlertSubscription, Cluster
from app.routers import strategy


@pytest.fixture()
def h():
    harness = Harness(strategy)
    yield harness
    harness.close()


# --------------------------------------------------------------------------- #
#  Bug: recompilar un boletin aprobado permitia publicar cifras no aprobadas
# --------------------------------------------------------------------------- #
def test_recompiling_an_approved_bulletin_requires_a_new_approval(h):
    cycle = h.cycle(status="en_evaluacion")
    compiled = h.client.post(f"/api/bulletins/compile/{cycle.id}").json()
    approved = h.client.post(f"/api/bulletins/{compiled['id']}/approve", json={"publish": False}).json()
    assert approved["approved_by"] == "superadmin@iets.org.co"

    recompiled = h.client.post(f"/api/bulletins/compile/{cycle.id}").json()

    assert recompiled["id"] == compiled["id"]
    assert recompiled["approved_by"] == ""
    assert recompiled["status"] == "pendiente_aprobacion"


def test_publishing_follows_approval_and_is_final(h):
    cycle = h.cycle(status="en_evaluacion")
    bid = h.client.post(f"/api/bulletins/compile/{cycle.id}").json()["id"]

    published = h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": True})
    again = h.client.post(f"/api/bulletins/{bid}/approve", json={"publish": False})
    export = h.client.get(f"/api/bulletins/{bid}/export")

    assert published.json()["status"] == "publicado"
    assert again.status_code == 409
    assert export.status_code == 200 and "text/html" in export.headers["content-type"]


def test_bulletin_actions_require_cycle_write(h):
    cycle = h.cycle(status="en_evaluacion")

    res = h.as_role("tomador_decisiones").client.post(f"/api/bulletins/compile/{cycle.id}")

    assert res.status_code == 403


# --------------------------------------------------------------------------- #
#  Alertas: suscripcion por cluster, bandeja y canal de correo
# --------------------------------------------------------------------------- #
def test_subscription_per_cluster_can_be_toggled_and_validates_the_cluster(h):
    cluster = h.db.query(Cluster).first()

    on = h.client.post("/api/alerts/subscriptions", json={"cluster_id": cluster.id, "enabled": True})
    off = h.client.post("/api/alerts/subscriptions", json={"cluster_id": cluster.id, "enabled": False})
    bad = h.client.post("/api/alerts/subscriptions", json={"cluster_id": 99999, "enabled": True})
    listed = h.client.get("/api/alerts/subscriptions").json()

    assert on.status_code == 200 and on.json()["enabled"] is True
    assert off.json()["id"] == on.json()["id"] and off.json()["enabled"] is False
    assert bad.status_code == 422
    assert len(listed) == 1


def test_read_all_marks_only_my_unread_alerts(h):
    me = h.users["superadmin"]
    other = h.users["tomador_decisiones"]
    for user in (me, me, other):
        h.db.add(AlertEvent(user_id=user.id, kind="new_phase3_colombia", title="Aviso"))
    h.db.commit()

    res = h.client.post("/api/alerts/read-all")

    assert res.json() == {"updated": 2}
    assert h.client.get("/api/alerts", params={"unread": True}).json() == []
    h.db.expire_all()
    assert h.db.query(AlertEvent).filter(AlertEvent.user_id == other.id, AlertEvent.read_at.is_(None)).count() == 1


def test_channels_report_email_only_with_smtp(h, monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    assert h.client.get("/api/alerts/channels").json()["email"] is False
    monkeypatch.setattr(settings, "smtp_host", "smtp.iets.test")
    assert h.client.get("/api/alerts/channels").json()["email"] is True


def test_alerts_are_emailed_to_subscribers_when_smtp_is_configured(h, monkeypatch):
    queued = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.iets.test")
    monkeypatch.setattr(mailer, "send_mail_async", lambda to, subject, text, html=None: queued.append((to, subject)) or True)
    tech = h.tech("Terapia genica", development_phase="Fase III en Colombia", indication="Hemofilia colombia")
    subscriber = h.users["evaluador_clinico"]
    h.db.add(AlertSubscription(user_id=subscriber.id, cluster_id=tech.cluster_id, enabled=True))
    h.db.commit()

    strategy_service.watch_technology(h.db, tech, previous_phase="Fase II", previous_status="")
    h.db.commit()

    assert h.db.query(AlertEvent).filter(AlertEvent.user_id == subscriber.id).count() == 1
    assert queued and queued[0][0] == subscriber.email
    assert queued[0][1].startswith("[Alerta IETS]")


# --------------------------------------------------------------------------- #
#  Mailer
# --------------------------------------------------------------------------- #
def test_mailer_is_a_noop_without_smtp(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "")
    called = []
    monkeypatch.setattr(mailer, "_deliver", lambda msg: called.append(msg))

    result = mailer.send_mail("a@b.co", "Asunto", "Texto")

    assert result.sent is False and "SMTP" in result.detail
    assert mailer.send_mail_async("a@b.co", "Asunto", "Texto") is False
    assert called == []


def test_mailer_never_raises_when_the_server_fails(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "smtp.iets.test")

    def boom(msg):
        raise ConnectionRefusedError("sin servidor")

    monkeypatch.setattr(mailer, "_deliver", boom)

    result = mailer.send_mail("a@b.co", "Asunto", "Texto")

    assert result.sent is False
    assert "ConnectionRefusedError" in result.detail


def test_invitation_mail_escapes_user_text(monkeypatch):
    sent = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.iets.test")
    monkeypatch.setattr(mailer, "_deliver", lambda msg: sent.append(msg))

    result = mailer.reviewer_invitation(
        to="par@u.edu", reviewer_name="<script>x</script>", doc_title="Doc", link="https://x/revisar/t", days=10
    )

    assert result.sent is True
    html = sent[0].get_body(("html",)).get_content()
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "10 días" in sent[0].get_body(("plain",)).get_content()
