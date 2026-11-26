import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card } from "../components/Card";
import { GLOSSARY } from "../constants/glossary";
import Badge from "../components/Badge";
import { Input, Select } from "../components/Field";
import Button from "../components/Button";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Tooltip from "../components/Tooltip";
import InfoTip from "../components/InfoTip";
import HelpNote from "../components/HelpNote";
import SafeAvatar from "../components/SafeAvatar";
import PasswordField from "../components/PasswordField";
import { passwordRules, RuleList } from "../components/ChangePasswordForm";
import { LoadingBlock } from "../components/Spinner";
import { t, tr, ts, intlLocale } from "../i18n";

const HELP = {
  total: t("Todas las cuentas registradas, activas o no."),
  active: t("Cuentas que pueden iniciar sesión hoy."),
  inactive: t("Cuentas desactivadas: no pueden entrar, pero su historia en la bitácora se conserva."),
  locked: t("Cuentas bloqueadas temporalmente por intentos fallidos de contraseña. Puede desbloquearlas."),
  nopassword: t("Cuentas sin contraseña (creadas con Google o con el acceso de desarrollo). En producción no podrán entrar hasta que les asigne una contraseña temporal."),
  lastLogin: t("Último inicio de sesión exitoso registrado."),
  role: t("El perfil define qué módulos puede usar y qué criterios de la matriz P1-P6 puede calificar."),
};

function isLocked(u) {
  return Boolean(u.locked_until && new Date(u.locked_until) > new Date());
}

