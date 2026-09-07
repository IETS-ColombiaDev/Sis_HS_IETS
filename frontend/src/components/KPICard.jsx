import InfoTip from "./InfoTip";

export default function KPICard({ label, value, icon, accent = "#6366F1", sub, hint }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding: 24,
        transition: "all 200ms ease-in-out",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
          <InfoTip text={hint} label={`Que es ${label}`} />
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
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: "#0F172A", marginTop: 10 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
