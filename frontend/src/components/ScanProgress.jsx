import { Fragment, useState } from "react";
import Badge from "./Badge";
import Button from "./Button";
import HintButton from "./HintButton";
import Icon from "./Icon";
import { Card } from "./Card";
import { elapsedSince, formatClock, formatDuration, formatRange } from "../scan/format";

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
        {running && row.started_at && (
          <span className="source-progress-meta">
            {elapsed(row.started_at)}
            {row.typical_seconds ? ` · suele tardar ${formatDuration(row.typical_seconds)}` : ""}
          </span>
        )}
        {row.stage === "en_cola" && row.typical_seconds ? (
          <span className="source-progress-meta">suele tardar {formatDuration(row.typical_seconds)}</span>
        ) : null}
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
  const pct = progress.total ? Math.round((finished / progress.total) * 100) : 0;
  const seg = (n) => `${(n / progress.total) * 100}%`;
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
    { key: "ejecutando", label: "En curso", value: running, tone: "info" },
    { key: "pendiente", label: "En cola", value: queued, tone: "viewer" },
    { key: "ok", label: "Terminadas", value: done, tone: "success" },
    { key: "error", label: "Con error", value: failed, tone: "danger" },
    { key: "cancelado", label: "Canceladas", value: cancelled, tone: "viewer" },
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
                <span className="pulse-dot" aria-hidden="true" /> Vigilancia en curso
              </>
            ) : (
              "Última vigilancia (últimas 12 h)"
            )}
          </div>
          <div className="scan-run-sub">
            {progress.active
              ? "Corre en el servidor: puede cambiar de módulo o de pestaña, o cerrar el navegador. Sigue sola y le avisamos al terminar."
              : `${finished} de ${progress.total} fuente(s) procesadas: ${done} terminadas${failed ? `, ${failed} con error` : ""}${cancelled ? `, ${cancelled} canceladas` : ""}.`}
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

      {progress.active && (
        <div className="scan-kpis" role="group" aria-label="Avance de la vigilancia">
          <div className="scan-kpi">
            <span className="scan-kpi-label">Avance</span>
            <strong className="scan-kpi-value">
              {finished} de {progress.total}
            </strong>
            <span className="scan-kpi-sub">
              {pct} % · {done} ok{failed ? ` · ${failed} con error` : ""}
            </span>
          </div>
          {eta && (
            <>
              <div className="scan-kpi">
                <span className="scan-kpi-label">Transcurrido</span>
                <strong className="scan-kpi-value">{formatDuration(eta.elapsed_seconds)}</strong>
                <span className="scan-kpi-sub">Inició {formatClock(eta.run_started_at)}</span>
              </div>
              <div className="scan-kpi scan-kpi--accent">
                <span className="scan-kpi-label">Tiempo restante</span>
                <strong className="scan-kpi-value">~{formatDuration(eta.eta_seconds)}</strong>
                <span className="scan-kpi-sub">entre {formatRange(eta.eta_low_seconds, eta.eta_high_seconds)}</span>
              </div>
              <div className="scan-kpi">
                <span className="scan-kpi-label">Fin estimado</span>
                <strong className="scan-kpi-value">{formatClock(eta.eta_at)}</strong>
                <span className="scan-kpi-sub">{progress.parallel} fuente(s) a la vez</span>
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
        aria-label={`${pct} % de las fuentes procesadas`}
      >
        <span className="seg-ok" style={{ width: seg(done) }} />
        <span className="seg-error" style={{ width: seg(failed + cancelled) }} />
        <span className="seg-running" style={{ width: seg(running) }} />
      </div>

      {progress.active && (
        <div className="scan-now">
          {stale && (
            <p className="scan-warn" role="status">
              <Icon name="info" size={14} /> Sin respuesta del servidor hace {formatDuration((Date.now() - lastFetch) / 1000)}. Si se
              reinició, la vigilancia se reanuda sola donde quedó.
            </p>
          )}
          {!progress.worker_running && (
            <p className="scan-warn" role="status">
              <Icon name="info" size={14} /> El worker regular no está en marcha en este servidor: la cola se atiende desde la
              corrida que la lanzó.
            </p>
          )}
          {retryWait && (
            <p className="scan-note">
              <Icon name="clock" size={14} /> Esperando reintentos: la próxima fuente se vuelve a intentar a las{" "}
              {formatClock(next[0]?.scheduled_for)}.
            </p>
          )}
          {now.map((r) => {
            const took = elapsedSince(r.started_at);
            const quiet = r.updated_at ? elapsedSince(r.updated_at) : null;
            return (
              <div key={r.source_id} className="scan-now-row">
                <span className="scan-now-tag">Ahora</span>
                <strong>{r.source_title}</strong>
                <span className="muted">
                  {r.stage_label}
                  {took != null ? ` · lleva ${formatDuration(took)}` : ""}
                  {r.typical_seconds ? ` · suele tardar ${formatDuration(r.typical_seconds)}` : ""}
                  {quiet != null && quiet > 180 ? ` · sin novedades hace ${formatDuration(quiet)}` : ""}
                </span>
              </div>
            );
          })}
          {next.length > 0 && (
            <div className="scan-now-row">
              <span className="scan-now-tag scan-now-tag--next">Siguen</span>
              <span className="muted">
                {next.map((r) => r.source_title).join(" · ")}
                {queued > next.length ? ` y ${queued - next.length} más` : ""}
              </span>
            </div>
          )}
          {eta && (
            <details className="scan-eta-basis">
              <summary>¿Cómo se calcula el tiempo?</summary>
              <p>
                Cada fuente se estima con el promedio de sus 3 últimas corridas en este servidor y se ajusta a la velocidad
                real de esta corrida. Luego se reparte la cola entre {progress.parallel} carril(es) en el orden en que el
                servidor la atenderá, incluidos los reintentos programados. El rango va de lo que la fuente tarda en sus
                corridas rápidas a lo que tarda en las lentas.
                Ninguna fuente pasa de {progress.job_timeout_minutes} min: si los supera, se cierra con error y la corrida sigue.
              </p>
              <p className="muted">{eta.basis}</p>
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
            Ver todas
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
  const pct = Math.round((finished / progress.total) * 100);
  const eta = progress.eta;
  const current = (progress.sources || []).find((r) => r.job_status === "ejecutando");
  if (collapsed) {
    return (
      <button type="button" className="scan-dock scan-dock--mini" onClick={() => setCollapsed(false)} aria-label="Mostrar el avance de la vigilancia">
        <span className="pulse-dot" aria-hidden="true" /> {finished}/{progress.total}
        {eta ? ` · ~${formatDuration(eta.eta_seconds)}` : ""}
      </button>
    );
  }
  return (
    <div className="scan-dock" role="status" aria-live="polite" data-testid="scan-dock">
      <div className="scan-dock-head">
        <span className="pulse-dot" aria-hidden="true" />
        <strong>Vigilancia en curso</strong>
        <button type="button" className="scan-dock-x" onClick={() => setCollapsed(true)} aria-label="Minimizar">
          <Icon name="x" size={13} />
        </button>
      </div>
      <div className="scan-run-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="scan-dock-line">
        {finished} de {progress.total} fuentes · {pct} %
      </div>
      {eta && (
        <div className="scan-dock-line">
          Faltan ~{formatDuration(eta.eta_seconds)} · termina ~{formatClock(eta.eta_at)}
        </div>
      )}
      {current && <div className="scan-dock-line muted">Ahora: {current.source_title}</div>}
      <button type="button" className="scan-log-link" onClick={onOpen}>
        Ver el detalle en Vigilancia →
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
