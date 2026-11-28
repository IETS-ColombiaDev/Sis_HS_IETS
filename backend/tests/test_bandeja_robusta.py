"""Bandeja de trabajo: bloques que fallan, fases, avance del ciclo, señales por día y actividad propia."""
from __future__ import annotations

import datetime as dt

from test_frente_c_dashboards import _cycle, _seed_work, h  # noqa: F401  (fixture)

from app import ttm
from app.models import AuditLog, Bulletin, Finding, Source, Technology, User
from app.routers import dashboard


def _user(h, role):
    return h.db.query(User).filter(User.role == role).first()


def test_a_failing_block_is_skipped_and_reported_instead_of_breaking_the_inbox(h, monkeypatch):
    _seed_work(h)

    def boom(db):
        raise RuntimeError("consulta rota")

    monkeypatch.setattr(dashboard, "_item_drafts", boom)
    res = h.as_role("superadmin").get("/api/dashboard/my-work")
    assert res.status_code == 200
    body = res.json()
    keys = [i["key"] for i in body["items"]]
    assert "drafts" not in keys and "rate" in keys and "submissions" in keys
    assert body["degraded"] == ["drafts"]
    assert body["generated_at"]

    monkeypatch.setattr(dashboard, "work_queue", lambda db, limit=12: (_ for _ in ()).throw(RuntimeError("cola rota")))
    body = h.client.get("/api/dashboard/my-work").json()
    assert body["degraded"] == ["drafts", "queue"] and body["queue"] == [] and body["items"]


def test_items_carry_their_phase_and_the_totals_per_phase(h):
    _seed_work(h)
    body = h.as_role("superadmin").get("/api/dashboard/my-work").json()
    assert body["degraded"] == []
    phases = {i["key"]: i["phase"] for i in body["items"]}
    assert phases["rate"] == "priorizacion" and phases["classify"] == "identificacion"
    assert phases["drafts"] == "caracterizacion" and phases["bulletins_pending"] == "diseminacion"
    assert phases["cycle_deadline"] == ""  # el vencimiento es del ciclo, no de una fase

    expected: dict[str, int] = {}
    for item in body["items"]:
        if item["phase"] and item["severity"] in ("accion", "aviso") and item["count"] > 0:
            expected[item["phase"]] = expected.get(item["phase"], 0) + item["count"]
    assert body["by_phase"] == expected and body["by_phase"]["priorizacion"] == 2

    # Para quien solo lee, las novedades no cuentan como pendientes de una fase.
    reader = h.as_role("tomador_decisiones").get("/api/dashboard/my-work").json()
    assert all(i["severity"] in ("info", "aviso", "ok") or i["count"] == 0 or i["phase"] for i in reader["items"])


def test_cycle_schedule_tells_days_left_and_progress(h):
    today = ttm.today_co()
    assert h.as_role("superadmin").get("/api/dashboard/my-work").json()["active_cycle_schedule"] is None

    cycle = _cycle(
        h.db, "Ciclo fechas",
        opened_on=today - dt.timedelta(days=30),
        data_cutoff_on=today + dt.timedelta(days=10),
        bulletin_due_on=today + dt.timedelta(days=30),
    )
    sched = h.client.get("/api/dashboard/my-work").json()["active_cycle_schedule"]
    assert sched["opened_on"] == cycle.opened_on.isoformat()
    assert (sched["days_to_open"], sched["days_to_cutoff"], sched["days_to_closing"]) == (-30, 10, 30)
    assert sched["elapsed_pct"] == 50

    cycle.bulletin_due_on = None
    cycle.data_cutoff_on = today - dt.timedelta(days=5)
    h.db.commit()
    late = h.client.get("/api/dashboard/my-work").json()["active_cycle_schedule"]
    assert late["bulletin_due_on"] is None and late["days_to_closing"] == -5 and late["elapsed_pct"] == 100


def test_signals_by_day_covers_seven_days_ending_today(h):
    db = h.db
    source = Source(title="Fuente", url="https://f.example")
    db.add(source)
    db.flush()
    now = dt.datetime.now(dt.timezone.utc)
    for n, days_ago in enumerate((0, 0, 2, 6, 9)):
        db.add(Finding(source_id=source.id, title=f"Señal {days_ago}", content_hash=f"hash-{n}", created_at=now - dt.timedelta(days=days_ago)))
    db.commit()

    wb = h.as_role("superadmin").get("/api/dashboard/workbench").json()
    days = wb["findings_by_day"]
    assert len(days) == 7 and days[-1]["date"] == ttm.today_co().isoformat()
    assert [d["date"] for d in days] == sorted(d["date"] for d in days)
    assert sum(d["count"] for d in days) == 4  # la de hace 9 días queda fuera
    assert days[-1]["count"] >= 1


def test_my_activity_summarises_my_own_actions_with_links(h):
    db = h.db
    me, other = _user(h, "superadmin"), _user(h, "evaluador_tecnico")
    cycle = _cycle(db, "Ciclo actividad")
    tech = Technology(commercial_name="Terapia Z", status="priorizada")
    bulletin = Bulletin(cycle_id=cycle.id, title="Boletín Z", status="pendiente_aprobacion", body={})
    db.add_all([tech, bulletin])
    db.commit()
    now = dt.datetime.now(dt.timezone.utc)

    def log(user, minutes, entity, eid, action, request=""):
        db.add(AuditLog(
            user_id=user.id, user_email=user.email, entity_type=entity, entity_id=str(eid), action=action,
            occurred_at=now - dt.timedelta(minutes=minutes), request_id=request,
        ))

    log(me, 50, "auth", me.id, "auth:login")  # los accesos no se muestran
    log(me, 40, "technologies", tech.id, "update", "r1")
    log(me, 30, "cycle_technologies", 1, "update", "r2")  # la misma operación deja dos filas
    log(me, 30, "cycles", cycle.id, "cycle:transition", "r2")
    log(me, 20, "bulletins", bulletin.id, "bulletin:approve", "r3")
    log(me, 10, "strategy_dashboard", cycle.id, "strategy:export", "r4")
    log(me, 5, "technologies", 99999, "delete", "r5")
    log(other, 1, "cycles", cycle.id, "cycle:close", "r9")  # de otra persona
    db.commit()

    items = h.as_role("superadmin").get("/api/dashboard/my-activity").json()
    assert [i["label"] for i in items] == [
        "Eliminó una tecnología",
        "Descargó el recorte del tablero",
        "Aprobó un boletín",
        "Cambió la etapa de un ciclo",
        "Editó una tecnología",
    ]
    assert items[0]["to"] == "" and items[0]["name"] == ""
    assert items[1] == {"label": "Descargó el recorte del tablero", "name": "Ciclo actividad", "to": f"/dashboards?ciclo={cycle.id}", "at": items[1]["at"]}
    assert (items[2]["name"], items[2]["to"]) == ("Boletín Z", "/boletines")
    assert (items[3]["name"], items[3]["to"]) == ("Ciclo actividad", "/ciclos")
    assert (items[4]["name"], items[4]["to"]) == ("Terapia Z", f"/evaluacion?tecnologia={tech.id}")

    assert len(h.client.get("/api/dashboard/my-activity", params={"limit": 2}).json()) == 2
    assert h.as_role("revisor_pares").get("/api/dashboard/my-activity").json() == []
