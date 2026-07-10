export function Spinner({ size = 22, color = "#6366F1" }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        border: `3px solid ${color}33`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        display: "inline-block",
      }}
    />
  );
}

export function LoadingBlock({ label = "Cargando..." }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: "64px 0",
        color: "#64748B",
      }}
    >
      <Spinner size={32} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </div>
  );
}

export default Spinner;
