export function Card({ children, style, padding = 24 }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 24,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{title}</h1>
        {subtitle && (
          <p style={{ color: "#64748B", fontSize: 14, marginTop: 6, maxWidth: 720 }}>{subtitle}</p>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 600 }}>{children}</h3>
      {right}
    </div>
  );
}

export default Card;
