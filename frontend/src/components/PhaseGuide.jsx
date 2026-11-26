import { useState } from "react";
import { useNavigate } from "react-router-dom";
import InfoTip from "./InfoTip";
import Icon from "./Icon";
import { t } from "../i18n";

const KEY = "iets_hs_phase_guide_closed";

function closedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set();
  }
}

/**
 * Guia compacta de la fase metodologica activa. Se puede plegar: quien ya
 * conoce la pantalla la deja en una linea (se recuerda por fase) y la vuelve
 * a abrir cuando quiera.
 */
export default function PhaseGuide({ phase, tasks, nextLabel, nextTo, onNext, hint }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => !closedSet().has(phase));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      const set = closedSet();
      if (next) set.delete(phase);
      else set.add(phase);
      localStorage.setItem(KEY, JSON.stringify([...set]));
    } catch {
      /* sin almacenamiento: el pliegue dura lo que la pantalla */
    }
  };

  const next = nextLabel && (nextTo || onNext) && (
    <button
      type="button"
      className="phase-guide-next"
      // Navegacion dentro de la SPA: recargar la pagina perdia el estado.
      onClick={onNext || (() => navigate(nextTo))}
    >
      {t("Siguiente: {label} →", { label: nextLabel })}
    </button>
  );

  return (
    <div className={`phase-guide${open ? "" : " is-collapsed"}`}>
      <div className="phase-guide-head">
        <span className="phase-guide-badge term-label">
          {phase}
          <InfoTip text={hint} label={t("Qué es {name}", { name: phase })} />
        </span>
        <span className="phase-guide-label">{t("Qué hace el técnico en esta fase")}</span>
        {next}
        <button
          type="button"
          className="phase-guide-toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t("Ocultar los pasos de la fase") : t("Mostrar los pasos de la fase")}
        >
          {open ? t("Ocultar") : t("Ver {n} pasos", { n: tasks.length })}
          <span className={`phase-guide-caret${open ? " is-open" : ""}`}>
            <Icon name="chevron" size={14} />
          </span>
        </button>
      </div>
      {open && (
        <>
          <ul className="phase-guide-tasks">
            {tasks.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        </>
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
            {item.hint ? <InfoTip text={item.hint} label={t("Qué es {name}", { name: item.label })} /> : null}
          </div>
          {item.sub && <div className="module-stat-sub">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}
