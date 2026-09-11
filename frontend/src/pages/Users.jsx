import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card } from "../components/Card";
import { GLOSSARY } from "../constants/glossary";
import Badge from "../components/Badge";
import { Input, Select } from "../components/Field";
import Button from "../components/Button";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Tooltip from "../components/Tooltip";
import InfoTip from "../components/InfoTip";
import HelpNote from "../components/HelpNote";
import SafeAvatar from "../components/SafeAvatar";
import PasswordField from "../components/PasswordField";
import { passwordRules, RuleList } from "../components/ChangePasswordForm";
import { LoadingBlock } from "../components/Spinner";

const HELP = {
  total: "Todas las cuentas registradas, activas o no.",
  active: "Cuentas que pueden iniciar sesión hoy.",
  inactive: "Cuentas desactivadas: no pueden entrar, pero su historia en la bitácora se conserva.",
  locked: "Cuentas bloqueadas temporalmente por intentos fallidos de contraseña. Puede desbloquearlas.",
  nopassword: "Cuentas sin contraseña (creadas con Google o con el acceso de desarrollo). En producción no podrán entrar hasta que les asigne una contraseña temporal.",
  lastLogin: "Último inicio de sesión exitoso registrado.",
  role: "El perfil define qué módulos puede usar y qué criterios de la matriz P1-P6 puede calificar.",
};

function isLocked(u) {
  return Boolean(u.locked_until && new Date(u.locked_until) > new Date());
}

