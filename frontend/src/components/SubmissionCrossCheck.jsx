import { useState } from "react";
import api, { apiError } from "../api/client";
import Badge from "./Badge";
import HintButton from "./HintButton";
import Icon from "./Icon";
import "./signal-origin.css";

function fmt(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("es-CO");
}

const MATCHED_ON = {
  nct: "mismo NCT",
  nombre: "nombre o DCI",
  nombre_contenido: "nombre contenido en la señal",
  fabricante: "fabricante",
  atc: "código ATC",
};

/**
 * Cruce de una postulación con la vigilancia proactiva y con la web (RF-02-F).
 *
 * Muestra si la vigilancia ya detectó la tecnología (con el enlace a la señal
 * exacta en su fuente) y qué dice la web (resultados oficiales y del catálogo
 * primero). «Cruzar de nuevo» repite las dos búsquedas.
 */
export default function SubmissionCrossCheck({ row, canRun, onUpdated, toast, compact = false }) {
  const [busy, setBusy] = useState(false);
  const cross = row.cross_check;

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/submissions/${row.id}/cross-check`, null, { params: { web: true } });
      onUpdated?.(data);
      toast?.success("Cruce actualizado con la vigilancia y la web.");
    } catch (e) {
      toast?.error(apiError(e, "No se pudo cruzar la postulación"));
    } finally {
      setBusy(false);
    }
  };

  const proactive = cross?.proactive || { count: 0, matches: [] };
  const web = cross?.web;
  const allResults = web?.results || [];
  const registryResults = allResults.filter((r) => r.kind === "registro");
  const webResults = allResults
    .filter((r) => r.kind !== "registro")
    .sort((a, b) => Number(b.official || b.catalog_source !== "") - Number(a.official || a.catalog_source !== ""));
  const limit = compact ? 3 : 12;

  const ResultItem = ({ r }) => (
    <li>
      <a href={r.url} target="_blank" rel="noopener noreferrer">
        {r.title || r.url}
      </a>{" "}
      {r.registry && <Badge tone="ok">{r.registry}</Badge>}
      {!r.registry && r.official && <Badge tone="ok">Oficial</Badge>}{" "}
      {r.catalog_source && <Badge tone="editor">En el catálogo: {r.catalog_source}</Badge>}{" "}
      {r.cited_by_submitter && <Badge tone="viewer">Citada por quien postula</Badge>}
      <div className="xc-muted" style={{ overflowWrap: "anywhere" }}>
        {r.snippet || r.host}
      </div>
    </li>
  );
  return (
    <section className="xc-box" data-testid={`submission-cross-${row.id}`}>
      <header className="xc-head">
        <strong>Cruce con la vigilancia y la web</strong>
        {canRun && (
          <HintButton
            size="sm"
            variant="outline"
            loading={busy}
            onClick={run}
            hint="Busca la tecnología entre las señales de la vigilancia proactiva (mismo comparador del filtrado), en registros oficiales (ClinicalTrials.gov, FDA, PubMed) y en la web. Tarda unos segundos."
            data-testid={`submission-cross-run-${row.id}`}
          >
            <Icon name="search" size={14} /> {cross ? "Cruzar de nuevo" : "Cruzar ahora"}
          </HintButton>
        )}
      </header>
      {!cross ? (
        <p className="xc-muted">Aún no se ha cruzado esta postulación.</p>
      ) : (
        <>
          <p className={`xc-summary ${proactive.count ? "is-known" : "is-new"}`}>{cross.summary?.text}</p>

          <div className="xc-section">
            <div className="xc-label">
              Vigilancia proactiva <Badge tone={proactive.count ? "parcial" : "ok"}>{proactive.count ? `${proactive.count} coincidencia(s)` : "Sin coincidencias"}</Badge>
            </div>
            {proactive.matches?.length > 0 && (
              <ul className="xc-list">
                {proactive.matches.slice(0, compact ? 3 : 12).map((m) => {
                  const href = m.link_type === "exacto" ? m.url : m.locator_url || m.url;
                  return (
                    <li key={m.technology_id}>
                      <div>
                        <strong>{m.name}</strong>
                        {m.manufacturer ? ` · ${m.manufacturer}` : ""} — {m.source_title || "Sin fuente"}{" "}
                        <span className="xc-muted">
                          ({Math.round(m.score)}% por {(m.matched_on || []).map((k) => MATCHED_ON[k] || k).join(", ") || "nombre"}
                          {m.status_label ? ` · ${m.status_label}` : ""})
                        </span>
                      </div>
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="so-link">
                          <Icon name="external" size={13} />{" "}
                          {m.link_type === "exacto" ? "Abrir la señal en la fuente" : m.locator_url ? "Abrir la página y resaltar la señal" : "Abrir la página de consulta"}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="xc-section">
            <div className="xc-label">
              Registros oficiales{" "}
              {web ? (
                <Badge tone={registryResults.length ? "ok" : "parcial"}>
                  {registryResults.length ? `${registryResults.length} ficha(s)` : "Sin fichas"}
                </Badge>
              ) : (
                <span className="xc-muted">en curso: pulse «Cruzar de nuevo» si no aparece en unos segundos.</span>
              )}
            </div>
            {web?.names?.length > 0 && <div className="xc-muted">ClinicalTrials.gov, FDA y PubMed por «{web.names.join("» y «")}».</div>}
            {registryResults.length > 0 && (
              <ul className="xc-list">
                {registryResults.slice(0, limit).map((r) => (
                  <ResultItem key={r.url} r={r} />
                ))}
              </ul>
            )}
          </div>

          {web && (
            <div className="xc-section">
              <div className="xc-label">
                Web <Badge tone={webResults.length ? "ok" : "viewer"}>{webResults.length ? `${webResults.length} resultado(s)` : "Sin resultados pertinentes"}</Badge>
              </div>
              {web.query && (
                <div className="xc-muted">
                  Búsqueda: {web.query}
                  {web.discarded ? ` · ${web.discarded} resultado(s) descartados porque no mencionan la tecnología` : ""}
                </div>
              )}
              {web.error && !allResults.length && <div className="xc-muted">{web.error}</div>}
              {webResults.length > 0 && (
                <ul className="xc-list">
                  {webResults.slice(0, limit).map((r) => (
                    <ResultItem key={r.url} r={r} />
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="xc-muted">
            Cruce del {fmt(cross.at)}
            {cross.by && cross.by !== "sistema" ? ` por ${cross.by}` : ""}.
          </div>
        </>
      )}
      {compact && cross && (proactive.matches?.length > 3 || registryResults.length > 3 || webResults.length > 3) && (
        <div className="xc-muted">El cruce completo se ve en «Revisar y decidir».</div>
      )}
    </section>
  );
}
