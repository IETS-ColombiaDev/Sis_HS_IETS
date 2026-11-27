import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import ClampText from "../components/ClampText";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import Tooltip from "../components/Tooltip";
import { Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import PriorityMatrix from "../components/PriorityMatrix";
import { PERM, TECH_STATUS_LABELS } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import {
  TechLinkNotice,
  buildTechNotice,
  focusElement,
  locateTech,
  resolveTechLink,
  useTechDeepLink,
} from "../utils/techLink";
import { downloadFromApi } from "../utils/download";
import { t, tr, ts, fmtDateTime } from "../i18n";
import "./prioritization.css";

const PAGE_SIZE = 50;

const ORDER_OPTIONS = [
  { value: "cribado", label: t("Orden: puntaje de cribado") },
  { value: "pct", label: t("Orden: %P más alto") },
  { value: "avance", label: t("Orden: más cerca de completar") },
  { value: "recientes", label: t("Orden: calificadas hace poco") },
  { value: "nombre", label: t("Orden: nombre (A-Z)") },
];

const PROGRESS_OPTIONS = [
  { value: "", label: t("Cualquier avance") },
  { value: "incompletas", label: t("Con criterios pendientes") },
  { value: "completas", label: t("Matriz completa") },
];

const HISTORY_ICON = {
  assigned: "inbox",
  apt: "filter",
  rated: "check",
  changed: "edit",
  classified: "chart",
  excluded: "x",
  evaluation: "send",
  published: "book",
};

/** Seis puntos, uno por criterio: verde Sí, gris No, hueco pendiente, ámbar si le toca al perfil. */
function CriteriaDots({ item }) {
  const codes = Object.keys(item.scores || {});
  if (!codes.length) return null;
  const mine = new Set(item.my_missing || []);
  return (
    <span className="prio-dots" role="img" aria-label={t("{n} de {total} criterios calificados", { n: item.rated, total: item.total_criteria })}>
      {codes.map((code) => {
        const value = item.scores[code];
        const state = value === 1 ? "yes" : value === 0 ? "no" : mine.has(code) ? "mine" : "pending";
        const title =
          value === 1 ? t("{codigo}: Sí", { codigo: code })
          : value === 0 ? t("{codigo}: No", { codigo: code })
          : mine.has(code) ? t("{codigo}: pendiente, lo califica su perfil", { codigo: code })
          : t("{codigo}: pendiente", { codigo: code });
        return <span key={code} className={`prio-dot is-${state}`} title={title} />;
      })}
    </span>
  );
}

function History({ cycleId, technologyId, refreshKey }) {
  const [events, setEvents] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setEvents(null);
  }, [technologyId]);
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    api
      .get(`/priority/${cycleId}/${technologyId}/history`)
      .then(({ data }) => !cancelled && setEvents(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setEvents([]));
    return () => {
      cancelled = true;
    };
  }, [open, cycleId, technologyId, refreshKey]);
  return (
    <details className="prio-history-fold" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="prio-history-toggle">
      <summary>
        <Icon name="clock" size={15} /> {t("Recorrido en la matriz")}
        <span>{t("Quién calificó o cambió cada criterio y cuándo")}</span>
      </summary>
      {open &&
        (events == null ? (
          <p className="prio-history-empty">{t("Cargando el recorrido...")}</p>
        ) : events.length === 0 ? (
          <p className="prio-history-empty">{t("Sin eventos registrados.")}</p>
        ) : (
          <ol className="prio-history" data-testid="prio-history">
            {events.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className={`is-${ev.kind}`}>
                <span className="prio-history-dot" aria-hidden="true">
                  <Icon name={HISTORY_ICON[ev.kind] || "info"} size={13} />
                </span>
                <div>
                  <strong>{ts(ev.label)}</strong>
                  <span className="prio-history-meta">
                    {fmtDateTime(ev.at)}
                    {ev.by ? ` · ${ev.by}` : ""}
                  </span>
                  {ev.detail && <p>{ts(ev.detail)}</p>}
                </div>
              </li>
            ))}
          </ol>
        ))}
    </details>
  );
}

