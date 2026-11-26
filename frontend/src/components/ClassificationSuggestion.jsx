import Badge from "./Badge";
import Icon from "./Icon";
import "./signal-origin.css";
import { t, ts } from "../i18n";

export const METHOD = {
  reglas: t("Reglas del catálogo"),
  aprendizaje: t("Aprendido de clasificaciones anteriores"),
  aprendizaje_debil: t("Parecido bajo con lo ya clasificado"),
  reglas_y_aprendizaje: t("Reglas y clasificaciones anteriores coinciden"),
  ia: t("Propuesto por la IA con ejemplos del equipo"),
  ia_confirma: t("La IA confirma la propuesta"),
  sin_evidencia: t("Sin evidencia suficiente"),
};

function tone(confidence, minimum) {
  if (confidence >= Math.max(75, minimum)) return "ok";
  if (confidence >= minimum) return "viewer";
  return "warning";
}

function Line({ label, name, confidence, method, reason, minimum, testId }) {
  if (!name) {
    return (
      <div className="cs-line" data-testid={testId}>
        <strong>{label}:</strong> <span className="sl-muted">{t("sin propuesta. Clasifique manualmente.")}</span>
      </div>
    );
  }
  return (
    <div className="cs-line" data-testid={testId}>
      <strong>{label}:</strong> {name} <Badge tone={tone(confidence, minimum)}>{t("Confianza {n} %", { n: confidence })}</Badge>
      <div className="sl-muted">
        {METHOD[method] || ts(method)}
        {reason ? `. ${ts(reason)}` : ""}
      </div>
    </div>
  );
}

/**
 * Sugerencia de clasificación con su confianza y su evidencia: de dónde sale
 * (reglas, clasificaciones anteriores o IA), las señales parecidas que el
 * equipo ya clasificó y, si aplica, el aviso de que se parece a señales descartadas.
 */
export default function ClassificationSuggestion({ data }) {
  if (!data) return null;
  const minimum = data.min_confidence ?? 55;
  return (
    <div className="cs-box" data-testid="classification-suggestion">
      <div className="cs-title">
        <Icon name="spark" size={14} /> {t("Sugerencia de clasificación")}
        {data.ai_used && <Badge tone="viewer">{data.ai_model ? t("Con IA ({model})", { model: data.ai_model }) : t("Con IA")}</Badge>}
        {!data.learning && <span className="sl-muted">{t("Aún no hay clasificaciones parecidas de las que aprender.")}</span>}
      </div>
      <Line label={t("Clúster")} name={data.cluster_name} confidence={data.cluster_confidence} method={data.cluster_method} reason={data.cluster_reason} minimum={minimum} testId="suggestion-cluster" />
      <Line label={t("Tipología")} name={data.tech_type_name} confidence={data.tech_type_confidence} method={data.tech_type_method} reason={data.tech_type_reason} minimum={minimum} testId="suggestion-type" />
      {data.condition && (
        <div className="cs-line">
          <strong>{t("Condición:")}</strong> {data.condition === "nueva" ? t("Nueva") : t("Emergente")}
        </div>
      )}
      {data.discard_hint && (
        <div className="cs-warning" role="status" data-testid="suggestion-discard-hint">
          <Icon name="alert" size={14} /> {ts(data.discard_hint.message)}
        </div>
      )}
      {data.similar?.length > 0 && (
        <details className="cs-similar" data-testid="suggestion-similar">
          <summary>{t("Ver las {n} señales parecidas que el equipo ya clasificó", { n: data.similar.length })}</summary>
          <ul>
            {data.similar.map((s) => (
              <li key={s.technology_id}>
                <strong>{s.name || t("Tecnología {id}", { id: s.technology_id })}</strong> · {t("parecido {n} %", { n: Math.round(s.similarity * 100) })}
                <div className="sl-muted">
                  {s.cluster_name || t("sin clúster")} · {s.tech_type_name || t("sin tipología")}
                  {" · "}
                  {s.origin === "historica" ? t("primera búsqueda histórica") : s.origin === "postulacion" ? t("postulación") : t("vigilancia posterior")}
                  {s.year ? ` · ${s.year}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="sl-muted">{t("La sugerencia orienta: revísela y guarde para confirmarla. El sistema aprende de lo que usted confirma.")}</div>
    </div>
  );
}
