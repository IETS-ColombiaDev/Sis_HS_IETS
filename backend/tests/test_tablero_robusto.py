"""Tablero estratégico: resumen, calidad de datos, ciclo anterior, bitácora de descargas y hoja de resumen."""
from __future__ import annotations

import datetime as dt
import io

from test_frente_c_dashboards import _cycle, _small_cycle, h  # noqa: F401  (fixture)

from app import ttm
from app.models import AuditLog, Cluster, CycleTechnology, EvaluationDoc, TechType, Technology


def _previous(h, statuses: list[str], *, cluster_id=None):
    """Un ciclo que abrió antes que los de `_cycle`, con una tecnología por estado."""
    db = h.db
    cycle = _cycle(db, "Ciclo previo", status="en_evaluacion", opened_on=ttm.today_co() - dt.timedelta(weeks=30))
    for i, status in enumerate(statuses):
        tech = Technology(commercial_name=f"Previa {i}", cluster_id=cluster_id)
        db.add(tech)
        db.flush()
        points = 5 if status in ("priorizada", "en_evaluacion", "publicada") else None
        db.add(CycleTechnology(cycle_id=cycle.id, technology_id=tech.id, status=status, priority_points=points))
    db.commit()
    return cycle


def test_summary_matches_the_rows_of_the_cut(h):
    cycle = _small_cycle(h)
    data = h.as_role("superadmin").get("/api/strategy/dashboard", params={"cycle_id": cycle.id}).json()
    rows = data["ttm_scatter"]
    assert data["summary"] == {
        "imminent": sum(1 for r in rows if r["band"] == "inminente"),
        "act_now": sum(1 for r in rows if r["band"] == "inminente" and r["points_rated"] and r["points"] >= 4),
        "docs": 1,
        "docs_published": 0,
        "to_rate": 1,
    }
    assert data["summary"]["act_now"] == 1  # 6 puntos y fin de fase III hoy
    assert data["generated_at"]

    cut = h.client.get("/api/strategy/dashboard", params={"cycle_id": cycle.id, "status": "filtrada_apta_priorizacion"}).json()
    assert cut["summary"]["docs"] == 0 and cut["summary"]["to_rate"] == 1


def test_data_quality_counts_what_is_missing_and_hides_budget_checks(h):
    cycle = _small_cycle(h)
    db = h.db
    loose = Technology(commercial_name="Suelta")  # sin clúster, tipología, fase ni fechas
    db.add(loose)
    db.commit()
    db.add(CycleTechnology(cycle_id=cycle.id, technology_id=loose.id, status="asignada_a_ciclo"))
    db.commit()

    data = h.as_role("superadmin").get("/api/strategy/dashboard", params={"cycle_id": cycle.id}).json()
    quality = data["data_quality"]
    counts = {i["key"]: i["count"] for i in quality["items"]}
    assert quality["total"] == 3
    assert counts["sin_cluster"] == 1
    assert counts["sin_tipologia"] == 3
    assert counts["sin_ttm"] == 2  # solo una tiene fecha de fin de fase III
    assert counts["sin_calificar"] == 1  # Beta: apta y sin puntos
    assert counts["monto_ilegible"] == 1  # "por estimar"
    assert counts["sin_monto"] == 0
    assert quality["complete"] == 0 and quality["complete_pct"] == 0

    # Con tipología y fase, la que tiene fecha queda completa.
    full = db.query(Technology).filter(Technology.commercial_name.like("=HYPERLINK%")).one()
    full.tech_type_id = db.query(TechType).first().id
    full.development_phase = "Fase III"
    db.commit()
    again = h.client.get("/api/strategy/dashboard", params={"cycle_id": cycle.id}).json()["data_quality"]
    assert again["complete"] == 1 and again["complete_pct"] == 33

    public = h.as_role("revisor_pares").get("/api/strategy/dashboard", params={"cycle_id": cycle.id}).json()
    keys = {i["key"] for i in public["data_quality"]["items"]}
    assert "monto_ilegible" not in keys and "sin_monto" not in keys