/** Avance del ciclo: barra general y una pastilla por criterio. */
function ProgressPanel({ stats }) {
  if (!stats?.criteria?.length || !stats.rateable) return null;
  return (
    <Card className="prio-progress" data-testid="prio-progress">
      <div className="prio-progress-main">
        <div className="prio-progress-head">
          <strong>{t("Avance de la matriz")}</strong>
          <span>
            {t("{n} de {total} tecnologías con los seis criterios", { n: stats.complete, total: stats.rateable })}
            {stats.avg_pct != null ? ` · ${t("%P promedio {pct}%", { pct: stats.avg_pct })}` : ""}
          </span>
        </div>
        <div className="prio-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.progress_pct}>
          <div style={{ width: `${stats.progress_pct}%` }} />
        </div>
        <span className="prio-progress-pct">{stats.progress_pct}%</span>
      </div>
      <ul className="prio-criteria">
        {stats.criteria.map((c) => {
          const pct = c.total ? Math.round((c.rated * 100) / c.total) : 0;
          return (
            <li key={c.code} className={`${c.mine ? "is-mine" : ""} ${c.rated >= c.total ? "is-done" : ""}`} data-testid={`prio-crit-${c.code}`}>
              <div className="prio-criteria-top">
                <b>{c.code}</b>
                <span>
                  {c.rated}/{c.total}
                </span>
              </div>
              <div className="prio-criteria-label" title={ts(c.short_label)}>
                {ts(c.short_label)}
              </div>
              <div className="prio-criteria-track">
                <div style={{ width: `${pct}%` }} />
              </div>
              <div className="prio-criteria-foot">
                <span>{t("{n} con Sí", { n: c.yes })}</span>
                {c.mine && <em>{t("Lo califica usted")}</em>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const STATUS_FILTERS = [
  { value: "", label: t("Todos los estados") },
  { value: "filtrada_apta_priorizacion", label: t("Por calificar (aptas)") },
  { value: "priorizada", label: t("Priorizadas") },
  { value: "bajo_vigilancia", label: t("Bajo vigilancia") },
  { value: "no_priorizada", label: t("No priorizadas") },
];

const STATUS_HINT = {
  filtrada_apta_priorizacion: GLOSSARY.filtradas,
  priorizada: GLOSSARY.fa_priorizada,
  bajo_vigilancia: GLOSSARY.fa_bajo_vigilancia,
  no_priorizada: GLOSSARY.fa_no_priorizada,
};

/**
 * Fase 2 de la metodologia dentro de un ciclo: calificacion con la matriz
 * oficial P1 a P6. El puntaje de cribado solo ordena la cola.
 *
 * La cola pagina en el servidor (P5-2): con cientos de tecnologias la lista se
 * busca y se filtra sin dibujarla completa.
 */
export default function Prioritization() {
  const [queue, setQueue] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);
  const [activeId, setActiveId] = useState(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clusterFilter, setClusterFilter] = useState("");
  const [order, setOrder] = useState("cribado");
  const [progress, setProgress] = useState("");
  const [view, setView] = useState("calificar");
  const [exporting, setExporting] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [excluding, setExcluding] = useState(null);
  const [exclusionReasons, setExclusionReasons] = useState({});
  const [exclusionForm, setExclusionForm] = useState({ reason_code: "", note: "" });
  const [sending, setSending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pinned, setPinned] = useState(null);
  const [linkNotice, setLinkNotice] = useState(null);
  const resetActive = useRef(false);
  // Enlace directo ?tecnologia=<id>: tecnologia que la siguiente carga debe ubicar.
  const focusRef = useRef(null);
  const activeRef = useRef(null);

  const { cycle, cycleId, isClosed, setCycleId } = useCycle();
  const { techId, invalidParam, setTechId } = useTechDeepLink();
  const { can, rateableCriteria } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const canScreen = can(PERM.SCREENING_WRITE);
  const canEvaluate = can(PERM.TECHNOLOGY_WRITE);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Un filtro nuevo vuelve a la primera pagina y a su primer elemento.
  useEffect(() => {
    resetActive.current = true;
    setPage(0);
  }, [search, statusFilter, clusterFilter, onlyMine, cycleId, order, progress]);
  useEffect(() => {
    resetActive.current = true;
  }, [page]);

  const load = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    try {
      const params = { only_pending: onlyMine, limit: PAGE_SIZE, offset: page * PAGE_SIZE, order };
      if (progress) params.progress = progress;
      if (focusRef.current) params.focus = focusRef.current;
      if (search) params.q = search;
      if (statusFilter) params.status = statusFilter;
      if (clusterFilter) params.cluster_id = clusterFilter;
      const [q, s] = await Promise.all([
        api.get(`/priority/${cycleId}/queue`, { params }),
        api.get(`/priority/${cycleId}/stats`),
      ]);
      setQueue(q.data);
      setTotal(Number(q.headers?.["x-total-count"] ?? q.data.length));
      setStats(s.data);
      const focus = focusRef.current;
      if (focus) {
        if (q.headers?.["x-focus-found"] === "1") {
          const wanted = Math.floor(Number(q.headers?.["x-offset"] || 0) / PAGE_SIZE);
          if (wanted !== page) {
            // La tecnologia vive en otra pagina: se salta a ella y la proxima carga la abre.
            setPage(wanted);
            return;
          }
          focusRef.current = null;
          resetActive.current = false;
          setActiveId(focus);
          focusElement(`prio-item-${focus}`);
          return;
        }
        focusRef.current = null;
        setLinkNotice({
          tone: "info",
          message: t("La tecnología #{id} no aparece en la cola de priorización de {ciclo}.", {
            id: focus,
            ciclo: cycle?.code || t("este ciclo"),
          }),
          actions: [],
        });
      }
      const reset = resetActive.current;
      resetActive.current = false;
      setActiveId((current) => {
        if (current && q.data.some((i) => i.technology_id === current)) return current;
        // Tras calificar, la tecnologia puede dejar de coincidir con el filtro
        // (t("Solo lo que me toca")); se mantiene en pantalla para ver su %P hasta
        // que el usuario cambie de filtro, de pagina o elija otra.
        if (!reset && current) return current;
        return q.data[0]?.technology_id || null;
      });
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudo cargar la cola de priorización")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, onlyMine, page, search, statusFilter, clusterFilter, order, progress]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    api
      .get("/methodology/enums")
      .then(({ data }) => setExclusionReasons(data.exclusion_reasons || {}))
      .catch(() => {});
    api
      .get("/clusters")
      .then(({ data }) => setClusters(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const found = useMemo(
    () => queue.find((i) => i.technology_id === activeId) || null,
    [queue, activeId]
  );
  useEffect(() => {
    if (found) setPinned(found);
  }, [found]);
  const active = found || (pinned && pinned.technology_id === activeId ? pinned : null);
  const outOfFilter = Boolean(active && !found);
  activeRef.current = activeId;

  // Enlace directo: ubica la tecnologia aunque este en otra pagina o fuera del
  // filtro t("Solo lo que me toca"); si no es de este ciclo, lo dice y ofrece cambiar.
  useEffect(() => {
    if (invalidParam) {
      setLinkNotice({ tone: "warn", message: t("El enlace de tecnología no es válido."), actions: [] });
      return;
    }
    if (!techId || !cycleId || techId === activeRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const loc = await locateTech(api, techId);
        if (cancelled) return;
        const res = resolveTechLink(loc, {
          cycleId,
          accepts: (status) =>
            ["filtrada_apta_priorizacion", "priorizada", "bajo_vigilancia", "no_priorizada"].includes(status),
        });
        if (res.kind !== "ok") {
          setLinkNotice(buildTechNotice(res, { id: techId, page: "priorizacion", cycle, setCycleId, navigate }));
          return;
        }
        setLinkNotice(null);
        focusRef.current = techId;
        // Si algun filtro cambia, su efecto recarga la cola; si no, se recarga aqui.
        const filtered = onlyMine || searchText || search || statusFilter || clusterFilter || progress;
        setView("calificar");
        setOnlyMine(false);
        setSearchText("");
        setSearch("");
        setStatusFilter("");
        setClusterFilter("");
        setProgress("");
        if (!filtered) load();
      } catch (e) {
        toast.error(apiError(e, t("No se pudo abrir la tecnología del enlace")));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techId, cycleId, invalidParam]);

  const selectItem = (id) => {
    focusRef.current = null;
    setLinkNotice(null);
    setActiveId(id);
    setTechId(id);
  };

  const position = queue.findIndex((i) => i.technology_id === activeId);
  const step = (delta) => {
    const next = queue[position + delta];
    if (next) selectItem(next.technology_id);
  };
  // La siguiente que espera una respuesta de este perfil, empezando después de la abierta.
  const nextMine = useMemo(() => {
    const rest = [...queue.slice(position + 1), ...queue.slice(0, Math.max(position, 0))];
    return rest.find((i) => i.pending_for_me && i.technology_id !== activeId) || null;
  }, [queue, position, activeId]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, `/priority/${cycleId}/export.csv`, `priorizacion_${cycle?.code || cycleId}.csv`);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descargar la matriz")));
    } finally {
      setExporting(false);
    }
  };

  const onRated = (state) => {
    setHistoryKey((k) => k + 1);
    if (state?.complete && pinned && pinned.technology_id === activeId) {
      setPinned((p) => ({ ...p, status: state.classification, priority_pct: state.priority_pct, points: state.points }));
    }
    load();
  };

  const submitExclusion = async () => {
    setSaving(true);
    try {
      await api.post(
        `/technologies/${excluding.technology_id}/cycles/${cycleId}/exclude`,
        exclusionForm
      );
      toast.success(t("Tecnología excluida con causa registrada."));
      setExcluding(null);
      resetActive.current = true;
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo excluir")));
    } finally {
      setSaving(false);
    }
  };

  const sendToEvaluation = async () => {
    setSaving(true);
    try {
      await api.post(`/technologies/${sending.technology_id}/cycles/${cycleId}/to-evaluation`);
      toast.success(t("Pasa a evaluación temprana. El expediente ya está abierto en Evaluación."));
      setSending(null);
      resetActive.current = true;
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo enviar a evaluación")));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label={t("Cargando priorización...")} />;

  if (!cycleId) {
    return (
      <div>
        <PageHeader
          title={t("Priorización")}
          titleHint={GLOSSARY.priorizacion}
          subtitle={t("La priorización ocurre siempre dentro de un ciclo operativo.")}
        />
        <Card>
          <EmptyState
            icon="🗓️"
            title={t("Seleccione un ciclo")}
            message={t("La matriz P1 a P6 califica tecnologías asignadas a un ciclo. Cree o seleccione uno para comenzar.")}
            action={<Button onClick={() => navigate("/ciclos")}>{t("Ir a ciclos")}</Button>}
          />
        </Card>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const filtered = Boolean(search || statusFilter || clusterFilter || onlyMine || progress);
  const clearFilters = () => {
    setSearchText("");
    setStatusFilter("");
    setClusterFilter("");
    setProgress("");
    setOnlyMine(false);
  };
  const toolbar = (
    <div className="fa-toolbar">
      <input
        type="search"
        aria-label={t("Buscar en la cola de priorización")}
        placeholder={t("Buscar por nombre, DCI o indicación...")}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        data-testid="prio-search"
      />
      <div className="fa-toolbar-row">
        <select
          aria-label={t("Filtrar por estado")}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="prio-status"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select aria-label={t("Filtrar por clúster")} value={clusterFilter} onChange={(e) => setClusterFilter(e.target.value)}>
          <option value="">{t("Todos los clústeres")}</option>
          {clusters.map((c) => (
            <option key={c.id} value={c.id}>
              {ts(c.name)}
            </option>
          ))}
        </select>
      </div>
      <div className="fa-toolbar-row">
        <select aria-label={t("Filtrar por avance")} value={progress} onChange={(e) => setProgress(e.target.value)} data-testid="prio-progress-filter">
          {PROGRESS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select aria-label={t("Ordenar la cola")} value={order} onChange={(e) => setOrder(e.target.value)} data-testid="prio-order">
          {ORDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
  const emptyQueue = (
    <div style={{ padding: 16 }}>
      <EmptyState
        icon="🧮"
        title={
          filtered
            ? onlyMine && !search && !statusFilter && !clusterFilter && !progress
              ? t("Nada pendiente para su perfil")
              : t("Sin resultados")
            : t("No hay tecnologías en la cola")
        }
        message={
          filtered
            ? t("Ninguna tecnología coincide con los filtros actuales.")
            : t("Asigne señales al ciclo desde la bandeja de entrada y márquelas como aptas en Filtrado y depuración.")
        }
        action={
          filtered ? (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              {t("Limpiar filtros")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => navigate("/filtrado")}>
              {t("Ir a filtrado")}
            </Button>
          )
        }
      />
    </div>
  );
  const pager = total > 0 && (
    <div className="fa-pager" data-testid="prio-pager">
      <span>{t("{from}-{to} de {total}", { from, to, total })}</span>
      <span style={{ display: "flex", gap: 6 }}>
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          {t("Anterior")}
        </button>
        <span style={{ alignSelf: "center" }}>{t("Página {n} de {total}", { n: page + 1, total: pages })}</span>
        <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} data-testid="prio-next-page">
          {t("Siguiente")}
        </button>
      </span>
    </div>
  );
  const codes = stats?.criteria?.map((c) => c.code) || [];

  return (
    <div>
      <PageHeader
        title={t("Priorización")}
        titleHint={GLOSSARY.priorizacion}
        subtitle={t(
          "Matriz oficial de seis criterios binarios en {ciclo}. El índice %P solo se calcula cuando los seis criterios están validados por los perfiles habilitados.",
          { ciclo: cycle?.code }
        )}
        actions={
          <>
            <div className="prio-view" role="group" aria-label={t("Vista de la priorización")}>
              <button type="button" aria-pressed={view === "calificar"} onClick={() => setView("calificar")} data-testid="prio-view-rate">
                <Icon name="list" size={15} /> {t("Calificar")}
              </button>
              <button type="button" aria-pressed={view === "matriz"} onClick={() => setView("matriz")} data-testid="prio-view-matrix">
                <Icon name="layers" size={15} /> {t("Matriz del ciclo")}
              </button>
            </div>
            <HintButton
              variant={onlyMine ? "primary" : "secondary"}
              onClick={() => setOnlyMine((v) => !v)}
              hint={GLOSSARY.fa_solo_mio}
              data-testid="prio-only-mine"
            >
              <Icon name="filter" size={16} />
              {onlyMine ? t("Viendo lo mío") : t("Solo lo que me toca")}
            </HintButton>
            <HintButton
              variant="secondary"
              onClick={exportCsv}
              loading={exporting}
              disabled={!stats?.rateable}
              disabledHint={t("Aún no hay tecnologías en la matriz de este ciclo.")}
              hint={t("Descarga la matriz completa del ciclo: respuesta de cada criterio, quién la dio, cuándo y su justificación. La descarga queda en la bitácora.")}
              data-testid="prio-export"
            >
              <Icon name="doc" size={16} /> {t("Exportar CSV")}
            </HintButton>
          </>
        }
      />

      <PhaseGuide
        phase={t("Fase 2 · Priorización")}
        hint={GLOSSARY.priorizacion}
        tasks={[
          t("Su perfil califica: {criterios}.", {
            criterios: rateableCriteria.length ? rateableCriteria.join(", ") : t("ningún criterio (solo consulta)"),
          }),
          t("Excluya con causa tipificada lo que no debe seguir en el ciclo."),
          t("El estado se asigna solo (priorizada, bajo vigilancia o no priorizada) al completar los seis criterios."),
          t("Pase las priorizadas a evaluación temprana."),
        ]}
        nextLabel={t("Evaluación temprana")}
        onNext={() => navigate("/evaluacion")}
      />

      {stats && (
        <ModuleStatsRow
          items={[
            { label: t("En cola##tecnologias"), value: stats.rateable, hint: GLOSSARY.fa_en_cola },
            {
              label: t("Pendientes"),
              value: stats.pending,
              color: stats.pending ? "#D97706" : undefined,
              hint: GLOSSARY.fa_pendientes,
            },
            {
              label: t("Le tocan a usted"),
              value: stats.pending_for_me,
              color: stats.pending_for_me ? "#2563EB" : undefined,
              sub: rateableCriteria.length ? rateableCriteria.join(", ") : t("Solo consulta"),
              hint: t("Tecnologías de la cola a las que les falta un criterio que su perfil puede calificar."),
              testId: "prio-kpi-mine",
            },
            {
              label: t("Priorizadas"),
              value: stats.prioritized,
              color: "#059669",
              sub: stats.prioritized ? t("Listas para evaluación") : undefined,
              hint: GLOSSARY.fa_priorizada,
            },
            { label: t("Bajo vigilancia"), value: stats.watchlist, color: "#D97706", hint: GLOSSARY.fa_bajo_vigilancia },
            { label: t("No priorizadas"), value: stats.not_prioritized, hint: GLOSSARY.fa_no_priorizada },
            {
              label: t("Ya en evaluación"),
              value: stats.in_evaluation,
              color: stats.in_evaluation ? "#7C3AED" : undefined,
              sub: stats.excluded ? t("{n} excluida(s) del ciclo", { n: stats.excluded }) : undefined,
              hint: t("Tecnologías que salieron de la matriz hacia evaluación temprana o ya están publicadas. Su calificación quedó fija."),
            },
          ]}
        />
      )}

      <ProgressPanel stats={stats} />

      <TechLinkNotice notice={linkNotice} onClose={() => setLinkNotice(null)} />

      {isClosed && (
        <div className="fa-notice fa-notice--ok">
          <div>
            {tr(
              "<b>Ciclo cerrado.</b> Los puntajes están congelados y la matriz es de solo lectura. Una reevaluación se hace en un ciclo posterior.",
              null,
              { b: (c) => <strong>{c}</strong> }
            )}
          </div>
        </div>
      )}

      {view === "matriz" ? (
        <Card padding={0} style={{ overflow: "hidden" }} data-testid="prio-matrix-view">
          <div className="prio-list-head">{t("Matriz del ciclo · {total} tecnología(s)", { total })}</div>
          {toolbar}
          {queue.length === 0 ? (
            emptyQueue
          ) : (
            <div className="prio-table-wrap">
              <table className="prio-table" data-testid="prio-matrix-table">
                <thead>
                  <tr>
                    <th scope="col">{t("Tecnología")}</th>
                    {codes.map((code) => (
                      <th key={code} scope="col" className="is-crit">
                        {code}
                      </th>
                    ))}
                    <th scope="col" className="is-num">{t("Puntos")}</th>
                    <th scope="col" className="is-num">%P</th>
                    <th scope="col">{t("Estado")}</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((item) => (
                    <tr key={item.technology_id} data-testid={`prio-row-${item.technology_id}`}>
                      <th scope="row">
                        <button
                          type="button"
                          className="prio-table-name"
                          onClick={() => {
                            selectItem(item.technology_id);
                            setView("calificar");
                          }}
                          title={t("Abrir para calificar")}
                        >
                          <ClampText text={item.name} lines={2} />
                        </button>
                        <span className="prio-table-meta">
                          {item.cluster_name || t("Sin clúster")}
                          {item.pending_for_me ? <em>{t("Le toca")}</em> : null}
                        </span>
                      </th>
                      {codes.map((code) => {
                        const value = item.scores?.[code];
                        const mine = (item.my_missing || []).includes(code);
                        return (
                          <td key={code} className={`is-crit ${value === 1 ? "is-yes" : value === 0 ? "is-no" : mine ? "is-mine" : "is-pending"}`}>
                            {value === 1 ? t("Sí") : value === 0 ? t("No") : "·"}
                          </td>
                        );
                      })}
                      <td className="is-num">{item.points ?? `${item.rated}/${item.total_criteria}`}</td>
                      <td className="is-num">
                        {item.priority_pct != null ? <strong>{item.priority_pct}%</strong> : <span className="prio-table-dash">-</span>}
                      </td>
                      <td>
                        <Badge tone={item.status}>{TECH_STATUS_LABELS[item.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pager}
        </Card>
      ) : (
      <div className="prio-layout">
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div className="prio-list-head">{t("Cola del ciclo · {total} tecnología(s)", { total })}</div>
          {toolbar}
          {queue.length === 0 ? (
            emptyQueue
          ) : (
            <div className="prio-list" data-testid="prio-queue">
              {queue.map((item) => (
                <button
                  key={item.technology_id}
                  type="button"
                  className={`prio-item ${item.technology_id === activeId ? "prio-item-active" : ""}`}
                  onClick={() => selectItem(item.technology_id)}
                  data-testid={`prio-item-${item.technology_id}`}
                >
                  <ClampText className="prio-item-name" text={item.name} lines={3} />
                  <div className="prio-item-meta">
                    {item.cluster_name || t("Sin clúster")} · {ts(item.tech_type_name) || t("Sin tipología")}
                  </div>
                  <CriteriaDots item={item} />
                  <div className="prio-item-foot">
                    <Badge tone={item.status}>{TECH_STATUS_LABELS[item.status]}</Badge>
                    {item.priority_pct != null ? (
                      <span className="prio-item-pct" title={t("{puntos} de {total} puntos", { puntos: item.points, total: item.total_criteria })}>
                        {item.priority_pct}%
                      </span>
                    ) : (
                      <span className="prio-item-progress" title={t("Criterios calificados de seis")}>
                        {item.rated}/{item.total_criteria}
                      </span>
                    )}
                    {item.pending_for_me && (
                      <span className="prio-item-flag" title={GLOSSARY.fa_le_toca}>
                        {t("Le toca")}
                      </span>
                    )}
                    {item.carried_from_cycle_id && (
                      <span className="prio-item-progress" title={GLOSSARY.fa_arrastrada}>
                        {t("Arrastrada")}
                        {item.previous_priority_pct != null
                          ? ` · ${t("antes {pct}%", { pct: item.previous_priority_pct })}`
                          : ""}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {pager}
        </Card>

        <div>
          {active ? (
            <Card>
              <div className="prio-detail-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <ClampText
                    as="h2"
                    className="prio-detail-title"
                    text={active.name}
                    lines={3}
                    expandable
                    testId="prio-detail-title"
                  />
                  <div className="prio-detail-meta prio-chips">
                    <Tooltip text={STATUS_HINT[active.status]}>
                      <span>
                        <Badge tone={active.status}>{TECH_STATUS_LABELS[active.status]}</Badge>
                      </span>
                    </Tooltip>
                    <span className="prio-chip">{active.cluster_name || t("Sin clúster")}</span>
                    <span className="prio-chip">{ts(active.tech_type_name) || t("Sin tipología")}</span>
                    {active.condition ? <span className="prio-chip">{active.condition}</span> : null}
                    <Tooltip text={GLOSSARY.cribado}>
                      <span className="prio-chip is-soft">{t("Cribado {puntaje}", { puntaje: active.screening_score })}</span>
                    </Tooltip>
                    {active.carried_from_cycle_id ? (
                      <Tooltip text={GLOSSARY.fa_arrastrada}>
                        <span className="prio-chip is-soft">
                          {t("Arrastrada")}
                          {active.previous_priority_pct != null ? ` · ${t("antes {pct}%", { pct: active.previous_priority_pct })}` : ""}
                        </span>
                      </Tooltip>
                    ) : null}
                  </div>
                </div>
                <div className="prio-detail-actions">
                  {canScreen && !isClosed && (
                    <HintButton
                      variant="secondary"
                      size="sm"
                      hint={GLOSSARY.fa_excluir}
                      onClick={() => {
                        setExcluding(active);
                        setExclusionForm({ reason_code: "", note: "" });
                      }}
                      data-testid="prio-exclude"
                    >
                      {t("Excluir")}
                    </HintButton>
                  )}
                  {canEvaluate && !isClosed && (
                    <HintButton
                      size="sm"
                      disabled={active.status !== "priorizada"}
                      disabledHint={
                        active.status === "filtrada_apta_priorizacion"
                          ? t("Complete los seis criterios: solo las priorizadas (4 o más puntos) pasan a evaluación.")
                          : t("Solo las priorizadas (4 o más puntos) pasan a evaluación temprana.")
                      }
                      hint={GLOSSARY.fa_pasar_evaluacion}
                      onClick={() => setSending(active)}
                      data-testid="prio-to-evaluation"
                    >
                      {t("Pasar a evaluación")}
                    </HintButton>
                  )}
                </div>
              </div>

              {outOfFilter && (
                <div className="fa-notice fa-notice--info" data-testid="prio-out-of-filter">
                  {t("La calificación quedó registrada. Esta tecnología ya no coincide con los filtros de la cola; se mantiene en pantalla hasta que elija otra.")}
                </div>
              )}
              <PriorityMatrix
                cycleId={cycleId}
                technologyId={active.technology_id}
                onChange={onRated}
              />
              <History cycleId={cycleId} technologyId={active.technology_id} refreshKey={historyKey} />
              {found && queue.length > 1 && (
                <div className="prio-nav" data-testid="prio-nav">
                  <Button variant="secondary" size="sm" disabled={position <= 0} onClick={() => step(-1)}>
                    {t("Anterior")}
                  </Button>
                  <span>{t("{n} de {total} en esta página", { n: position + 1, total: queue.length })}</span>
                  {nextMine && (
                    <Button size="sm" onClick={() => selectItem(nextMine.technology_id)} data-testid="prio-next-mine">
                      {t("Siguiente que me toca")}
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" disabled={position + 1 >= queue.length} onClick={() => step(1)}>
                    {t("Siguiente")}
                  </Button>
                </div>
              )}
            </Card>
          ) : (
            <Card>
              <EmptyState
                title={t("Seleccione una tecnología")}
                message={t("Elija un elemento de la cola para calificar sus criterios.")}
              />
            </Card>
          )}
        </div>
      </div>
      )}

      <ConfirmDialog
        open={Boolean(sending)}
        onClose={() => setSending(null)}
        onConfirm={sendToEvaluation}
        loading={saving}
        title={t("Pasar a evaluación temprana")}
        confirmVariant="primary"
        confirmLabel={t("Pasar a evaluación")}
        message={t(
          "{nombre} sale de la matriz con {puntos} puntos y se abre su expediente. Su calificación queda fija para este ciclo.",
          { nombre: (sending?.name || "").slice(0, 120), puntos: sending?.points ?? "-" }
        )}
      />

      <Modal
        open={Boolean(excluding)}
        onClose={() => setExcluding(null)}
        title={t("Excluir del ciclo")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcluding(null)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              variant="danger"
              onClick={submitExclusion}
              loading={saving}
              disabled={!exclusionForm.reason_code}
              disabledHint={t("Seleccione el motivo tipificado: es obligatorio.")}
              data-testid="prio-exclude-confirm"
            >
              {t("Excluir")}
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
          {t("La causa de exclusión es obligatoria y no editable una vez registrada. Queda con marca de tiempo y evaluador en la bitácora inmutable.")}
        </p>
        <Select
          id="prio-exclusion-reason"
          label={t("Motivo tipificado")}
          required
          value={exclusionForm.reason_code}
          onChange={(e) => setExclusionForm({ ...exclusionForm, reason_code: e.target.value })}
        >
          <option value="">{t("Seleccione un motivo...")}</option>
          {Object.entries(exclusionReasons).map(([code, label]) => (
            <option key={code} value={code}>
              {ts(label)}
            </option>
          ))}
        </Select>
        <Textarea
          id="prio-exclusion-note"
          label={t("Observación")}
          rows={3}
          value={exclusionForm.note}
          onChange={(e) => setExclusionForm({ ...exclusionForm, note: e.target.value })}
        />
      </Modal>
    </div>
  );
}
