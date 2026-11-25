import Badge from "./Badge";
import Icon from "./Icon";
import "./signal-origin.css";

export const METHOD = {
  reglas: "Reglas del catálogo",
  aprendizaje: "Aprendido de clasificaciones anteriores",
  aprendizaje_debil: "Parecido bajo con lo ya clasificado",
  reglas_y_aprendizaje: "Reglas y clasificaciones anteriores coinciden",
  ia: "Propuesto por la IA con ejemplos del equipo",
  ia_confirma: "La IA confirma la propuesta",
  sin_evidencia: "Sin evidencia suficiente",
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
        <strong>{label}:</strong> <span className="sl-muted">sin propuesta. Clasifique manualmente.</span>
      </div>
    );
  }
  return (
    <div className="cs-line" data-testid={testId}>
      <strong>{label}:</strong> {name} <Badge tone={tone(confidence, minimum)}>Confianza {confidence} %</Badge>
      <div className="sl-muted">
        {METHOD[method] || method}
        {reason ? `. ${reason}` : ""}
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
        <Icon name="spark" size={14} /> Sugerencia de clasificación
        {data.ai_used && <Badge tone="viewer">Con IA{data.ai_model ? ` (${data.ai_model})` : ""}</Badge>}
        {!data.learning && <span className="sl-muted">Aún no hay clasificaciones parecidas de las que aprender.</span>}
      </div>
      <Line label="Clúster" name={data.cluster_name} confidence={data.cluster_confidence} method={data.cluster_method} reason={data.cluster_reason} minimum={minimum} testId="suggestion-cluster" />
      <Line label="Tipología" name={data.tech_type_name} confidence={data.tech_type_confidence} method={data.tech_type_method} reason={data.tech_type_reason} minimum={minimum} testId="suggestion-type" />
      {data.condition && (
        <div className="cs-line">
          <strong>Condición:</strong> {data.condition === "nueva" ? "Nueva" : "Emergente"}
        </div>
      )}
      {data.discard_hint && (
        <div className="cs-warning" role="status" data-testid="suggestion-discard-hint">
          <Icon name="alert" size={14} /> {data.discard_hint.message}
        </div>
      )}
      {data.similar?.length > 0 && (
        <details className="cs-similar" data-testid="suggestion-similar">
          <summary>Ver las {data.similar.length} señales parecidas que el equipo ya clasificó</summary>
          <ul>
            {data.similar.map((s) => (
              <li key={s.technology_id}>
                <strong>{s.name || `Tecnología ${s.technology_id}`}</strong> · parecido {Math.round(s.similarity * 100)} %
                <div className="sl-muted">
                  {s.cluster_name || "sin clúster"} · {s.tech_type_name || "sin tipología"}
                  {s.origin === "historica" ? " · primera búsqueda histórica" : s.origin === "postulacion" ? " · postulación" : " · vigilancia posterior"}
                  {s.year ? ` · ${s.year}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="sl-muted">La sugerencia orienta: revísela y guarde para confirmarla. El sistema aprende de lo que usted confirma.</div>
    </div>
  );
}
