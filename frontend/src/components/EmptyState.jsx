export default function EmptyState({ icon = "📭", title, message, action }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "56px 24px",
        color: "#64748B",
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 12 }}>{icon}</div>
      {title && (
        <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
          {title}
        </div>
      )}
      {message && <div style={{ fontSize: 14, maxWidth: 420, margin: "0 auto" }}>{message}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}
