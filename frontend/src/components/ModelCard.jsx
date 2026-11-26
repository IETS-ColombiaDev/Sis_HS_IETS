import { useNavigate } from "react-router-dom";
import { Card, SectionTitle } from "./Card";
import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import { t, tr, ts, intlLocale } from "../i18n";

const ICON = { reglas: "filter", aprendizaje: "layers", calibracion: "sliders", ia: "spark" };

function factValue(fact) {
  const v = fact.value;
  if (v === null || v === undefined || v === "") return t("Sin dato");
  if (fact.kind === "percent") return `${Math.round(Number(v) * 100)} %`;
  if (fact.kind === "bool") return v ? t("Sí") : t("No");
  if (fact.kind === "datetime") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString(intlLocale(), { dateStyle: "medium", timeStyle: "short" });
  }
  if (fact.kind === "int") return Number(v).toLocaleString(intlLocale());
  return ts(String(v));
}

function Component({ item }) {
  return (
    <article className={`model-part${item.active ? "" : " model-part--off"}`} data-testid={`model-part-${item.key}`}>
      <header className="model-part-head">
        <span className="model-part-icon" aria-hidden="true">
          <Icon name={ICON[item.key] || "bulb"} size={17} />
        </span>
        <div className="model-part-title">
          <h4>{ts(item.name)}</h4>
          <span className="model-part-type">{ts(item.type)}</span>
        </div>
        <Badge tone={item.active ? "ok" : "viewer"}>{item.active ? t("Activo") : t("Inactivo")}</Badge>
      </header>
      {item.note && <p className="model-part-note">{ts(item.note)}</p>}
      <dl className="model-part-text">
        <dt>{t("Qué hace")}</dt>
        <dd>{ts(item.role)}</dd>
        <dt>{t("Cómo aprende")}</dt>
        <dd>{ts(item.learning)}</dd>
        <dt>{t("Con qué datos")}</dt>
        <dd>{ts(item.data)}</dd>
      </dl>
      <dl className="model-part-facts">
        {item.facts.map((fact) => (
          <div key={fact.label}>
            <dt>{ts(fact.label)}</dt>
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
        hint={t("Transparencia: qué modelos usa el sistema, de qué tipo son, cómo aprenden y con qué datos. Las cifras salen del estado actual.")}
        right={
          <Button size="sm" variant="secondary" onClick={download} data-testid="model-card-download">
            <Icon name="doc" size={14} /> {t("Descargar ficha")}
          </Button>
        }
      >
        {t("Modelos, aprendizaje y trazabilidad")}
      </SectionTitle>
      <p className="model-card-lead">
        {t("El sistema no usa una caja negra. Combina cuatro piezas, cada una con un papel acotado, y deja registro de cada sugerencia. La decisión final es siempre de una persona.")}
      </p>
      <div className="model-parts">
        {card.components.map((item) => (
          <Component key={item.key} item={item} />
        ))}
      </div>

      <h4 className="source-section-title">{t("Cómo se arma una sugerencia")}</h4>
      <ol className="model-rule" data-testid="model-rule">
        {card.decision_rule.filter(Boolean).map((line) => (
          <li key={line}>{ts(line)}</li>
        ))}
      </ol>

      <h4 className="source-section-title">{t("Trazabilidad: últimas sugerencias registradas")}</h4>
      {trace.length === 0 ? (
        <p className="model-card-empty" data-testid="model-trace-empty">
          {t("Aún no hay sugerencias registradas. Aparecen aquí en cuanto alguien abre una señal en la Bandeja de entrada.")}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="model-trace">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{t("Fecha y hora")}</th>
                <th style={{ textAlign: "left" }}>{t("Señal")}</th>
                <th style={{ textAlign: "left" }}>{t("Sugerencia")}</th>
                <th style={{ textAlign: "left" }}>{t("Método")}</th>
                <th>{t("Confianza")}</th>
                <th style={{ textAlign: "left" }}>{t("Decisión del equipo")}</th>
              </tr>
            </thead>
            <tbody>
              {trace.map((row, i) => (
                <tr key={`${row.technology_id}-${i}`}>
                  <td>{row.at ? new Date(row.at).toLocaleString(intlLocale(), { dateStyle: "medium", timeStyle: "short" }) : "-"}</td>
                  <td>{row.technology}</td>
                  <td>{[ts(row.cluster_suggested), ts(row.tech_type_suggested)].filter(Boolean).join(" · ") || "-"}</td>
                  <td>{ts(row.method_label) || "-"}</td>
                  <td style={{ textAlign: "center" }}>{row.confidence != null ? `${row.confidence} %` : "-"}</td>
                  <td>
                    {!row.decided ? (
                      <Badge tone="viewer">{t("Sin clasificar")}</Badge>
                    ) : row.accepted ? (
                      <Badge tone="ok">{t("Confirmó la sugerencia")}</Badge>
                    ) : (
                      <>
                        <Badge tone="warning">{t("Eligió otro")}</Badge> {ts(row.cluster_final)}
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
        {tr("Cada sugerencia queda en la bitácora con la acción <code>intelligence:suggest</code>: señal, método, confianza y usuario.", null, {
          code: (c) => <code>{c}</code>,
        })}{" "}
        <button type="button" className="so-linkbtn" onClick={() => navigate("/auditoria")}>
          {t("Abrir la bitácora de auditoría")}
        </button>
      </p>
    </Card>
  );
}
