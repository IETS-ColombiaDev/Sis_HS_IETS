import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card, SectionTitle } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import { LoadingBlock, Spinner } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { ietsTag } from "../utils/iets";

function daysSince(iso) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  return `Hace ${d} dias`;
}

export default function Scan() {
  const { isEditor } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const [sources, setSources] = useState([]);
  const [logs, setLogs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [running, setRunning] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, l, j] = await Promise.all([
        api.get("/sources"),
        api.get("/scan/logs"),
        api.get("/ingest/jobs", { params: { limit: 12 } }),
      ]);
      setSources(s.data);
      setLogs(l.data);
      setJobs(j.data);
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

  const enabled = sources.filter((s) => s.scrape_enabled);
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

  const totalSignals = enabled.reduce((n, s) => n + (s.findings_count || 0), 0);
  const staleCount = enabled.filter((s) => {
    if (!s.last_scraped_at) return true;
    return Date.now() - new Date(s.last_scraped_at).getTime() > 7 * 86400000;
  }).length;
  const recentErrors = logs.filter((l) => l.status === "error").slice(0, 5).length;
  const lastNew = logs.reduce((m, l) => Math.max(m, l.items_new || 0), 0);

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
      const { data } = await api.post("/ingest/run", {
        source_ids: ids?.length ? ids : [],
        process_now: false,
      });
      toast.success(
        `Vigilancia encolada: ${data.queued} fuente(s). El worker las atiende sin bloquear esta pantalla.`
      );
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar la vigilancia"));
    } finally {
      setRunning(false);
    }
  };

  const scanOne = async (s, e) => {
    e?.stopPropagation();
    setScanningId(s.id);
    try {
      const { data } = await api.post(`/scan/source/${s.id}`);
      toast.success(`${s.title}: ${data.items_new} senales nuevas`);
      load();
    } catch (err) {
      toast.error(apiError(err, "No se pudo escanear"));
    } finally {
      setScanningId(null);
    }
  };

  if (loading) return <LoadingBlock label="Cargando vigilancia..." />;

  return (
    <div>
      <ModuleHeader
        step="identificacion"
        title="Vigilancia de fuentes"
        titleHint={GLOSSARY.vigilancia}
        purpose="Fase 1 · Identificacion: rastreo sistematico de referentes internacionales para capturar senales de tecnologias sanitarias emergentes."
        actions={
          isEditor && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => navigate("/fuentes")}>
                <Icon name="globe" size={16} /> Inventario
              </Button>
              <Tooltip text={`Analiza ${enabled.length} referentes vigilados. Duracion estimada: 1-3 min.`}>
                <Button onClick={() => runScan(null)} loading={running} size="lg">
                  <Icon name="radar" size={17} /> Ejecutar vigilancia ({enabled.length})
                </Button>
              </Tooltip>
            </div>
          )
        }
      />

      <PhaseGuide
        phase="Fase 1 · Identificacion"
        hint={GLOSSARY.vigilancia}
        tasks={[
          "Priorice las fuentes de nivel A y B: ClinicalTrials, openFDA, Health Canada, EMA, PubMed y TGA.",
          "La sonda corre antes de cada corrida de contrato. Ambar o rojo suspende esa fuente, no el resto.",
          "Las senales nuevas llegan a la bandeja de entrada; el nivel D no pisa campos ya llenados por A/B.",
        ]}
        nextLabel="Priorizacion de senales"
        onNext={() => navigate("/priorizacion")}
      />

      <ModuleStatsRow
        items={[
          { label: "Referentes vigilados", value: enabled.length, sub: `${sources.length} en inventario` },
          { label: "Senales capturadas", value: totalSignals, sub: "Total acumulado" },
          { label: "Sin rastrear >7 dias", value: staleCount, sub: "Requieren vigilancia", color: staleCount > 0 ? "#F59E0B" : undefined },
          { label: "Ultimo lote nuevo", value: lastNew, sub: "Senales en ultimo escaneo", color: lastNew > 0 ? "#10B981" : undefined },
        ]}
      />

      {jobs.length > 0 && (
        <Card title="Cola de ingesta" hint="La extraccion ya no corre en el hilo de la peticion." style={{ marginBottom: 16 }}>
          <div className="ingest-job-list">
            {jobs.slice(0, 8).map((job) => (
              <div key={job.id} className="ingest-job-row">
                <Badge tone={job.status === "ok" ? "success" : job.status === "error" ? "danger" : "warning"}>
                  {job.status}
                </Badge>
                <span className="ingest-job-src">{job.source_title || job.connector}</span>
                <span className="ingest-job-meta">
                  {job.connector} · +{job.items_new}/{job.items_found}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {running && (
        <Card className="scan-running-banner" padding={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Spinner />
            <div>
              <div style={{ fontWeight: 600 }}>Vigilancia en curso</div>
              <div style={{ fontSize: 13, color: "#64748B" }}>
                Descargando referentes y extrayendo tecnologias emergentes…
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="vigilancia-grid">
        <Card padding={0} className="vigilancia-sources-panel">
          <div className="panel-toolbar">
            <SectionTitle
              right={
                isEditor && selected.size > 0 ? (
                  <Button size="sm" onClick={() => runScan([...selected])} loading={running}>
                    Rastrear seleccion ({selected.size})
                  </Button>
                ) : null
              }
            >
              Referentes en vigilancia
            </SectionTitle>
            <div className="panel-filters">
              <input
                placeholder="Buscar referente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input"
              />
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="filter-select">
                <option value="">Todas las categorias</option>
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
                message="No hay referentes que coincidan."
                action={
                  isEditor ? (
                    <Button onClick={() => navigate("/fuentes")}>Ir al inventario</Button>
                  ) : null
                }
              />
            ) : (
              filtered.map((s) => {
                const tag = ietsTag(s.category);
                const stale = !s.last_scraped_at || Date.now() - new Date(s.last_scraped_at).getTime() > 7 * 86400000;
                return (
                  <div key={s.id} className={`source-scan-card${selected.has(s.id) ? " source-scan-card--selected" : ""}`}>
                    <div className="source-scan-card-main">
                      {isEditor && (
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)}
                          className="source-scan-check"
                          aria-label={`Seleccionar ${s.title}`}
                        />
                      )}
                      <div className="source-scan-icon">
                        <Icon name="globe" size={18} />
                      </div>
                      <div className="source-scan-body">
                        <div className="source-scan-title-row">
                          <span className="source-scan-title" title={s.title}>{s.title}</span>
                          {s.catalog_code && <span className="catalog-code">{s.catalog_code}</span>}
                          {s.access_level && <Badge tone={s.access_level}>Nivel {s.access_level}</Badge>}
                          {s.health_status && <Badge tone={s.health_status}>{s.health_status}</Badge>}
                          {tag && <Badge tone={tag.tone}>{tag.label}</Badge>}
                        </div>
                        <div className="source-scan-meta">
                          <Badge>{s.category || "Referente"}</Badge>
                          <span>{s.connector && s.connector !== "html" ? s.connector : "HTML"}</span>
                          <span>{s.findings_count || 0} senales</span>
                          {s.circuit_open_until && (
                            <span className="meta-warn">circuito abierto</span>
                          )}
                          <span className={stale ? "meta-warn" : ""}>
                            {s.last_scraped_at ? daysSince(s.last_scraped_at) : "Nunca rastreado"}
                          </span>
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
                        <Button size="sm" variant="ghost" onClick={() => navigate("/priorizacion")}>
                          Ver senales
                        </Button>
                      )}
                      {isEditor && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={scanningId === s.id}
                          onClick={(e) => scanOne(s, e)}
                        >
                          <Icon name="radar" size={14} /> Rastrear
                        </Button>
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
            <SectionTitle>Registro de vigilancia</SectionTitle>
          </div>
          <div className="scan-log-list">
            {logs.length === 0 ? (
              <EmptyState
                icon="🕐"
                message="Aun no hay rastreos registrados."
                action={
                  isEditor && enabled.length > 0 ? (
                    <Button onClick={() => runScan(null)} loading={running}>
                      Ejecutar primer rastreo
                    </Button>
                  ) : null
                }
              />
            ) : (
              logs.slice(0, 25).map((log) => (
                <div key={log.id} className={`scan-log-item scan-log-item--${log.status}`}>
                  <div className="scan-log-head">
                    <Badge tone={log.status}>{log.status}</Badge>
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
                      <button type="button" className="scan-log-link" onClick={() => navigate("/priorizacion")}>
                        Priorizar →
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {recentErrors > 0 && (
            <div className="scan-log-alert">
              {recentErrors} rastreo(s) con error reciente. Verifique conectividad del referente.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
