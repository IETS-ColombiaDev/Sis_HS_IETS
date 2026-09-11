import InfoTip from "./InfoTip";

const labelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "#0F172A",
  marginBottom: 6,
};

const baseInput = {
  width: "100%",
  padding: "9px 12px",
  border: "2px solid #E2E8F0",
  borderRadius: 8,
  fontSize: 14,
  color: "#0F172A",
  background: "#fff",
  transition: "border-color 150ms ease-in-out",
  outline: "none",
};

function focusHandlers(error) {
  return {
    onFocus: (e) => {
      e.target.style.borderColor = error ? "#EF4444" : "#3B82F6";
    },
    onBlur: (e) => {
      e.target.style.borderColor = error ? "#EF4444" : "#E2E8F0";
    },
  };
}

export function Label({ children, htmlFor, required, hint }) {
  return (
    <label htmlFor={htmlFor} style={labelStyle}>
      <span>
        {children}
        {required && <span style={{ color: "#EF4444" }}> *</span>}
      </span>
      <InfoTip text={hint} label={`Qué es ${children}`} />
    </label>
  );
}

export function Input({ label, error, required, hint, style, id, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <Label htmlFor={id} required={required} hint={hint}>
          {label}
        </Label>
      )}
      <input
        id={id}
        style={{ ...baseInput, borderColor: error ? "#EF4444" : "#E2E8F0", ...style }}
        {...focusHandlers(error)}
        {...props}
      />
      {error && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export function Textarea({ label, error, required, hint, rows = 4, style, id, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <Label htmlFor={id} required={required} hint={hint}>
          {label}
        </Label>
      )}
      <textarea
        id={id}
        rows={rows}
        style={{ ...baseInput, resize: "vertical", ...style }}
        {...focusHandlers(error)}
        {...props}
      />
      {error && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export function Select({ label, error, required, hint, children, style, id, ...props }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <Label htmlFor={id} required={required} hint={hint}>
          {label}
        </Label>
      )}
      <select
        id={id}
        style={{ ...baseInput, cursor: "pointer", ...style }}
        {...focusHandlers(error)}
        {...props}
      >
        {children}
      </select>
      {error && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