function relativeTime(iso) {
  if (!iso) return "Nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Hace un momento";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `Hace ${days} día${days === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString("es-CO");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** Selector de perfil con la descripcion de lo que cada uno puede hacer. */
function RolePicker({ roles, value, onChange, disabled, name }) {
  return (
    <div className="role-cards" role="radiogroup" aria-label="Perfil">
      {roles.map((r) => (
        <label key={r.code} className={`role-card${value === r.code ? " is-selected" : ""}`} style={disabled ? { opacity: 0.6, cursor: "not-allowed" } : undefined}>
          <input
            type="radio"
            name={name}
            value={r.code}
            checked={value === r.code}
            onChange={() => onChange(r.code)}
            disabled={disabled}
          />
          <span>
            <strong style={{ fontSize: 14 }}>{r.label}</strong>
            <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 2, lineHeight: 1.45 }}>{r.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** Muestra una sola vez la contrasena temporal, con copia y recomendaciones. */
function CredentialModal({ data, onClose }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!data) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={data.title}
      width={500}
      footer={<Button onClick={onClose}>Entendido, ya la guardé</Button>}
    >
      <p style={{ fontSize: 14, color: "#475569" }}>
        Contraseña temporal de <strong>{data.user.name}</strong> ({data.user.email}):
      </p>
      <div className="temp-password" data-testid="temp-password">
        <span>{data.password}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            const ok = await copyText(data.password);
            setCopied(ok);
            if (ok) toast.success("Contraseña copiada al portapapeles");
          }}
        >
          {copied ? "Copiada" : "Copiar"}
        </Button>
      </div>
      <ul style={{ fontSize: 13, color: "#475569", paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Esta es la única vez que se muestra. Si la pierde, restablézcala de nuevo.</li>
        <li>Entréguela por un canal seguro (en persona o por un medio distinto al correo del usuario).</li>
        <li>La persona deberá cambiarla en su primer ingreso; hasta entonces no podrá operar el sistema.</li>
      </ul>
    </Modal>
  );
}

function UserFormModal({ open, mode, initial, roles, me, minLength, onClose, onSaved }) {
  const toast = useToast();
  const editing = mode === "edit";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("evaluador_tecnico");
  const [active, setActive] = useState(true);
  const [pwdMode, setPwdMode] = useState("auto");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmail(initial?.email || "");
    setName(initial?.name || "");
    setRole(initial?.role || "evaluador_tecnico");
    setActive(initial?.is_active ?? true);
    setPwdMode("auto");
    setPassword("");
    setError("");
  }, [open, initial]);

  const self = editing && initial?.id === me?.id;
  const rules = passwordRules(password, { email, minLength, current: null });
  const pwdOk = pwdMode === "auto" || (password && rules.every((r) => r.ok));
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const save = async (e) => {
    e?.preventDefault();
    setError("");
    if (!editing && !emailOk) {
      setError("Escriba un correo válido.");
      return;
    }
    if (editing && !name.trim()) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    if (!pwdOk) {
      setError("La contraseña no cumple los requisitos.");
      return;
    }
    try {
      setSaving(true);
      if (editing) {
        const body = { name: name.trim() };
        if (!self) {
          body.role = role;
          body.is_active = active;
        }
        const { data } = await api.put(`/users/${initial.id}`, body);
        toast.success(`${data.name}: cambios guardados`);
        onSaved({ user: data });
      } else {
        const { data } = await api.post("/users", {
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role,
          password: pwdMode === "manual" ? password : "",
        });
        toast.success(`Cuenta creada para ${data.user.email}`);
        onSaved(data);
      }
    } catch (err) {
      setError(apiError(err, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Editar ${initial?.name || "usuario"}` : "Nuevo usuario"}
      width={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!pwdOk || (!editing && !emailOk)}>
            {editing ? "Guardar cambios" : "Crear cuenta"}
          </Button>
        </>
      }
    >
      <form onSubmit={save} noValidate>
        <Input
          id="user-email"
          label="Correo"
          required={!editing}
          hint="Será su usuario para iniciar sesión. Debe ser único. Use el correo institucional; para personas externas (MSPS, INVIMA) use su correo oficial."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={editing}
          placeholder="nombre.apellido@iets.org.co"
          type="email"
          autoFocus={!editing}
          error={!editing && email && !emailOk ? "Formato de correo no válido." : ""}
        />
        <Input
          id="user-name"
          label="Nombre completo"
          hint="Nombre visible en la bitácora y en las asignaciones. Si la persona existe en el directorio institucional, allí manda el nombre oficial."
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre y apellidos"
          autoFocus={editing}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Perfil <InfoTip text={HELP.role} label="Qué es el perfil" />
        </div>
        {self && (
          <p style={{ fontSize: 12.5, color: "#92400E", marginBottom: 8 }}>
            No puede cambiar su propio perfil ni desactivarse: pida a otro superadministrador que lo haga.
          </p>
        )}
        <RolePicker roles={roles} value={role} onChange={setRole} disabled={self} name="user-role" />

        {editing && (
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, marginBottom: 12, opacity: self ? 0.6 : 1 }}>
            <input type="checkbox" checked={active} disabled={self} onChange={(e) => setActive(e.target.checked)} />
            Cuenta activa
            <InfoTip text="Una cuenta inactiva no puede iniciar sesión y sus sesiones abiertas se cierran de inmediato. Su historia se conserva." />
          </label>
        )}

        {!editing && (
          <fieldset style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, padding: "0 6px" }}>Contraseña inicial</legend>
            <label style={{ display: "flex", gap: 8, fontSize: 14, marginBottom: 6, alignItems: "flex-start" }}>
              <input type="radio" name="pwd-mode" checked={pwdMode === "auto"} onChange={() => setPwdMode("auto")} style={{ marginTop: 3 }} />
              <span>
                Generar una contraseña temporal <Badge tone="ok">Recomendado</Badge>
                <span style={{ display: "block", fontSize: 12.5, color: "#64748B" }}>Se mostrará una sola vez para que la entregue.</span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 8, fontSize: 14, alignItems: "flex-start" }}>
              <input type="radio" name="pwd-mode" checked={pwdMode === "manual"} onChange={() => setPwdMode("manual")} style={{ marginTop: 3 }} />
              <span>Definirla ahora</span>
            </label>
            {pwdMode === "manual" && (
              <div style={{ marginTop: 10 }}>
                <PasswordField id="user-password" label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <RuleList rules={rules} show={password.length > 0} />
              </div>
            )}
            <p style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
              En ambos casos la persona debe cambiarla en su primer ingreso.
            </p>
          </fieldset>
        )}

        {error && (
          <div role="alert" style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginTop: 12 }}>
            {error}
          </div>
        )}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Modal>
  );
}

