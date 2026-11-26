import { useNavigate } from "react-router-dom";
import { Card, SectionTitle } from "./Card";
import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";

const ICON = { reglas: "filter", aprendizaje: "layers", calibracion: "sliders", ia: "spark" };

function factValue(fact) {
  const v = fact.value;
  if (v === null || v === undefined || v === "") return "Sin dato";
  if (fact.kind === "percent") return `${Math.round(Number(v) * 100)} %`;
  if (fact.kind === "bool") return v ? "Sí" : "No";
  if (fact.kind === "datetime") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  }
  if (fact.kind === "int") return Number(v).toLocaleString("es-CO");
  return String(v);
}

function Component({ item }) {
  return (
    <article className={`model-part${item.active ? "" : " model-part--off"}`} data-testid={`model-part-${item.key}`}>
      <header className="model-part-head">
        <span className="model-part-icon" aria-hidden="true">
          <Icon name={ICON[item.key] || "bulb"} size={17} />
        </span>
        <div className="model-part-title">
          <h4>{item.name}</h4>
          <span className="model-part-type">{item.type}</span>
        </div>
        <Badge tone={item.active ? "ok" : "viewer"}>{item.active ? "Activo" : "Inactivo"}</Badge>
      </header>
      {item.note && <p className="model-part-note">{item.note}</p>}
      <dl className="model-part-text">
        <dt>Qué hace</dt>
        <dd>{item.role}</dd>
        <dt>Cómo aprende</dt>
        <dd>{item.learning}</dd>
        <dt>Con qué datos</dt>
        <dd>{item.data}</dd>
      </dl>
      <dl className="model-part-facts">
        {item.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{factValue(fact)}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

/**
 * Ficha técnica de la inteligencia del sistema: qué modelos corren, de qué tipo
 * son, cómo aprenden, con qué datos y qué sugirieron. Todo viene del estado real
 * (GET /api/intelligence/status → model_card y trace).
 */
export default function ModelCard({ card, trace = [] }) {
  const navigate = useNavigate();
  if (!card) return null;
  const download = () => {
    const blob = new Blob([JSON.stringify({ ...card, ultimas_sugerencias: trace }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ficha_modelos_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card data-testid="model-card">
      <SectionTitle
        hint="Transparencia: qué modelos usa el sistema, de qué tipo son, cómo aprenden y con qué datos. Las cifras salen del estado actual."
        right={
          <Button size="sm" variant="secondary" onClick={download} data-testid="model-card-download">
            <Icon name="doc" size={14} /> Descargar ficha
          </Button>
        }
      >
        Modelos, aprendizaje y trazabilidad
      </SectionTitle>
      <p className="model-card-lead">
        El sistema no usa una caja negra. Combina cuatro piezas, cada una con un papel acotado, y deja registro de cada sugerencia.
        La decisión final es siempre de una persona.
      </p>
      <div className="model-parts">
        {card.components.map((item) => (
          <Component key={item.key} item={item} />
        ))}
      </div>

      <h4 className="source-section-title">Cómo se arma una sugerencia</h4>
      <ol className="model-rule" data-testid="model-rule">
        {card.decision_rule.filter(Boolean).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>

      <h4 className="source-section-title">Trazabilidad: últimas sugerencias registradas</h4>
      {trace.length === 0 ? (
        <p className="model-card-empty" data-testid="model-trace-empty">
          Aún no hay sugerencias registradas. Aparecen aquí en cuanto alguien abre una señal en la Bandeja de entrada.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="model-trace">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Fecha y hora</th>
                <th style={{ textAlign: "left" }}>Señal</th>
                <th style={{ textAlign: "left" }}>Sugerencia</th>
                <th style={{ textAlign: "left" }}>Método</th>
                <th>Confianza</th>
                <th style={{ textAlign: "left" }}>Decisión del equipo</th>
              </tr>
            </thead>
            <tbody>
              {trace.map((row, i) => (
                <tr key={`${row.technology_id}-${i}`}>
                  <td>{row.at ? new Date(row.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "-"}</td>
                  <td>{row.technology}</td>
                  <td>{[row.cluster_suggested, row.tech_type_suggested].filter(Boolean).join(" · ") || "-"}</td>
                  <td>{row.method_label || "-"}</td>
                  <td style={{ textAlign: "center" }}>{row.confidence != null ? `${row.confidence} %` : "-"}</td>
                  <td>
                    {!row.decided ? (
                      <Badge tone="viewer">Sin clasificar</Badge>
                    ) : row.accepted ? (
                      <Badge tone="ok">Confirmó la sugerencia</Badge>
                    ) : (
                      <>
                        <Badge tone="warning">Eligió otro</Badge> {row.cluster_final}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="model-card-foot">
        Cada sugerencia queda en la bitácora con la acción <code>intelligence:suggest</code>: señal, método, confianza y usuario.{" "}
        <button type="button" className="so-linkbtn" onClick={() => navigate("/auditoria")}>
          Abrir la bitácora de auditoría
        </button>
      </p>
    </Card>
  );
}
