import { Fragment, useState } from "react";
import Badge from "./Badge";
import Button from "./Button";
import HintButton from "./HintButton";
import Icon from "./Icon";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import { elapsedSince, formatClock, formatDateTime, formatDuration, formatRange, formatSpan } from "../scan/format";
import { t, tr, ts, intlLocale } from "../i18n";

/**
 * Estado en vivo de la vigilancia: barra global y, por fuente, en qué paso va
 * (cola → acceso → recorrido → extracción → guardado → lista), por qué ruta
 * accedió y cuántas señales lleva. Lee GET /api/ingest/progress.
 */

export const STEPS = [
  { key: "cola", label: t("Cola") },
  { key: "acceso", label: t("Acceso") },
  { key: "recorrido", label: t("Recorrido##etapa") },
  { key: "extraccion", label: t("Extracción") },
  { key: "guardado", label: t("Guardado##etapa") },
  { key: "lista", label: t("Lista##etapa") },
];

const STAGE_STEP = {
  en_cola: 0,
  sonda: 1,
  conectando: 1,
  accedida: 1,
  recorriendo: 2,
  extrayendo: 3,
  guardando: 4,
  terminada: 5,
};

const STAGE_TONE = {
  en_cola: "viewer",
  sonda: "info",
  conectando: "info",
  accedida: "info",
  recorriendo: "info",
  extrayendo: "info",
  guardando: "info",
  terminada: "success",
  error: "danger",
  cancelada: "viewer",
};

const VIA_TONE = {
  google_news: "warning",
  busqueda_web: "warning",
  rss_oficial: "warning",
  indice_pubmed: "warning",
  ruta_matriz: "info",
  sitio: "success",
  navegador: "success",
  api: "success",
  pdf: "info",
};

/** Paso actual y si falló, a partir de la etapa del backend. */
export function stepState(row) {
  if (!row) return { current: -1, failed: false, done: false };
  if (row.stage === "error") return { current: row.accessed ? 2 : 1, failed: true, done: false };
  if (row.stage === "cancelada") return { current: 0, failed: true, done: false };
  const current = STAGE_STEP[row.stage] ?? 0;
  return { current, failed: false, done: row.stage === "terminada" };
}

export function isRunning(row) {
  return row && !["terminada", "error", "cancelada", "en_cola"].includes(row.stage);
}

