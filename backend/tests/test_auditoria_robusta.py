"""Bitácora: búsqueda y filtros nuevos, nombres, resumen, catálogo, integridad y exporte."""
from __future__ import annotations

import datetime as dt

import pytest
from sqlalchemy import text

from frente_a_helpers import Harness

from app.database import _SQLITE_AUDIT_GUARDS
from app.models import AuditLog
from app.routers import audit


@pytest.fixture()
def h():
    harness = Harness(audit)
    # Si otra prueba dejó activos los registros automáticos, crear el arnés ya escribió filas:
    # cada prueba parte de una bitácora vacía.
    harness.db.query(AuditLog).delete()
    harness.db.commit()
    yield harness
    harness.close()


def _log(h, minutes, entity, eid, action, *, email="superadmin@iets.org.co", request="", ip="10.0.0.1", new=None, old=None):
    now = dt.datetime.now(dt.timezone.utc)
    h.db.add(AuditLog(
        user_email=email, user_role="superadmin", ip_address=ip, entity_type=entity, entity_id=str(eid), action=action,
        occurred_at=now - dt.timedelta(minutes=minutes), request_id=request, request_path="PUT /api/x",
        new_value=new, old_value=old,
    ))
    h.db.commit()


def _seed(h):
    _log(h, 50, "cycles", 7, "create", request="r1", new={"code": "Ciclo I - 2032"})
    _log(h, 40, "cycles", 7, "cycle:transition", request="r2", old={"status": "en_configuracion"}, new={"status": "en_filtrado"})
    _log(h, 40, "cycle_technologies", 3, "update", request="r2", new={"frozen": True})
    _log(h, 30, "notes", 5, "note:edit", email="tecnico@iets.org.co", ip="10.0.0.9", request="r3", new={"fields": ["content"]})
    _log(h, 20, "auth", 1, "auth:login", email="", request="r4")


def test_list_brings_labels_and_filters_by_text_request_and_ip(h):
    _seed(h)
    page = h.client.get("/api/audit").json()
    assert page["total"] == 5
    by_action = {i["action"]: i for i in page["items"]}
    assert by_action["cycle:transition"]["action_label"] == "Cambió la etapa de un ciclo"
    assert by_action["create"]["action_label"] == "Creación" and by_action["create"]["entity_label"] == "Ciclos"
    assert by_action["auth:login"]["action_label"] == "Inicio de sesión"

    # Texto libre: busca también dentro de los valores guardados.
    assert h.client.get("/api/audit", params={"q": "ciclo i - 2032"}).json()["total"] == 1
    assert h.client.get("/api/audit", params={"q": "EN_FILTRADO"}).json()["total"] == 1
    assert h.client.get("/api/audit", params={"q": "tecnico@"}).json()["total"] == 1
    # Una operación: todas las filas de la misma petición.
    same = h.client.get("/api/audit", params={"request_id": "r2"}).json()
    assert same["total"] == 2 and {i["entity_type"] for i in same["items"]} == {"cycles", "cycle_technologies"}
    assert h.client.get("/api/audit", params={"ip": "10.0.0.9"}).json()["total"] == 1
    assert h.client.get("/api/audit", params={"limit": 0}).status_code == 422


def test_summary_counts_by_action_user_entity_and_day(h):
    _seed(h)
    data = h.client.get("/api/audit/summary").json()
    assert data["total"] == 5 and data["users"] == 2 and data["first_at"] and data["last_at"]
    assert {i["code"]: i["count"] for i in data["by_entity"]}["cycles"] == 2
    users = {i["code"]: i for i in data["by_user"]}
    assert users["superadmin@iets.org.co"]["count"] == 3 and users[""]["label"] == "sistema"
    assert sum(d["count"] for d in data["by_day"]) == 5
    assert all(i["label"] for i in data["by_action"])

    only = h.client.get("/api/audit/summary", params={"entity_type": "notes"}).json()
    assert only["total"] == 1 and only["by_action"] == [{"code": "note:edit", "label": "Editó una nota", "count": 1}]


def test_catalog_lists_what_exists_with_names_and_counts(h):
    _seed(h)
    data = h.client.get("/api/audit/catalog").json()
    actions = {a["code"]: a for a in data["actions"]}
    assert actions["cycle:transition"] == {"code": "cycle:transition", "label": "Cambió la etapa de un ciclo", "count": 1}
    entities = {e["code"]: e for e in data["entities"]}
    assert entities["cycles"]["label"] == "Ciclos" and entities["cycles"]["count"] == 2
    assert "bulletins" not in entities  # solo lo que tiene registros


def test_integrity_reports_whether_the_engine_really_protects_the_log(h):
    _seed(h)
    before = h.client.get("/api/audit/integrity").json()
    assert before["engine"] == "sqlite" and before["protected"] is False and before["total"] == 5
    assert "No se encontraron" in before["detail"]

    for stmt in _SQLITE_AUDIT_GUARDS:
        h.db.execute(text(stmt))
    h.db.commit()
    after = h.client.get("/api/audit/integrity").json()
    assert after["protected"] is True and after["first_at"]


def test_export_respects_filters_and_records_itself(h):
    _seed(h)
    _log(h, 5, "notes", 9, "note:create", new={"title": "=HYPERLINK(1)"})
    res = h.client.get("/api/audit/export", params={"entity_type": "notes"})
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    assert res.headers["x-total-count"] == "2"
    lines = res.content.decode("utf-8-sig").splitlines()
    assert lines[0].startswith("id;fecha_utc;usuario;perfil;ip;entidad;entidad_id;accion;accion_nombre")
    assert len(lines) == 3 and ";Notas;9;note:create;Escribió una nota;" in lines[1]

    h.db.expire_all()
    ev = h.db.query(AuditLog).filter(AuditLog.action == "audit:export").one()
    assert ev.new_value == {"rows": 2, "total": 2, "truncated": False, "filters": {"entity_type": "notes"}}
    # La descarga aparece en la bitácora con su nombre.
    listed = h.client.get("/api/audit", params={"action": "audit:export"}).json()["items"][0]
    assert listed["action_label"] == "Descarga de la bitácora" and listed["entity_label"] == "Bitácora"


def test_every_new_endpoint_needs_audit_read(h):
    for role in ("evaluador_tecnico", "tomador_decisiones", "revisor_pares"):
        client = h.as_role(role).client
        for path in ("/api/audit/summary", "/api/audit/catalog", "/api/audit/integrity", "/api/audit/export"):
            assert client.get(path).status_code == 403, (role, path)
