import Badge from "./Badge";
import Icon from "./Icon";

/**
 * Etiqueta de procedencia de la URL principal de una fuente frente a la matriz
 * EH (Excel institucional). La calcula el backend (`url_provenance`):
 * - matriz: la URL es la original que reporta la matriz.
 * - api / sub_fuente / ajustada / distinta / ia / equipo / sin_matriz: no lo es,
 *   y `url_note` explica por qué; `matrix_url` es la original para comparar.
 */
const TONE = {
  matriz: "success",
  api: "info",
  sub_fuente: "warning",
  ajustada: "warning",
  distinta: "danger",
  ia: "warning",
  equipo: "viewer",
  sin_matriz: "viewer",
};

export function UrlOriginTag({ source, detailed = false }) {
  if (!source?.url_origin) return null;
  const same = source.url_origin === "matriz";
  return (
    <div className="url-origin-wrap">
      <span className="url-origin" title={source.url_note || ""}>
        <Badge tone={TONE[source.url_origin] || "viewer"}>
          <Icon name={same ? "check" : "info"} size={12} /> {source.url_origin_label}
        </Badge>
      </span>
      {!same && (detailed || source.matrix_url) && (
        <div className="url-origin-note">
          {source.url_note}
          {source.matrix_url && !detailed && (
            <>
              {" "}
              <a href={source.matrix_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                Abrir la URL de la matriz
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default UrlOriginTag;
