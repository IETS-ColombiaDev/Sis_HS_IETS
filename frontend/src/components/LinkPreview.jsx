import Badge from "./Badge";
import { t, tr, ts } from "../i18n";

/** Resultado de la vista previa de un enlace (POST /api/scan/preview). */
export default function LinkPreview({ data }) {
  if (!data) return null;
  return (
    <div className="fb-preview" data-testid="link-preview">
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
        <Badge tone={data.ok ? "ok" : "warning"}>{data.ok ? t("Se puede leer") : t("No se pudo leer")}</Badge>
        {data.content_type && <span style={{ color: "#94A3B8" }}>{data.content_type}</span>}
      </div>
      {data.message && <p style={{ margin: "4px 0" }}>{ts(data.message)}</p>}
      {data.title && <p style={{ margin: "4px 0" }}><strong>{t("Título:")}</strong> {data.title}</p>}
      {data.description && <p style={{ margin: "4px 0" }}>{data.description}</p>}
          {data.ok && (
        <>
          {data.pages_visited > 1 && (
            <p style={{ margin: "6px 0 0" }}>
              {tr("El rastreador entró a <b>{n}</b> páginas internas (listado y fichas).", { n: data.pages_visited }, { b: (c) => <strong>{c}</strong> })}
            </p>
          )}
          <p style={{ margin: "6px 0 0" }}>{tr("<b>{n}</b> posible(s) señal(es) detectadas.", { n: data.candidates_count || 0 }, { b: (c) => <strong>{c}</strong> })}</p>
          {(data.candidates || []).length > 0 && (
            <ul>
              {data.candidates.slice(0, 6).map((c, i) => (
                <li key={`${c.title || c}-${i}`}>{c.title || String(c)}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
