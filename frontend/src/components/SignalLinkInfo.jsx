import Icon from "./Icon";
import "./signal-origin.css";

/** Etiquetas del tipo de enlace de una señal (RF-001). Nunca se presenta como exacto lo que no lo es. */
export const LINK_TYPE = {
  exacto: { label: "Enlace exacto", button: "Abrir la señal en la fuente", tone: "ok" },
  consulta: { label: "Página de consulta, la fuente no ofrece enlace directo", button: "Abrir la página de consulta", tone: "warn" },
  sin_enlace: { label: "Sin enlace", button: "", tone: "bad" },
};

export const LINK_STATUS = {
  ok: "Responde",
  redirigido: "Redirige a otra página",
  caido: "No responde",
  bloqueado: "El sitio bloquea la verificación automática",
  sin_verificar: "Sin verificar",
};

function fmt(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("es-CO");
}

/**
 * Enlace de la señal con su tipo, su estado y, cuando la fuente no ofrece
 * enlace directo, la evidencia de captura (título, fragmento, fecha y hora, URL consultada).
 */
export default function SignalLinkInfo({ url, linkType, linkStatus, queryUrl, evidence, compact = false }) {
  const type = LINK_TYPE[linkType] || (url ? null : LINK_TYPE.sin_enlace);
  const broken = linkStatus === "caido" || linkStatus === "redirigido";
  const showEvidence = evidence && linkType !== "exacto";
  return (
    <div className="sl-box" data-testid="signal-link-info">
      <div className="sl-row">
        {type && (
          <span className={`sl-badge sl-badge--${type.tone}`} data-testid="signal-link-type">
            <Icon name={linkType === "exacto" ? "check" : "alert"} size={13} /> {type.label}
          </span>
        )}
        {linkStatus && linkStatus !== "sin_verificar" && (
          <span className={`sl-badge sl-badge--${broken ? "bad" : linkStatus === "ok" ? "ok" : "warn"}`} data-testid="signal-link-status">
            {LINK_STATUS[linkStatus] || linkStatus}
          </span>
        )}
        {url && (
          <a className="so-link" href={url} target="_blank" rel="noopener noreferrer" title={url} data-testid="signal-link-open">
            <Icon name="external" size={14} /> {type?.button || "Abrir enlace"}
          </a>
        )}
        {queryUrl && linkType === "exacto" && !compact && (
          <a className="sl-query" href={queryUrl} target="_blank" rel="noopener noreferrer" title={queryUrl}>
            Página consultada
          </a>
        )}
      </div>
      {showEvidence && (
        <div className="sl-evidence" data-testid="signal-evidence">
          <div className="sl-evidence-title">Evidencia de captura</div>
          {evidence.title && <div><strong>Título:</strong> {evidence.title}</div>}
          {evidence.snippet && (
            <blockquote className="sl-snippet">
              {evidence.snippet}
              {!evidence.is_quote && <span className="sl-muted"> (resumen; la fuente no dio cita textual)</span>}
            </blockquote>
          )}
          {evidence.captured_at && <div><strong>Fecha y hora de captura:</strong> {fmt(evidence.captured_at)}</div>}
          {(evidence.query_url || queryUrl) && (
            <div style={{ overflowWrap: "anywhere" }}>
              <strong>URL consultada:</strong>{" "}
              <a href={evidence.query_url || queryUrl} target="_blank" rel="noopener noreferrer">{evidence.query_url || queryUrl}</a>
            </div>
          )}
          <div className="sl-muted">Busque el título o el fragmento en la página consultada para ubicar la señal.</div>
        </div>
      )}
    </div>
  );
}
