import { Fragment, useState } from "react";
import Badge from "./Badge";
import Button from "./Button";
import HintButton from "./HintButton";
import Icon from "./Icon";
import { Card } from "./Card";

/**
 * Estado en vivo de la vigilancia: barra global y, por fuente, en qué paso va
 * (cola → acceso → recorrido → extracción → guardado → lista), por qué ruta
 * accedió y cuántas señales lleva. Lee GET /api/ingest/progress.
 */

export const STEPS = [
  { key: "cola", label: "Cola" },
  { key: "acceso", label: "Acceso" },
  { key: "recorrido", label: "Recorrido" },
  { key: "extraccion", label: "Extracción" },
  { key: "guardado", label: "Guardado" },
  { key: "lista", label: "Lista" },
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

const VIA_TONE = { google_news: "warning", rss_oficial: "warning", ruta_matriz: "info", sitio: "success", api: "success", pdf: "info" };

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
    <ol className={`stage-track${compact ? " stage-track--compact" : ""}`} aria-label="Avance de la fuente">
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
          {running && <span className="pulse-dot" aria-hidden="true" />} {row.stage_label}
        </Badge>
        {row.attempts > 1 && <span className="source-progress-meta">intento {row.attempts}/{row.max_attempts}</span>}
        {running && row.started_at && <span className="source-progress-meta">{elapsed(row.started_at)}</span>}
      </div>
      <div className="source-progress-facts">
        <span title="¿El sistema ya entró a la fuente?">
          <Icon name={row.accessed ? "check" : "clock"} size={13} /> {row.accessed ? "Accedió" : "Sin acceso aún"}
          {row.http_status ? ` · HTTP ${row.http_status}` : ""}
        </span>
        {row.access_via && <Badge tone={VIA_TONE[row.access_via] || "viewer"}>{row.access_label || row.access_via}</Badge>}
        {(row.pages_visited > 0 || row.stage === "recorriendo") && (
          <span>
            {row.pages_visited}
            {row.pages_planned ? ` de ~${row.pages_planned}` : ""} página(s)
          </span>
        )}
        {(row.items_found > 0 || row.stage === "terminada") && (
          <span>
            <strong className={row.items_new > 0 ? "txt-ok" : ""}>+{row.items_new}</strong> nuevas de {row.items_found}
          </span>
        )}
      </div>
      {row.detail && <p className="source-progress-detail">{row.detail}</p>}
      <SearchAndAiLine search={row.search} ai={row.ai} />
      {(row.events?.length > 1 || row.access_attempts?.length > 0) && (
        <>
          <button type="button" className="scan-log-link" onClick={() => setOpen((v) => !v)}>
            {open ? "Ocultar detalle" : "Ver detalle: rutas, búsqueda, IA y pasos"}
          </button>
          {open && <SourceRunDetail row={row} />}
        </>
      )}
    </div>
  );
}

const ROUTE_LABEL = { sitio: "Sitio", ruta_matriz: "Ruta de la matriz", rss_oficial: "RSS oficial", google_news: "Google News", api: "API" };

