"""Alertas: filtros y paginación, contexto, resumen, reglas, leer y desleer, quitar y exporte."""
from __future__ import annotations

import datetime as dt

import pytest

from frente_a_helpers import Harness

from app import strategy_service
from app.models import AlertEvent, AlertSubscription, Cluster, CycleTechnology
from app.routers import strategy


@pytest.fixture()
def h():
    harness = Harness(strategy)
    yield harness
    harness.close()


def _alert(h, role="superadmin", *, kind="new_phase3_colombia", title="Aviso", body="", tech=None, cluster_id=None, read=False, minutes=0):
    row = AlertEvent(
        user_id=h.users[role].id,
        kind=kind,
        title=title,
        body=body,
        technology_id=tech.id if tech else None,
        cluster_id=cluster_id,
        read_at=dt.datetime.now(dt.timezone.utc) if read else None,
        created_at=dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=minutes),
    )
    h.db.add(row)
    h.db.commit()
    return row


def test_list_filters_paginates_and_brings_context(h):
    cluster = h.db.query(Cluster).first()
    tech = h.tech("Terapia X", status="priorizada")
    first = _alert(h, title="Cambio en Terapia X", kind="phase_change_high_budget", tech=tech, cluster_id=cluster.id, minutes=1)
    _alert(h, title="Otra cosa", body="menciona terapia", minutes=2)
    _alert(h, title="Vigilancia terminada", kind="vigilancia_programada", read=True, minutes=3)
    _alert(h, "tomador_decisiones", title="Ajena")

    res = h.client.get("/api/alerts")
    assert res.headers["x-total-count"] == "3"
    items = res.json()
    assert [a["title"] for a in items] == ["Cambio en Terapia X", "Otra cosa", "Vigilancia terminada"]
    top = items[0]
    assert top["id"] == first.id and top["kind_label"] == "Cambio de etapa · alto riesgo presupuestal"
    assert top["technology_name"] == "Terapia X" and top["technology_status"] == "priorizada"
    assert top["cluster_name"] == cluster.name and top["link"] == ""
    assert items[2]["link"] == "/vigilancia" and items[2]["kind_label"] == "Vigilancia programada"

    assert [a["title"] for a in h.client.get("/api/alerts", params={"q": "TERAPIA"}).json()] == ["Cambio en Terapia X", "Otra cosa"]
    assert len(h.client.get("/api/alerts", params={"kind": "vigilancia_programada"}).json()) == 1
    assert len(h.client.get("/api/alerts", params={"cluster_id": cluster.id}).json()) == 1
    assert len(h.client.get("/api/alerts", params={"unread": True}).json()) == 2
    page = h.client.get("/api/alerts", params={"limit": 1, "offset": 1})
    assert [a["title"] for a in page.json()] == ["Otra cosa"] and page.headers["x-total-count"] == "3"
    assert h.client.get("/api/alerts", params={"limit": 500}).status_code == 422


def test_summary_counts_by_kind_only_for_me(h):
    _alert(h, kind="new_phase3_colombia")
    _alert(h, kind="new_phase3_colombia", read=True)
    _alert(h, kind="vigilancia_programada")
    _alert(h, "tomador_decisiones")

    data = h.client.get("/api/alerts/summary").json()
    assert (data["total"], data["unread"]) == (3, 2) and data["last_at"]
    by_kind = {k["kind"]: (k["total"], k["unread"]) for k in data["by_kind"]}
    assert by_kind == {"new_phase3_colombia": (2, 1), "vigilancia_programada": (1, 1)}
    assert data["by_kind"][0]["label"]

    empty = h.as_role("revisor_pares").client.get("/api/alerts/summary").json()
    assert empty == {"total": 0, "unread": 0, "by_kind": [], "last_at": None}


