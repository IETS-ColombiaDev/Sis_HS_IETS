import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card } from "../components/Card";
import { GLOSSARY } from "../constants/glossary";
import Badge from "../components/Badge";
import { Select } from "../components/Field";
import Button from "../components/Button";
import { LoadingBlock } from "../components/Spinner";

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([api.get("/users"), api.get("/users/roles")]);
      setUsers(u.data);
      setRoles(r.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar los usuarios"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changeRole = async (u, role) => {
    try {
      const { data } = await api.put(`/users/${u.id}/role`, { role });
      toast.success(`${u.name}: perfil actualizado a ${data.role_label}`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo cambiar el perfil"));
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}/active`, { is_active: !u.is_active });
      toast.success(u.is_active ? "Usuario desactivado" : "Usuario activado");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar"));
    }
  };

  if (loading) return <LoadingBlock label="Cargando usuarios..." />;

  return (
    <div>
      <PageHeader
        title="Usuarios y perfiles"
        titleHint={GLOSSARY.rbac}
        subtitle="Matriz RBAC de cinco perfiles. Los permisos se otorgan por modulo y, en la matriz de priorizacion, por criterio: el evaluador tecnico califica P1, P5 y P6; el evaluador clinico califica P2, P3 y P4."
      />

      <Card style={{ marginBottom: 18 }} padding={16}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {roles.map((r) => (
            <div key={r.code} style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <Badge tone={r.code} style={{ minWidth: 170, textAlign: "center" }}>
                {r.label}
              </Badge>
              <span style={{ fontSize: 12, color: "#64748B", fontFamily: "ui-monospace, Menlo, monospace" }}>
                {r.permissions.join(" · ")}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card padding={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#3B82F6", color: "#fff", textAlign: "left" }}>
                <th style={th}>Usuario</th>
                <th style={th}>Correo</th>
                <th style={th}>Perfil</th>
                <th style={th}>Estado</th>
                <th style={th}>Ultimo acceso</th>
                <th style={{ ...th, textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #F1F5F9", background: i % 2 ? "#FbFcFe" : "#fff" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar user={u} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.name}</div>
                        {u.id === me.id && <span style={{ fontSize: 11, color: "#94A3B8" }}>(tu)</span>}
                      </div>
                    </div>
                  </td>
                  <td style={{ ...td, color: "#64748B" }}>{u.email}</td>
                  <td style={td}>
                    <Select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                      disabled={u.id === me.id}
                      style={{ marginBottom: 0, width: 190 }}
                    >
                      {roles.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                    {u.rateable_criteria?.length > 0 && (
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                        Califica {u.rateable_criteria.join(", ")}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <Badge tone={u.is_active ? "ok" : "error"}>{u.is_active ? "Activo" : "Inactivo"}</Badge>
                  </td>
                  <td style={{ ...td, color: "#64748B", fontSize: 13 }}>
                    {u.last_login ? new Date(u.last_login).toLocaleString() : "—"}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <Button
                      size="sm"
                      variant={u.is_active ? "secondary" : "success"}
                      onClick={() => toggleActive(u)}
                      disabled={u.id === me.id}
                    >
                      {u.is_active ? "Desactivar" : "Activar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const th = { padding: "12px 16px", fontSize: 12, fontWeight: 600 };
const td = { padding: "12px 16px", verticalAlign: "middle" };

function Avatar({ user }) {
  if (user.picture) {
    return <img src={user.picture} alt="" style={{ width: 34, height: 34, borderRadius: "50%" }} />;
  }
  const initials = (user.name || user.email || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#3B82F6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
      {initials}
    </div>
  );
}
