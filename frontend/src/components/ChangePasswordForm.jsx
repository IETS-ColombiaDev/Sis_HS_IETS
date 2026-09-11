import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiError } from "../api/client";
import Button from "./Button";
import PasswordField from "./PasswordField";

/** Reglas de la politica institucional; el backend aplica las mismas. */
export function passwordRules(password, { email = "", minLength = 10, current = "" } = {}) {
  const local = (email || "").split("@")[0].toLowerCase();
  return [
    { ok: password.length >= minLength, text: `Al menos ${minLength} caracteres` },
    { ok: /[A-Za-z]/.test(password), text: "Al menos una letra" },
    { ok: /\d/.test(password), text: "Al menos un número" },
    {
      ok: !(local.length >= 4 && password.toLowerCase().includes(local)),
      text: "No contiene su usuario de correo",
    },
    { ok: password.trim() === password, text: "Sin espacios al inicio ni al final" },
    ...(current !== null ? [{ ok: !password || password !== current, text: "Distinta de la actual" }] : []),
  ];
}

export function RuleList({ rules, show }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "grid", gap: 4 }} aria-label="Requisitos de la contraseña">
      {rules.map((r) => (
        <li key={r.text} style={{ fontSize: 12.5, color: !show ? "#64748B" : r.ok ? "#047857" : "#B91C1C", display: "flex", gap: 8 }}>
          <span aria-hidden="true" style={{ width: 14, textAlign: "center", fontWeight: 700 }}>
            {!show ? "•" : r.ok ? "✓" : "✗"}
          </span>
          <span>{r.text}</span>
          <span className="sr-only">{show ? (r.ok ? "cumple" : "no cumple") : ""}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Cambio de contrasena propia. Sirve para el cambio obligatorio del primer
 * ingreso (`forced`) y para el cambio voluntario desde el menu del usuario.
 */
export default function ChangePasswordForm({ onDone, onCancel, forced = false }) {
  const { account, status, changePassword } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const minLength = status?.password_min_length || 10;

  const rules = useMemo(
    () => passwordRules(next, { email: account?.email, minLength, current }),
    [next, account?.email, minLength, current]
  );
  const allOk = rules.every((r) => r.ok) && next.length > 0;
  const matches = confirm.length > 0 && confirm === next;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!allOk) {
      setError("La nueva contraseña no cumple todos los requisitos.");
      return;
    }
    if (!matches) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    try {
      setSaving(true);
      await changePassword(current, next);
      onDone?.();
    } catch (err) {
      setError(apiError(err, "No se pudo cambiar la contraseña"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <PasswordField
        id="pwd-current"
        label={forced ? "Contraseña temporal" : "Contraseña actual"}
        hint={
          forced
            ? "La que le entregó el administrador. Solo sirve para este primer ingreso."
            : "Su contraseña vigente. Se pide para confirmar que es usted."
        }
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
        required
        autoFocus
      />
      <PasswordField
        id="pwd-new"
        label="Nueva contraseña"
        hint="Use una frase fácil de recordar y difícil de adivinar, por ejemplo tres palabras y un número."
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
        required
      />
      <RuleList rules={rules} show={next.length > 0} />
      <PasswordField
        id="pwd-confirm"
        label="Confirmar nueva contraseña"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
        error={confirm.length > 0 && !matches ? "No coincide con la nueva contraseña." : ""}
      />
      {error && (
        <div role="alert" style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#991B1B", borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            {forced ? "Salir" : "Cancelar"}
          </Button>
        )}
        <Button type="submit" loading={saving} disabled={!current || !allOk || !matches}>
          Guardar contraseña
        </Button>
      </div>
      <p style={{ fontSize: 12, color: "#64748B", marginTop: 12 }}>
        Al cambiarla se cierran sus sesiones abiertas en otros equipos.
      </p>
    </form>
  );
}
