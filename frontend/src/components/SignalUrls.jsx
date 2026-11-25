import Icon from "./Icon";
import "./signal-origin.css";

/** Quita la directiva de resaltado (#:~:text=...) para mostrar la dirección limpia. */
export function cleanUrl(url) {
  return (url || "").replace(/#:~:text=.*$/, "");
}

function Row({ label, hint, url, href, testId, onCopy }) {
  if (!url) return null;
  return (
    <div className="su-row" data-testid={testId}>
      <div className="su-label">
        {label}
        {hint && <span className="su-hint">{hint}</span>}
      </div>
      <div className="su-value">
        <a href={href || url} target="_blank" rel="noopener noreferrer" title="Abrir en una pestaña nueva">
          {url}
        </a>
        <button type="button" className="so-copy" onClick={() => onCopy(url)} aria-label={`Copiar ${label}`}>
          <Icon name="doc" size={13} /> Copiar
        </button>
      </div>
    </div>
  );
}

/**
 * Las tres direcciones de una señal, escritas completas para poder leerlas,
 * copiarlas y citarlas: la URL exacta de lo que el sistema capturó, la página
 * que consultó y la fuente original del catálogo.
 */
export default function SignalUrls({ url, linkType, queryUrl, sourceUrl, sourceTitle, evidence, toast }) {
  const exact = cleanUrl(url);
  const located = linkType !== "exacto" ? evidence?.locator_url || "" : "";
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast?.success("Dirección copiada.");
    } catch {
      toast?.error("El navegador no permitió copiar. Seleccione el texto y cópielo.");
    }
  };
  if (!exact && !queryUrl && !sourceUrl) return null;
  const same = (a, b) => cleanUrl(a).replace(/\/$/, "") === cleanUrl(b).replace(/\/$/, "");
  return (
    <div className="su-box" data-testid="signal-urls">
      <div className="su-title">Direcciones de la señal</div>
      {!exact && !located && (
        <div className="su-row" data-testid="signal-url-exact">
          <div className="su-label">
            URL exacta de captura
            <span className="su-hint">
              Esta señal no trae dirección propia (llegó por un registro o una carga sin enlace). Use la página consultada o la
              fuente original.
            </span>
          </div>
        </div>
      )}
      <Row
        label="URL exacta de captura"
        hint={
          linkType === "exacto"
            ? "Dirección de la ficha, noticia o registro donde está la señal."
            : located
              ? "La fuente no da enlace por ítem: esta dirección abre la página con la señal resaltada."
              : "La fuente no da enlace por ítem: es la página donde el sistema leyó la señal."
        }
        url={located ? cleanUrl(located) : exact}
        href={located || url}
        testId="signal-url-exact"
        onCopy={copy}
      />
      {queryUrl && !same(queryUrl, located || exact) && (
        <Row
          label="Página consultada"
          hint="Listado, buscador o canal que el sistema recorrió para encontrarla."
          url={queryUrl}
          testId="signal-url-query"
          onCopy={copy}
        />
      )}
      <Row
        label="Fuente original"
        hint={sourceTitle ? `Dirección de «${sourceTitle}» en el catálogo de fuentes.` : "Dirección de la fuente en el catálogo."}
        url={sourceUrl}
        testId="signal-url-source"
        onCopy={copy}
      />
      {evidence?.captured_at && (
        <div className="sl-muted" data-testid="signal-url-captured">
          Capturada el {new Date(evidence.captured_at).toLocaleString("es-CO")}.
          {evidence.resolved?.label ? ` ${evidence.resolved.label}.` : ""}
        </div>
      )}
    </div>
  );
}
