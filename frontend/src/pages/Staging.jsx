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
import { TermLabel } from "../components/InfoTip";
import Modal from "../components/Modal";
import { Input, Select } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { CONDITION_LABELS, PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import {
  PAGE_LABEL,
  PAGE_PATH,
  TECH_PARAM,
  TechLinkNotice,
  focusElement,
  locateTech,
  pageForStatus,
  useTechDeepLink,
} from "../utils/techLink";

const PAGE_SIZE = 100;

/**
 * Bandeja de entrada del staging (RF04): senales capturadas que aun no
 * pertenecen a ningun ciclo. Antes de arrastrarlas hay que clasificarlas:
 * cluster y tipologia son obligatorios (regla de la fase 1).
 */
export default function Staging() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [types, setTypes] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [filters, setFilters] = useState({ q: "", source_id: "", channel: "" });
  const [query, setQuery] = useState({ q: "", source_id: "", channel: "" });
  const [editing, setEditing] = useState(null);
  const [rawPreview, setRawPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [result, setResult] = useState(null);

  const { can } = useAuth();
  const { cycle, cycleId, isClosed, isHistoric, reload: reloadCycles, setCycleId } = useCycle();
  const { techId, invalidParam, setTechId } = useTechDeepLink();
  const [linkNotice, setLinkNotice] = useState(null);
  const handledLink = useRef(null);
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const canWrite = can(PERM.TECHNOLOGY_WRITE);
  const canAssign = can(PERM.STAGING_ASSIGN);

  // La busqueda espera a que el usuario deje de escribir: antes cada tecla
  // disparaba dos consultas al servidor.
  useEffect(() => {
    const t = setTimeout(() => setQuery(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  const params = useCallback(
    (offset) => {
      const p = { limit: PAGE_SIZE, offset };
      if (query.q) p.q = query.q;
      if (query.source_id) p.source_id = query.source_id;
      if (query.channel) p.channel = query.channel;
      return p;
    },
    [query]
  );

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        api.get("/technologies/staging", { params: params(0) }),
        api.get("/technologies/staging/stats"),
      ]);
      setItems(list.data);
      setTotal(Number(list.headers?.["x-total-count"] ?? list.data.length));
      setStats(st.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la bandeja de entrada"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    load();
  }, [load, version]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data, headers } = await api.get("/technologies/staging", { params: params(items.length) });
      setItems((prev) => [...prev, ...data.filter((d) => !prev.some((p) => p.id === d.id))]);
      setTotal(Number(headers?.["x-total-count"] ?? total));
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar más señales"));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [c, t, s] = await Promise.all([
          api.get("/clusters"),
          api.get("/tech-types"),
          api.get("/sources"),
        ]);
        setClusters(c.data);
        setTypes(t.data);
        setSources(s.data);
      } catch {
        /* los catalogos no bloquean la vista */
      }
    })();
  }, []);

  const classifiable = useMemo(
    () => items.filter((i) => i.cluster_id && i.tech_type_id),
    [items]
  );

  const selectedReady = useMemo(
    () => [...selected].filter((id) => classifiable.some((i) => i.id === id)),
    [selected, classifiable]
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) items.forEach((i) => next.delete(i.id));
      else items.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const closeEdit = () => {
    setEditing(null);
    handledLink.current = null;
    setTechId(null);
  };

  // Enlace directo ?tecnologia=<id>: abre el detalle de la senal. Si ya salio de
  // la bandeja, dice a que ciclo y pantalla fue y ofrece ir alla.
  useEffect(() => {
    if (invalidParam) {
      setLinkNotice({ tone: "warn", message: "El enlace de tecnología no es válido.", actions: [] });
      return;
    }
    if (!techId || loading || handledLink.current === techId) return;
    handledLink.current = techId;
    let cancelled = false;
    (async () => {
      try {
        const loc = await locateTech(api, techId);
        if (cancelled) return;
        if (!loc) {
          setLinkNotice({ tone: "warn", message: `La señal #${techId} no existe o fue eliminada. Revise el enlace.`, actions: [] });
          return;
        }
        const live = (loc.entries || []).filter((e) => !e.is_historic);
        if (loc.status === "capturada_no_asignada" && live.length === 0) {
          const { data } = await api.get(`/technologies/${techId}`);
          if (cancelled) return;
          setLinkNotice(null);
          openEdit(data, { readOnly: !canWrite });
          focusElement(`staging-row-${techId}`);
          return;
        }
        const entry = live[0];
        const actions = [];
        if (entry) {
          const target = pageForStatus(entry.status);
          actions.push({
            label: `Ir a ${PAGE_LABEL[target]} (${entry.cycle_code})`,
            testId: `tech-link-go-${target}`,
            onClick: () => {
              if (entry.cycle_id !== cycleId) setCycleId(entry.cycle_id);
              navigate(`${PAGE_PATH[target]}?${TECH_PARAM}=${techId}`);
            },
          });
        }
        if (loc.merged_into_id) {
          actions.push({
            label: `Ver la tecnología que la absorbió (#${loc.merged_into_id})`,
            testId: "tech-link-merged",
            onClick: () => navigate(`${PAGE_PATH.filtrado}?${TECH_PARAM}=${loc.merged_into_id}`),
          });
        }
        setLinkNotice({
          tone: "info",
          message: entry
            ? `"${loc.name.slice(0, 90)}" ya no está en la bandeja: fue asignada a ${entry.cycle_code} (${entry.status_label}).`
            : `"${loc.name.slice(0, 90)}" ya no está en la bandeja (${loc.status_label}).`,
          actions,
        });
      } catch (e) {
        toast.error(apiError(e, "No se pudo abrir la señal del enlace"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techId, loading, invalidParam]);

  const openEdit = (item, { readOnly = false } = {}) => {
    setRawPreview(null);
    handledLink.current = item.id;
    setTechId(item.id);
    setEditing({
      ...item,
      readOnly,
      cluster_id: item.cluster_id || item.suggested_cluster_id || "",
      tech_type_id: item.tech_type_id || "",
      condition: item.condition || "",
    });
  };

  const applySuggestion = async () => {
    setSuggesting(true);
    try {
      const { data } = await api.post(`/technologies/${editing.id}/suggest-classification`);
      setEditing((prev) => ({
        ...prev,
        cluster_id: data.cluster_id || prev.cluster_id,
        tech_type_id: data.tech_type_id || prev.tech_type_id,
        suggested_cluster_reason: [data.cluster_reason, data.tech_type_reason].filter(Boolean).join(" · "),
      }));
      if (!data.cluster_id && !data.tech_type_id) {
        toast.info("El clasificador no encontró evidencia suficiente. Clasifique manualmente.");
      } else {
        toast.success("Sugerencia aplicada. Revísela y guarde para confirmarla.");
      }
    } catch (e) {
      toast.error(apiError(e, "No se pudo generar la sugerencia"));
    } finally {
      setSuggesting(false);
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.put(`/technologies/${editing.id}`, {
        commercial_name: editing.commercial_name,
        inn_name: editing.inn_name,
        manufacturer: editing.manufacturer,
        indication: editing.indication,
        cluster_id: editing.cluster_id ? Number(editing.cluster_id) : null,
        tech_type_id: editing.tech_type_id ? Number(editing.tech_type_id) : null,
        condition: editing.condition || null,
        regulatory_status: editing.regulatory_status,
        fda_approval_date: editing.fda_approval_date || null,
        ema_approval_date: editing.ema_approval_date || null,
        phase3_completion_date: editing.phase3_completion_date || null,
      });
      toast.success(
        editing.cluster_id && editing.tech_type_id
          ? "Clasificación guardada. La señal ya se puede asignar al ciclo."
          : "Cambios guardados. Falta clúster o tipología para poder asignarla."
      );
      closeEdit();
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const doAssign = async () => {
    setSaving(true);
    try {
      // Solo viajan las clasificadas: las demas ya se advirtieron en el modal.
      const { data } = await api.post("/technologies/assign-to-cycle", {
        technology_ids: selectedReady,
        cycle_id: cycleId || null,
      });
      setResult(data);
      setAssignOpen(false);
      setSelected((prev) => {
        const next = new Set(prev);
        selectedReady.forEach((id) => next.delete(id));
        return next;
      });
      await load();
      await reloadCycles();
      if (data.assigned) {
        toast.success(`${data.assigned} señal(es) asignadas a ${data.cycle_code}. Continúe en Filtrado y depuración.`);
      } else if (data.skipped) {
        toast.info(`Las ${data.skipped} señal(es) ya estaban en ${data.cycle_code}.`);
      }
    } catch (e) {
      toast.error(apiError(e, "No se pudo asignar al ciclo"));
    } finally {
      setSaving(false);
    }
  };

  let assignBlock = "";
  if (!cycleId) assignBlock = "Seleccione o cree un ciclo antes de asignar.";
  else if (isHistoric) assignBlock = "El ciclo histórico no admite asignaciones. Seleccione un ciclo formal.";
  else if (isClosed) assignBlock = `${cycle?.code} está cerrado y no admite asignaciones. Seleccione un ciclo abierto.`;
  else if (selected.size === 0) assignBlock = "Marque en la tabla las señales que quiere asignar.";

  if (loading) return <LoadingBlock label="Cargando bandeja de entrada..." />;

  return (
    <div>
      <PageHeader
        title="Bandeja de entrada"
        titleHint={GLOSSARY.bandeja_entrada}
        subtitle="Staging de señales capturadas que aún no pertenecen a ningún ciclo. Clasifique clúster y tipología, y arrastre por lotes al ciclo en pantalla."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => navigate("/postulaciones")}>
              <Icon name="note" size={16} /> Postulaciones
            </Button>
            {canAssign && (
              <HintButton
                onClick={() => setAssignOpen(true)}
                disabled={Boolean(assignBlock)}
                disabledHint={assignBlock}
                hint={GLOSSARY.fa_asignar_lote}
                data-testid="staging-assign"
              >
                <Icon name="layers" size={17} /> Asignar {selected.size || ""} al ciclo
              </HintButton>
            )}
          </div>
        }
      />

      <PhaseGuide
        phase="Fase 1 · Identificación"
        hint={GLOSSARY.vigilancia}
        tasks={[
          "Revise las señales capturadas por vigilancia y por el canal reactivo.",
          "Confirme clúster y tipología: son obligatorios para entrar al ciclo.",
          "Seleccione por lotes y arrastre al ciclo en pantalla.",
        ]}
        nextLabel="Filtrado y depuración"
        nextTo="/filtrado"
      />

      {stats && (
        <ModuleStatsRow
          items={[
            { label: "Sin asignar", value: stats.unassigned, color: "#4F46E5", hint: GLOSSARY.fa_sin_asignar },
            { label: "Total capturadas", value: stats.total, hint: GLOSSARY.fa_total_capturadas },
            {
              label: "Sin clúster",
              value: stats.without_cluster,
              color: stats.without_cluster ? "#D97706" : undefined,
              sub: "Bloquea la asignación",
              hint: GLOSSARY.fa_sin_cluster,
            },
            {
              label: "Sin tipología",
              value: stats.without_tech_type,
              color: stats.without_tech_type ? "#D97706" : undefined,
              sub: "Bloquea la asignación",
              hint: GLOSSARY.fa_sin_tipologia,
            },
            {
              label: "Listas para asignar",
              value: classifiable.length,
              color: "#059669",
              sub: items.length < total ? "En las filas cargadas" : undefined,
              hint: GLOSSARY.fa_listas_asignar,
            },
          ]}
        />
      )}

      <TechLinkNotice notice={linkNotice} onClose={() => setLinkNotice(null)} />

      {(!cycleId || isClosed || isHistoric) && (
        <div className="fa-notice fa-notice--warn">
          <div>
            <strong>{!cycleId ? "No hay un ciclo seleccionado." : `${cycle?.code} no admite asignaciones.`}</strong>{" "}
            Cree o seleccione un ciclo abierto en{" "}
            <button
              type="button"
              className="clamp-text-toggle"
              style={{ color: "#92400E", fontSize: 13 }}
              onClick={() => navigate("/ciclos")}
            >
              Ciclos de escaneo
            </button>{" "}
            para poder arrastrar señales.
          </div>
        </div>
      )}

      <Card style={{ marginBottom: 18 }} padding={16}>
        <div className="staging-filters">
          <Input
            aria-label="Buscar señales"
            placeholder="Buscar por nombre, DCI o resumen..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            style={{ marginBottom: 0 }}
          />
          <Select
            aria-label="Filtrar por fuente"
            value={filters.source_id}
            onChange={(e) => setFilters({ ...filters, source_id: e.target.value })}
            style={{ marginBottom: 0 }}
          >
            <option value="">Todas las fuentes</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filtrar por canal"
            value={filters.channel}
            onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
            style={{ marginBottom: 0 }}
          >
            <option value="">Todos los canales</option>
            <option value="proactiva">Búsqueda proactiva</option>
            <option value="reactiva">Postulación reactiva</option>
          </Select>
        </div>
      </Card>

      {result && result.rejected?.length > 0 && (
        <Card style={{ marginBottom: 18, background: "#FEF2F2", borderColor: "#FECACA" }}>
          <div style={{ fontSize: 14, color: "#991B1B", fontWeight: 600, marginBottom: 6 }}>
            {result.rejected.length} señal(es) no se pudieron asignar
          </div>
          <ul style={{ fontSize: 13, color: "#7F1D1D", paddingLeft: 18 }}>
            {result.rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="📥"
            title={query.q || query.source_id || query.channel ? "Sin resultados" : "La bandeja está vacía"}
            message={
              query.q || query.source_id || query.channel
                ? "Ninguna señal sin asignar coincide con los filtros. Limpie la búsqueda o cambie de fuente."
                : "Ejecute la vigilancia para capturar señales nuevas desde los referentes internacionales."
            }
            action={
              query.q || query.source_id || query.channel ? (
                <Button variant="secondary" onClick={() => setFilters({ q: "", source_id: "", channel: "" })}>
                  Limpiar filtros
                </Button>
              ) : (
                <Button onClick={() => navigate("/vigilancia")}>Ir a vigilancia</Button>
              )
            }
          />
        </Card>
      ) : (
        <Card padding={0}>
          <div style={{ overflowX: "auto" }}>
            <table className="staging-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label="Seleccionar todas las filas cargadas"
                    />
                  </th>
                  <th>Señal</th>
                  <th>
                    <TermLabel tip={GLOSSARY.cluster}>Clúster</TermLabel>
                  </th>
                  <th>
                    <TermLabel tip={GLOSSARY.tipologia}>Tipología</TermLabel>
                  </th>
                  <th>
                    <TermLabel tip={GLOSSARY.fa_condicion}>Condición</TermLabel>
                  </th>
                  <th>
                    <TermLabel tip={GLOSSARY.cribado}>Cribado</TermLabel>
                  </th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const ready = Boolean(item.cluster_id && item.tech_type_id);
                  const name = item.commercial_name || item.inn_name || `Señal #${item.id}`;
                  return (
                    <tr key={item.id} className={selected.has(item.id) ? "row-selected" : ""} data-testid={`staging-row-${item.id}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                          aria-label={`Seleccionar ${name.slice(0, 80)}`}
                        />
                      </td>
                      <td style={{ maxWidth: 520 }}>
                        <ClampText className="staging-name" text={name} lines={2} expandable />
                        <div className="staging-meta">
                          {item.source_title || "Sin fuente"} ·{" "}
                          {new Date(item.captured_at).toLocaleDateString("es-CO")} ·{" "}
                          {item.source_channel === "reactiva" ? "Reactiva" : "Proactiva"}
                        </div>
                      </td>
                      <td>
                        {item.cluster_name ? (
                          <Badge tone="info">{item.cluster_name}</Badge>
                        ) : item.suggested_cluster_name ? (
                          <span className="staging-suggestion" title={item.suggested_cluster_reason || undefined}>
                            Sugerido: {item.suggested_cluster_name}
                          </span>
                        ) : (
                          <span className="staging-missing">Sin clasificar</span>
                        )}
                      </td>
                      <td>
                        {item.tech_type_name || <span className="staging-missing">Sin clasificar</span>}
                      </td>
                      <td>
                        {item.condition ? (
                          <Badge tone={item.condition}>{item.condition}</Badge>
                        ) : (
                          <span className="staging-missing">—</span>
                        )}
                      </td>
                      <td>
                        <span className="staging-score">{item.screening_score}</span>
                      </td>
                      <td>
                        {canWrite && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                            {ready ? "Editar" : "Clasificar"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="fa-pager">
            <span data-testid="staging-count">
              Mostrando {items.length} de {total} señal(es) sin asignar
              {selected.size ? ` · ${selected.size} seleccionada(s)` : ""}
            </span>
            {items.length < total && (
              <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                Cargar {Math.min(PAGE_SIZE, total - items.length)} más
              </Button>
            )}
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={closeEdit}
        title={editing?.readOnly ? "Detalle de la señal" : "Clasificar señal"}
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit}>
              {editing?.readOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!editing?.readOnly && (
              <Button onClick={saveEdit} loading={saving} data-testid="staging-save">
                Guardar clasificación
              </Button>
            )}
          </>
        }
      >
        {editing && (
          <>
            {editing.readOnly && (
              <p className="muted-note" data-testid="staging-readonly">
                Su perfil consulta la señal; clasificarla corresponde a los evaluadores.
              </p>
            )}
            <div style={{ marginBottom: 14 }} hidden={editing.readOnly}>
              <HintButton
                variant="outline"
                size="sm"
                onClick={applySuggestion}
                loading={suggesting}
                hint={GLOSSARY.fa_sugerir}
              >
                <Icon name="pulse" size={15} /> Sugerir clasificación
              </HintButton>
              {editing.suggested_cluster_reason && (
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
                  {editing.suggested_cluster_reason}
                </div>
              )}
            </div>

            <Input
              id="stg-commercial"
              disabled={editing.readOnly}
              label="Nombre comercial"
              value={editing.commercial_name || ""}
              onChange={(e) => setEditing({ ...editing, commercial_name: e.target.value })}
            />
            <Input
              id="stg-inn"
              disabled={editing.readOnly}
              label="Denominación común internacional (DCI)"
              hint="Nombre genérico del principio activo (INN). Mejora la desduplicación y el cruce con el INVIMA."
              value={editing.inn_name || ""}
              onChange={(e) => setEditing({ ...editing, inn_name: e.target.value })}
            />
            <Input
              id="stg-manufacturer"
              disabled={editing.readOnly}
              label="Fabricante"
              value={editing.manufacturer || ""}
              onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })}
            />
            <Input
              id="stg-indication"
              disabled={editing.readOnly}
              label="Indicación / patología"
              hint="Enfermedad o condición a la que se destina. Alimenta la sugerencia de clúster (CIE-10 y MeSH)."
              value={editing.indication || ""}
              onChange={(e) => setEditing({ ...editing, indication: e.target.value })}
            />

            <Select
              id="stg-cluster"
              disabled={editing.readOnly}
              label="Clúster de salud"
              hint={GLOSSARY.cluster}
              required
              value={editing.cluster_id || ""}
              onChange={(e) => setEditing({ ...editing, cluster_id: e.target.value })}
            >
              <option value="">Seleccione un clúster...</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Select
              id="stg-type"
              disabled={editing.readOnly}
              label="Tipología tecnológica"
              hint={GLOSSARY.tipologia}
              required
              value={editing.tech_type_id || ""}
              onChange={(e) => setEditing({ ...editing, tech_type_id: e.target.value })}
            >
              <option value="">Seleccione una tipología...</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>

            <Select
              id="stg-condition"
              disabled={editing.readOnly}
              label="Condición de la tecnología"
              hint={GLOSSARY.fa_condicion}
              value={editing.condition || ""}
              onChange={(e) => setEditing({ ...editing, condition: e.target.value })}
            >
              <option value="">Sin definir</option>
              {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>

            <div className="form-two-col">
              <Input
                id="stg-fda"
                disabled={editing.readOnly}
                label="Aprobación FDA"
                hint={GLOSSARY.fa_fechas_regulatorias}
                type="date"
                value={editing.fda_approval_date || ""}
                onChange={(e) => setEditing({ ...editing, fda_approval_date: e.target.value })}
              />
              <Input
                id="stg-ema"
                disabled={editing.readOnly}
                label="Aprobación EMA"
                hint={GLOSSARY.fa_fechas_regulatorias}
                type="date"
                value={editing.ema_approval_date || ""}
                onChange={(e) => setEditing({ ...editing, ema_approval_date: e.target.value })}
              />
            </div>
            <div className="form-two-col">
              <Input
                id="stg-phase3"
                disabled={editing.readOnly}
                label="Fin de fase III"
                hint={GLOSSARY.fa_fechas_regulatorias}
                type="date"
                value={editing.phase3_completion_date || ""}
                onChange={(e) => setEditing({ ...editing, phase3_completion_date: e.target.value })}
              />
              <Input
                id="stg-regulatory"
                disabled={editing.readOnly}
                label="Estado regulatorio"
                hint={GLOSSARY.fa_estado_regulatorio}
                placeholder="Sometido a FDA, en revisión EMA..."
                value={editing.regulatory_status || ""}
                onChange={(e) => setEditing({ ...editing, regulatory_status: e.target.value })}
              />
            </div>
            <p style={{ fontSize: 12, color: "#64748B" }}>
              Las fechas alimentan el pre-llenado de los criterios P1, P5 y P6 y el cálculo de
              time-to-market.
            </p>
            {editing.has_raw && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { data } = await api.get(`/ingest/raw/${editing.id}`);
                    setRawPreview(data);
                  } catch (err) {
                    toast.error(apiError(err, "No se pudo abrir el crudo"));
                  }
                }}
              >
                Ver señal original (RF03)
              </Button>
            )}
            {rawPreview && rawPreview.technology_id === editing.id && (
              <pre className="raw-preview">
                {JSON.stringify(rawPreview.payload, null, 2).slice(0, 4000)}
              </pre>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Asignar al ciclo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancelar
            </Button>
            <HintButton
              onClick={doAssign}
              loading={saving}
              disabled={selectedReady.length === 0}
              disabledHint="Ninguna de las señales seleccionadas tiene clúster y tipología. Clasifíquelas primero."
              data-testid="staging-assign-confirm"
            >
              Asignar {selectedReady.length}
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569" }}>
          Se asignarán <strong>{selectedReady.length}</strong> de {selected.size} señal(es)
          seleccionadas al ciclo <strong>{cycle?.code}</strong>.
        </p>
        {selected.size > selectedReady.length && (
          <div className="fa-notice fa-notice--warn" style={{ marginTop: 12 }}>
            {selected.size - selectedReady.length} señal(es) quedan fuera porque les falta clúster o
            tipología. La metodología exige ambos antes de entrar al ciclo.
          </div>
        )}
      </Modal>
    </div>
  );
}
