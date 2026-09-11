import { useNavigate } from "react-router-dom";
import InfoTip from "./InfoTip";

/** Guia compacta de la fase metodologica activa. */
export default function PhaseGuide({ phase, tasks, nextLabel, nextTo, onNext, hint }) {
  const navigate = useNavigate();
  return (
    <div className="phase-guide">
      <div className="phase-guide-head">
        <span className="phase-guide-badge term-label">
          {phase}
          <InfoTip text={hint} label={`Qué es ${phase}`} />
        </span>
        <span className="phase-guide-label">Qué hace el técnico en esta fase</span>
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
          // Navegacion dentro de la SPA: recargar la pagina perdia el estado.
          onClick={onNext || (() => navigate(nextTo))}
        >
          Siguiente: {nextLabel} →
        </button>
      )}
    </div>
  );
}

/**
 * Fila de indicadores del modulo. Cada item acepta `hint`: la explicacion del
 * KPI en lenguaje sencillo (que cuenta y por que importa).
 */
export function ModuleStatsRow({ items }) {
  return (
    <div className="module-stats">
      {items.map((item) => (
        <div key={item.label} className="module-stat" data-testid={item.testId}>
          <div className="module-stat-value" style={item.color ? { color: item.color } : undefined}>
            {item.value}
          </div>
          <div className="module-stat-label">
            {item.label}
            {item.hint ? <InfoTip text={item.hint} label={`Qué es ${item.label}`} /> : null}
          </div>
          {item.sub && <div className="module-stat-sub">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}