export function StageTrack({ row, compact = false }) {
  const { current, failed, done } = stepState(row);
  return (
    <ol className={`stage-track${compact ? " stage-track--compact" : ""}`} aria-label={t("Avance de la fuente")}>
      {STEPS.map((step, i) => {
        let cls = "stage-step";
        if (done || i < current) cls += " stage-step--done";
        else if (i === current) cls += failed ? " stage-step--failed" : " stage-step--active";
        return (
          <li key={step.key} className={cls} aria-current={i === current ? "step" : undefined}>
            <span className="stage-dot" />
            {!compact && <span className="stage-label">{step.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function elapsed(fromIso) {
  if (!fromIso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(fromIso).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Bloque de estado dentro de la tarjeta de una fuente. */
export function SourceProgress({ row }) {
  const [open, setOpen] = useState(false);
  if (!row) return null;
  const running = isRunning(row);
  return (
    <div className={`source-progress source-progress--${row.stage}`} data-testid={`progress-${row.source_id}`}>
      <div className="source-progress-head">
        <StageTrack row={row} />
        <Badge tone={STAGE_TONE[row.stage] || "viewer"}>
          {running && <span className="pulse-dot" aria-hidden="true" />} {ts(row.stage_label)}
        </Badge>
        {row.attempts > 1 && <span className="source-progress-meta">{t("intento {n}/{max}", { n: row.attempts, max: row.max_attempts })}</span>}
        {running && row.started_at && (
          <span className="source-progress-meta">
            {elapsed(row.started_at)}
            {row.typical_seconds ? ` · ${t("suele tardar {tiempo}", { tiempo: formatDuration(row.typical_seconds) })}` : ""}
          </span>
        )}
        {row.stage === "en_cola" && row.typical_seconds ? (
          <span className="source-progress-meta">{t("suele tardar {tiempo}", { tiempo: formatDuration(row.typical_seconds) })}</span>
        ) : null}
      </div>
      <div className="source-progress-facts">
        <span title={t("¿El sistema ya entró a la fuente?")}>
          <Icon name={row.accessed ? "check" : "clock"} size={13} /> {row.accessed ? t("Accedió") : t("Sin acceso aún")}
          {row.http_status ? ` · HTTP ${row.http_status}` : ""}
        </span>
        {row.access_via && <Badge tone={VIA_TONE[row.access_via] || "viewer"}>{ts(row.access_label) || row.access_via}</Badge>}
        {(row.pages_visited > 0 || row.stage === "recorriendo") && (
          <span>
            {row.pages_planned
              ? t("{n} de ~{total} página(s)", { n: row.pages_visited, total: row.pages_planned })
              : t("{n} página(s)", { n: row.pages_visited })}
          </span>
        )}
        {(row.items_found > 0 || row.stage === "terminada") && (
          <span>
            {tr("<b>+{n}</b> nuevas de {found}", { n: row.items_new, found: row.items_found }, {
              b: (c) => <strong className={row.items_new > 0 ? "txt-ok" : ""}>{c}</strong>,
            })}
          </span>
        )}
      </div>
      {row.detail && <p className="source-progress-detail">{ts(row.detail)}</p>}
      <SearchAndAiLine search={row.search} ai={row.ai} />
      {(row.events?.length > 1 || row.access_attempts?.length > 0) && (
        <>
          <button type="button" className="scan-log-link" onClick={() => setOpen((v) => !v)}>
            {open ? t("Ocultar detalle") : t("Ver detalle: rutas, búsqueda, IA y pasos")}
          </button>
          {open && <SourceRunDetail row={row} />}
        </>
      )}
    </div>
  );
}

const ENGINE_LABEL = { base_conocimiento: t("base de conocimiento"), sitemap: t("mapa del sitio"), brave_api: "Brave", searxng: "SearXNG" };
const engineLabel = (e) => ENGINE_LABEL[e] || e;

const ROUTE_LABEL = {
  sitio: t("Sitio"),
  navegador: t("Sitio (cliente compatible con navegador)"),
  ruta_matriz: t("Ruta de la matriz"),
  rss_oficial: t("RSS oficial"),
  indice_pubmed: t("Índice de PubMed"),
  google_news: "Google News",
  busqueda_web: t("Buscadores web"),
  api: "API",
};

// Cada combinación es una frase entera: en inglés el orden de las palabras cambia.
function aiLine(ai) {
  const vars = { n: ai.kept ?? 0, ev: ai.with_evidence, ung: ai.ungrounded };
  if (ai.with_evidence && ai.ungrounded) return t("IA: {n} señal(es) ({ev} con cita verificada) · {ung} descartada(s) por no estar en el texto", vars);
  if (ai.with_evidence) return t("IA: {n} señal(es) ({ev} con cita verificada)", vars);
  if (ai.ungrounded) return t("IA: {n} señal(es) · {ung} descartada(s) por no estar en el texto", vars);
  return t("IA: {n} señal(es)", vars);
}

function aiSummary(ai) {
  const vars = { n: ai.returned ?? 0, kept: ai.kept ?? 0, ev: ai.with_evidence, ung: ai.ungrounded };
  let first;
  if (ai.with_evidence && ai.ungrounded) {
    first = t("La IA devolvió {n} señal(es); se conservaron {kept} ({ev} con cita textual verificada en la fuente) y se descartaron {ung} porque no aparecen en el texto visitado.", vars);
  } else if (ai.with_evidence) {
    first = t("La IA devolvió {n} señal(es); se conservaron {kept} ({ev} con cita textual verificada en la fuente).", vars);
  } else if (ai.ungrounded) {
    first = t("La IA devolvió {n} señal(es); se conservaron {kept} y se descartaron {ung} porque no aparecen en el texto visitado.", vars);
  } else {
    first = t("La IA devolvió {n} señal(es); se conservaron {kept}.", vars);
  }
  const second = t("Reemplazó {n} de {total} candidato(s) por reglas.", { n: ai.heuristic_replaced ?? 0, total: ai.heuristic_candidates ?? 0 });
  return `${first} ${second}${ai.ocr ? ` ${t("OCR activo.")}` : ""}`;
}

/** Línea corta: qué buscó en la web y qué hizo la IA. */
export function SearchAndAiLine({ search, ai }) {
  if (!search?.domain && search?.enabled !== false && !ai?.used && !ai?.reason) return null;
  return (
    <div className="source-progress-facts">
      {search && Object.keys(search).length > 0 && (
        <span title={(search.queries || []).join("\n")}>
          <Icon name="search" size={13} />{" "}
          {search.enabled === false
            ? t("Búsqueda web apagada")
            : search.engines?.length
              ? t("Búsqueda web: {n} resultado(s) de {domain} ({engines})", { n: search.results ?? 0, domain: search.domain, engines: search.engines.map(engineLabel).join(", ") })
              : t("Búsqueda web: {n} resultado(s) de {domain}", { n: search.results ?? 0, domain: search.domain })}
        </span>
      )}
      {ai && Object.keys(ai).length > 0 && (
        <span>
          <Icon name="spark" size={13} />{" "}
          {ai.used === false
            ? t("Sin IA (solo reglas)")
            : ai.error
              ? t("IA falló: {error}", { error: ts(ai.error) })
              : aiLine(ai)}
        </span>
      )}
    </div>
  );
}

/** Detalle completo y verificable de lo que hizo el rastreador en la fuente. */
export function SourceRunDetail({ row }) {
  const search = row.search || {};
  const ai = row.ai || {};
  return (
    <div className="source-run-detail">
      {row.access_attempts?.length > 0 && (
        <>
          <h5>{t("Rutas de acceso probadas")}</h5>
          <ul>
            {row.access_attempts.map((a, i) => (
              <li key={i}>
                <Badge tone={a.status === "ok" ? "success" : "danger"}>{a.status.replace("http_", "HTTP ")}</Badge>{" "}
                {ROUTE_LABEL[a.route] || a.route} ·{" "}
                <a href={a.url} target="_blank" rel="noreferrer">{a.url.replace(/^https?:\/\//, "").slice(0, 90)}</a>
                {a.detail ? <span className="muted"> · {ts(a.detail)}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {Object.keys(search).length > 0 && (
        <>
          <h5>{t("Búsqueda web")}</h5>
          {search.enabled === false ? (
            <p>{ts(search.reason) || t("Apagada")}</p>
          ) : (
            <>
              <p>
                {search.query_origin === "ia"
                  ? t("Consultas redactadas por la IA en {domain}: {queries}", { domain: search.domain, queries: (search.queries || []).map((q) => `«${q}»`).join(", ") || t("ninguna") })
                  : t("Consultas redactadas por reglas en {domain}: {queries}", { domain: search.domain, queries: (search.queries || []).map((q) => `«${q}»`).join(", ") || t("ninguna") })}
              </p>
              <p>
                {search.from_knowledge
                  ? t("Motores: {motores}. Resultados útiles: {n} ({k} de la base de conocimiento de búsqueda).", { motores: (search.engine_attempts || []).join(" | ") || "-", n: search.results ?? 0, k: search.from_knowledge })
                  : t("Motores: {motores}. Resultados útiles: {n}.", { motores: (search.engine_attempts || []).join(" | ") || "-", n: search.results ?? 0 })}
              </p>
              {search.skipped ? <p>{t("No se consultó ningún buscador: {motivo}.", { motivo: ts(search.skipped) })}</p> : null}
              {search.urls?.length > 0 && (
                <ul>
                  {search.urls.map((u) => (
                    <li key={u}><a href={u} target="_blank" rel="noreferrer">{u.replace(/^https?:\/\//, "").slice(0, 100)}</a></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
      {Object.keys(ai).length > 0 && (
        <>
          <h5>{t("Extracción con IA")}</h5>
          {ai.used === false ? (
            <p>{ts(ai.reason)}</p>
          ) : (
            <p>
              {ai.error
                ? t("La IA falló ({error}); quedaron los candidatos por reglas.", { error: ts(ai.error) })
                : aiSummary(ai)}
              {ai.ungrounded_titles?.length > 0 && <span className="muted"> {t("Descartadas: {titulos}", { titulos: ai.ungrounded_titles.join(" · ") })}</span>}
            </p>
          )}
        </>
      )}
      {row.events?.length > 0 && (
        <>
          <h5>{t("Pasos")}</h5>
          <ol className="source-progress-events">
            {row.events.map((e, i) => (
              <li key={i}>
                <time>{new Date(e.at).toLocaleTimeString(intlLocale())}</time> <strong>{ts(e.stage)}</strong> {ts(e.detail)}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

const OUTCOME_TONE = {
  entro_directo: "success",
  entro_respaldo: "warning",
  entro_sin_senales: "warning",
  no_entro: "danger",
  fallo_despues: "danger",
  en_curso: "info",
  sin_ejecutar: "viewer",
};

function csvCell(v) {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Informe de transparencia: una fila por fuente activa con su último desenlace.
 * Va plegado para no ocupar la pantalla: la cabecera resume los desenlaces y,
 * durante una corrida, avisa que se está actualizando en tiempo real.
 */
export function AccessReport({ report, onReload, live = false, updatedAt = null }) {
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState(null);
  const [open, setOpen] = useState(false);
  if (!report) return null;
  const c = report.counts || {};
  const entered = (c.entro_directo || 0) + (c.entro_respaldo || 0) + (c.entro_sin_senales || 0);
  const rows = report.sources.filter((r) => !filter || r.outcome === filter);
  const download = () => {
    const head = [t("Fuente"), "URL", t("Resultado"), t("Ruta"), "HTTP", t("Páginas"), t("Búsqueda web"), t("IA"), t("Detectadas"), t("Nuevas"), t("Detalle"), t("Fecha")];
    const lines = report.sources.map((r) => [
      r.title,
      r.url,
      ts(r.outcome_label),
      ts(r.access_label) || "",
      r.http_status || "",
      r.pages_visited ?? "",
      r.search?.enabled === false ? t("apagada") : r.search?.domain ? t("{n} resultado(s)", { n: r.search.results ?? 0 }) : "",
      r.ai?.used === false ? t("sin IA") : r.ai?.used ? t("{kept} conservadas / {ung} descartadas", { kept: r.ai.kept ?? 0, ung: r.ai.ungrounded ?? 0 }) : "",
      r.items_found ?? "",
      r.items_new ?? "",
      ts(r.detail || r.message || ""),
      r.at || "",
    ]);
    const csv = [head, ...lines].map((l) => l.map(csvCell).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe_acceso_fuentes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card padding={0} className={`access-report fold${open ? " fold--open" : ""}`} style={{ marginBottom: 14 }} data-testid="access-report">
      <button
        type="button"
        className="fold-head"
        aria-expanded={open}
        aria-controls="access-report-body"
        onClick={() => setOpen((v) => !v)}
        data-testid="access-report-toggle"
      >
        <span className={`fold-icon${live ? " fold-icon--live" : ""}`} aria-hidden="true">
          {live ? <Spinner size={16} /> : <Icon name="doc" size={16} />}
        </span>
        <span className="fold-text">
          <span className="fold-title">{t("Informe de acceso por fuente")}</span>
          <span className="fold-sub">
            {live ? t("Ver informe en tiempo real") : open ? t("Ocultar el informe") : t("Ver el informe")}
            {" · "}
            {t("{n} de {total} fuente(s) entraron", { n: entered, total: report.total })}
            {c.no_entro ? ` · ${t("{n} no pudo entrar", { n: c.no_entro })}` : ""}
            {c.sin_ejecutar ? ` · ${t("{n} sin ejecutar", { n: c.sin_ejecutar })}` : ""}
            {updatedAt ? ` · ${t("actualizado {hora}", { hora: formatClock(updatedAt) })}` : ""}
          </span>
        </span>
        {c.no_entro > 0 && <Badge tone="danger">{t("{n} sin acceso", { n: c.no_entro })}</Badge>}
        {live && <Badge tone="info">{t("En vivo")}</Badge>}
        <span className="fold-chevron" aria-hidden="true">
          <Icon name="chevron" size={18} />
        </span>
      </button>
      {open && (
      <div className="fold-body" id="access-report-body">
      <div className="scan-run-head">
        <div className="scan-run-sub" style={{ marginTop: 0 }}>
          {t("Último resultado real de cada una de las {total} fuentes con ingesta activa: si entró, por dónde, qué buscó y qué encontró.", { total: report.total })}
          {live ? ` ${t("Se actualiza solo cada 15 segundos mientras corre la vigilancia.")}` : ""}
        </div>
        <div className="fb-toolbar">
          <Button size="sm" variant="ghost" onClick={onReload}>{t("Actualizar")}</Button>
          <Button size="sm" variant="secondary" onClick={download}><Icon name="doc" size={14} /> CSV</Button>
        </div>
      </div>
      <SearchHealth health={report.search_health} />
      {report.access_routes && (
        <div className="search-health" data-testid="access-routes">
          <Icon name="globe" size={14} />{" "}
          {report.access_routes.browser_enabled
            ? t("Rutas de acceso: sitio de la fuente → cliente compatible con navegador (encendido) → rutas de la matriz → RSS oficial → índice de la revista en PubMed → Google News.")
            : report.access_routes.browser_allowed && report.access_routes.browser_installed
              ? t("Rutas de acceso: sitio de la fuente → cliente compatible con navegador (apagado; se enciende en Configuración › Parámetros de fuentes) → rutas de la matriz → RSS oficial → índice de la revista en PubMed → Google News.")
              : t("Rutas de acceso: sitio de la fuente → cliente compatible con navegador (no disponible en este servidor) → rutas de la matriz → RSS oficial → índice de la revista en PubMed → Google News.")}
        </div>
      )}
      <div className="scan-run-chips" style={{ marginTop: 10 }}>
        {Object.entries(report.labels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`scan-run-chip${filter === key ? " scan-run-chip--on" : ""}`}
            onClick={() => setFilter(filter === key ? "" : key)}
            aria-pressed={filter === key}
          >
            <Badge tone={OUTCOME_TONE[key]}>{String(report.counts[key] || 0)}</Badge> {ts(label)}
          </button>
        ))}
      </div>
      <div className="access-report-table-wrap">
        <table className="access-report-table">
          <thead>
            <tr>
              <th>{t("Fuente")}</th>
              <th>{t("Resultado")}</th>
              <th>{t("Ruta / HTTP")}</th>
              <th>{t("Búsqueda web")}</th>
              <th>{t("IA")}</th>
              <th>{t("Señales")}</th>
              <th>{t("Detalle")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.source_id}>
                <tr className={`access-row access-row--${r.outcome}`}>
                  <td>
                    <strong>{r.title}</strong>
                    <div className="muted">{r.connector}{r.access_level ? ` · ${t("nivel {nivel}", { nivel: r.access_level })}` : ""}</div>
                  </td>
                  <td><Badge tone={OUTCOME_TONE[r.outcome]}>{ts(r.outcome_label)}</Badge></td>
                  <td>{ts(r.access_label) || "-"}{r.http_status ? ` · ${r.http_status}` : ""}</td>
                  <td>
                    {r.search?.enabled === false
                      ? t("Apagada")
                      : r.search?.domain
                        ? `${t("{n} resultado(s)", { n: r.search.results ?? 0 })}${r.search.engines?.length ? ` · ${r.search.engines.map(engineLabel).join(", ")}` : ""}`
                        : "-"}
                  </td>
                  <td>
                    {r.ai?.used === false
                      ? t("Sin IA")
                      : r.ai?.used
                        ? `${t("{n} conservadas", { n: r.ai.kept ?? 0 })}${r.ai.ungrounded ? ` · ${t("{n} descartadas", { n: r.ai.ungrounded })}` : ""}`
                        : "-"}
                  </td>
                  <td>{r.outcome === "sin_ejecutar" ? "-" : `+${r.items_new ?? 0} / ${r.items_found ?? 0}`}</td>
                  <td className="access-detail">
                    {ts(r.detail || r.message || "").slice(0, 160)}
                    {r.outcome !== "sin_ejecutar" && (
                      <button type="button" className="scan-log-link" onClick={() => setOpenId(openId === r.source_id ? null : r.source_id)}>
                        {openId === r.source_id ? t("Ocultar") : t("Ver todo")}
                      </button>
                    )}
                  </td>
                </tr>
                {openId === r.source_id && (
                  <tr>
                    <td colSpan={7}><SourceRunDetail row={r} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      )}
    </Card>
  );
}

const HISTORY_STATUS = {
  en_curso: { label: t("En curso"), tone: "info" },
  ok: { label: t("Completa"), tone: "success" },
  parcial: { label: t("Con novedades"), tone: "warning" },
  error: { label: t("Con error"), tone: "danger" },
};
const HISTORY_PAGE = 5;
const BOLD = { b: (c) => <strong>{c}</strong> };

/** Línea bajo el botón de ejecutar: cuándo terminó la última vigilancia. */
export function LastRunCaption({ history, active }) {
  if (active) {
    return (
      <span className="last-run-caption" data-testid="last-run-caption">
        {t("Vigilancia en curso…")}
      </span>
    );
  }
  const last = history?.last_finished;
  return (
    <span className="last-run-caption" data-testid="last-run-caption">
      {last
        ? t("Última realizada: {fecha} · duró {duracion}", { fecha: formatDateTime(last.finished_at || last.started_at), duracion: formatSpan(last.duration_seconds) })
        : t("Última realizada: aún no hay vigilancias registradas")}
    </span>
  );
}

/** Historial de vigilancias: fecha y hora, duración, quién la lanzó y el resumen de cada corrida. */
export function ScanHistory({ history, onReload }) {
  const [openId, setOpenId] = useState(null);
  const [all, setAll] = useState(false);
  if (!history) return null;
  const runs = history.runs || [];
  const shown = all ? runs : runs.slice(0, HISTORY_PAGE);
  return (
    <Card padding={16} className="scan-history" style={{ marginBottom: 14 }} data-testid="scan-history">
      <div className="scan-run-head">
        <div>
          <div className="scan-run-title">
            <Icon name="clock" size={16} /> {t("Historial de vigilancias")}
          </div>
          <div className="scan-run-sub">
            {t("Cada corrida con su fecha y hora, cuánto tardó, quién la lanzó y qué dejó. Pulse una fila para ver el resumen.")}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onReload}>{t("Actualizar")}</Button>
      </div>
      {runs.length === 0 ? (
        <p className="scan-history-empty">
          {t("Aún no hay vigilancias registradas. El historial empieza con la próxima corrida, manual o programada.")}
        </p>
      ) : (
        <div className="access-report-table-wrap" style={{ maxHeight: "none" }}>
          <table className="access-report-table scan-history-table">
            <thead>
              <tr>
                <th>{t("Inicio##hora")}</th>
                <th>{t("Duración")}</th>
                <th>{t("Estado")}</th>
                <th>{t("Alcance")}</th>
                <th>{t("Fuentes")}</th>
                <th>{t("Acceso")}</th>
                <th>{t("Señales")}</th>
                <th>{t("Lanzada por")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((run) => {
                const st = HISTORY_STATUS[run.status] || { label: run.status, tone: "viewer" };
                const o = run.outcomes || {};
                const entered = (o.entro_directo || 0) + (o.entro_respaldo || 0) + (o.entro_sin_senales || 0) + (o.fallo_despues || 0);
                const isOpen = openId === run.id;
                return (
                  <Fragment key={run.id}>
                    <tr
                      className={`scan-history-row${isOpen ? " scan-history-row--open" : ""}`}
                      onClick={() => setOpenId(isOpen ? null : run.id)}
                      data-testid={`scan-history-row-${run.id}`}
                    >
                      <td>
                        <strong>{formatDateTime(run.started_at)}</strong>
                        <div className="muted">
                          {run.finished_at ? t("terminó {fecha}", { fecha: formatDateTime(run.finished_at) }) : t("sin terminar")}
                        </div>
                      </td>
                      <td>{formatSpan(run.duration_seconds)}{run.status === "en_curso" ? ` ${t("(va)")}` : ""}</td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td>
                        {ts(run.scope_label)}
                        <div className="muted">{run.origin === "manual" ? t("Manual") : t("Programada")}</div>
                      </td>
                      <td>
                        {run.sources_total}
                        {run.sources_pending ? <div className="muted">{t("{n} pendiente(s)", { n: run.sources_pending })}</div> : null}
                      </td>
                      <td>
                        {t("{n} entraron", { n: entered })}
                        {o.no_entro ? <div className="txt-danger">{t("{n} sin acceso", { n: o.no_entro })}</div> : null}
                      </td>
                      <td>
                        {tr("<b>+{n}</b> nuevas", { n: run.items_new }, { b: (c) => <strong className={run.items_new > 0 ? "txt-ok" : ""}>{c}</strong> })}
                        <div className="muted">{t("{n} detectadas", { n: run.items_found })}</div>
                      </td>
                      <td className="scan-history-who">
                        {run.origin === "manual" ? run.triggered_by : t("Programador")}
                        <button type="button" className="scan-log-link" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); setOpenId(isOpen ? null : run.id); }}>
                          {isOpen ? t("Ocultar resumen") : t("Ver resumen")}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="scan-history-detail">
                        <td colSpan={8}>
                          <p>{ts(run.message)}</p>
                          <ul className="scan-history-facts">
                            <li>{tr("<b>{n}</b> entraron a la fuente", { n: o.entro_directo || 0 }, BOLD)}</li>
                            <li>{tr("<b>{n}</b> por ruta de respaldo", { n: o.entro_respaldo || 0 }, BOLD)}</li>
                            <li>{tr("<b>{n}</b> entraron sin señales", { n: o.entro_sin_senales || 0 }, BOLD)}</li>
                            <li>{tr("<b>{n}</b> fallaron al extraer", { n: o.fallo_despues || 0 }, BOLD)}</li>
                            <li>{tr("<b>{n}</b> no pudieron entrar", { n: o.no_entro || 0 }, BOLD)}</li>
                            <li>{tr("<b>{n}</b> canceladas", { n: run.counts?.cancelado || 0 }, BOLD)}</li>
                          </ul>
                          {run.failed?.length > 0 && (
                            <>
                              <h5>{t("Fuentes con problema en esta corrida")}</h5>
                              <ul className="scan-history-failed">
                                {run.failed.map((f) => (
                                  <li key={f.source_id}>
                                    <strong>{f.title}</strong>
                                    <span className="muted"> · {ts(f.message) || t("Sin detalle")}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {runs.length > HISTORY_PAGE && (
        <button type="button" className="scan-log-link" style={{ marginTop: 8 }} onClick={() => setAll((v) => !v)}>
          {all ? t("Ver solo las últimas") : t("Ver las {n} vigilancias registradas", { n: runs.length })}
        </button>
      )}
    </Card>
  );
}

/** Resumen de la corrida: avance, tiempos, qué está haciendo ahora y cómo se estima. */
export function ScanRunSummary({ progress, canScan, onCancel, cancelling, filter, onFilter, lastFetch }) {
  if (!progress || !progress.total) return null;
  const c = progress.counts || {};
  const done = (c.ok || 0) + (c.parcial || 0);
  const failed = c.error || 0;
  const cancelled = c.cancelado || 0;
  const running = c.ejecutando || 0;
  const queued = c.pendiente || 0;
  const finished = done + failed + cancelled;
  const pct = Math.floor(progress.percent_display ?? progress.percent ?? (finished / progress.total) * 100);
  const seg = (n) => `${(n / progress.total) * 100}%`;
  // Lo avanzado dentro de las fuentes en curso (etapa y páginas), aparte de las terminadas.
  const runningShare = Math.max(0, (progress.percent_display ?? progress.percent ?? 0) - (finished / progress.total) * 100);
  const eta = progress.eta;
  const rows = progress.sources || [];
  const now = rows.filter((r) => r.job_status === "ejecutando");
  const next = rows
    .filter((r) => r.job_status === "pendiente")
    .sort((a, b) => new Date(a.scheduled_for || 0) - new Date(b.scheduled_for || 0) || a.job_id - b.job_id)
    .slice(0, 3);
  const retryWait =
    progress.active && running === 0 && queued > 0 && next.every((r) => r.scheduled_for && new Date(r.scheduled_for).getTime() > Date.now());
  const stale = progress.active && lastFetch && Date.now() - lastFetch > 60000;
  const chips = [
    { key: "ejecutando", label: t("En curso"), value: running, tone: "info" },
    { key: "pendiente", label: t("En cola"), value: queued, tone: "viewer" },
    { key: "ok", label: t("Terminadas"), value: done, tone: "success" },
    { key: "error", label: t("Con error"), value: failed, tone: "danger" },
    { key: "cancelado", label: t("Canceladas"), value: cancelled, tone: "viewer" },
  ];
  return (
    <Card
      padding={18}
      className={`scan-run-summary${progress.active ? " scan-run-summary--active" : ""}`}
      style={{ marginBottom: 16 }}
      data-testid="scan-run-summary"
    >
      <div className="scan-run-head">
        <div>
          <div className="scan-run-title">
            {progress.active ? (
              <>
                <span className="pulse-dot" aria-hidden="true" /> {t("Vigilancia en curso")}
              </>
            ) : (
              <>{t("Última vigilancia · {pct} %", { pct })}</>
            )}
          </div>
          <div className="scan-run-sub">
            {progress.active
              ? t("Corre en el servidor: puede cambiar de módulo o de pestaña, o cerrar el navegador. Sigue sola y le avisamos al terminar.")
              : `${t("{n} de {total} fuente(s) procesadas: {done} terminadas", { n: finished, total: progress.total, done })}${failed ? `, ${t("{n} con error", { n: failed })}` : ""}${cancelled ? `, ${t("{n} canceladas", { n: cancelled })}` : ""}.`}
          </div>
        </div>
        {progress.active && canScan && (
          <HintButton
            size="sm"
            variant="outline"
            loading={cancelling}
            onClick={onCancel}
            hint={t("Cancela las fuentes que siguen en cola. Las que ya se están rastreando terminan su paso actual.")}
          >
            <Icon name="x" size={14} /> {t("Detener")}
          </HintButton>
        )}
      </div>

      {progress.active && (
        <div className="scan-kpis" role="group" aria-label={t("Avance de la vigilancia")}>
          <div className="scan-kpi">
            <span className="scan-kpi-label">{t("Avance")}</span>
            <strong className="scan-kpi-value">
              {t("{n} de {total}", { n: finished, total: progress.total })}
            </strong>
            <span className="scan-kpi-sub">
              {t("{pct} % · {done} ok", { pct, done })}{failed ? ` · ${t("{n} con error", { n: failed })}` : ""}
            </span>
          </div>
          {eta && (
            <>
              <div className="scan-kpi">
                <span className="scan-kpi-label">{t("Transcurrido")}</span>
                <strong className="scan-kpi-value">{formatDuration(eta.elapsed_seconds)}</strong>
                <span className="scan-kpi-sub">{t("Inició {hora}", { hora: formatClock(eta.run_started_at) })}</span>
              </div>
              <div className="scan-kpi scan-kpi--accent">
                <span className="scan-kpi-label">{t("Tiempo restante")}</span>
                <strong className="scan-kpi-value">~{formatDuration(eta.eta_seconds)}</strong>
                <span className="scan-kpi-sub">{t("entre {rango}", { rango: formatRange(eta.eta_low_seconds, eta.eta_high_seconds) })}</span>
              </div>
              <div className="scan-kpi">
                <span className="scan-kpi-label">{t("Fin estimado")}</span>
                <strong className="scan-kpi-value">{formatClock(eta.eta_at)}</strong>
                <span className="scan-kpi-sub">{t("{n} fuente(s) a la vez", { n: progress.parallel })}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div
        className="scan-run-bar scan-run-bar--stack"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("{pct} % de las fuentes procesadas", { pct })}
      >
        <span className="seg-ok" style={{ width: seg(done) }} />
        <span className="seg-error" style={{ width: seg(failed + cancelled) }} />
        <span className="seg-running" style={{ width: `${progress.active ? runningShare : 0}%` }} />
      </div>

      {progress.active && (
        <div className="scan-now">
          {stale && (
            <p className="scan-warn" role="status">
              <Icon name="info" size={14} />{" "}
              {t("Sin respuesta del servidor hace {tiempo}. Si se reinició, la vigilancia se reanuda sola donde quedó.", { tiempo: formatDuration((Date.now() - lastFetch) / 1000) })}
            </p>
          )}
          {!progress.worker_running && (
            progress.guardian_running ? (
              <p className="scan-note" role="status" data-testid="scan-guardian">
                <Icon name="info" size={14} />{" "}
                {t("Este servidor no tiene un trabajador permanente: la cola la cuida un vigilante que revisa cada minuto. Si el servicio se reinicia o se suspende, la vigilancia se reanuda sola donde quedó.")}
              </p>
            ) : (
              <p className="scan-warn" role="status">
                <Icon name="info" size={14} />{" "}
                {t("El trabajador de vigilancia no está en marcha en este servidor: la cola se atiende desde la corrida que la lanzó.")}
              </p>
            )
          )}
          {retryWait && (
            <p className="scan-note">
              <Icon name="clock" size={14} />{" "}
              {t("Esperando reintentos: la próxima fuente se vuelve a intentar a las {hora}.", { hora: formatClock(next[0]?.scheduled_for) })}
            </p>
          )}
          {now.map((r) => {
            const took = elapsedSince(r.started_at);
            const quiet = r.updated_at ? elapsedSince(r.updated_at) : null;
            return (
              <div key={r.source_id} className="scan-now-row">
                <span className="scan-now-tag">{t("Ahora")}</span>
                <strong>{r.source_title}</strong>
                <span className="muted">
                  {ts(r.stage_label)}
                  {took != null ? ` · ${t("lleva {tiempo}", { tiempo: formatDuration(took) })}` : ""}
                  {r.typical_seconds ? ` · ${t("suele tardar {tiempo}", { tiempo: formatDuration(r.typical_seconds) })}` : ""}
                  {quiet != null && quiet > 180 ? ` · ${t("sin novedades hace {tiempo}", { tiempo: formatDuration(quiet) })}` : ""}
                </span>
              </div>
            );
          })}
          {next.length > 0 && (
            <div className="scan-now-row">
              <span className="scan-now-tag scan-now-tag--next">{t("Siguen")}</span>
              <span className="muted">
                {next.map((r) => r.source_title).join(" · ")}
                {queued > next.length ? ` ${t("y {n} más", { n: queued - next.length })}` : ""}
              </span>
            </div>
          )}
          {eta && (
            <details className="scan-eta-basis">
              <summary>{t("¿Cómo se calcula el tiempo?")}</summary>
              <p>
                {t(
                  "Cada fuente se estima con el promedio de sus 3 últimas corridas en este servidor y se ajusta a la velocidad real de esta corrida. Luego se reparte la cola entre {parallel} carril(es) en el orden en que el servidor la atenderá, incluidos los reintentos programados. El rango va de lo que la fuente tarda en sus corridas rápidas a lo que tarda en las lentas. Ninguna fuente pasa de {minutos} min: si los supera, se cierra con error y la corrida sigue.",
                  { parallel: progress.parallel, minutos: progress.job_timeout_minutes }
                )}
              </p>
              <p className="muted">{ts(eta.basis)}</p>
            </details>
          )}
        </div>
      )}

      <div className="scan-run-chips">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className={`scan-run-chip${filter === chip.key ? " scan-run-chip--on" : ""}`}
            onClick={() => onFilter(filter === chip.key ? "" : chip.key)}
            aria-pressed={filter === chip.key}
          >
            <Badge tone={chip.tone}>{String(chip.value)}</Badge> {chip.label}
          </button>
        ))}
        {filter && (
          <Button size="sm" variant="ghost" onClick={() => onFilter("")}>
            {t("Ver todas")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Barra flotante: la vigilancia a la vista desde cualquier módulo. */
export function ScanDock({ progress, onOpen }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!progress?.active || !progress.total) return null;
  const c = progress.counts || {};
  const finished = (c.ok || 0) + (c.parcial || 0) + (c.error || 0) + (c.cancelado || 0);
  const pct = Math.floor(progress.percent_display ?? progress.percent ?? (finished / progress.total) * 100);
  const eta = progress.eta;
  const current = (progress.sources || []).find((r) => r.job_status === "ejecutando");
  if (collapsed) {
    return (
      <button type="button" className="scan-dock scan-dock--mini" onClick={() => setCollapsed(false)} aria-label={t("Mostrar el avance de la vigilancia")}>
        <span className="pulse-dot" aria-hidden="true" /> {pct} % · {finished}/{progress.total}
        {eta ? ` · ~${formatDuration(eta.eta_seconds)}` : ""}
      </button>
    );
  }
  return (
    <div className="scan-dock" role="status" aria-live="polite" data-testid="scan-dock">
      <div className="scan-dock-head">
        <span className="pulse-dot" aria-hidden="true" />
        <strong>{t("Vigilancia en curso")}</strong>
        <button type="button" className="scan-dock-x" onClick={() => setCollapsed(true)} aria-label={t("Minimizar")}>
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="scan-run-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="scan-dock-line">
        {t("{n} de {total} fuentes · {pct} %", { n: finished, total: progress.total, pct })}
      </div>
      {eta && (
        <div className="scan-dock-line">
          {t("Faltan ~{tiempo} · termina ~{hora}", { tiempo: formatDuration(eta.eta_seconds), hora: formatClock(eta.eta_at) })}
        </div>
      )}
      {current && <div className="scan-dock-line muted">{t("Ahora: {fuente}", { fuente: current.source_title })}</div>}
      <button type="button" className="scan-log-link" onClick={onOpen}>
        {t("Ver el detalle en Vigilancia →")}
      </button>
    </div>
  );
}

/** Estado real de los buscadores: cuáles están en pausa y si conviene una API. */
function SearchHealth({ health }) {
  if (!health) return null;
  const cooling = Object.entries(health.cooling || {});
  return (
    <div className={`search-health${health.note ? " search-health--warn" : ""}`} data-testid="search-health">
      <Icon name="search" size={14} />{" "}
      {!health.enabled ? (
        t("Búsqueda web apagada en Parámetros de fuentes.")
      ) : (
        <>
          {t("Búsqueda web: {n} de {total} fuente(s) obtuvieron resultados del dominio en su última corrida.", { n: health.sources_with_results, total: health.sources_searched })}
          {" "}
          {health.api_configured
            ? t("Motores: {motores} · API configurada.", { motores: health.engines.join(", ") })
            : t("Motores: {motores} · sin API.", { motores: health.engines.join(", ") })}
          {cooling.length > 0 && <> {t("En pausa por bloqueo: {lista}.", { lista: cooling.map(([e, sec]) => `${e} (${Math.ceil(sec / 60)} min)`).join(", ") })}</>}
          {health.knowledge ? (
            <div style={{ marginTop: 4 }} data-testid="search-knowledge-line">
              {health.sources_from_knowledge
                ? t("Base de conocimiento de búsqueda: {pages} página(s) de {domains} sitio(s), {signals} ya aportaron señales. La vigilancia las visita sin consultar buscadores ({n} fuente(s) la usaron en su última corrida).", {
                    pages: health.knowledge.pages,
                    domains: health.knowledge.domains,
                    signals: health.knowledge.with_signals,
                    n: health.sources_from_knowledge,
                  })
                : t("Base de conocimiento de búsqueda: {pages} página(s) de {domains} sitio(s), {signals} ya aportaron señales. La vigilancia las visita sin consultar buscadores.", {
                    pages: health.knowledge.pages,
                    domains: health.knowledge.domains,
                    signals: health.knowledge.with_signals,
                  })}
            </div>
          ) : null}
          {health.note && <div style={{ marginTop: 4 }}>{ts(health.note)}</div>}
        </>
      )}
    </div>
  );
}
