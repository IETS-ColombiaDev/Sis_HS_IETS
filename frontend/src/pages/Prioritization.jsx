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

const PAGE_SIZE = 50;

const STATUS_FILTERS = [
  { value: "", label: "Todos los estados" },
  { value: "filtrada_apta_priorizacion", label: "Por calificar (aptas)" },
  { value: "priorizada", label: "Priorizadas" },
  { value: "bajo_vigilancia", label: "Bajo vigilancia" },
  { value: "no_priorizada", label: "No priorizadas" },
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
  const [activeId, setActiveId] = useState(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clusterFilter, setClusterFilter] = useState("");
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
    const t = setTimeout(() => setSearch(searchText.trim()), 300);
    return () => clearTimeout(t);
  }, [searchText]);

  // Un filtro nuevo vuelve a la primera pagina y a su primer elemento.
  useEffect(() => {
    resetActive.current = true;
    setPage(0);
  }, [search, statusFilter, clusterFilter, onlyMine, cycleId]);
  useEffect(() => {
    resetActive.current = true;
  }, [page]);

  const load = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    try {
      const params = { only_pending: onlyMine, limit: PAGE_SIZE, offset: page * PAGE_SIZE };
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
          message: `La tecnología #${focus} no aparece en la cola de priorización de ${cycle?.code || "este ciclo"}.`,
          actions: [],
        });
      }
      const reset = resetActive.current;
      resetActive.current = false;
      setActiveId((current) => {
        if (current && q.data.some((i) => i.technology_id === current)) return current;
        // Tras calificar, la tecnologia puede dejar de coincidir con el filtro
        // ("Solo lo que me toca"); se mantiene en pantalla para ver su %P hasta
        // que el usuario cambie de filtro, de pagina o elija otra.
        if (!reset && current) return current;
        return q.data[0]?.technology_id || null;
      });
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la cola de priorización"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, onlyMine, page, search, statusFilter, clusterFilter]);

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
  // filtro "Solo lo que me toca"; si no es de este ciclo, lo dice y ofrece cambiar.
  useEffect(() => {
    if (invalidParam) {
      setLinkNotice({ tone: "warn", message: "El enlace de tecnología no es válido.", actions: [] });
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
        const filtered = onlyMine || searchText || search || statusFilter || clusterFilter;
        setOnlyMine(false);
        setSearchText("");
        setSearch("");
        setStatusFilter("");
        setClusterFilter("");
        if (!filtered) load();
      } catch (e) {
        toast.error(apiError(e, "No se pudo abrir la tecnología del enlace"));
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

  const onRated = (state) => {
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
      toast.success("Tecnología excluida con causa registrada.");
      setExcluding(null);
      resetActive.current = true;
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo excluir"));
    } finally {
      setSaving(false);
    }
  };

  const sendToEvaluation = async () => {
    setSaving(true);
    try {
      await api.post(`/technologies/${sending.technology_id}/cycles/${cycleId}/to-evaluation`);
      toast.success("Pasa a evaluación temprana. El expediente ya está abierto en Evaluación.");
      setSending(null);
      resetActive.current = true;
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo enviar a evaluación"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando priorización..." />;

  if (!cycleId) {
    return (
      <div>
        <PageHeader
          title="Priorización"
          titleHint={GLOSSARY.priorizacion}
          subtitle="La priorización ocurre siempre dentro de un ciclo operativo."
        />
        <Card>
          <EmptyState
            icon="🗓️"
            title="Seleccione un ciclo"
            message="La matriz P1 a P6 califica tecnologías asignadas a un ciclo. Cree o seleccione uno para comenzar."
            action={<Button onClick={() => navigate("/ciclos")}>Ir a ciclos</Button>}
          />
        </Card>
      </div>
    );
  }

  const filtered = Boolean(search || statusFilter || clusterFilter || onlyMine);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Priorización"
        titleHint={GLOSSARY.priorizacion}
        subtitle={`Matriz oficial de seis criterios binarios en ${cycle?.code}. El índice %P solo se calcula cuando los seis criterios están validados por los perfiles habilitados.`}
        actions={
          <HintButton
            variant={onlyMine ? "primary" : "secondary"}
            onClick={() => setOnlyMine((v) => !v)}
            hint={GLOSSARY.fa_solo_mio}
            data-testid="prio-only-mine"
          >
            <Icon name="filter" size={16} />
            {onlyMine ? "Viendo lo mío" : "Solo lo que me toca"}
          </HintButton>
        }
      />

      <PhaseGuide
        phase="Fase 2 · Priorización"
        hint={GLOSSARY.priorizacion}
        tasks={[
          `Su perfil califica: ${rateableCriteria.length ? rateableCriteria.join(", ") : "ningún criterio (solo consulta)"}.`,
          "Excluya con causa tipificada lo que no debe seguir en el ciclo.",
          "El estado se asigna solo (priorizada, bajo vigilancia o no priorizada) al completar los seis criterios.",
          "Pase las priorizadas a evaluación temprana.",
        ]}
        nextLabel="Evaluación temprana"
        onNext={() => navigate("/evaluacion")}
      />

      {stats && (
        <ModuleStatsRow
          items={[
            { label: "En cola", value: stats.rateable, hint: GLOSSARY.fa_en_cola },
            {
              label: "Pendientes",
              value: stats.pending,
              color: stats.pending ? "#D97706" : undefined,
              hint: GLOSSARY.fa_pendientes,
            },
            { label: "Priorizadas", value: stats.prioritized, color: "#059669", hint: GLOSSARY.fa_priorizada },
            { label: "Bajo vigilancia", value: stats.watchlist, color: "#D97706", hint: GLOSSARY.fa_bajo_vigilancia },
            { label: "No priorizadas", value: stats.not_prioritized, hint: GLOSSARY.fa_no_priorizada },
          ]}
        />
      )}

      <TechLinkNotice notice={linkNotice} onClose={() => setLinkNotice(null)} />

      {isClosed && (
        <div className="fa-notice fa-notice--ok">
          <div>
            <strong>Ciclo cerrado.</strong> Los puntajes están congelados y la matriz es de solo
            lectura. Una reevaluación se hace en un ciclo posterior.
          </div>
        </div>
      )}

      <div className="prio-layout">
        <Card padding={0} style={{ overflow: "hidden" }}>
          <div className="prio-list-head">Cola del ciclo · {total} tecnología(s)</div>
          <div className="fa-toolbar">
            <input
              type="search"
              aria-label="Buscar en la cola de priorización"
              placeholder="Buscar por nombre, DCI o indicación..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              data-testid="prio-search"
            />
            <div className="fa-toolbar-row">
              <select
                aria-label="Filtrar por estado"
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
              <select
                aria-label="Filtrar por clúster"
                value={clusterFilter}
                onChange={(e) => setClusterFilter(e.target.value)}
              >
                <option value="">Todos los clústeres</option>
                {clusters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {queue.length === 0 ? (
            <div style={{ padding: 16 }}>
              <EmptyState
                icon="🧮"
                title={
                  filtered
                    ? onlyMine && !search && !statusFilter && !clusterFilter
                      ? "Nada pendiente para su perfil"
                      : "Sin resultados"
                    : "No hay tecnologías en la cola"
                }
                message={
                  filtered
                    ? "Ninguna tecnología coincide con los filtros actuales."
                    : "Asigne señales al ciclo desde la bandeja de entrada y márquelas como aptas en Filtrado y depuración."
                }
                action={
                  filtered ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSearchText("");
                        setStatusFilter("");
                        setClusterFilter("");
                        setOnlyMine(false);
                      }}
                    >
                      Limpiar filtros
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => navigate("/filtrado")}>
                      Ir a filtrado
                    </Button>
                  )
                }
              />
            </div>
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
                    {item.cluster_name || "Sin clúster"} · {item.tech_type_name || "Sin tipología"}
                  </div>
                  <div className="prio-item-foot">
                    <Badge tone={item.status}>{TECH_STATUS_LABELS[item.status]}</Badge>
                    {item.priority_pct != null ? (
                      <span className="prio-item-pct" title={`${item.points} de ${item.total_criteria} puntos`}>
                        {item.priority_pct}%
                      </span>
                    ) : (
                      <span className="prio-item-progress" title="Criterios calificados de seis">
                        {item.rated}/{item.total_criteria}
                      </span>
                    )}
                    {item.pending_for_me && (
                      <span className="prio-item-flag" title={GLOSSARY.fa_le_toca}>
                        Le toca
                      </span>
                    )}
                    {item.carried_from_cycle_id && (
                      <span className="prio-item-progress" title={GLOSSARY.fa_arrastrada}>
                        Arrastrada{item.previous_priority_pct != null ? ` · antes ${item.previous_priority_pct}%` : ""}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {total > 0 && (
            <div className="fa-pager" data-testid="prio-pager">
              <span>
                {from}-{to} de {total}
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Anterior
                </button>
                <span style={{ alignSelf: "center" }}>
                  Página {page + 1} de {pages}
                </span>
                <button
                  type="button"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="prio-next-page"
                >
                  Siguiente
                </button>
              </span>
            </div>
          )}
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
                  <div className="prio-detail-meta">
                    {active.cluster_name || "Sin clúster"} ·{" "}
                    {active.tech_type_name || "Sin tipología"}
                    {active.condition ? ` · ${active.condition}` : ""} ·{" "}
                    <Tooltip text={GLOSSARY.cribado}>
                      <span style={{ textDecoration: "underline dotted" }}>Cribado {active.screening_score}</span>
                    </Tooltip>
                    {" · "}
                    <Tooltip text={STATUS_HINT[active.status]}>
                      <span style={{ textDecoration: "underline dotted" }}>
                        {TECH_STATUS_LABELS[active.status]}
                      </span>
                    </Tooltip>
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
                      Excluir
                    </HintButton>
                  )}
                  {canEvaluate && !isClosed && (
                    <HintButton
                      size="sm"
                      disabled={active.status !== "priorizada"}
                      disabledHint={
                        active.status === "filtrada_apta_priorizacion"
                          ? "Complete los seis criterios: solo las priorizadas (4 o más puntos) pasan a evaluación."
                          : "Solo las priorizadas (4 o más puntos) pasan a evaluación temprana."
                      }
                      hint={GLOSSARY.fa_pasar_evaluacion}
                      onClick={() => setSending(active)}
                      data-testid="prio-to-evaluation"
                    >
                      Pasar a evaluación
                    </HintButton>
                  )}
                </div>
              </div>

              {outOfFilter && (
                <div className="fa-notice fa-notice--info" data-testid="prio-out-of-filter">
                  La calificación quedó registrada. Esta tecnología ya no coincide con los filtros de la
                  cola; se mantiene en pantalla hasta que elija otra.
                </div>
              )}
              <PriorityMatrix
                cycleId={cycleId}
                technologyId={active.technology_id}
                onChange={onRated}
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                title="Seleccione una tecnología"
                message="Elija un elemento de la cola para calificar sus criterios."
              />
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(sending)}
        onClose={() => setSending(null)}
        onConfirm={sendToEvaluation}
        loading={saving}
        title="Pasar a evaluación temprana"
        confirmVariant="primary"
        confirmLabel="Pasar a evaluación"
        message={`${(sending?.name || "").slice(0, 120)} sale de la matriz con ${sending?.points ?? "—"} puntos y se abre su expediente. Su calificación queda fija para este ciclo.`}
      />

      <Modal
        open={Boolean(excluding)}
        onClose={() => setExcluding(null)}
        title="Excluir del ciclo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcluding(null)}>
              Cancelar
            </Button>
            <HintButton
              variant="danger"
              onClick={submitExclusion}
              loading={saving}
              disabled={!exclusionForm.reason_code}
              disabledHint="Seleccione el motivo tipificado: es obligatorio."
              data-testid="prio-exclude-confirm"
            >
              Excluir
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
          La causa de exclusión es obligatoria y no editable una vez registrada. Queda con
          marca de tiempo y evaluador en la bitácora inmutable.
        </p>
        <Select
          id="prio-exclusion-reason"
          label="Motivo tipificado"
          required
          value={exclusionForm.reason_code}
          onChange={(e) => setExclusionForm({ ...exclusionForm, reason_code: e.target.value })}
        >
          <option value="">Seleccione un motivo...</option>
          {Object.entries(exclusionReasons).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
        <Textarea
          id="prio-exclusion-note"
          label="Observación"
          rows={3}
          value={exclusionForm.note}
          onChange={(e) => setExclusionForm({ ...exclusionForm, note: e.target.value })}
        />
      </Modal>
    </div>
  );
}
