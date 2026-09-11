import { useState } from "react";
import { Label } from "./Field";

/**
 * Campo de contrasena con boton de mostrar/ocultar y aviso de mayusculas
 * activadas, las dos causas mas comunes de "no me deja entrar".
 */
export default function PasswordField({
  label,
  hint,
  id,
  value,
  onChange,
  autoComplete = "current-password",
  required,
  error,
  autoFocus,
  placeholder,
}) {
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);

  const detectCaps = (e) => {
    if (typeof e.getModifierState === "function") setCaps(e.getModifierState("CapsLock"));
  };

  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <Label htmlFor={id} required={required} hint={hint}>
          {label}
        </Label>
      )}
      <div style={{ position: "relative" }}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          onKeyUp={detectCaps}
          onKeyDown={detectCaps}
          onBlur={() => setCaps(false)}
          autoComplete={autoComplete}
          required={required}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          style={{
            width: "100%",
            padding: "9px 76px 9px 12px",
            border: `2px solid ${error ? "#EF4444" : "#E2E8F0"}`,
            borderRadius: 8,
            fontSize: 14,
            color: "#0F172A",
            background: "#fff",
            outline: "none",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = error ? "#EF4444" : "#3B82F6";
          }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "#F1F5F9",
            color: "#475569",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 6,
            padding: "5px 9px",
            cursor: "pointer",
          }}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {caps && (
        <div role="status" style={{ color: "#92400E", fontSize: 12, marginTop: 4 }}>
          Bloq Mayús está activado.
        </div>
      )}
      {error && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
