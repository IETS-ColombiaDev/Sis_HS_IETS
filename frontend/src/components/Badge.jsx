const PRESETS = {
  emergente: { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  transicional: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  inminente: { bg: "#E0E7FF", color: "#3730A3", border: "#A5B4FC" },
  medicamento: { bg: "#F0FDFA", color: "#0F766E", border: "#99F6E4" },
  dispositivo: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  digital: { bg: "#EDE9FE", color: "#6D28D9", border: "#DDD6FE" },
  otro: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  nuevo: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  revisado: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  priorizado: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  descartado: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  alto: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  medio: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  bajo: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  ok: { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" },
  error: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
  parcial: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  admin: { bg: "#EEF2FF", color: "#4338CA", border: "#C7D2FE" },
  editor: { bg: "#DBEAFE", color: "#1E40AF", border: "#BFDBFE" },
  viewer: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  default: { bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
};

export default function Badge({ children, tone, style }) {
  const key = (tone || String(children || "").toLowerCase()).trim();
  const p = PRESETS[key] || PRESETS.default;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background: p.bg,
        color: p.color,
        border: `1px solid ${p.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children || "—"}
    </span>
  );
}