def test_comparison_uses_the_previous_cycle_with_the_same_cut(h):
    cycle = _small_cycle(h)
    first = h.as_role("superadmin").get("/api/strategy/dashboard", params={"cycle_id": cycle.id}).json()
    assert first["comparison"] is None  # no hay ciclo anterior

    cluster = h.db.query(Cluster).first()
    prev = _previous(h, ["priorizada", "priorizada", "asignada_a_ciclo", "filtrada_apta_priorizacion"], cluster_id=cluster.id)
    data = h.client.get("/api/strategy/dashboard", params={"cycle_id": cycle.id}).json()
    cmp_ = data["comparison"]
    assert cmp_["cycle_id"] == prev.id and cmp_["cycle_code"] == "Ciclo previo"
    assert cmp_["total"] == 4
    assert cmp_["funnel"] == {"captured": 4, "filtered": 3, "prioritized": 2, "evaluated": 0, "published": 0}
    assert cmp_["summary"]["to_rate"] == 1

    # El recorte se aplica también al ciclo anterior; las fechas de captura no.
    cut = h.client.get(
        "/api/strategy/dashboard",
        params={"cycle_id": cycle.id, "stage": "prioritized", "date_from": "2100-01-01"},
    ).json()
    assert cut["ttm_scatter"] == []
    assert cut["comparison"]["total"] == 2 and cut["comparison"]["funnel"]["prioritized"] == 2
    none = h.client.get("/api/strategy/dashboard", params={"cycle_id": cycle.id, "cluster_id": 0}).json()
    assert none["comparison"]["total"] == 0

    # Visto desde el ciclo anterior no hay con qué comparar.
    assert h.client.get("/api/strategy/dashboard", params={"cycle_id": prev.id}).json()["comparison"] is None


def test_export_and_refresh_are_audited_and_listed_as_activity(h):
    cycle = _small_cycle(h)
    client = h.as_role("superadmin")
    assert client.get("/api/strategy/dashboard/export", params={"cycle_id": cycle.id, "format": "csv", "stage": "prioritized"}).status_code == 200
    assert client.post(f"/api/strategy/refresh/{cycle.id}").status_code == 200
    h.as_role("revisor_pares")
    assert h.client.get("/api/strategy/dashboard/export", params={"cycle_id": cycle.id, "format": "xlsx"}).status_code == 200

    h.db.expire_all()
    events = h.db.query(AuditLog).filter(AuditLog.entity_type == "strategy_dashboard").order_by(AuditLog.id).all()
    assert [e.action for e in events] == ["strategy:export", "strategy:refresh", "strategy:export"]
    assert events[0].new_value == {"format": "csv", "rows": 1, "restricted": True, "filters": {"stage": "prioritized"}}
    assert events[2].new_value["restricted"] is False and events[2].new_value["rows"] == 2

    assert h.client.get("/api/strategy/dashboard/activity", params={"cycle_id": cycle.id}).status_code == 403
    activity = h.as_role("superadmin").get("/api/strategy/dashboard/activity", params={"cycle_id": cycle.id}).json()
    assert [a["kind"] for a in activity] == ["export", "refresh", "export"]  # del más reciente al más antiguo
    assert activity[0]["detail"] == "XLSX · 2 tecnología(s) · sin montos"
    assert activity[2]["detail"] == "CSV · 1 tecnología(s) · con montos · con filtros"
    assert activity[1]["label"] == "Datamart recalculado"


def test_xlsx_carries_a_summary_sheet_with_the_previous_cycle(h):
    from openpyxl import load_workbook

    cycle = _small_cycle(h)
    _previous(h, ["priorizada", "asignada_a_ciclo"])
    res = h.as_role("superadmin").get("/api/strategy/dashboard/export", params={"cycle_id": cycle.id, "format": "xlsx"})
    wb = load_workbook(io.BytesIO(res.content))
    assert wb.sheetnames == ["Recorte", "Contexto", "Resumen"]
    rows = [list(r) for r in wb["Resumen"].values]
    assert rows[0] == ["Etapa del embudo", "Tecnologías (Ciclo API)", "Ciclo anterior (Ciclo previo)"]
    assert rows[1] == ["Capturadas", 2, 2]
    assert rows[3] == ["Priorizadas", 1, 1]
    labels = [r[0] for r in rows]
    assert "Franja de llegada al mercado" in labels and "Calidad de los datos" in labels
    assert rows[labels.index("Sin tipología")][1] == 2


def test_closed_previous_cycle_is_read_from_its_datamart(h):
    from app import strategy_service

    db = h.db
    prev = _previous(h, ["priorizada", "asignada_a_ciclo"])
    prev.status = "cerrado_consolidado"
    strategy_service.refresh_datamart(db, prev)
    db.commit()
    # Lo que cambie después del cierre no altera la comparación.
    db.add(EvaluationDoc(cycle_id=prev.id, technology_id=db.query(CycleTechnology).filter_by(cycle_id=prev.id).first().technology_id, status="publicado", body={}))
    db.commit()
    cycle = _small_cycle(h)
    cmp_ = h.as_role("superadmin").get("/api/strategy/dashboard", params={"cycle_id": cycle.id}).json()["comparison"]
    assert cmp_["cycle_status"] == "cerrado_consolidado"
    assert cmp_["funnel"]["published"] == 0 and cmp_["summary"]["docs"] == 0