def test_rules_explain_each_kind_with_the_current_threshold(h):
    _alert(h, kind="phase_change_high_budget")
    rules = h.client.get("/api/alerts/rules").json()
    by_kind = {r["kind"]: r for r in rules}
    assert set(by_kind) == {
        "new_phase3_colombia", "phase_change_high_budget", "clinical_phase_change_high_budget",
        "vigilancia_programada", "duplicados_propuestos",
    }
    assert "5 o más puntos" in by_kind["phase_change_high_budget"]["scope"]
    assert by_kind["phase_change_high_budget"]["last_30_days"] == 1
    assert by_kind["new_phase3_colombia"]["last_30_days"] == 0 and by_kind["new_phase3_colombia"]["label"]


def test_read_keeps_the_first_date_unread_and_delete_are_only_mine(h):
    mine = _alert(h)
    other = _alert(h, "tomador_decisiones")

    first = h.client.post(f"/api/alerts/{mine.id}/read").json()
    again = h.client.post(f"/api/alerts/{mine.id}/read").json()
    assert first["read_at"] and again["read_at"] == first["read_at"]

    back = h.client.post(f"/api/alerts/{mine.id}/unread")
    assert back.status_code == 200 and back.json()["read_at"] is None

    for call in (
        lambda: h.client.post(f"/api/alerts/{other.id}/read"),
        lambda: h.client.post(f"/api/alerts/{other.id}/unread"),
        lambda: h.client.delete(f"/api/alerts/{other.id}"),
    ):
        assert call().status_code == 404

    assert h.client.delete(f"/api/alerts/{mine.id}").status_code == 204
    assert h.db.query(AlertEvent).count() == 1


def test_read_all_respects_the_filter_and_clear_read_keeps_the_unread(h):
    _alert(h, kind="new_phase3_colombia")
    _alert(h, kind="vigilancia_programada")
    _alert(h, kind="vigilancia_programada", read=True)
    _alert(h, "tomador_decisiones", read=True)

    assert h.client.post("/api/alerts/read-all", params={"kind": "vigilancia_programada"}).json() == {"updated": 1}
    assert len(h.client.get("/api/alerts", params={"unread": True}).json()) == 1

    assert h.client.post("/api/alerts/clear-read").json() == {"deleted": 2}
    assert [a["kind"] for a in h.client.get("/api/alerts").json()] == ["new_phase3_colombia"]
    h.db.expire_all()
    assert h.db.query(AlertEvent).filter(AlertEvent.user_id == h.users["tomador_decisiones"].id).count() == 1


def test_export_uses_the_filter_and_neutralises_formulas(h):
    cluster = h.db.query(Cluster).first()
    tech = h.tech("Terapia Y")
    _alert(h, title="=HYPERLINK(1)", body="detalle", tech=tech, cluster_id=cluster.id)
    _alert(h, title="Leída", read=True)

    res = h.client.get("/api/alerts/export", params={"unread": True})
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    lines = res.content.decode("utf-8-sig").splitlines()
    assert lines[0] == "Fecha;Tipo;Título;Detalle;Tecnología;Clúster;Leída el"
    assert len(lines) == 2
    cells = lines[1].split(";")
    assert cells[1] == "Ensayo fase III en el país" and cells[2] == "'=HYPERLINK(1)"
    assert cells[4] == "Terapia Y" and cells[5] == cluster.name


def test_inactive_subscriber_does_not_get_new_alerts(h):
    cluster = h.db.query(Cluster).first()
    active, retired = h.users["superadmin"], h.users["tomador_decisiones"]
    for user in (active, retired):
        h.db.add(AlertSubscription(user_id=user.id, cluster_id=None, enabled=True))
    retired.is_active = False
    cycle = h.cycle(status="en_priorizacion")
    tech = h.tech("Alto riesgo", status="priorizada", cluster_id=cluster.id)
    h.db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status="priorizada", priority_points=6))
    h.db.commit()

    strategy_service.watch_technology(h.db, tech, previous_status="filtrada_apta_priorizacion")
    h.db.commit()

    owners = {a.user_id for a in h.db.query(AlertEvent).all()}
    assert owners == {active.id}
