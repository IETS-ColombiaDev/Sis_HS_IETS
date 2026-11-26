import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { SCAN_TIMEOUT, apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import { PERM } from "../constants/methodology";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card, SectionTitle } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import { Input } from "../components/Field";
import { LoadingBlock, Spinner } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { ietsTag } from "../utils/iets";
import LinkPreview from "../components/LinkPreview";
import { AccessReport, LastRunCaption, ScanHistory, ScanRunSummary, SourceProgress } from "../components/ScanProgress";
import { useScan } from "../scan/ScanContext";
import { UrlOriginTag } from "../components/UrlOrigin";
import { t, tr, ts, intlLocale } from "../i18n";

const PROGRESS_POLL_MS = 2500;
const REPORT_POLL_MS = 15000;
const FILTER_STATUS = { ejecutando: ["ejecutando"], pendiente: ["pendiente"], ok: ["ok", "parcial"], error: ["error"], cancelado: ["cancelado"] };
const RUN_ORDER = { ejecutando: 0, pendiente: 1, error: 2 };

const JOB_LABELS = {
  pendiente: t("Pendiente"),
  ejecutando: t("Ejecutando"),
  ok: t("Ok"),
  parcial: t("Parcial"),
  error: t("Error"),
  cancelado: t("Cancelado"),
};
const JOB_TONE = { ok: "success", parcial: "warning", error: "danger", cancelado: "danger" };
const RUN_LABELS = { en_curso: t("En curso"), ok: t("Ok"), parcial: t("Parcial"), error: t("Error"), sin_trabajo: t("Sin trabajo") };
const RUN_TONE = { ok: "success", parcial: "warning", error: "danger", sin_trabajo: "viewer", en_curso: "info" };

function daysSince(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return t("Hoy");
  if (d === 1) return t("Ayer");
  return t("Hace {d} días", { d });
}

function when(iso) {
  return iso ? new Date(iso).toLocaleString(intlLocale()) : "-";
}

/** Proxima ejecucion; si ya vencio, corre en la siguiente vuelta del worker. */
function nextRun(iso) {
  if (!iso) return "-";
  return new Date(iso).getTime() <= Date.now() ? t("En la próxima vuelta del worker") : when(iso);
}

