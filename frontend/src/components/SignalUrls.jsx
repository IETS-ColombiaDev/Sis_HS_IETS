import Icon from "./Icon";
import "./signal-origin.css";

/** Quita la directiva de resaltado (#:~:text=...) para mostrar la dirección limpia. */
export function cleanUrl(url) {
  return (url || "").replace(/#:~:text=.*$/, "");
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function LinkButton({ href, label, icon = "external", testId, title, onCopy, tone }) {
  return (
    <span className="su-btn">
      <a className={`so-link${tone ? ` so-link--${tone}` : ""}`} href={href} target="_blank" rel="noopener noreferrer" title={title || cleanUrl(href)} data-testid={testId}>
        <Icon name={icon} size={15} />
        <span>{label}</span>
        {host(href) && <span className="so-host">{host(href)}</span>}
      </a>
      <button type="button" className="so-copy" onClick={() => onCopy(cleanUrl(href))} aria-label={`Copiar la dirección: ${label}`} title="Copiar la dirección">
        <Icon name="doc" size={13} />
      </button>
    </span>
  );
}

/**
 * Los tres enlaces de una señal, cada uno como botón: la URL exacta de lo que
 * el sistema capturó, la página que consultó y la fuente original del catálogo.
 * El de la URL exacta lleva a la ficha, noticia o registro; si la fuente no da
 * enlace por ítem, abre la página con la señal resaltada. Un enlace que el
 * sistema verificó que ya no existe no se ofrece como exacto.
 */
export default function SignalUrls({ url, linkType, linkStatus, queryUrl, sourceUrl, sourceTitle, evidence, toast }) {
  const exact = cleanUrl(url);
  const located = linkType !== "exacto" ? evidence?.locator_url || "" : "";
  const broken = linkStatus === "caido" || linkStatus === "redirigido";
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
  const exactHref = located || url;
  const isExact = linkType === "exacto" || Boolean(located);
  return (
    <div className="su-actions" data-testid="signal-urls">
      {exactHref && !broken ? (
        <LinkButton
          href={exactHref}
          label={isExact ? "URL exacta de la señal" : "Página donde está la señal"}
          icon={located ? "search" : "external"}
          testId="signal-url-exact"
          onCopy={copy}
          title={
            linkType === "exacto"
              ? `Ficha, noticia o registro de la señal: ${exact}`
              : located
                ? `La fuente no da enlace por ítem: abre la página con la señal resaltada. ${cleanUrl(located)}`
                : `La fuente no da enlace por ítem: es la página donde el sistema leyó la señal. ${exact}`
          }
        />
      ) : (
        <span className="so-nolink" data-testid="signal-url-exact">
          <Icon name="alert" size={15} />{" "}
          {broken
            ? "La URL exacta ya no responde en el sitio: use la página consultada"
            : "Esta señal no trae URL exacta: use la página consultada o la fuente original"}
        </span>
      )}
      {queryUrl && !same(queryUrl, exactHref) && (
        <LinkButton
          href={queryUrl}
          label="Página consultada"
          testId="signal-url-query"
          onCopy={copy}
          title={`Listado, buscador o canal que el sistema recorrió: ${queryUrl}`}
        />
      )}
      {sourceUrl && (
        <LinkButton
          href={sourceUrl}
          label="Fuente original"
          icon="globe"
          testId="signal-url-source"
          onCopy={copy}
          title={`${sourceTitle ? `«${sourceTitle}» en el catálogo de fuentes: ` : ""}${sourceUrl}`}
        />
      )}
      {evidence?.broken_url && (
        <div className="sl-muted" data-testid="signal-url-broken">
          El enlace capturado ({evidence.broken_url}) ya no existe en el sitio. La señal se abre en su página consultada.
        </div>
      )}
    </div>
  );
}
