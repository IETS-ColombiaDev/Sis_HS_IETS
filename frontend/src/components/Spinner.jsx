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
    <div className="loading-block" role="status" aria-live="polite">
      <Spinner size={30} />
      <span>{label}</span>
      <div className="loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default Spinner;
