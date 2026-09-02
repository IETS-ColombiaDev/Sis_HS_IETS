import { useNavigate, useLocation } from "react-router-dom";
import Icon from "./Icon";
import { IETS_PHASES } from "../constants/methodology";

/** Flujograma metodologico IETS visible en cada modulo operativo. */
export default function WorkflowStrip({ active }) {
  const navigate = useNavigate();
  const location = useLocation();

  const resolveActive = () => {
    if (active) return active;
    const path = location.pathname;
    if (path.startsWith("/vigilancia") || path.startsWith("/escaneo") || path.startsWith("/fuentes")) {
      return "identificacion";
    }
    if (path.startsWith("/priorizacion") || path.startsWith("/hallazgos")) return "priorizacion";
    if (
      path.startsWith("/evaluacion") ||
      path.startsWith("/caracterizacion") ||
      path.startsWith("/revisar")
    ) {
      return "caracterizacion";
    }
    if (
      path.startsWith("/diseminacion") ||
      path.startsWith("/recomendaciones") ||
      path.startsWith("/notas") ||
      path.startsWith("/boletines") ||
      path.startsWith("/dashboards") ||
      path.startsWith("/alertas")
    ) {
      return "diseminacion";
    }
    return null;
  };

  const current = resolveActive();

  return (
    <nav className="workflow-strip methodology-strip" aria-label="Metodologia IETS">
      {IETS_PHASES.map((step, i) => {
        const isActive = step.key === current;
        return (
          <div key={step.key} className="workflow-step-wrap">
            <button
              type="button"
              className={`workflow-step${isActive ? " workflow-step--active" : ""}`}
              onClick={() => navigate(step.to)}
              title={step.hint}
            >
              <span className="workflow-step-num">{i + 1}</span>
              <Icon name={step.icon} size={15} />
              <span className="workflow-step-label">{step.label}</span>
            </button>
            {i < IETS_PHASES.length - 1 && <span className="workflow-arrow" aria-hidden="true" />}
          </div>
        );
      })}
    </nav>
  );
}

export { IETS_PHASES };
