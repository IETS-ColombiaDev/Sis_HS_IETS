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
  sin_respuesta: "El sitio no respondió a la verificación (se reintenta)",
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
export default function SignalLinkInfo({ url, linkType, linkStatus, queryUrl, evidence, compact = false, hideLinks = false }) {
  const type = LINK_TYPE[linkType] || (url ? null : LINK_TYPE.sin_enlace);
  const broken = linkStatus === "caido" || linkStatus === "redirigido";
  const showEvidence = evidence && linkType !== "exacto";
  // RF-001: la fuente no tiene enlace por ítem, pero el sistema verificó que la
  // señal está en la página: el enlace abre la página y el navegador la resalta.
  const locatorUrl = linkType !== "exacto" ? evidence?.locator_url : "";
  const resolved = evidence?.resolved || null;
  // Fuentes que bloquean robots se leen por su canal en Google Noticias: el enlace redirige al artículo.
  const viaNews = /^https?:\/\/news\.google\.com\//i.test(url || "");
  return (
    <div className="sl-box" data-testid="signal-link-info">
      <div className="sl-row">
        {type && (
          <span className={`sl-badge sl-badge--${type.tone}`} data-testid="signal-link-type">
            <Icon name={linkType === "exacto" ? "check" : "alert"} size={13} /> {type.label}
          </span>
        )}
        {linkStatus && linkStatus !== "sin_verificar" && linkStatus !== "sin_respuesta" && (
          <span className={`sl-badge sl-badge--${broken ? "bad" : linkStatus === "ok" ? "ok" : "warn"}`} data-testid="signal-link-status">
            {LINK_STATUS[linkStatus] || linkStatus}
          </span>
        )}
        {locatorUrl && !hideLinks && (
          <a
            className="so-link"
            href={locatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abre la página y resalta «${evidence.locator_text || ""}»`}
            data-testid="signal-link-locate"
          >
            <Icon name="search" size={14} /> Abrir la página y resaltar la señal
          </a>
        )}
        {url && !hideLinks && (
          <a
            className={locatorUrl ? "sl-query" : "so-link"}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
            data-testid="signal-link-open"
          >
            {!locatorUrl && <Icon name="external" size={14} />} {type?.button || "Abrir enlace"}
          </a>
        )}
        {queryUrl && linkType === "exacto" && !compact && !hideLinks && (
          <a className="sl-query" href={queryUrl} target="_blank" rel="noopener noreferrer" title={queryUrl}>
            Página consultada
          </a>
        )}
      </div>
      {linkType === "exacto" && resolved?.method === "enlace_en_pagina" && !compact && (
        <div className="sl-muted" data-testid="signal-link-resolved">
          Enlace exacto ubicado por el sistema en la página de la fuente.
          {resolved.previous_url && (
            <>
              {" "}Antes apuntaba a{" "}
              <a href={resolved.previous_url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>
                la página de consulta
              </a>
              .
            </>
          )}
        </div>
      )}
      {viaNews && !compact && (
        <div className="sl-muted" data-testid="signal-link-news">
          Este enlace pasa por Google Noticias y redirige al artículo original de la fuente. Allí, busque el título de la
          señal (Ctrl+F) para ubicarla.
        </div>
      )}
      {linkType === "exacto" && resolved?.method === "enlace_del_registro" && !compact && (
        <div className="sl-muted" data-testid="signal-link-registry">
          Enlace exacto a la ficha del producto en el registro oficial.
        </div>
      )}
      {linkType === "exacto" && evidence?.snippet && evidence.is_quote && !compact && (
        <div className="sl-muted" data-testid="signal-link-quote">
          Texto de la señal en la fuente: «{evidence.snippet}». El enlace abre la página y el navegador resalta ese texto.
        </div>
      )}
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
          {locatorUrl ? (
            <div className="sl-muted">
              La fuente publica esta señal en una tabla o listado sin enlace propio. «Abrir la página y resaltar la señal»
              lleva al punto exacto de la página (navegadores Chrome, Edge, Safari y Firefox recientes).
            </div>
          ) : (
            <div className="sl-muted">
              {resolved?.method === "sin_ubicar" && resolved.reason ? `${resolved.reason} ` : ""}
              Busque el título o el fragmento en la página consultada para ubicar la señal.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
