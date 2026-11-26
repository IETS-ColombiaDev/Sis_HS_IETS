import { useState } from "react";
import api, { apiError } from "../api/client";
import Badge from "./Badge";
import HintButton from "./HintButton";
import Icon from "./Icon";
import { t, ts, intlLocale } from "../i18n";
import "./signal-origin.css";

function fmt(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(intlLocale());
}

const MATCHED_ON = {
  nct: t("mismo NCT"),
  nombre: t("nombre o DCI"),
  nombre_contenido: t("nombre contenido en la señal"),
  fabricante: t("fabricante"),
  atc: t("código ATC"),
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
      toast?.success(t("Cruce actualizado con la vigilancia y la web."));
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo cruzar la postulación")));
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
      {!r.registry && r.official && <Badge tone="ok">{t("Oficial")}</Badge>}{" "}
      {r.catalog_source && <Badge tone="editor">{t("En el catálogo: {source}", { source: r.catalog_source })}</Badge>}{" "}
      {r.cited_by_submitter && <Badge tone="viewer">{t("Citada por quien postula")}</Badge>}
      <div className="xc-muted" style={{ overflowWrap: "anywhere" }}>
        {r.snippet || r.host}
      </div>
    </li>
  );
  return (
    <section className="xc-box" data-testid={`submission-cross-${row.id}`}>
      <header className="xc-head">
        <strong>{t("Cruce con la vigilancia y la web")}</strong>
        {canRun && (
          <HintButton
            size="sm"
            variant="outline"
            loading={busy}
            onClick={run}
            hint={t("Busca la tecnología entre las señales de la vigilancia proactiva (mismo comparador del filtrado), en registros oficiales (ClinicalTrials.gov, FDA, PubMed) y en la web. Tarda unos segundos.")}
            data-testid={`submission-cross-run-${row.id}`}
          >
            <Icon name="search" size={14} /> {cross ? t("Cruzar de nuevo") : t("Cruzar ahora")}
          </HintButton>
        )}
      </header>
      {!cross ? (
        <p className="xc-muted">{t("Aún no se ha cruzado esta postulación.")}</p>
      ) : (
        <>
          <p className={`xc-summary ${proactive.count ? "is-known" : "is-new"}`}>{ts(cross.summary?.text)}</p>

          <div className="xc-section">
            <div className="xc-label">
              {t("Vigilancia proactiva")} <Badge tone={proactive.count ? "parcial" : "ok"}>{proactive.count ? t("{n} coincidencia(s)", { n: proactive.count }) : t("Sin coincidencias")}</Badge>
            </div>
            {proactive.matches?.length > 0 && (
              <ul className="xc-list">
                {proactive.matches.slice(0, compact ? 3 : 12).map((m) => {
                  const href = m.link_type === "exacto" ? m.url : m.locator_url || m.url;
                  return (
                    <li key={m.technology_id}>
                      <div>
                        <strong>{m.name}</strong>
                        {m.manufacturer ? ` · ${m.manufacturer}` : ""} - {m.source_title || t("Sin fuente")}{" "}
                        <span className="xc-muted">
                          ({t("{score}% por {criteria}", { score: Math.round(m.score), criteria: (m.matched_on || []).map((k) => MATCHED_ON[k] || k).join(", ") || t("nombre") })}
                          {m.status_label ? ` · ${ts(m.status_label)}` : ""})
                        </span>
                      </div>
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="so-link">
                          <Icon name="external" size={13} />{" "}
                          {m.link_type === "exacto" ? t("Abrir la señal en la fuente") : m.locator_url ? t("Abrir la página y resaltar la señal") : t("Abrir la página de consulta")}
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
              {t("Registros oficiales")}{" "}
              {web ? (
                <Badge tone={registryResults.length ? "ok" : "parcial"}>
                  {registryResults.length ? t("{n} ficha(s)", { n: registryResults.length }) : t("Sin fichas")}
                </Badge>
              ) : (
                <span className="xc-muted">{t("en curso: pulse «Cruzar de nuevo» si no aparece en unos segundos.")}</span>
              )}
            </div>
            {web?.names?.length > 0 && <div className="xc-muted">{t("ClinicalTrials.gov, FDA y PubMed por «{names}».", { names: web.names.join(t("» y «")) })}</div>}
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
                Web <Badge tone={webResults.length ? "ok" : "viewer"}>{webResults.length ? t("{n} resultado(s)", { n: webResults.length }) : t("Sin resultados pertinentes")}</Badge>
              </div>
              {web.query && (
                <div className="xc-muted">
                  {t("Búsqueda: {query}", { query: web.query })}
                  {web.discarded ? " · " + t("{n} resultado(s) descartados porque no mencionan la tecnología", { n: web.discarded }) : ""}
                </div>
              )}
              {web.error && !allResults.length && <div className="xc-muted">{ts(web.error)}</div>}
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
            {cross.by && cross.by !== "sistema"
              ? t("Cruce del {date} por {name}.", { date: fmt(cross.at), name: cross.by })
              : t("Cruce del {date}.", { date: fmt(cross.at) })}
          </div>
        </>
      )}
      {compact && cross && (proactive.matches?.length > 3 || registryResults.length > 3 || webResults.length > 3) && (
        <div className="xc-muted">{t("El cruce completo se ve en «Revisar y decidir».")}</div>
      )}
    </section>
  );
}
