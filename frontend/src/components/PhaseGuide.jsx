import InfoTip from "./InfoTip";

/** Guia compacta de la fase metodologica activa. */
export default function PhaseGuide({ phase, tasks, nextLabel, nextTo, onNext, hint }) {
  return (
    <div className="phase-guide">
      <div className="phase-guide-head">
        <span className="phase-guide-badge term-label">
          {phase}
          <InfoTip text={hint} label={`Que es ${phase}`} />
        </span>
        <span className="phase-guide-label">Que hace el tecnico en esta fase</span>
      </div>
      <ul className="phase-guide-tasks">
        {tasks.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {nextLabel && (nextTo || onNext) && (
        <button
          type="button"
          className="phase-guide-next"
          onClick={onNext || (() => { window.location.href = nextTo; })}
        >
          Siguiente: {nextLabel} →
        </button>
      )}
    </div>
  );
}

export function ModuleStatsRow({ items }) {
  return (
    <div className="module-stats">
      {items.map((item) => (
        <div key={item.label} className="module-stat">
          <div className="module-stat-value" style={item.color ? { color: item.color } : undefined}>
            {item.value}
          </div>
          <div className="module-stat-label">{item.label}</div>
          {item.sub && <div className="module-stat-sub">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}
