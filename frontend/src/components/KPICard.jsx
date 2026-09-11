import InfoTip from "./InfoTip";

/**
 * Tarjeta de indicador. `hint` explica que mide y como se calcula.
 * Con `onClick` la tarjeta es un boton (p. ej. para profundizar en un tablero)
 * y `active` la marca como seleccionada; sin ellos se comporta como antes.
 */
export default function KPICard({ label, value, icon, accent = "#6366F1", sub, hint, onClick, active = false, actionLabel }) {
  const interactive = typeof onClick === "function";
  const shell = {
    background: active ? "#EEF2FF" : "#fff",
    border: `1px solid ${active ? "#6366F1" : "#E2E8F0"}`,
    borderRadius: 12,
    padding: 24,
    transition: "all 200ms ease-in-out",
    position: "relative",
    minWidth: 0,
  };
  const hover = {
    onMouseEnter: (e) => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.boxShadow = "var(--shadow-md)";
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = "none";
    },
  };
  const body = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: "#94A3B8",
          }}
        >
          {label}
          {!interactive && <InfoTip text={hint} label={`Qué es ${label}`} />}
        </div>
        {icon && (
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: `${accent}18`,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: "#0F172A", marginTop: 10 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{sub}</div>}
    </>
  );

  if (!interactive) {
    return (
      <div style={shell} {...hover}>
        {body}
      </div>
    );
  }
  // Boton y ayuda son hermanos: un boton no puede contener otro boton.
  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={actionLabel || `${label}: ${value}`}
        style={{ ...shell, width: "100%", textAlign: "left", cursor: "pointer", font: "inherit" }}
        {...hover}
      >
        {body}
      </button>
      {hint && (
        <span style={{ position: "absolute", top: 10, right: 10 }}>
          <InfoTip text={hint} label={`Qué es ${label}`} position="bottom" />
        </span>
      )}
    </div>
  );
}
