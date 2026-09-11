import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
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

const JOB_LABELS = {
  pendiente: "Pendiente",
  ejecutando: "Ejecutando",
  ok: "Ok",
  parcial: "Parcial",
  error: "Error",
  cancelado: "Cancelado",
};
const JOB_TONE = { ok: "success", parcial: "warning", error: "danger", cancelado: "danger" };
const RUN_LABELS = { en_curso: "En curso", ok: "Ok", parcial: "Parcial", error: "Error", sin_trabajo: "Sin trabajo" };
const RUN_TONE = { ok: "success", parcial: "warning", error: "danger", sin_trabajo: "viewer", en_curso: "info" };

function daysSince(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "Hoy";
  if (d === 1) return "Ayer";
  return `Hace ${d} días`;
}

function when(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

/** Proxima ejecucion; si ya vencio, corre en la siguiente vuelta del worker. */
function nextRun(iso) {
  if (!iso) return "—";
  return new Date(iso).getTime() <= Date.now() ? "En la próxima vuelta del worker" : when(iso);
}

export default function Scan() {
  const { can, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canScan = can(PERM.SCAN_RUN);
  const canConfig = can(PERM.CONFIG_MANAGE);
  const noScan = `Su perfil (${user?.role_label || user?.role}) no puede ejecutar la vigilancia (permiso scan:run).`;

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
      toast.error(apiError(e, "No se pudo cargar la vigilancia"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const enabled = useMemo(() => sources.filter((s) => s.scrape_enabled && !s.retired && s.catalog_active !== false), [sources]);
  const categories = useMemo(() => [...new Set(enabled.map((s) => s.category).filter(Boolean))].sort(), [enabled]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return enabled.filter((s) => {
      const okCat = !catFilter || s.category === catFilter;
      const okQ =
        !q ||
        (s.title || "").toLowerCase().includes(q) ||
        (s.url || "").toLowerCase().includes(q) ||
        (s.category || "").toLowerCase().includes(q);
      return okCat && okQ;
    });
  }, [enabled, search, catFilter]);

  const visibleLogs = useMemo(() => logs.filter((l) => !logFilter || l.status === logFilter), [logs, logFilter]);
  const totalSignals = enabled.reduce((n, s) => n + (s.findings_count || 0), 0);
  const staleCount = enabled.filter((s) => !s.last_scraped_at || Date.now() - new Date(s.last_scraped_at).getTime() > 7 * 86400000).length;
  const recentErrors = logs.slice(0, 20).filter((l) => l.status === "error").length;
  const lastNew = logs[0]?.items_new || 0;
  const scanTask = schedule?.tasks?.find((t) => t.task === "vigilancia");

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
      const { data } = await api.post("/ingest/run", { source_ids: ids?.length ? ids : [], process_now: false });
      toast.success(`Vigilancia encolada: ${data.queued} fuente(s). El worker las atiende sin bloquear esta pantalla.`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar la vigilancia"));
    } finally {
      setRunning(false);
    }
  };

  const runScheduledNow = async () => {
    setRunningScheduled(true);
    try {
      const { data } = await api.post("/config/schedule/vigilancia/run");
      if (data.status === "sin_trabajo") toast.info(data.message);
      else toast.success(data.message || "Vigilancia programada ejecutada");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar la vigilancia programada"));
    } finally {
      setRunningScheduled(false);
    }
  };

  const scanOne = async (s, e) => {
    e?.stopPropagation();
    setScanningId(s.id);
    try {
      const { data } = await api.post(`/scan/source/${s.id}`);
      if (data.status === "error") toast.error(`${s.title}: ${data.message || "error de ingesta"}`);
      else toast.success(`${s.title}: ${data.items_new} señales nuevas de ${data.items_found}`);
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo escanear"));
    } finally {
      setScanningId(null);
    }
  };

  const runPreview = async (e) => {
    e?.preventDefault();
    if (!/^https?:\/\//i.test(previewUrl.trim())) {
      toast.warning("Escriba una URL que inicie con http:// o https://");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const { data } = await api.post("/scan/preview", { url: previewUrl.trim() });
      setPreview(data);
    } catch (err) {
      toast.error(apiError(err, "No se pudo previsualizar el enlace"));
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando vigilancia..." />;

  return (
    <div>
      <ModuleHeader
        step="identificacion"
        title="Vigilancia de fuentes"
        titleHint={GLOSSARY.vigilancia}
        purpose="Fase 1 · Identificación: rastreo sistemático de referentes internacionales para capturar señales de tecnologías sanitarias emergentes."
        actions={
          <div className="fb-toolbar">
            <Button variant="secondary" onClick={() => navigate("/fuentes")}>
              <Icon name="globe" size={16} /> Inventario
            </Button>
            <HintButton
              size="lg"
              onClick={() => runScan(null)}
              loading={running}
              disabled={!canScan || enabled.length === 0}
              hint={`Encola las ${enabled.length} fuentes con ingesta activa. El worker las procesa en segundo plano: puede seguir trabajando.`}
              disabledHint={!canScan ? noScan : "No hay fuentes con ingesta activa. Habilite alguna en el catálogo de fuentes."}
            >
              <Icon name="radar" size={17} /> Ejecutar vigilancia ({enabled.length})
            </HintButton>
          </div>
        }
      />

      {!canScan && (
        <div className="fb-readonly-note" data-testid="scan-readonly">
          <Icon name="info" size={16} />
          <span>Modo consulta: {noScan} Puede revisar la cola, el registro y la programación.</span>
        </div>
      )}

      <PhaseGuide
        phase="Fase 1 · Identificación"
        hint={GLOSSARY.vigilancia}
        tasks={[
          "Priorice las fuentes de nivel A y B: ClinicalTrials, openFDA, Health Canada, EMA, PubMed y TGA.",
          "La sonda corre antes de cada corrida de contrato. Ámbar o rojo suspende esa fuente, no el resto.",
          "Las señales nuevas llegan a la bandeja de entrada; el nivel D no pisa campos ya llenados por A/B.",
        ]}
        nextLabel="Bandeja de entrada"
        onNext={() => navigate("/bandeja-entrada")}
      />

      <ModuleStatsRow
        items={[
          { label: "Referentes vigilados", value: enabled.length, sub: `${sources.length} en inventario`, hint: GLOSSARY.fb_ingesta },
          { label: "Señales capturadas", value: totalSignals, sub: "Total acumulado", hint: "Señales que ya produjeron las fuentes vigiladas, desde siempre." },
          { label: "Sin rastrear >7 días", value: staleCount, sub: "Requieren vigilancia", color: staleCount > 0 ? "#F59E0B" : undefined, hint: "Fuentes activas que no se consultan hace más de una semana (o nunca). Puede ser normal si su frecuencia es mensual." },
          { label: "Último lote nuevo", value: lastNew, sub: "Señales en el último rastreo", color: lastNew > 0 ? "#10B981" : undefined, hint: "Señales nuevas que trajo el rastreo más reciente del registro." },
        ]}
      />

      <div className="fb-schedule-grid" style={{ marginBottom: 16 }}>
        <Card padding={18} className="fb-schedule-card">
          <h4>
            <Icon name="clock" size={16} /> Vigilancia programada
            <InfoTip text={GLOSSARY.fb_programada} label="Qué es la vigilancia programada" />
          </h4>
          {scanTask ? (
            <>
              <dl className="fb-schedule-meta" data-testid="scan-schedule">
                <dt>Estado</dt>
                <dd>{scanTask.enabled ? <Badge tone="ok">Activa</Badge> : <Badge tone="viewer">Apagada</Badge>}</dd>
                <dt>Cada</dt>
                <dd>{scanTask.interval_hours} h <InfoTip text={GLOSSARY.fb_intervalo_vigilancia} /></dd>
                <dt>Próxima</dt>
                <dd>{scanTask.enabled ? nextRun(scanTask.next_run_at) : "—"}</dd>
                <dt>Última</dt>
                <dd>
                  {scanTask.last_run ? (
                    <>
                      <Badge tone={RUN_TONE[scanTask.last_run.status]}>{RUN_LABELS[scanTask.last_run.status] || scanTask.last_run.status}</Badge>{" "}
                      {when(scanTask.last_run.started_at)}
                    </>
                  ) : (
                    "Aún no ha corrido"
                  )}
                </dd>
                <dt>Worker <InfoTip text={GLOSSARY.fb_worker} /></dt>
                <dd>{schedule.worker_running ? "En marcha" : schedule.worker_enabled ? "Detenido" : "Deshabilitado en este servidor"}</dd>
              </dl>
              {scanTask.last_run?.message && <p style={{ fontSize: 12.5, color: "#64748B", margin: "0 0 10px" }}>{scanTask.last_run.message}</p>}
              <div className="fb-toolbar">
                <HintButton
                  size="sm"
                  variant="outline"
                  loading={runningScheduled}
                  disabled={!canScan}
                  hint="Corre ya la vigilancia programada: encola solo las fuentes cuya frecuencia venció."
                  disabledHint={noScan}
                  onClick={runScheduledNow}
                >
                  Ejecutar ahora
                </HintButton>
                <HintButton
                  size="sm"
                  variant="ghost"
                  disabled={!canConfig}
                  hint="Cambiar el intervalo o apagar la tarea"
                  disabledHint="Solo el superadministrador cambia la programación (permiso config:manage)."
                  onClick={() => navigate("/configuracion?tab=programacion")}
                >
                  Configurar
                </HintButton>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "#64748B" }}>No se pudo leer la programación.</p>
          )}
        </Card>

        <Card padding={18} className="fb-schedule-card">
          <h4>
            <Icon name="eye" size={16} /> Vista previa de un enlace
            <InfoTip text={GLOSSARY.fb_vista_previa} label="Qué es la vista previa" />
          </h4>
          <form onSubmit={runPreview} className="fb-inline-row" style={{ marginTop: 10 }}>
            <Input id="preview-url" placeholder="https://..." aria-label="URL a previsualizar" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} style={{ marginBottom: 0 }} />
            <div style={{ flex: "0 0 auto", marginBottom: 14 }}>
              <HintButton type="submit" variant="outline" loading={previewing} disabled={!canScan} hint={GLOSSARY.fb_vista_previa} disabledHint={noScan}>
                Previsualizar
              </HintButton>
            </div>
          </form>
          <LinkPreview data={preview} />
        </Card>
      </div>

      <Card
        title={
          <span className="term-label">
            Cola de ingesta <InfoTip text={GLOSSARY.fb_cola} label="Qué es la cola de ingesta" />
          </span>
        }
        actions={<Button size="sm" variant="ghost" onClick={load}>Actualizar</Button>}
        hint="La extracción no corre en el hilo de la petición: el worker toma los trabajos en orden."
        style={{ marginBottom: 16 }}
      >
        {jobs.length === 0 ? (
          <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>La cola está vacía. Ejecute la vigilancia o espere a la programada.</p>
        ) : (
          <div className="ingest-job-list" data-testid="ingest-jobs">
            {jobs.slice(0, 8).map((job) => (
              <div key={job.id} className="ingest-job-row" title={job.message || ""}>
                <Badge tone={JOB_TONE[job.status] || "warning"}>{JOB_LABELS[job.status] || job.status}</Badge>
                <span className="ingest-job-src">{job.source_title || job.connector}</span>
                <span className="ingest-job-meta">
                  {job.connector} · +{job.items_new}/{job.items_found} · {job.origin === "programado" ? "programado" : "manual"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {running && (
        <Card className="scan-running-banner" padding={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Spinner />
            <div>
              <div style={{ fontWeight: 600 }}>Encolando la vigilancia</div>
              <div style={{ fontSize: 13, color: "#64748B" }}>El worker procesa las fuentes en segundo plano.</div>
            </div>
          </div>
        </Card>
      )}

      <div className="vigilancia-grid">
        <Card padding={0} className="vigilancia-sources-panel">
          <div className="panel-toolbar">
            <SectionTitle
              hint="Fuentes con ingesta activa. Marque varias para rastrearlas juntas."
              right={
                canScan && selected.size > 0 ? (
                  <Button size="sm" onClick={() => runScan([...selected])} loading={running}>
                    Rastrear selección ({selected.size})
                  </Button>
                ) : null
              }
            >
              Referentes en vigilancia
            </SectionTitle>
            <div className="panel-filters">
              <input placeholder="Buscar referente..." aria-label="Buscar referente" value={search} onChange={(e) => setSearch(e.target.value)} className="filter-input" />
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="filter-select" aria-label="Filtrar por categoría">
                <option value="">Todas las categorías</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="source-scan-list">
            {filtered.length === 0 ? (
              <EmptyState
                icon="🌐"
                message={enabled.length === 0 ? "No hay fuentes con ingesta activa." : "No hay referentes que coincidan con la búsqueda."}
                action={<Button onClick={() => navigate("/fuentes")}>Ir al catálogo de fuentes</Button>}
              />
            ) : (
              filtered.map((s) => {
                const tag = ietsTag(s.category);
                const stale = !s.last_scraped_at || Date.now() - new Date(s.last_scraped_at).getTime() > 7 * 86400000;
                return (
                  <div key={s.id} className={`source-scan-card${selected.has(s.id) ? " source-scan-card--selected" : ""}`} data-testid={`scan-source-${s.id}`}>
                    <div className="source-scan-card-main">
                      {canScan && (
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="source-scan-check" aria-label={`Seleccionar ${s.title}`} />
                      )}
                      <div className="source-scan-icon">
                        <Icon name="globe" size={18} />
                      </div>
                      <div className="source-scan-body">
                        <div className="source-scan-title-row">
                          <span className="source-scan-title" title={s.title}>{s.title}</span>
                          {s.catalog_code && <span className="catalog-code">{s.catalog_code}</span>}
                          {s.access_level && <span title={GLOSSARY.fb_nivel}><Badge tone={s.access_level}>Nivel {s.access_level}</Badge></span>}
                          {s.health_status && <span title={GLOSSARY.fb_salud}><Badge tone={s.health_status}>{s.health_status}</Badge></span>}
                          {tag && <Badge tone={tag.tone}>{tag.label}</Badge>}
                        </div>
                        <div className="source-scan-meta">
                          <Badge>{s.category || "Referente"}</Badge>
                          <span title={GLOSSARY.fb_adaptador}>{s.connector && s.connector !== "html" ? s.connector : "HTML"}</span>
                          <span>{s.findings_count || 0} señales</span>
                          {s.circuit_open_until && (
                            <span className="meta-warn" title="Tras varios fallos seguidos la fuente se pausa unas horas para no insistir sobre un servicio caído.">
                              circuito abierto
                            </span>
                          )}
                          <span className={stale ? "meta-warn" : ""}>{s.last_scraped_at ? daysSince(s.last_scraped_at) : "Nunca rastreado"}</span>
                        </div>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="source-scan-url" onClick={(e) => e.stopPropagation()}>
                            {s.url.replace(/^https?:\/\//, "").slice(0, 55)}{s.url.length > 58 ? "…" : ""}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="source-scan-actions">
                      {(s.findings_count || 0) > 0 && (
                        <Button size="sm" variant="ghost" onClick={() => navigate("/senales")}>
                          Ver señales
                        </Button>
                      )}
                      {canScan && (
                        <HintButton size="sm" variant="outline" hint={GLOSSARY.fb_ingerir} loading={scanningId === s.id} onClick={(e) => scanOne(s, e)}>
                          <Icon name="radar" size={14} /> Rastrear
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
              hint="Bitácora de cada rastreo: cuándo corrió, qué fuente, cuántas señales nuevas y detectadas, y el mensaje del adaptador."
              right={
                <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)} className="filter-select" aria-label="Filtrar registro por estado">
                  <option value="">Todos</option>
                  <option value="ok">Ok</option>
                  <option value="parcial">Parcial</option>
                  <option value="error">Error</option>
                </select>
              }
            >
              Registro de vigilancia
            </SectionTitle>
          </div>
          <div className="scan-log-list" data-testid="scan-log">
            {visibleLogs.length === 0 ? (
              <EmptyState
                icon="🕐"
                message={logs.length === 0 ? "Aún no hay rastreos registrados." : "Ningún rastreo con ese estado."}
                action={
                  canScan && enabled.length > 0 && logs.length === 0 ? (
                    <Button onClick={() => runScan(null)} loading={running}>Ejecutar primer rastreo</Button>
                  ) : null
                }
              />
            ) : (
              visibleLogs.slice(0, 25).map((log) => (
                <div key={log.id} className={`scan-log-item scan-log-item--${log.status}`}>
                  <div className="scan-log-head">
                    <Badge tone={log.status}>{JOB_LABELS[log.status] || log.status}</Badge>
                    <time>{new Date(log.started_at).toLocaleString()}</time>
                  </div>
                  <div className="scan-log-source">{log.source_title || "Rastreo masivo"}</div>
                  <p className="scan-log-msg">{log.message}</p>
                  <div className="scan-log-foot">
                    <span>
                      <strong style={{ color: log.items_new > 0 ? "#10B981" : "#64748B" }}>{log.items_new}</strong> nuevas
                      {" · "}
                      {log.items_found} detectadas
                    </span>
                    {log.items_new > 0 && (
                      <button type="button" className="scan-log-link" onClick={() => navigate("/bandeja-entrada")}>
                        Ir a la bandeja →
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {recentErrors > 0 && (
            <div className="scan-log-alert">
              {recentErrors} rastreo(s) con error reciente. Revise la salud de la fuente en el catálogo.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
