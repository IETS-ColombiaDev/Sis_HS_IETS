from __future__ import annotations

from datetime import date

import pytest

from app.models import AuditLog, Cycle, CycleTechnology, Technology
from frente_b_support import api  # noqa: F401  (fixture)


def _tech(api, name: str, status: str = "capturada_no_asignada", **kw) -> int:
    with api.db() as db:
        tech = Technology(commercial_name=name, status=status, **kw)
        db.add(tech)
        db.commit()
        return tech.id


def _staging_ids(api, **params) -> set[int]:
    res = api.get("/api/technologies/staging", params=params)
    assert res.status_code == 200
    return {t["id"] for t in res.json()}


def test_discard_by_row_and_batch_logs_reason_and_keeps_rows(api):
    a, b, c = (_tech(api, n) for n in ("Alfa", "Beta", "Gama"))

    one = api.post("/api/technologies/staging/discard", json={"technology_ids": [a], "reason": "Ya evaluada en 2024"})
    assert one.status_code == 200 and one.json()["affected"] == 1
    batch = api.post("/api/technologies/staging/discard", json={"technology_ids": [b, c], "reason": "Duplicado conocido"})
    assert batch.status_code == 200 and batch.json()["affected"] == 2

    assert _staging_ids(api).isdisjoint({a, b, c})
    assert {a, b, c} <= _staging_ids(api, view="descartadas")
    with api.db() as db:
        assert db.query(Technology).filter(Technology.id.in_([a, b, c])).count() == 3
        log = (
            db.query(AuditLog)
            .filter(AuditLog.action == "staging:discard", AuditLog.entity_id == str(a))
            .one()
        )
        assert log.new_value["reason"] == "Tecnología ya conocida: Ya evaluada en 2024"


@pytest.mark.parametrize("reason", ["", "   ", "abc"])
def test_discard_requires_reason(api, reason):
    tid = _tech(api, "Delta")
    res = api.post("/api/technologies/staging/discard", json={"technology_ids": [tid], "reason": reason})
    assert res.status_code == 422
    assert tid in _staging_ids(api)


def test_restore_returns_to_inbox_and_logs(api):
    tid = _tech(api, "Épsilon")
    api.post("/api/technologies/staging/discard", json={"technology_ids": [tid], "reason": "Ya conocida"})
    res = api.post("/api/technologies/staging/restore", json={"technology_ids": [tid]})
    assert res.status_code == 200 and res.json()["affected"] == 1
    assert tid in _staging_ids(api)
    assert tid not in _staging_ids(api, view="descartadas")
    with api.db() as db:
        assert db.query(AuditLog).filter(AuditLog.action == "staging:restore", AuditLog.entity_id == str(tid)).count() == 1


def test_descartadas_ignores_other_excluded_flows(api):
    """Excluidas del ciclo, fusionadas o heredadas no aparecen ni se restauran."""
    merged = _tech(api, "Fusionada", status="excluida", merged_into_id=1)
    legacy = _tech(api, "Heredada", status="excluida")
    in_cycle = _tech(api, "Excluida del ciclo", status="excluida")
    with api.db() as db:
        cycle = Cycle(
            code="C-T", year=2026, opened_on=date(2026, 1, 1), data_cutoff_on=date(2026, 4, 1), status="en_configuracion"
        )
        db.add(cycle)
        db.flush()
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=in_cycle, status="excluida"))
        db.commit()

    assert _staging_ids(api, view="descartadas").isdisjoint({merged, legacy, in_cycle})
    res = api.post("/api/technologies/staging/restore", json={"technology_ids": [merged, legacy, in_cycle]})
    assert res.json()["affected"] == 0 and len(res.json()["rejected"]) == 3


def test_stats_keep_total_and_count_discarded(api):
    keep = _tech(api, "Vigente", corroboration_count=2)
    drop = _tech(api, "Descartada", corroboration_count=2)
    before = api.get("/api/technologies/staging/stats").json()
    api.post("/api/technologies/staging/discard", json={"technology_ids": [drop], "reason": "Ya conocida"})
    after = api.get("/api/technologies/staging/stats").json()
    assert after["unassigned"] == before["unassigned"] - 1
    # Total capturadas incluye las descartadas (guía §10.1); se informan aparte.
    assert after["total"] == before["total"]
    assert after["discarded"] == before["discarded"] + 1
    assert after["corroborated"] <= before["corroborated"]
    assert keep in _staging_ids(api)


@pytest.mark.parametrize("role", ["tomador_decisiones", "revisor_pares"])
def test_profiles_without_staging_assign_cannot_discard_or_restore(api, role):
    tid = _tech(api, "Zeta")
    body = {"technology_ids": [tid], "reason": "Ya conocida"}
    assert api.post("/api/technologies/staging/discard", role=role, json=body).status_code == 403
    assert api.post("/api/technologies/staging/restore", role=role, json={"technology_ids": [tid]}).status_code == 403
    # Pueden consultar la pestaña de descartadas.
    assert api.get("/api/technologies/staging", role=role, params={"view": "descartadas"}).status_code == 200


@pytest.mark.parametrize("role", ["evaluador_tecnico", "evaluador_clinico"])
def test_evaluators_can_discard(api, role):
    tid = _tech(api, "Eta")
    res = api.post("/api/technologies/staging/discard", role=role, json={"technology_ids": [tid], "reason": "Ya conocida"})
    assert res.status_code == 200 and res.json()["affected"] == 1