/** Línea corta: qué buscó en la web y qué hizo la IA. */
export function SearchAndAiLine({ search, ai }) {
  if (!search?.domain && search?.enabled !== false && !ai?.used && !ai?.reason) return null;
  return (
    <div className="source-progress-facts">
      {search && Object.keys(search).length > 0 && (
        <span title={(search.queries || []).join("\n")}>
          <Icon name="search" size={13} />{" "}
          {search.enabled === false
            ? "Búsqueda web apagada"
            : `Búsqueda web: ${search.results ?? 0} resultado(s) de ${search.domain}${search.engines?.length ? ` (${search.engines.join(", ")})` : ""}`}
        </span>
      )}
      {ai && Object.keys(ai).length > 0 && (
        <span>
          <Icon name="spark" size={13} />{" "}
          {ai.used === false
            ? "Sin IA (solo reglas)"
            : ai.error
              ? `IA falló: ${ai.error}`
              : `IA: ${ai.kept ?? 0} señal(es)${ai.with_evidence ? ` (${ai.with_evidence} con cita verificada)` : ""}${ai.ungrounded ? ` · ${ai.ungrounded} descartada(s) por no estar en el texto` : ""}`}
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
          <h5>Rutas de acceso probadas</h5>
          <ul>
            {row.access_attempts.map((a, i) => (
              <li key={i}>
                <Badge tone={a.status === "ok" ? "success" : "danger"}>{a.status.replace("http_", "HTTP ")}</Badge>{" "}
                {ROUTE_LABEL[a.route] || a.route} ·{" "}
                <a href={a.url} target="_blank" rel="noreferrer">{a.url.replace(/^https?:\/\//, "").slice(0, 90)}</a>
                {a.detail ? <span className="muted"> · {a.detail}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {Object.keys(search).length > 0 && (
        <>
          <h5>Búsqueda web</h5>
          {search.enabled === false ? (
            <p>{search.reason || "Apagada"}</p>
          ) : (
            <>
              <p>
                Consultas redactadas por {search.query_origin === "ia" ? "la IA" : "reglas"} en {search.domain}:{" "}
                {(search.queries || []).map((q) => `«${q}»`).join(", ") || "ninguna"}
              </p>
              <p>
                Motores: {(search.engine_attempts || []).join(" | ") || "—"}. Resultados útiles: {search.results ?? 0}.
              </p>
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
          <h5>Extracción con IA</h5>
          {ai.used === false ? (
            <p>{ai.reason}</p>
          ) : (
            <p>
              {ai.error
                ? `La IA falló (${ai.error}); quedaron los candidatos por reglas.`
                : `La IA devolvió ${ai.returned ?? 0} señal(es); se conservaron ${ai.kept ?? 0}` +
                  (ai.with_evidence ? ` (${ai.with_evidence} con cita textual verificada en la fuente)` : "") +
                  (ai.ungrounded ? ` y se descartaron ${ai.ungrounded} porque no aparecen en el texto visitado` : "") +
                  `. Reemplazó ${ai.heuristic_replaced ?? 0} de ${ai.heuristic_candidates ?? 0} candidato(s) por reglas` +
                  (ai.ocr ? ". OCR activo." : ".")}
              {ai.ungrounded_titles?.length > 0 && <span className="muted"> Descartadas: {ai.ungrounded_titles.join(" · ")}</span>}
            </p>
          )}
        </>
      )}
      {row.events?.length > 0 && (
        <>
          <h5>Pasos</h5>
          <ol className="source-progress-events">
            {row.events.map((e, i) => (
              <li key={i}>
                <time>{new Date(e.at).toLocaleTimeString()}</time> <strong>{e.stage}</strong> {e.detail}
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

/** Informe de transparencia: una fila por fuente activa con su último desenlace. */
export function AccessReport({ report, onReload }) {
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState(null);
  if (!report) return null;
  const rows = report.sources.filter((r) => !filter || r.outcome === filter);
  const download = () => {
    const head = ["Fuente", "URL", "Resultado", "Ruta", "HTTP", "Páginas", "Búsqueda web", "IA", "Detectadas", "Nuevas", "Detalle", "Fecha"];
    const lines = report.sources.map((r) => [
      r.title,
      r.url,
      r.outcome_label,
      r.access_label || "",
      r.http_status || "",
      r.pages_visited ?? "",
      r.search?.enabled === false ? "apagada" : r.search?.domain ? `${r.search.results ?? 0} resultado(s)` : "",
      r.ai?.used === false ? "sin IA" : r.ai?.used ? `${r.ai.kept ?? 0} conservadas / ${r.ai.ungrounded ?? 0} descartadas` : "",
      r.items_found ?? "",
      r.items_new ?? "",
      r.detail || r.message || "",
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
    <Card padding={16} className="access-report" style={{ marginBottom: 16 }} data-testid="access-report">
      <div className="scan-run-head">
        <div>
          <div className="scan-run-title">Informe de acceso por fuente</div>
          <div className="scan-run-sub">
            Último resultado real de cada una de las {report.total} fuentes con ingesta activa: si entró, por dónde, qué buscó y qué encontró.
          </div>
        </div>
        <div className="fb-toolbar">
          <Button size="sm" variant="ghost" onClick={onReload}>Actualizar</Button>
          <Button size="sm" variant="secondary" onClick={download}><Icon name="doc" size={14} /> CSV</Button>
        </div>
      </div>
      <SearchHealth health={report.search_health} />
      <div className="scan-run-chips" style={{ marginTop: 10 }}>
        {Object.entries(report.labels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`scan-run-chip${filter === key ? " scan-run-chip--on" : ""}`}
            onClick={() => setFilter(filter === key ? "" : key)}
            aria-pressed={filter === key}
          >
            <Badge tone={OUTCOME_TONE[key]}>{String(report.counts[key] || 0)}</Badge> {label}
          </button>
        ))}
      </div>
      <div className="access-report-table-wrap">
        <table className="access-report-table">
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Resultado</th>
              <th>Ruta / HTTP</th>
              <th>Búsqueda web</th>
              <th>IA</th>
              <th>Señales</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.source_id}>
                <tr className={`access-row access-row--${r.outcome}`}>
                  <td>
                    <strong>{r.title}</strong>
                    <div className="muted">{r.connector}{r.access_level ? ` · nivel ${r.access_level}` : ""}</div>
                  </td>
                  <td><Badge tone={OUTCOME_TONE[r.outcome]}>{r.outcome_label}</Badge></td>
                  <td>{r.access_label || "—"}{r.http_status ? ` · ${r.http_status}` : ""}</td>
                  <td>
                    {r.search?.enabled === false
                      ? "Apagada"
                      : r.search?.domain
                        ? `${r.search.results ?? 0} resultado(s)${r.search.engines?.length ? ` · ${r.search.engines.join(", ")}` : ""}`
                        : "—"}
                  </td>
                  <td>
                    {r.ai?.used === false
                      ? "Sin IA"
                      : r.ai?.used
                        ? `${r.ai.kept ?? 0} conservadas${r.ai.ungrounded ? ` · ${r.ai.ungrounded} descartadas` : ""}`
                        : "—"}
                  </td>
                  <td>{r.outcome === "sin_ejecutar" ? "—" : `+${r.items_new ?? 0} / ${r.items_found ?? 0}`}</td>
                  <td className="access-detail">
                    {(r.detail || r.message || "").slice(0, 160)}
                    {r.outcome !== "sin_ejecutar" && (
                      <button type="button" className="scan-log-link" onClick={() => setOpenId(openId === r.source_id ? null : r.source_id)}>
                        {openId === r.source_id ? "Ocultar" : "Ver todo"}
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
    </Card>
  );
}

/** Resumen de la corrida: barra, conteos, carriles y botón para detener. */
export function ScanRunSummary({ progress, canScan, onCancel, cancelling, filter, onFilter }) {
  if (!progress || !progress.total) return null;
  const c = progress.counts || {};
  const finished = (c.ok || 0) + (c.parcial || 0) + (c.error || 0) + (c.cancelado || 0);
  const pct = progress.total ? Math.round((finished / progress.total) * 100) : 0;
  const chips = [
    { key: "ejecutando", label: "En curso", value: c.ejecutando || 0, tone: "info" },
    { key: "pendiente", label: "En cola", value: c.pendiente || 0, tone: "viewer" },
    { key: "ok", label: "Terminadas", value: (c.ok || 0) + (c.parcial || 0), tone: "success" },
    { key: "error", label: "Con error", value: c.error || 0, tone: "danger" },
    { key: "cancelado", label: "Canceladas", value: c.cancelado || 0, tone: "viewer" },
  ];
  return (
    <Card padding={16} className="scan-run-summary" style={{ marginBottom: 16 }}>
      <div className="scan-run-head">
        <div>
          <div className="scan-run-title">
            {progress.active ? (
              <>
                <span className="pulse-dot" aria-hidden="true" /> Vigilancia en curso
              </>
            ) : (
              "Última vigilancia (12 h)"
            )}
          </div>
          <div className="scan-run-sub">
            {finished} de {progress.total} fuente(s) procesadas · {progress.parallel} a la vez
            {!progress.worker_running && progress.active ? " · procesando sin worker regular (se atiende desde esta corrida)" : ""}
          </div>
        </div>
        {progress.active && canScan && (
          <HintButton
            size="sm"
            variant="outline"
            loading={cancelling}
            onClick={onCancel}
            hint="Cancela las fuentes que siguen en cola. Las que ya se están rastreando terminan su paso actual."
          >
            <Icon name="x" size={14} /> Detener
          </HintButton>
        )}
      </div>
      <div className="scan-run-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
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
            Ver todas
          </Button>
        )}
      </div>
    </Card>
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
        "Búsqueda web apagada en Parámetros de fuentes."
      ) : (
        <>
          Búsqueda web: {health.sources_with_results} de {health.sources_searched} fuente(s) obtuvieron resultados del dominio en su última corrida.
          {" "}Motores: {health.engines.join(", ")}{health.api_configured ? " · API configurada" : " · sin API"}.
          {cooling.length > 0 && <> En pausa por bloqueo: {cooling.map(([e, sec]) => `${e} (${Math.ceil(sec / 60)} min)`).join(", ")}.</>}
          {health.note && <div style={{ marginTop: 4 }}>{health.note}</div>}
        </>
      )}
    </div>
  );
}