function relativeTime(iso) {
  if (!iso) return t("Nunca");
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t("Hace un momento");
  if (diff < 3600) return t("Hace {n} min", { n: Math.floor(diff / 60) });
  if (diff < 86400) return t("Hace {n} h", { n: Math.floor(diff / 3600) });
  const days = Math.floor(diff / 86400);
  if (days < 30) return days === 1 ? t("Hace {n} día", { n: days }) : t("Hace {n} días", { n: days });
  return new Date(iso).toLocaleDateString(intlLocale());
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
    <div className="role-cards" role="radiogroup" aria-label={t("Perfil")}>
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
            <strong style={{ fontSize: 14 }}>{ts(r.label)}</strong>
            <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 2, lineHeight: 1.45 }}>{ts(r.description)}</span>
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
      footer={<Button onClick={onClose}>{t("Entendido, ya la guardé")}</Button>}
    >
      <p style={{ fontSize: 14, color: "#475569" }}>
        {tr("Contraseña temporal de {name} ({email}):", {
          name: <strong>{data.user.name}</strong>,
          email: data.user.email,
        })}
      </p>
      <div className="temp-password" data-testid="temp-password">
        <span>{data.password}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            const ok = await copyText(data.password);
            setCopied(ok);
            if (ok) toast.success(t("Contraseña copiada al portapapeles"));
          }}
        >
          {copied ? t("Copiada") : t("Copiar")}
        </Button>
      </div>
      <ul style={{ fontSize: 13, color: "#475569", paddingLeft: 18, lineHeight: 1.7 }}>
        <li>{t("Esta es la única vez que se muestra. Si la pierde, restablézcala de nuevo.")}</li>
        <li>{t("Entréguela por un canal seguro (en persona o por un medio distinto al correo del usuario).")}</li>
        <li>{t("La persona deberá cambiarla en su primer ingreso; hasta entonces no podrá operar el sistema.")}</li>
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
      setError(t("Escriba un correo válido."));
      return;
    }
    if (editing && !name.trim()) {
      setError(t("El nombre no puede quedar vacío."));
      return;
    }
    if (!pwdOk) {
      setError(t("La contraseña no cumple los requisitos."));
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
        toast.success(t("{name}: cambios guardados", { name: data.name }));
        onSaved({ user: data });
      } else {
        const { data } = await api.post("/users", {
          email: email.trim().toLowerCase(),
          name: name.trim(),
          role,
          password: pwdMode === "manual" ? password : "",
        });
        toast.success(t("Cuenta creada para {email}", { email: data.user.email }));
        onSaved(data);
      }
    } catch (err) {
      setError(apiError(err, t("No se pudo guardar")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? (initial?.name ? t("Editar {name}", { name: initial.name }) : t("Editar usuario")) : t("Nuevo usuario")}
      width={620}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("Cancelar")}
          </Button>
          <Button onClick={save} loading={saving} disabled={!pwdOk || (!editing && !emailOk)}>
            {editing ? t("Guardar cambios") : t("Crear cuenta")}
          </Button>
        </>
      }
    >
      <form onSubmit={save} noValidate>
        <Input
          id="user-email"
          label={t("Correo")}
          required={!editing}
          hint={t("Será su usuario para iniciar sesión. Debe ser único. Use el correo institucional; para personas externas (MSPS, INVIMA) use su correo oficial.")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={editing}
          placeholder={t("nombre.apellido@iets.org.co")}
          type="email"
          autoFocus={!editing}
          error={!editing && email && !emailOk ? t("Formato de correo no válido.") : ""}
        />
        <Input
          id="user-name"
          label={t("Nombre completo")}
          hint={t("Nombre visible en la bitácora y en las asignaciones. Si la persona existe en el directorio institucional, allí manda el nombre oficial.")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("Nombre y apellidos")}
          autoFocus={editing}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          {t("Perfil")} <InfoTip text={HELP.role} label={t("Qué es el perfil")} />
        </div>
        {self && (
          <p style={{ fontSize: 12.5, color: "#92400E", marginBottom: 8 }}>
            {t("No puede cambiar su propio perfil ni desactivarse: pida a otro superadministrador que lo haga.")}
          </p>
        )}
        <RolePicker roles={roles} value={role} onChange={setRole} disabled={self} name="user-role" />

        {editing && (
          <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, marginBottom: 12, opacity: self ? 0.6 : 1 }}>
            <input type="checkbox" checked={active} disabled={self} onChange={(e) => setActive(e.target.checked)} />
            {t("Cuenta activa")}
            <InfoTip text={t("Una cuenta inactiva no puede iniciar sesión y sus sesiones abiertas se cierran de inmediato. Su historia se conserva.")} />
          </label>
        )}

        {!editing && (
          <fieldset style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
            <legend style={{ fontSize: 13, fontWeight: 600, padding: "0 6px" }}>{t("Contraseña inicial")}</legend>
            <label style={{ display: "flex", gap: 8, fontSize: 14, marginBottom: 6, alignItems: "flex-start" }}>
              <input type="radio" name="pwd-mode" checked={pwdMode === "auto"} onChange={() => setPwdMode("auto")} style={{ marginTop: 3 }} />
              <span>
                {t("Generar una contraseña temporal")} <Badge tone="ok">{t("Recomendado")}</Badge>
                <span style={{ display: "block", fontSize: 12.5, color: "#64748B" }}>{t("Se mostrará una sola vez para que la entregue.")}</span>
              </span>
            </label>
            <label style={{ display: "flex", gap: 8, fontSize: 14, alignItems: "flex-start" }}>
              <input type="radio" name="pwd-mode" checked={pwdMode === "manual"} onChange={() => setPwdMode("manual")} style={{ marginTop: 3 }} />
              <span>{t("Definirla ahora")}</span>
            </label>
            {pwdMode === "manual" && (
              <div style={{ marginTop: 10 }}>
                <PasswordField id="user-password" label={t("Contraseña")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <RuleList rules={rules} show={password.length > 0} />
              </div>
            )}
            <p style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
              {t("En ambos casos la persona debe cambiarla en su primer ingreso.")}
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
            <th scope="col">{t("Permiso")}</th>
            {roles.map((r) => (
              <th key={r.code} scope="col">
                <Tooltip text={ts(r.description)} position="bottom" maxWidth={280}>
                  <span tabIndex={0} style={{ cursor: "help" }}>{ts(r.label)}</span>
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
                  {ts(p.label)}
                  <InfoTip text={`${ts(p.description)} (${p.code})`} label={t("Qué permite {label}", { label: ts(p.label) })} />
                </span>
              </td>
              {roles.map((r) => {
                const has = r.permissions.includes(p.code);
                return (
                  <td key={r.code} className={has ? "perm-yes" : "perm-no"} aria-label={`${ts(r.label)}: ${has ? t("sí") : t("no")}`}>
                    {has ? "✓" : "-"}
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
      toast.error(apiError(e, t("No se pudieron cargar los usuarios")));
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
        setCredential({ title: t("Contraseña restablecida"), user: data.user, password: data.temporary_password });
      } else if (kind === "toggle") {
        await api.put(`/users/${u.id}`, { is_active: !u.is_active });
        toast.success(u.is_active ? t("{name} fue desactivado", { name: u.name }) : t("{name} fue activado", { name: u.name }));
      } else if (kind === "delete") {
        await api.delete(`/users/${u.id}`);
        toast.success(t("Cuenta {email} eliminada", { email: u.email }));
      }
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo completar la acción")));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (u) => {
    try {
      await api.post(`/users/${u.id}/unlock`);
      toast.success(t("{name} puede volver a intentar el ingreso", { name: u.name }));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo desbloquear")));
    }
  };

  if (loading) return <LoadingBlock label={t("Cargando usuarios...")} />;

  const confirmCopy = confirm && {
    reset: {
      title: t("Restablecer contraseña"),
      message: t(
        "Se generará una contraseña temporal para {name} ({email}). Sus sesiones abiertas se cerrarán y deberá cambiarla al ingresar.",
        { name: confirm.user.name, email: confirm.user.email }
      ),
      label: t("Restablecer"),
      variant: "primary",
    },
    toggle: confirm.user.is_active
      ? {
          title: t("Desactivar cuenta"),
          message: t(
            "{name} no podrá iniciar sesión y su sesión abierta se cerrará de inmediato. Su historia en la bitácora se conserva y puede reactivarla cuando quiera.",
            { name: confirm.user.name }
          ),
          label: t("Desactivar"),
          variant: "danger",
        }
      : {
          title: t("Activar cuenta"),
          message: t("{name} podrá iniciar sesión de nuevo con su perfil actual.", { name: confirm.user.name }),
          label: t("Activar"),
          variant: "success",
        },
    delete: {
      title: t("Eliminar cuenta"),
      message: t(
        "Se eliminará definitivamente la cuenta {email}. Solo es posible si nunca ha tenido actividad; si la tuvo, el sistema le pedirá desactivarla para conservar la trazabilidad.",
        { email: confirm.user.email }
      ),
      label: t("Eliminar"),
      variant: "danger",
    },
  }[confirm.kind];

  const KPI = [
    ["", t("Total"), counts.total, HELP.total],
    ["active", t("Activas"), counts.active, HELP.active],
    ["inactive", t("Inactivas"), counts.inactive, HELP.inactive],
    ["locked", t("Bloqueadas"), counts.locked, HELP.locked],
    ["nopassword", t("Sin contraseña"), counts.nopassword, HELP.nopassword],
  ];

  return (
    <div>
      <PageHeader
        title={t("Usuarios y perfiles")}
        titleHint={GLOSSARY.rbac}
        subtitle={t("Cree las cuentas del equipo, asigne su perfil y administre el acceso. Cada cambio queda registrado en la bitácora con su autor.")}
        actions={
          <Button onClick={() => setForm({ open: true, mode: "create", initial: null })}>
            <Icon name="plus" size={16} /> {t("Nuevo usuario")}
          </Button>
        }
      />

      <HelpNote id="users-admin-v2">
        {tr(
          "Las cuentas nuevas reciben una <b>contraseña temporal</b> que la persona cambia en su primer ingreso. Para retirar a alguien, <b>desactive</b> su cuenta: conserva la trazabilidad. Eliminar solo es posible en cuentas que nunca se usaron.",
          null,
          { b: (c) => <strong>{c}</strong> }
        )}
      </HelpNote>

      <div className="users-kpis">
        {KPI.map(([key, label, value, tip]) => (
          <div key={label} className={`users-kpi${stateFilter === key && (key || !filtersActive) ? " is-active" : ""}`}>
            <button
              type="button"
              className="users-kpi-hit"
              onClick={() => setStateFilter(key)}
              aria-pressed={stateFilter === key}
              title={t("Filtrar: {label}", { label })}
            >
              <span className="users-kpi-value" style={key === "locked" && value ? { color: "#B91C1C" } : key === "nopassword" && value ? { color: "#B45309" } : undefined}>
                {value}
              </span>
              <span className="users-kpi-label">{label}</span>
            </button>
            <span className="users-kpi-tip">
              <InfoTip text={tip} label={t("Qué significa {label}", { label })} position="bottom" />
            </span>
          </div>
        ))}
      </div>

      <Card padding={0}>
        <div className="users-toolbar">
          <div style={{ flex: "1 1 260px" }}>
            <Input
              id="users-search"
              label={t("Buscar")}
              placeholder={t("Nombre o correo")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
            />
          </div>
          <div style={{ flex: "0 1 220px" }}>
            <Select id="users-role" label={t("Perfil")} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">{t("Todos los perfiles")}</option>
              {roles.map((r) => (
                <option key={r.code} value={r.code}>
                  {ts(r.label)}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ flex: "0 1 200px" }}>
            <Select id="users-state" label={t("Estado")} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
              <option value="">{t("Todos")}</option>
              <option value="active">{t("Activas")}</option>
              <option value="inactive">{t("Inactivas")}</option>
              <option value="locked">{t("Bloqueadas")}</option>
              <option value="nopassword">{t("Sin contraseña")}</option>
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
              {t("Limpiar filtros")}
            </Button>
          )}
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#64748B", alignSelf: "center" }}>
            {t("{n} de {total} cuenta(s)", { n: visible.length, total: users.length })}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="users-table">
            <thead>
              <tr>
                <th scope="col">{t("Usuario")}</th>
                <th scope="col">
                  <span className="term-label">{t("Perfil")} <InfoTip text={HELP.role} /></span>
                </th>
                <th scope="col">{t("Estado")}</th>
                <th scope="col">
                  <span className="term-label">{t("Último acceso")} <InfoTip text={HELP.lastLogin} /></span>
                </th>
                <th scope="col" style={{ textAlign: "right" }}>{t("Acciones")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "#64748B" }}>
                    {users.length === 0 ? t("Aún no hay cuentas.") : t("Ninguna cuenta coincide con los filtros.")}
                  </td>
                </tr>
              )}
              {visible.map((u) => {
                const self = u.id === me?.id;
                const locked = isLocked(u);
                const neverUsed = !u.last_login;
                return (
                  <tr key={u.id} data-testid={`user-row-${u.email}`}>
                    <td data-label={t("Usuario")} className="users-col-user">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <SafeAvatar user={u} size={34} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>
                            {u.name} {self && <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>{t("(usted)")}</span>}
                          </div>
                          <div className="users-email">{u.email}</div>
                          <div className="users-flags">
                            {u.must_change_password && (
                              <Tooltip text={t("Tiene una contraseña temporal: debe cambiarla en su próximo ingreso.")}>
                                <span tabIndex={0}><Badge tone="info">{t("Contraseña temporal")}</Badge></span>
                              </Tooltip>
                            )}
                            {!u.has_password && (
                              <Tooltip text={HELP.nopassword}>
                                <span tabIndex={0}><Badge tone="warning">{t("Sin contraseña")}</Badge></span>
                              </Tooltip>
                            )}
                            {locked && (
                              <Tooltip text={t("Bloqueada hasta {hora} por intentos fallidos.", { hora: new Date(u.locked_until).toLocaleTimeString(intlLocale()) })}>
                                <span tabIndex={0}><Badge tone="error">{t("Bloqueada")}</Badge></span>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label={t("Perfil")}>
                      <Badge tone={u.role}>{ts(u.role_label)}</Badge>
                      {u.rateable_criteria?.length > 0 && (
                        <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 4 }}>{t("Califica {criterios}", { criterios: u.rateable_criteria.join(", ") })}</div>
                      )}
                    </td>
                    <td data-label={t("Estado")}>
                      <Badge tone={u.is_active ? "ok" : "error"}>{u.is_active ? t("Activa") : t("Inactiva")}</Badge>
                    </td>
                    <td data-label={t("Último acceso")} className="users-col-when" style={{ color: "#64748B", fontSize: 13 }}>
                      <Tooltip text={u.last_login ? new Date(u.last_login).toLocaleString(intlLocale()) : t("Nunca ha iniciado sesión.")}>
                        <span tabIndex={0}>{relativeTime(u.last_login)}</span>
                      </Tooltip>
                    </td>
                    <td data-label={t("Acciones")}>
                      <div className="users-actions">
                        <Tooltip text={t("Cambiar nombre, perfil o estado de la cuenta.")}>
                          <Button size="sm" variant="secondary" onClick={() => setForm({ open: true, mode: "edit", initial: u })} aria-label={t("Editar {name}", { name: u.email })}>
                            {t("Editar")}
                          </Button>
                        </Tooltip>
                        <Tooltip text={t("Genera una contraseña temporal nueva y cierra las sesiones abiertas de la persona.")}>
                          <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: "reset", user: u })} aria-label={t("Restablecer contraseña de {email}", { email: u.email })}>
                            {u.has_password ? t("Nueva clave") : t("Asignar clave")}
                          </Button>
                        </Tooltip>
                        {locked && (
                          <Tooltip text={t("Quita el bloqueo por intentos fallidos sin cambiar la contraseña.")}>
                            <Button size="sm" variant="outline" onClick={() => unlock(u)} aria-label={t("Desbloquear {email}", { email: u.email })}>
                              {t("Desbloquear")}
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip text={self ? t("No puede desactivar su propia cuenta.") : u.is_active ? t("Impide el acceso y cierra la sesión abierta. Conserva la historia.") : t("Permite de nuevo el acceso.")}>
                          <Button
                            size="sm"
                            variant={u.is_active ? "secondary" : "success"}
                            disabled={self}
                            onClick={() => setConfirm({ kind: "toggle", user: u })}
                            aria-label={u.is_active ? t("Desactivar {email}", { email: u.email }) : t("Activar {email}", { email: u.email })}
                          >
                            {u.is_active ? t("Desactivar") : t("Activar")}
                          </Button>
                        </Tooltip>
                        <Tooltip
                          text={
                            self
                              ? t("No puede eliminar su propia cuenta.")
                              : neverUsed
                              ? t("Elimina la cuenta: solo posible porque nunca se ha usado.")
                              : t("Esta cuenta ya tiene actividad: desactívela para conservar la trazabilidad.")
                          }
                        >
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={self || !neverUsed}
                            onClick={() => setConfirm({ kind: "delete", user: u })}
                            aria-label={t("Eliminar {name}", { name: u.email })}
                          >
                            {t("Eliminar")}
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
              {t("Matriz de permisos por perfil")}
              <InfoTip text={t("Qué puede hacer cada perfil. Los permisos son fijos por perfil (Tabla 3 de la especificación); para dar un permiso, cambie el perfil de la persona.")} />
            </div>
            <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
              {t("{roles} perfiles · {permisos} permisos. Pase el cursor por cada permiso para ver su alcance.", {
                roles: roles.length,
                permisos: permissions.length,
              })}
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowMatrix((v) => !v)} aria-expanded={showMatrix}>
            {showMatrix ? t("Ocultar matriz") : t("Ver matriz")}
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
            setCredential({ title: t("Cuenta creada"), user: data.user, password: data.temporary_password });
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