export default function Scan() {
  const { can, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canScan = can(PERM.SCAN_RUN);
  const canConfig = can(PERM.CONFIG_MANAGE);
  const noScan = t("Su perfil ({role}) no puede ejecutar la vigilancia (permiso scan:run).", { role: ts(user?.role_label) || user?.role });

  const [sources, setSources] = useState([]);
  const [logs, setLogs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [running, setRunning] = useState(false);
  const [runningScheduled, setRunningScheduled] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [logFilter, setLogFilter] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const firstLoad = useRef(true);
  // El avance lo sigue ScanContext en toda la aplicación (no se pierde al cambiar de módulo).
  const { progress, refresh: loadProgress, lastFetch } = useScan();
  const [progressFilter, setProgressFilter] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const wasActive = useRef(false);
  const [report, setReport] = useState(null);
  const [reportAt, setReportAt] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, l, j, sc] = await Promise.all([
        api.get("/sources"),
        api.get("/scan/logs", { params: { limit: 60 } }),
        api.get("/ingest/jobs", { params: { limit: 12 } }),
        api.get("/config/schedule"),
      ]);
      setSources(s.data);
      setLogs(l.data);
      setJobs(j.data);
      setSchedule(sc.data);
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudo cargar la vigilancia")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadReport = useCallback(async () => {
    try {
      const { data } = await api.get("/ingest/access-report");
      setReport(data);
      setReportAt(new Date().toISOString());
    } catch {
      /* el informe es complementario: si falla, la pantalla sigue */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/ingest/runs", { params: { limit: 30 } });
      setHistory(data);
    } catch {
      /* el historial es complementario: si falla, la pantalla sigue */
    }
  }, []);

  useEffect(() => {
    load();
    loadProgress();
    loadReport();
    loadHistory();
  }, [load, loadProgress, loadReport, loadHistory, version]);

  // En esta pantalla el avance se refresca más seguido; al terminar se recargan registro e informe.
  useEffect(() => {
    if (!progress?.active) {
      if (wasActive.current) {
        wasActive.current = false;
        load();
        loadReport();
        loadHistory();
      }
      return undefined;
    }
    wasActive.current = true;
    loadHistory();
    const timer = setInterval(loadProgress, PROGRESS_POLL_MS);
    // El informe y el historial cambian más despacio: cada 15 s basta durante la corrida.
    const reportTimer = setInterval(() => {
      loadReport();
      loadHistory();
    }, REPORT_POLL_MS);
    return () => {
      clearInterval(timer);
      clearInterval(reportTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.active, loadProgress]);

  const progressBySource = useMemo(() => {
    const out = {};
    (progress?.sources || []).forEach((row) => {
      out[row.source_id] = row;
    });
    return out;
  }, [progress]);

  const enabled = useMemo(() => sources.filter((s) => s.scrape_enabled && !s.retired && s.catalog_active !== false), [sources]);
  const categories = useMemo(() => [...new Set(enabled.map((s) => s.category).filter(Boolean))].sort(), [enabled]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const wanted = FILTER_STATUS[progressFilter];
    const rows = enabled.filter((s) => {
      const okCat = !catFilter || s.category === catFilter;
      const okQ =
        !q ||
        (s.title || "").toLowerCase().includes(q) ||
        (s.url || "").toLowerCase().includes(q) ||
        (s.category || "").toLowerCase().includes(q);
      const okRun = !wanted || wanted.includes(progressBySource[s.id]?.job_status);
      return okCat && okQ && okRun;
    });
    if (!progress?.active) return rows;
    // Durante la corrida, arriba lo que se está rastreando y lo que sigue en cola.
    const rank = (s) => RUN_ORDER[progressBySource[s.id]?.job_status] ?? 9;
    return [...rows].sort((a, b) => rank(a) - rank(b));
  }, [enabled, search, catFilter, progressFilter, progressBySource, progress?.active]);

  const visibleLogs = useMemo(() => logs.filter((l) => !logFilter || l.status === logFilter), [logs, logFilter]);
  const totalSignals = enabled.reduce((n, s) => n + (s.findings_count || 0), 0);
  const staleCount = enabled.filter((s) => !s.last_scraped_at || Date.now() - new Date(s.last_scraped_at).getTime() > 7 * 86400000).length;
  const recentErrors = logs.slice(0, 20).filter((l) => l.status === "error").length;
  const lastNew = logs[0]?.items_new || 0;
  const scanTask = schedule?.tasks?.find((task) => task.task === "vigilancia");

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runScan = async (ids) => {
    setRunning(true);
    try {
      const { data } = await api.post("/ingest/run", { source_ids: ids?.length ? ids : [], process_now: false }, { timeout: 60000 });
      toast.success(t("Vigilancia encolada: {n} fuente(s). Siga el estado de cada una abajo; puede seguir trabajando.", { n: data.queued }));
      setSelected(new Set());
      load();
      loadProgress();
      loadHistory();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo ejecutar la vigilancia")));
    } finally {
      setRunning(false);
    }
  };

  const cancelRun = async () => {
    setCancelling(true);
    try {
      const { data } = await api.post("/ingest/cancel", {});
      toast.info(t("Se cancelaron {n} fuente(s) en cola. Las que ya corrían terminan su paso actual.", { n: data.cancelled }));
      loadProgress();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo detener la vigilancia")));
    } finally {
      setCancelling(false);
    }
  };

  const runScheduledNow = async () => {
    setRunningScheduled(true);
    try {
      const { data } = await api.post("/config/schedule/vigilancia/run", null, { timeout: 60000 });
      if (data.status === "sin_trabajo") toast.info(ts(data.message));
      else toast.success(ts(data.message) || t("Vigilancia programada ejecutada"));
      load();
      loadHistory();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo ejecutar la vigilancia programada")));
    } finally {
      setRunningScheduled(false);
    }
  };

  const scanOne = async (s, e) => {
    e?.stopPropagation();
    setScanningId(s.id);
    // El rastreo de una fuente espera la respuesta: mientras tanto se sondea su estado.
    const timer = setInterval(loadProgress, PROGRESS_POLL_MS);
    try {
      const { data } = await api.post(`/scan/source/${s.id}`, null, { timeout: SCAN_TIMEOUT });
      if (data.status === "error") toast.error(`${s.title}: ${ts(data.message) || t("error de ingesta")}`);
      else toast.success(t("{title}: {n} señales nuevas de {total}", { title: s.title, n: data.items_new, total: data.items_found }));
      load();
      loadProgress();
      loadReport();
      loadHistory();
    } catch (err) {
      toast.error(apiError(err, t("No se pudo escanear")));
    } finally {
      clearInterval(timer);
      setScanningId(null);
    }
  };

  const runPreview = async (e) => {
    e?.preventDefault();
    if (!/^https?:\/\//i.test(previewUrl.trim())) {
      toast.warning(t("Escriba una URL que inicie con http:// o https://"));
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const { data } = await api.post("/scan/preview", { url: previewUrl.trim() }, { timeout: SCAN_TIMEOUT });
      setPreview(data);
    } catch (err) {
      toast.error(apiError(err, t("No se pudo previsualizar el enlace")));
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) return <LoadingBlock label={t("Cargando vigilancia...")} />;

  return (
    <div>
      <ModuleHeader
        step="identificacion"
        title={t("Vigilancia de fuentes")}
        titleHint={GLOSSARY.vigilancia}
        purpose={t("Fase 1 · Identificación: el rastreador entra a cada fuente, sigue hasta las fichas internas y, si MiniMax está activo, extrae las señales.")}
        actions={
          <div className="scan-hero-actions">
            <div className="scan-hero-buttons">
              <Button variant="secondary" onClick={() => navigate("/fuentes")}>
                <Icon name="globe" size={16} /> {t("Inventario")}
              </Button>
              <HintButton
                size="lg"
                onClick={() => runScan(null)}
                loading={running}
                disabled={!canScan || enabled.length === 0}
                hint={t("Encola las {n} fuentes con ingesta activa. El worker las procesa en segundo plano: puede seguir trabajando.", { n: enabled.length })}
                disabledHint={!canScan ? noScan : t("No hay fuentes con ingesta activa. Habilite alguna en el catálogo de fuentes.")}
              >
                <Icon name="radar" size={17} /> {t("Ejecutar vigilancia ({n})", { n: enabled.length })}
              </HintButton>
            </div>
            <LastRunCaption history={history} active={Boolean(progress?.active)} />
          </div>
        }
      />

      {!canScan && (
        <div className="fb-readonly-note" data-testid="scan-readonly">
          <Icon name="info" size={16} />
          <span>{t("Modo consulta: {motivo} Puede revisar la cola, el registro y la programación.", { motivo: noScan })}</span>
        </div>
      )}

      <PhaseGuide
        phase={t("Fase 1 · Identificación")}
        hint={GLOSSARY.vigilancia}
        tasks={[
          t("Pulse «Ejecutar vigilancia»: corre en el servidor y puede seguir trabajando en otros módulos; la barra flotante muestra el avance y el tiempo restante."),
          t("Si un sitio rechaza al rastreador se prueban las rutas de respaldo (RSS oficial, índice de la revista en PubMed, Google News). El informe de acceso dice por dónde entró cada fuente."),
          t("Cada corrida queda en el historial con su fecha y hora, su duración y su resumen."),
          t("Las señales nuevas llegan a la bandeja de entrada; el nivel D no pisa campos ya llenados por A/B."),
        ]}
        nextLabel={t("Bandeja de entrada")}
        onNext={() => navigate("/bandeja-entrada")}
      />

      <ModuleStatsRow
        items={[
          { label: t("Referentes vigilados"), value: enabled.length, sub: t("{n} en inventario", { n: sources.length }), hint: GLOSSARY.fb_ingesta },
          { label: t("Señales capturadas"), value: totalSignals, sub: t("Total acumulado"), hint: t("Señales que ya produjeron las fuentes vigiladas, desde siempre.") },
          { label: t("Sin rastrear >7 días"), value: staleCount, sub: t("Requieren vigilancia"), color: staleCount > 0 ? "#F59E0B" : undefined, hint: t("Fuentes activas que no se consultan hace más de una semana (o nunca). Puede ser normal si su frecuencia es mensual.") },
          { label: t("Último lote nuevo"), value: lastNew, sub: t("Señales en el último rastreo"), color: lastNew > 0 ? "#10B981" : undefined, hint: t("Señales nuevas que trajo el rastreo más reciente del registro.") },
        ]}
      />

      <ScanRunSummary
        progress={progress}
        canScan={canScan}
        onCancel={cancelRun}
        cancelling={cancelling}
        filter={progressFilter}
        onFilter={setProgressFilter}
        lastFetch={lastFetch}
      />

      <AccessReport report={report} onReload={loadReport} live={Boolean(progress?.active)} updatedAt={reportAt} />

      <ScanHistory history={history} onReload={loadHistory} />

      <Card padding={0} className="scan-ops" style={{ marginBottom: 16 }}>
        <div className="scan-ops-head">
          <div className="scan-ops-title">
            <Icon name="clock" size={16} /> {t("Vigilancia programada")}
            <InfoTip text={GLOSSARY.fb_programada} label={t("Qué es la vigilancia programada")} />
          </div>
          {scanTask ? (
            <>
              <dl className="scan-sched-meta" data-testid="scan-schedule">
                <div className="scan-sched-pair"><dt>{t("Estado")}</dt>
                <dd>{scanTask.enabled ? <Badge tone="ok">{t("Activa")}</Badge> : <Badge tone="viewer">{t("Apagada")}</Badge>}</dd></div>
                <div className="scan-sched-pair"><dt>{t("Cada")}</dt>
                <dd>{scanTask.interval_hours} h <InfoTip text={GLOSSARY.fb_intervalo_vigilancia} /></dd></div>
                <div className="scan-sched-pair"><dt>{t("Próxima")}</dt>
                <dd>{scanTask.enabled ? nextRun(scanTask.next_run_at) : "-"}</dd></div>
                <div className="scan-sched-pair"><dt>{t("Última")}</dt>
                <dd>
                  {scanTask.last_run ? (
                    <>
                      <Badge tone={RUN_TONE[scanTask.last_run.status]}>{RUN_LABELS[scanTask.last_run.status] || scanTask.last_run.status}</Badge>{" "}
                      {when(scanTask.last_run.started_at)}
                    </>
                  ) : (
                    t("Aún no ha corrido")
                  )}
                </dd></div>
                <div className="scan-sched-pair"><dt>Worker <InfoTip text={GLOSSARY.fb_worker} /></dt>
                <dd>{schedule.worker_running ? t("En marcha") : schedule.worker_enabled ? t("Detenido") : t("Deshabilitado en este servidor")}</dd></div>
              </dl>
              <div className="scan-sched-actions">
                <HintButton
                  size="sm"
                  variant="outline"
                  loading={runningScheduled}
                  disabled={!canScan}
                  hint={t("Corre ya la vigilancia programada: encola solo las fuentes cuya frecuencia venció.")}
                  disabledHint={noScan}
                  onClick={runScheduledNow}
                >
                  {t("Ejecutar ahora")}
                </HintButton>
                <HintButton
                  size="sm"
                  variant="ghost"
                  disabled={!canConfig}
                  hint={t("Cambiar el intervalo o apagar la tarea")}
                  disabledHint={t("Solo el superadministrador cambia la programación (permiso config:manage).")}
                  onClick={() => navigate("/configuracion?tab=programacion")}
                >
                  {t("Configurar")}
                </HintButton>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>{t("No se pudo leer la programación.")}</p>
          )}
        </div>
        {scanTask?.last_run?.message && <p className="scan-ops-note">{ts(scanTask.last_run.message)}</p>}

        <details className="scan-ops-fold" open={queueOpen || jobs.length > 0} onToggle={(e) => setQueueOpen(e.currentTarget.open)}>
          <summary data-testid="scan-queue-toggle">
            <Icon name="list" size={15} />
            <span className="scan-ops-fold-title">{t("Cola de ingesta")}</span>
            <InfoTip text={GLOSSARY.fb_cola} label={t("Qué es la cola de ingesta")} />
            <span className="scan-ops-fold-meta">{jobs.length === 0 ? t("vacía") : t("{n} trabajo(s)", { n: jobs.length })}</span>
            <span className="scan-ops-chevron" aria-hidden="true"><Icon name="chevron" size={15} /></span>
          </summary>
          <div className="scan-ops-fold-body">
            <div className="scan-ops-fold-hint">
              <span>{t("La extracción no corre en el hilo de la petición: el worker toma los trabajos en orden.")}</span>
              <Button size="sm" variant="ghost" onClick={load}>{t("Actualizar")}</Button>
            </div>
        {jobs.length === 0 ? (
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>{t("La cola está vacía. Ejecute la vigilancia o espere a la programada.")}</p>
        ) : (
          <div className="ingest-job-list" data-testid="ingest-jobs">
            {jobs.slice(0, 8).map((job) => (
              <div key={job.id} className="ingest-job-row" title={ts(job.message) || ""}>
                <Badge tone={JOB_TONE[job.status] || "warning"}>{JOB_LABELS[job.status] || job.status}</Badge>
                <span className="ingest-job-src">{job.source_title || job.connector}</span>
                <span className="ingest-job-meta">
                  {job.connector} · +{job.items_new}/{job.items_found} · {job.origin === "programado" ? t("programado") : t("manual")}
                </span>
              </div>
            ))}
          </div>
        )}
          </div>
        </details>

        <details className="scan-ops-fold" open={previewOpen} onToggle={(e) => setPreviewOpen(e.currentTarget.open)}>
          <summary data-testid="scan-preview-toggle">
            <Icon name="eye" size={15} />
            <span className="scan-ops-fold-title">{t("Vista previa de un enlace")}</span>
            <InfoTip text={GLOSSARY.fb_vista_previa} label={t("Qué es la vista previa")} />
            <span className="scan-ops-fold-meta">{t("probar una URL sin guardar nada")}</span>
            <span className="scan-ops-chevron" aria-hidden="true"><Icon name="chevron" size={15} /></span>
          </summary>
          <div className="scan-ops-fold-body">
          <form onSubmit={runPreview} className="fb-inline-row" style={{ marginTop: 10 }}>
            <Input id="preview-url" placeholder="https://..." aria-label={t("URL a previsualizar")} value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} style={{ marginBottom: 0 }} />
            <div style={{ flex: "0 0 auto", marginBottom: 14 }}>
              <HintButton type="submit" variant="outline" loading={previewing} disabled={!canScan} hint={GLOSSARY.fb_vista_previa} disabledHint={noScan}>
                {t("Previsualizar")}
              </HintButton>
            </div>
          </form>
          <LinkPreview data={preview} />
          </div>
        </details>
      </Card>

      {running && (
        <Card className="scan-running-banner" padding={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Spinner />
            <div>
              <div style={{ fontWeight: 600 }}>{t("Encolando la vigilancia")}</div>
              <div style={{ fontSize: 13, color: "#64748B" }}>{t("El worker procesa las fuentes en segundo plano.")}</div>
            </div>
          </div>
        </Card>
      )}

      <div className="vigilancia-grid">
        <Card padding={0} className="vigilancia-sources-panel">
          <div className="panel-toolbar">
            <SectionTitle
              hint={t("Fuentes con ingesta activa. Marque varias para rastrearlas juntas.")}
              right={
                canScan && selected.size > 0 ? (
                  <Button size="sm" onClick={() => runScan([...selected])} loading={running}>
                    {t("Rastrear selección ({n})", { n: selected.size })}
                  </Button>
                ) : null
              }
            >
              {t("Referentes en vigilancia")}
            </SectionTitle>
            <div className="panel-filters">
              <input placeholder={t("Buscar referente...")} aria-label={t("Buscar referente")} value={search} onChange={(e) => setSearch(e.target.value)} className="filter-input" />
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="filter-select" aria-label={t("Filtrar por categoría")}>
                <option value="">{t("Todas las categorías")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{ts(c)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="source-scan-list">
            {filtered.length === 0 ? (
              <EmptyState
                icon="🌐"
                message={enabled.length === 0 ? t("No hay fuentes con ingesta activa.") : t("No hay referentes que coincidan con la búsqueda o el filtro de estado.")}
                action={<Button onClick={() => navigate("/fuentes")}>{t("Ir al catálogo de fuentes")}</Button>}
              />
            ) : (
              filtered.map((s) => {
                const tag = ietsTag(s.category);
                const stale = !s.last_scraped_at || Date.now() - new Date(s.last_scraped_at).getTime() > 7 * 86400000;
                return (
                  <div key={s.id} className={`source-scan-card${selected.has(s.id) ? " source-scan-card--selected" : ""}`} data-testid={`scan-source-${s.id}`}>
                    <div className="source-scan-card-main">
                      {canScan && (
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="source-scan-check" aria-label={t("Seleccionar {title}", { title: s.title })} />
                      )}
                      <div className="source-scan-icon">
                        <Icon name="globe" size={18} />
                      </div>
                      <div className="source-scan-body">
                        <div className="source-scan-title-row">
                          <span className="source-scan-title" title={s.title}>{s.title}</span>
                          {s.catalog_code && <span className="catalog-code">{s.catalog_code}</span>}
                          {s.access_level && <span title={GLOSSARY.fb_nivel}><Badge tone={s.access_level}>{t("Nivel {nivel}", { nivel: s.access_level })}</Badge></span>}
                          {s.health_status && <span title={GLOSSARY.fb_salud}><Badge tone={s.health_status}>{ts(s.health_status)}</Badge></span>}
                          {tag && <Badge tone={tag.tone}>{tag.label}</Badge>}
                        </div>
                        <div className="source-scan-meta">
                          <Badge>{ts(s.category) || t("Referente")}</Badge>
                          <span title={GLOSSARY.fb_adaptador}>{s.connector && s.connector !== "html" ? s.connector : "HTML"}</span>
                          <span>{t("{n} señales", { n: s.findings_count || 0 })}</span>
                          {s.circuit_open_until && (
                            <span className="meta-warn" title={t("Tras varios fallos seguidos la fuente se pausa unas horas para no insistir sobre un servicio caído.")}>
                              {t("circuito abierto")}
                            </span>
                          )}
                          <span className={stale ? "meta-warn" : ""}>{s.last_scraped_at ? daysSince(s.last_scraped_at) : t("Nunca rastreado")}</span>
                        </div>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="source-scan-url" onClick={(e) => e.stopPropagation()}>
                            {s.url.replace(/^https?:\/\//, "").slice(0, 55)}{s.url.length > 58 ? "…" : ""}
                          </a>
                        )}
                        <UrlOriginTag source={s} />
                        <SourceProgress row={progressBySource[s.id]} />
                      </div>
                    </div>
                    <div className="source-scan-actions">
                      {(s.findings_count || 0) > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => navigate("/senales")}>
                          {t("Ver señales")}
                        </Button>
                      )}
                      {canScan && (
                        <HintButton size="sm" variant="outline" hint={GLOSSARY.fb_ingerir} loading={scanningId === s.id} onClick={(e) => scanOne(s, e)}>
                          <Icon name="radar" size={14} /> {t("Rastrear")}
                        </HintButton>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card padding={0} className="vigilancia-log-panel">
          <div className="panel-toolbar">
            <SectionTitle
              hint={t("Bitácora de cada rastreo: cuándo corrió, qué fuente, cuántas señales nuevas y detectadas, y el mensaje del adaptador.")}
              right={
                <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)} className="filter-select" aria-label={t("Filtrar registro por estado")}>
                  <option value="">{t("Todos")}</option>
                  <option value="ok">{t("Ok")}</option>
                  <option value="parcial">{t("Parcial")}</option>
                  <option value="error">{t("Error")}</option>
                </select>
              }
            >
              {t("Registro de vigilancia")}
            </SectionTitle>
          </div>
          <div className="scan-log-list" data-testid="scan-log">
            {visibleLogs.length === 0 ? (
              <EmptyState
                icon="🕐"
                message={logs.length === 0 ? t("Aún no hay rastreos registrados.") : t("Ningún rastreo con ese estado.")}
                action={
                  canScan && enabled.length > 0 && logs.length === 0 ? (
                    <Button onClick={() => runScan(null)} loading={running}>{t("Ejecutar primer rastreo")}</Button>
                  ) : null
                }
              />
            ) : (
              visibleLogs.slice(0, 25).map((log) => (
                <div key={log.id} className={`scan-log-item scan-log-item--${log.status}`}>
                  <div className="scan-log-head">
                    <Badge tone={log.status}>{JOB_LABELS[log.status] || log.status}</Badge>
                    <time>{new Date(log.started_at).toLocaleString(intlLocale())}</time>
                  </div>
                  <div className="scan-log-source">{log.source_title || t("Rastreo masivo")}</div>
                  <p className="scan-log-msg">{ts(log.message)}</p>
                  <div className="scan-log-foot">
                    <span>
                      {tr("<b>{n}</b> nuevas · {found} detectadas", { n: log.items_new, found: log.items_found }, {
                        b: (c) => <strong style={{ color: log.items_new > 0 ? "#10B981" : "#64748B" }}>{c}</strong>,
                      })}
                    </span>
                    {log.items_new > 0 && (
                      <button type="button" className="scan-log-link" onClick={() => navigate("/bandeja-entrada")}>
                        {t("Ir a la bandeja →")}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {recentErrors > 0 && (
            <div className="scan-log-alert">
              {t("{n} rastreo(s) con error reciente. Revise la salud de la fuente en el catálogo.", { n: recentErrors })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
