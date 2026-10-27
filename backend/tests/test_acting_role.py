""""Ver como" del superadministrador (cabecera X-Acting-Role).

El superadministrador puede operar con los permisos de otro perfil para
verificar que ve y que puede hacer cada uno. La cabecera solo se honra cuando el
perfil real es superadmin y el valor es un perfil valido; nunca amplia permisos.
"""
from __future__ import annotations

from frente_b_support import api  # noqa: F401  (fixture)

from app import rbac
from app.models import AuditLog, User

HEADER = rbac.ACTING_ROLE_HEADER


def _get(api, path, role, acting=None):
    headers = dict(api.headers(role))
    if acting is not None:
        headers[HEADER] = acting
    return api.client.get(path, headers=headers)


def test_superadmin_acting_as_decision_maker_loses_admin_permissions(api):
    assert _get(api, "/api/users", "superadmin").status_code == 200
    res = _get(api, "/api/users", "superadmin", acting="tomador_decisiones")
    assert res.status_code == 403
    assert "Tomador de decisiones" in res.json()["detail"]
    assert _get(api, "/api/config", "superadmin", acting="evaluador_clinico").status_code == 403
    # Lo que el perfil simulado si puede, sigue permitido.
    assert _get(api, "/api/sources", "superadmin", acting="revisor_pares").status_code == 200


def test_me_reports_effective_and_real_role(api):
    me = _get(api, "/api/auth/me", "superadmin", acting="evaluador_clinico").json()
    assert me["role"] == "evaluador_clinico"
    assert me["role_label"] == "Evaluador clínico"
    assert me["real_role"] == "superadmin"
    assert me["real_role_label"] == "Superadministrador"
    assert me["acting_as"] is True
    assert "user:manage" not in me["permissions"]
    assert me["rateable_criteria"] == ["P2", "P3", "P4"]

    plain = _get(api, "/api/auth/me", "superadmin").json()
    assert plain["role"] == plain["real_role"] == "superadmin"
    assert plain["acting_as"] is False
    assert "user:manage" in plain["permissions"]


def test_acting_never_persists_the_role(api):
    _get(api, "/api/auth/me", "superadmin", acting="revisor_pares")
    with api.db() as db:
        assert db.query(User).filter(User.email == "superadmin@iets.org.co").one().role == "superadmin"
    # La siguiente peticion sin cabecera vuelve a ser superadmin.
    assert _get(api, "/api/users", "superadmin").status_code == 200


def test_header_from_non_superadmin_is_ignored(api):
    me = _get(api, "/api/auth/me", "tomador_decisiones", acting="superadmin").json()
    assert me["role"] == me["real_role"] == "tomador_decisiones"
    assert me["acting_as"] is False
    me = _get(api, "/api/auth/me", "revisor_pares", acting="evaluador_tecnico").json()
    assert me["role"] == "revisor_pares" and me["acting_as"] is False
    assert _get(api, "/api/users", "tomador_decisiones", acting="superadmin").status_code == 403
    assert _get(api, "/api/config", "evaluador_tecnico", acting="superadmin").status_code == 403


def test_invalid_or_superadmin_header_is_ignored(api):
    for value in ("admin", "root", "SUPERADMIN", "", "evaluador_tecnico; drop"):
        me = _get(api, "/api/auth/me", "superadmin", acting=value).json()
        assert me["role"] == "superadmin" and me["acting_as"] is False, value
        assert _get(api, "/api/users", "superadmin", acting=value).status_code == 200


def test_acting_role_endpoint_validates_and_audits(api):
    res = api.post("/api/auth/acting-role", json={"role": "evaluador_tecnico"})
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "evaluador_tecnico" and body["acting_as"] is True
    assert body["real_role"] == "superadmin"

    back = api.post("/api/auth/acting-role", json={"role": None})
    assert back.status_code == 200 and back.json()["acting_as"] is False

    assert api.post("/api/auth/acting-role", json={"role": "dios"}).status_code == 422
    denied = api.post("/api/auth/acting-role", role="evaluador_tecnico", json={"role": "superadmin"})
    assert denied.status_code == 403

    with api.db() as db:
        actions = [
            (row.action, (row.new_value or {}).get("role"), row.user_email)
            for row in db.query(AuditLog).filter(AuditLog.action.like("auth:acting_role%")).order_by(AuditLog.id)
        ]
    assert actions == [
        ("auth:acting_role", "evaluador_tecnico", "superadmin@iets.org.co"),
        ("auth:acting_role_end", "superadmin", "superadmin@iets.org.co"),
    ]


def test_rbac_helpers_never_escalate():
    class U:
        role = "tomador_decisiones"
        acting_role = "superadmin"

    assert rbac.effective_role(U()) == "tomador_decisiones"
    assert not rbac.has_permission(U(), rbac.P_USER_MANAGE)

    class A:
        role = "superadmin"
        acting_role = "revisor_pares"

    assert rbac.effective_role(A()) == "revisor_pares"
    assert rbac.real_role(A()) == "superadmin"
    assert rbac.rateable_criteria(A()) == []