function PermissionMatrix({ roles, permissions }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="perm-matrix">
        <thead>
          <tr>
            <th scope="col">Permiso</th>
            {roles.map((r) => (
              <th key={r.code} scope="col">
                <Tooltip text={r.description} position="bottom" maxWidth={280}>
                  <span tabIndex={0} style={{ cursor: "help" }}>{r.label}</span>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p.code}>
              <td>
                <span className="term-label">
                  {p.label}
                  <InfoTip text={`${p.description} (${p.code})`} label={`Qué permite ${p.label}`} />
                </span>
              </td>
              {roles.map((r) => {
                const has = r.permissions.includes(p.code);
                return (
                  <td key={r.code} className={has ? "perm-yes" : "perm-no"} aria-label={`${r.label}: ${has ? "sí" : "no"}`}>
                    {has ? "✓" : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Users() {
  const { user: me, status } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [form, setForm] = useState({ open: false, mode: "create", initial: null });
  const [credential, setCredential] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, r, p] = await Promise.all([api.get("/users"), api.get("/users/roles"), api.get("/users/permissions")]);
      setUsers(u.data);
      setRoles(r.data);
      setPermissions(p.data);
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

  const counts = useMemo(
    () => ({
      total: users.length,
      active: users.filter((u) => u.is_active).length,
      inactive: users.filter((u) => !u.is_active).length,
      locked: users.filter(isLocked).length,
      nopassword: users.filter((u) => !u.has_password).length,
    }),
    [users]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !`${u.name} ${u.email}`.toLowerCase().includes(q)) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (stateFilter === "active" && !u.is_active) return false;
      if (stateFilter === "inactive" && u.is_active) return false;
      if (stateFilter === "locked" && !isLocked(u)) return false;
      if (stateFilter === "nopassword" && u.has_password) return false;
      return true;
    });
  }, [users, query, roleFilter, stateFilter]);

  const filtersActive = Boolean(query || roleFilter || stateFilter);

  const runConfirmed = async () => {
    if (!confirm) return;
    const { kind, user: u } = confirm;
    try {
      setBusy(true);
      if (kind === "reset") {
        const { data } = await api.post(`/users/${u.id}/reset-password`);
        setCredential({ title: "Contraseña restablecida", user: data.user, password: data.temporary_password });
      } else if (kind === "toggle") {
        await api.put(`/users/${u.id}`, { is_active: !u.is_active });
        toast.success(u.is_active ? `${u.name} fue desactivado` : `${u.name} fue activado`);
      } else if (kind === "delete") {
        await api.delete(`/users/${u.id}`);
        toast.success(`Cuenta ${u.email} eliminada`);
      }
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo completar la acción"));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (u) => {
    try {
      await api.post(`/users/${u.id}/unlock`);
      toast.success(`${u.name} puede volver a intentar el ingreso`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo desbloquear"));
    }
  };

  if (loading) return <LoadingBlock label="Cargando usuarios..." />;

  const confirmCopy = confirm && {
    reset: {
      title: "Restablecer contraseña",
      message: `Se generará una contraseña temporal para ${confirm.user.name} (${confirm.user.email}). Sus sesiones abiertas se cerrarán y deberá cambiarla al ingresar.`,
      label: "Restablecer",
      variant: "primary",
    },
    toggle: confirm.user.is_active
      ? {
          title: "Desactivar cuenta",
          message: `${confirm.user.name} no podrá iniciar sesión y su sesión abierta se cerrará de inmediato. Su historia en la bitácora se conserva y puede reactivarla cuando quiera.`,
          label: "Desactivar",
          variant: "danger",
        }
      : {
          title: "Activar cuenta",
          message: `${confirm.user.name} podrá iniciar sesión de nuevo con su perfil actual.`,
          label: "Activar",
          variant: "success",
        },
    delete: {
      title: "Eliminar cuenta",
      message: `Se eliminará definitivamente la cuenta ${confirm.user.email}. Solo es posible si nunca ha tenido actividad; si la tuvo, el sistema le pedirá desactivarla para conservar la trazabilidad.`,
      label: "Eliminar",
      variant: "danger",
    },
  }[confirm.kind];

  const KPI = [
    ["", "Total", counts.total, HELP.total],
    ["active", "Activas", counts.active, HELP.active],
    ["inactive", "Inactivas", counts.inactive, HELP.inactive],
    ["locked", "Bloqueadas", counts.locked, HELP.locked],
    ["nopassword", "Sin contraseña", counts.nopassword, HELP.nopassword],
  ];

  return (
    <div>
      <PageHeader
        title="Usuarios y perfiles"
        titleHint={GLOSSARY.rbac}
        subtitle="Cree las cuentas del equipo, asigne su perfil y administre el acceso. Cada cambio queda registrado en la bitácora con su autor."
        actions={
          <Button onClick={() => setForm({ open: true, mode: "create", initial: null })}>+ Nuevo usuario</Button>
        }
      />

      <HelpNote id="users-admin-v2">
        Las cuentas nuevas reciben una <strong>contraseña temporal</strong> que la persona cambia en su primer ingreso.
        Para retirar a alguien, <strong>desactive</strong> su cuenta: conserva la trazabilidad. Eliminar solo es posible en
        cuentas que nunca se usaron.
      </HelpNote>

      <div className="users-kpis">
        {KPI.map(([key, label, value, tip]) => (
          <div key={label} className={`users-kpi${stateFilter === key && (key || !filtersActive) ? " is-active" : ""}`}>
            <button
              type="button"
              className="users-kpi-hit"
              onClick={() => setStateFilter(key)}
              aria-pressed={stateFilter === key}
              title={`Filtrar: ${label}`}
            >
              <span className="users-kpi-value" style={key === "locked" && value ? { color: "#B91C1C" } : key === "nopassword" && value ? { color: "#B45309" } : undefined}>
                {value}
              </span>
              <span className="users-kpi-label">{label}</span>
            </button>
            <span className="users-kpi-tip">
              <InfoTip text={tip} label={`Qué significa ${label}`} position="bottom" />
            </span>
          </div>
        ))}
      </div>

      <Card padding={0}>
        <div className="users-toolbar">
          <div style={{ flex: "1 1 260px" }}>
            <Input
              id="users-search"
              label="Buscar"
              placeholder="Nombre o correo"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
            />
          </div>
          <div style={{ flex: "0 1 220px" }}>
            <Select id="users-role" label="Perfil" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">Todos los perfiles</option>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ flex: "0 1 200px" }}>
            <Select id="users-state" label="Estado" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
              <option value="locked">Bloqueadas</option>
              <option value="nopassword">Sin contraseña</option>
            </Select>
          </div>
          {filtersActive && (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setRoleFilter("");
                setStateFilter("");
              }}
            >
              Limpiar filtros
            </Button>
          )}
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#64748B", alignSelf: "center" }}>
            {visible.length} de {users.length} cuenta(s)
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="users-table">
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">
                  <span className="term-label">Perfil <InfoTip text={HELP.role} /></span>
                </th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="term-label">Último acceso <InfoTip text={HELP.lastLogin} /></span>
                </th>
                <th scope="col" style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "#64748B" }}>
                    {users.length === 0 ? "Aún no hay cuentas." : "Ninguna cuenta coincide con los filtros."}
                  </td>
                </tr>
              )}
              {visible.map((u) => {
                const self = u.id === me?.id;
                const locked = isLocked(u);
                const neverUsed = !u.last_login;
                return (
                  <tr key={u.id} data-testid={`user-row-${u.email}`}>
                    <td data-label="Usuario" className="users-col-user">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <SafeAvatar user={u} size={34} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>
                            {u.name} {self && <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>(usted)</span>}
                          </div>
                          <div className="users-email">{u.email}</div>
                          <div className="users-flags">
                            {u.must_change_password && (
                              <Tooltip text="Tiene una contraseña temporal: debe cambiarla en su próximo ingreso.">
                                <span tabIndex={0}><Badge tone="info">Contraseña temporal</Badge></span>
                              </Tooltip>
                            )}
                            {!u.has_password && (
                              <Tooltip text={HELP.nopassword}>
                                <span tabIndex={0}><Badge tone="warning">Sin contraseña</Badge></span>
                              </Tooltip>
                            )}
                            {locked && (
                              <Tooltip text={`Bloqueada hasta ${new Date(u.locked_until).toLocaleTimeString("es-CO")} por intentos fallidos.`}>
                                <span tabIndex={0}><Badge tone="error">Bloqueada</Badge></span>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Perfil">
                      <Badge tone={u.role}>{u.role_label}</Badge>
                      {u.rateable_criteria?.length > 0 && (
                        <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 4 }}>Califica {u.rateable_criteria.join(", ")}</div>
                      )}
                    </td>
                    <td data-label="Estado">
                      <Badge tone={u.is_active ? "ok" : "error"}>{u.is_active ? "Activa" : "Inactiva"}</Badge>
                    </td>
                    <td data-label="Último acceso" className="users-col-when" style={{ color: "#64748B", fontSize: 13 }}>
                      <Tooltip text={u.last_login ? new Date(u.last_login).toLocaleString("es-CO") : "Nunca ha iniciado sesión."}>
                        <span tabIndex={0}>{relativeTime(u.last_login)}</span>
                      </Tooltip>
                    </td>
                    <td data-label="Acciones">
                      <div className="users-actions">
                        <Tooltip text="Cambiar nombre, perfil o estado de la cuenta.">
                          <Button size="sm" variant="secondary" onClick={() => setForm({ open: true, mode: "edit", initial: u })} aria-label={`Editar ${u.email}`}>
                            Editar
                          </Button>
                        </Tooltip>
                        <Tooltip text="Genera una contraseña temporal nueva y cierra las sesiones abiertas de la persona.">
                          <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: "reset", user: u })} aria-label={`Restablecer contraseña de ${u.email}`}>
                            {u.has_password ? "Nueva clave" : "Asignar clave"}
                          </Button>
                        </Tooltip>
                        {locked && (
                          <Tooltip text="Quita el bloqueo por intentos fallidos sin cambiar la contraseña.">
                            <Button size="sm" variant="outline" onClick={() => unlock(u)} aria-label={`Desbloquear ${u.email}`}>
                              Desbloquear
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip text={self ? "No puede desactivar su propia cuenta." : u.is_active ? "Impide el acceso y cierra la sesión abierta. Conserva la historia." : "Permite de nuevo el acceso."}>
                          <Button
                            size="sm"
                            variant={u.is_active ? "secondary" : "success"}
                            disabled={self}
                            onClick={() => setConfirm({ kind: "toggle", user: u })}
                            aria-label={`${u.is_active ? "Desactivar" : "Activar"} ${u.email}`}
                          >
                            {u.is_active ? "Desactivar" : "Activar"}
                          </Button>
                        </Tooltip>
                        <Tooltip
                          text={
                            self
                              ? "No puede eliminar su propia cuenta."
                              : neverUsed
                              ? "Elimina la cuenta: solo posible porque nunca se ha usado."
                              : "Esta cuenta ya tiene actividad: desactívela para conservar la trazabilidad."
                          }
                        >
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={self || !neverUsed}
                            onClick={() => setConfirm({ kind: "delete", user: u })}
                            aria-label={`Eliminar ${u.email}`}
                          >
                            Eliminar
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card style={{ marginTop: 18 }} padding={18}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }} className="term-label">
              Matriz de permisos por perfil
              <InfoTip text="Qué puede hacer cada perfil. Los permisos son fijos por perfil (Tabla 3 de la especificación); para dar un permiso, cambie el perfil de la persona." />
            </div>
            <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
              {roles.length} perfiles · {permissions.length} permisos. Pase el cursor por cada permiso para ver su alcance.
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowMatrix((v) => !v)} aria-expanded={showMatrix}>
            {showMatrix ? "Ocultar matriz" : "Ver matriz"}
          </Button>
        </div>
        {showMatrix && (
          <div style={{ marginTop: 14 }}>
            <PermissionMatrix roles={roles} permissions={permissions} />
          </div>
        )}
      </Card>

      <UserFormModal
        open={form.open}
        mode={form.mode}
        initial={form.initial}
        roles={roles}
        me={me}
        minLength={status?.password_min_length || 10}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(data) => {
          setForm((f) => ({ ...f, open: false }));
          if (data.temporary_password) {
            setCredential({ title: "Cuenta creada", user: data.user, password: data.temporary_password });
          }
          load();
        }}
      />

      <CredentialModal data={credential} onClose={() => setCredential(null)} />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        loading={busy}
        title={confirmCopy?.title}
        message={confirmCopy?.message}
        confirmLabel={confirmCopy?.label}
        confirmVariant={confirmCopy?.variant}
      />
    </div>
  );
}
