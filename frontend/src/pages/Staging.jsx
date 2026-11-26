import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import InfoTip, { TermLabel } from "../components/InfoTip";
import Modal from "../components/Modal";
import SignalOrigin from "../components/SignalOrigin";
import ClassificationSuggestion from "../components/ClassificationSuggestion";
import ManualReviewPanel from "../components/ManualReviewPanel";
import NoiseCleanup from "../components/NoiseCleanup";
import useManualReview from "../scan/useManualReview";
import { Input, Select, Textarea } from "../components/Field";
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
import { intlLocale, t, tr, ts } from "../i18n";

const PAGE_SIZE = 100;
const RELIABILITY_LABEL = { confiable: t("Confiable"), verificar: t("Verificar"), baja: t("Baja confiabilidad") };
// Etiqueta de la condición; el valor (`emergente`, `nueva`) es el que viaja al servidor.
const CONDITION_NAME = { emergente: t("emergente"), nueva: t("nueva") };

/** Datos de producto bajo el nombre de la senal (RF-003): forma, concentracion, marca, modelo. */
function ProductFacts({ item }) {
  const facts = [
    item.dosage_form,
    item.strength,
    item.route && t("Vía {route}", { route: item.route.toLowerCase() }),
    item.brand && t("Marca: {brand}", { brand: item.brand }),
    item.device_model && t("Modelo: {model}", { model: item.device_model }),
    item.manufacturer && t("Fabricante: {name}", { name: item.manufacturer }),
  ].filter(Boolean);
  if (!facts.length) return null;
  return (
    <div className="staging-facts" title={GLOSSARY.fa_datos_producto}>
      {facts.map((fact) => (
        <span key={fact}>{fact}</span>
      ))}
    </div>
  );
}

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
  const firstLoad = useRef(true);
  // Si el listado no llega (servidor iniciando u ocupado), la bandeja lo dice y
  // reintenta sola: nunca se presenta como vacia una bandeja que no se pudo leer.
  const [loadError, setLoadError] = useState("");
  const retries = useRef(0);
  const [selected, setSelected] = useState(() => new Set());
  const [filters, setFilters] = useState({ q: "", source_id: "", channel: "", date_from: "", date_to: "", corroborated: false, sort: "puntaje" });
  const [query, setQuery] = useState({ q: "", source_id: "", channel: "", date_from: "", date_to: "", corroborated: false, sort: "puntaje" });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [view, setView] = useState("pendientes");
  const [discardIds, setDiscardIds] = useState(null);
  const [discardReason, setDiscardReason] = useState("");

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

  // Fuentes de consulta manual (nivel E) por validar: aviso visible arriba y
  // ventana de validación. Se abre sola al llegar desde el pendiente
  // (?validar=fuentes-e), por ejemplo desde la Bandeja de trabajo o el aviso de entrada.
  const manual = useManualReview();
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualOpen, setManualOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get("validar") === "fuentes-e" && manual.allowed) {
      setManualOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("validar");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, manual.allowed]);

  // La busqueda espera a que el usuario deje de escribir: antes cada tecla
  // disparaba dos consultas al servidor.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const params = useCallback(
    (offset) => {
      const p = { limit: PAGE_SIZE, offset };
      if (view === "descartadas" || view === "legacy") p.view = view;
      if (query.q) p.q = query.q;
      if (query.source_id) p.source_id = query.source_id;
      if (query.channel) p.channel = query.channel;
      if (query.date_from) p.date_from = query.date_from;
      if (query.date_to) p.date_to = query.date_to;
      if (query.corroborated) p.corroborated = true;
      if (query.sort === "recientes") p.sort = "recientes";
      return p;
    },
    [query, view]
  );

  const load = useCallback(async () => {
    // El listado y los indicadores van por separado: si fallan los indicadores,
    // las señales se muestran igual.
    const [list, st] = await Promise.allSettled([
      api.get("/technologies/staging", { params: params(0) }),
      api.get("/technologies/staging/stats"),
    ]);
    if (list.status === "fulfilled") {
      setItems(list.value.data);
      setTotal(Number(list.value.headers?.["x-total-count"] ?? list.value.data.length));
      setLoadError("");
      retries.current = 0;
    } else {
      setLoadError(apiError(list.reason, t("No se pudo cargar la bandeja de entrada")));
    }
    if (st.status === "fulfilled") setStats(st.value.data);
    firstLoad.current = false;
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    load();
  }, [load, version]);

  // Reintento automático mientras el listado no llegue (hasta 6 veces, cada 20 s).
  useEffect(() => {
    if (!loadError || retries.current >= 6) return undefined;
    const timer = setTimeout(() => {
      retries.current += 1;
      load();
    }, 20000);
    return () => clearTimeout(timer);
  }, [loadError, load]);

  const retryLoad = () => {
    retries.current = 0;
    setLoading(true);
    load();
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data, headers } = await api.get("/technologies/staging", { params: params(items.length) });
      setItems((prev) => [...prev, ...data.filter((d) => !prev.some((p) => p.id === d.id))]);
      setTotal(Number(headers?.["x-total-count"] ?? total));
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron cargar más señales")));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [c, ty, s] = await Promise.all([
          api.get("/clusters"),
          api.get("/tech-types"),
          api.get("/sources"),
        ]);
        setClusters(c.data);
        setTypes(ty.data);
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
      setLinkNotice({ tone: "warn", message: t("El enlace de tecnología no es válido."), actions: [] });
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
          setLinkNotice({ tone: "warn", message: t("La señal #{id} no existe o fue eliminada. Revise el enlace.", { id: techId }), actions: [] });
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
            label: t("Ir a {page} ({cycle})", { page: PAGE_LABEL[target], cycle: entry.cycle_code }),
            testId: `tech-link-go-${target}`,
            onClick: () => {
              if (entry.cycle_id !== cycleId) setCycleId(entry.cycle_id);
              navigate(`${PAGE_PATH[target]}?${TECH_PARAM}=${techId}`);
            },
          });
        }
        if (loc.merged_into_id) {
          actions.push({
            label: t("Ver la tecnología que la absorbió (#{id})", { id: loc.merged_into_id }),
            testId: "tech-link-merged",
            onClick: () => navigate(`${PAGE_PATH.filtrado}?${TECH_PARAM}=${loc.merged_into_id}`),
          });
        }
        setLinkNotice({
          tone: "info",
          message: entry
            ? t('"{name}" ya no está en la bandeja: fue asignada a {cycle} ({status}).', {
                name: loc.name.slice(0, 90),
                cycle: entry.cycle_code,
                status: ts(entry.status_label),
              })
            : t('"{name}" ya no está en la bandeja ({status}).', { name: loc.name.slice(0, 90), status: ts(loc.status_label) }),
          actions,
        });
      } catch (e) {
        toast.error(apiError(e, t("No se pudo abrir la señal del enlace")));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techId, loading, invalidParam]);

  const openEdit = (item, { readOnly = false } = {}) => {
    setSuggestion(null);
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
      setSuggestion(data);
      setEditing((prev) => ({
        ...prev,
        cluster_id: data.cluster_id || prev.cluster_id,
        tech_type_id: data.tech_type_id || prev.tech_type_id,
        // La condición solo se propone si el evaluador aún no la eligió.
        condition: prev.condition || data.condition || "",
        suggested_cluster_reason: "",
      }));
      if (!data.cluster_id && !data.tech_type_id) {
        toast.info(t("El clasificador no encontró evidencia suficiente. Clasifique manualmente."));
      } else {
        toast.success(t("Sugerencia aplicada. Revísela y guarde para confirmarla."));
      }
    } catch (e) {
      toast.error(apiError(e, t("No se pudo generar la sugerencia")));
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
        dosage_form: editing.dosage_form || "",
        strength: editing.strength || "",
        route: editing.route || "",
        brand: editing.brand || "",
        device_model: editing.device_model || "",
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
          ? t("Clasificación guardada. La señal ya se puede asignar al ciclo.")
          : t("Cambios guardados. Falta clúster o tipología para poder asignarla.")
      );
      closeEdit();
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar")));
    } finally {
      setSaving(false);
    }
  };

  const changeView = (next) => {
    setView(next);
    setSelected(new Set());
  };

  const openDiscard = (ids) => {
    setDiscardReason("");
    setDiscardIds(ids);
  };

  const discardReasonOk = discardReason.trim().length >= 5;

  const doDiscard = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/technologies/staging/discard", {
        technology_ids: discardIds,
        reason: discardReason.trim(),
      });
      setDiscardIds(null);
      setSelected(new Set());
      await load();
      if (data.affected) toast.success(t("{n} señal(es) descartadas como tecnología ya conocida.", { n: data.affected }));
      if (data.rejected?.length) toast.info(data.rejected.map((r) => ts(r)).join(" "));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descartar")));
    } finally {
      setSaving(false);
    }
  };

  const doRestore = async (ids) => {
    setSaving(true);
    try {
      const { data } = await api.post("/technologies/staging/restore", { technology_ids: ids });
      setSelected(new Set());
      await load();
      if (data.affected) toast.success(t("{n} señal(es) restauradas a la bandeja.", { n: data.affected }));
      if (data.rejected?.length) toast.info(data.rejected.map((r) => ts(r)).join(" "));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo restaurar")));
    } finally {
      setSaving(false);
    }
  };

  // Bandeja Legacy: señales de fuentes del inventario anterior (matriz previa).
  const doRecover = async (ids) => {
    setSaving(true);
    try {
      const { data } = await api.post("/technologies/staging/recover", { technology_ids: ids });
      setSelected(new Set());
      await load();
      if (data.affected) toast.success(t("{n} señal(es) recuperadas a Pendientes.", { n: data.affected }));
      if (data.rejected?.length) toast.info(data.rejected.map((r) => ts(r)).join(" "));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo recuperar")));
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
        toast.success(
          t("{n} señal(es) asignadas a {cycle}. Continúe en Filtrado y depuración.", { n: data.assigned, cycle: data.cycle_code })
        );
      } else if (data.skipped) {
        toast.info(t("Las {n} señal(es) ya estaban en {cycle}.", { n: data.skipped, cycle: data.cycle_code }));
      }
    } catch (e) {
      toast.error(apiError(e, t("No se pudo asignar al ciclo")));
    } finally {
      setSaving(false);
    }
  };

  let assignBlock = "";
  if (!cycleId) assignBlock = t("Seleccione o cree un ciclo antes de asignar.");
  else if (isHistoric) assignBlock = t("El ciclo histórico no admite asignaciones. Seleccione un ciclo formal.");
  else if (isClosed) assignBlock = t("{code} está cerrado y no admite asignaciones. Seleccione un ciclo abierto.", { code: cycle?.code });
  else if (selected.size === 0) assignBlock = t("Marque en la tabla las señales que quiere asignar.");

  if (loading) return <LoadingBlock label={t("Cargando bandeja de entrada...")} />;

  return (
    <div>
      <PageHeader
        title={t("Bandeja de entrada")}
        titleHint={GLOSSARY.bandeja_entrada}
        subtitle={t("Staging de señales capturadas que aún no pertenecen a ningún ciclo. Clasifique clúster y tipología, y arrastre por lotes al ciclo en pantalla.")}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => navigate("/postulaciones")}>
              <Icon name="note" size={16} /> {t("Postulaciones")}
            </Button>
            {can(PERM.CONFIG_MANAGE) && <NoiseCleanup toast={toast} onDone={load} />}
            {canAssign && view === "pendientes" && (
              <Button
                variant="secondary"
                onClick={() => openDiscard([...selected])}
                disabled={selected.size === 0}
                title={t("Descartar las señales seleccionadas: tecnología ya conocida")}
                data-testid="staging-discard-batch"
              >
                <Icon name="x" size={16} /> {t("Descartar {n}", { n: selected.size || "" })}
              </Button>
            )}
            {canAssign && view === "legacy" && (
              <Button
                variant="secondary"
                onClick={() => doRecover([...selected])}
                disabled={selected.size === 0}
                loading={saving}
                title={t("Devolver las señales seleccionadas a Pendientes")}
                data-testid="staging-recover-batch"
              >
                {t("Recuperar {n}", { n: selected.size || "" })}
              </Button>
            )}
            {canAssign && view === "descartadas" && (
              <Button
                variant="secondary"
                onClick={() => doRestore([...selected])}
                disabled={selected.size === 0}
                loading={saving}
                data-testid="staging-restore-batch"
              >
                {t("Restaurar {n}", { n: selected.size || "" })}
              </Button>
            )}
            {canAssign && view === "pendientes" && (
              <HintButton
                onClick={() => setAssignOpen(true)}
                disabled={Boolean(assignBlock)}
                disabledHint={assignBlock}
                hint={GLOSSARY.fa_asignar_lote}
                data-testid="staging-assign"
              >
                <Icon name="layers" size={17} /> {t("Asignar {n} al ciclo", { n: selected.size || "" })}
              </HintButton>
            )}
          </div>
        }
      />

      {manual.allowed && manual.due > 0 && (
        <div className="mr-banner" role="status" data-testid="manual-review-banner">
          <div className="mr-banner-icon">
            <Icon name="alert" size={20} />
          </div>
          <div className="mr-banner-text">
            <strong>
              {manual.due === 1
                ? t("Por favor valide manualmente {n} fuente de consulta (tipo E)", { n: manual.due })
                : t("Por favor valide manualmente {n} fuentes de consulta (tipo E)", { n: manual.due })}
            </strong>
            <span>
              {t("La vigilancia automática no entra a estas fuentes (licencia, usuario o captcha). Consúltelas, registre lo que encuentre y márquelas como validadas.")}
            </span>
          </div>
          <Button onClick={() => setManualOpen(true)} data-testid="manual-review-open">
            <Icon name="check" size={16} /> {t("Validar ahora")}
          </Button>
        </div>
      )}

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title={t("Fuentes de consulta manual por validar ({due} de {total})", { due: manual.due, total: manual.total })}
        width={760}
        footer={
          <Button variant="secondary" onClick={() => setManualOpen(false)}>
            {t("Cerrar")}
          </Button>
        }
      >
        <ManualReviewPanel data={manual.data} onChange={manual.reload} toast={toast} />
      </Modal>

      <PhaseGuide
        phase={t("Fase 1 · Identificación")}
        hint={GLOSSARY.vigilancia}
        tasks={[
          t("Revise las señales capturadas por vigilancia y por el canal reactivo."),
          t("Confirme clúster y tipología: son obligatorios para entrar al ciclo."),
          t("Seleccione por lotes y arrastre al ciclo en pantalla."),
        ]}
        nextLabel={t("Filtrado y depuración")}
        nextTo="/filtrado"
      />

      {stats && (
        <ModuleStatsRow
          items={[
            { label: t("Sin asignar"), value: stats.unassigned, color: "#1D4ED8", hint: GLOSSARY.fa_sin_asignar },
            { label: t("Total capturadas"), value: stats.total, hint: GLOSSARY.fa_total_capturadas },
            {
              label: t("Sin clúster"),
              value: stats.without_cluster,
              color: stats.without_cluster ? "#D97706" : undefined,
              sub: t("Bloquea la asignación"),
              hint: GLOSSARY.fa_sin_cluster,
            },
            {
              label: t("Sin tipología"),
              value: stats.without_tech_type,
              color: stats.without_tech_type ? "#D97706" : undefined,
              sub: t("Bloquea la asignación"),
              hint: GLOSSARY.fa_sin_tipologia,
            },
            {
              label: t("En varias fuentes"),
              value: stats.corroborated ?? 0,
              color: stats.corroborated ? "#0E7490" : undefined,
              sub: t("Corroboradas"),
              hint: GLOSSARY.fa_corroborada,
            },
            {
              label: t("Descartadas"),
              value: stats.discarded ?? 0,
              color: stats.discarded ? "#64748B" : undefined,
              sub: t("Tecnología ya conocida"),
              hint: t("Señales descartadas desde la bandeja. Siguen contando en Total capturadas y se pueden restaurar."),
            },
            {
              label: t("Listas para asignar"),
              value: classifiable.length,
              color: "#059669",
              sub: items.length < total ? t("En las filas cargadas") : undefined,
              hint: GLOSSARY.fa_listas_asignar,
            },
          ]}
        />
      )}

      <TechLinkNotice notice={linkNotice} onClose={() => setLinkNotice(null)} />

      {(!cycleId || isClosed || isHistoric) && (
        <div className="fa-notice fa-notice--warn">
          <div>
            <strong>
              {!cycleId ? t("No hay un ciclo seleccionado.") : t("{code} no admite asignaciones.", { code: cycle?.code })}
            </strong>{" "}
            {tr("Cree o seleccione un ciclo abierto en <a>Ciclos de escaneo</a> para poder arrastrar señales.", null, {
              a: (c) => (
                <button
                  type="button"
                  className="clamp-text-toggle"
                  style={{ color: "#92400E", fontSize: 13 }}
                  onClick={() => navigate("/ciclos")}
                >
                  {c}
                </button>
              ),
            })}
          </div>
        </div>
      )}

      <Card style={{ marginBottom: 18 }} padding={16}>
        <div className="staging-filters">
          <Input
            aria-label={t("Buscar señales")}
            placeholder={t("Buscar por nombre, DCI o resumen...")}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            style={{ marginBottom: 0 }}
          />
          <Select
            aria-label={t("Filtrar por fuente")}
            value={filters.source_id}
            onChange={(e) => setFilters({ ...filters, source_id: e.target.value })}
            style={{ marginBottom: 0 }}
          >
            <option value="">{t("Todas las fuentes")}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t("Filtrar por canal")}
            value={filters.channel}
            onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
            style={{ marginBottom: 0 }}
          >
            <option value="">{t("Todos los canales")}</option>
            <option value="proactiva">{t("Búsqueda proactiva")}</option>
            <option value="reactiva">{t("Postulación reactiva")}</option>
          </Select>
          <Input
            type="date"
            aria-label={t("Capturadas desde")}
            title={t("Capturadas desde (fecha)")}
            value={filters.date_from}
            max={filters.date_to || undefined}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
            style={{ marginBottom: 0 }}
          />
          <Input
            type="date"
            aria-label={t("Capturadas hasta")}
            title={t("Capturadas hasta (fecha, inclusive)")}
            value={filters.date_to}
            min={filters.date_from || undefined}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
            style={{ marginBottom: 0 }}
          />
          <label className="staging-check">
            <input
              type="checkbox"
              checked={filters.corroborated}
              onChange={(e) => setFilters({ ...filters, corroborated: e.target.checked })}
            />
            {t("Solo detectadas en varias fuentes")}
            <InfoTip text={GLOSSARY.fa_corroborada} label={t("Qué es una señal corroborada")} />
          </label>
          <Select
            aria-label={t("Ordenar por")}
            title={t("Ordenar por")}
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
            style={{ marginBottom: 0 }}
          >
            <option value="puntaje">{t("Ordenar por: puntaje")}</option>
            <option value="recientes">{t("Ordenar por: más recientes")}</option>
          </Select>
        </div>
      </Card>

      {result && result.rejected?.length > 0 && (
        <Card style={{ marginBottom: 18, background: "#FEF2F2", borderColor: "#FECACA" }}>
          <div style={{ fontSize: 14, color: "#991B1B", fontWeight: 600, marginBottom: 6 }}>
            {t("{n} señal(es) no se pudieron asignar", { n: result.rejected.length })}
          </div>
          <ul style={{ fontSize: 13, color: "#7F1D1D", paddingLeft: 18 }}>
            {result.rejected.map((r) => (
              <li key={r}>{ts(r)}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="screening-tabs" role="tablist">
        {[
          { key: "pendientes", label: t("Pendientes") },
          { key: "descartadas", label: t("Descartadas") },
          { key: "legacy", label: stats?.legacy ? t("Legacy ({n})", { n: stats.legacy }) : t("Legacy") },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={view === tab.key}
            className={`screening-tab${view === tab.key ? " is-active" : ""}`}
            onClick={() => changeView(tab.key)}
            data-testid={`staging-tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "legacy" && (
        <p className="source-section-note" data-testid="staging-legacy-note" style={{ margin: "0 0 10px" }}>
          {t("Señales capturadas por las fuentes del inventario anterior, retiradas al cargar la matriz de escaneo por enlace (17-11-2026). No se borraron: siguen en el sistema y en la bitácora. Use (Recuperar) para devolver las que sirvan a Pendientes y clasificarlas como cualquier otra.")}
        </p>
      )}

      {loadError && items.length > 0 && (
        <p className="sl-muted" role="status" data-testid="staging-load-stale">
          {t("No se pudo actualizar la lista ({error}). Se muestra la última que llegó.", { error: loadError })}{" "}
          <button type="button" className="so-linkbtn" onClick={retryLoad}>{t("Reintentar")}</button>
        </p>
      )}
      {loadError && items.length === 0 ? (
        <Card>
          <div data-testid="staging-load-error" role="alert">
            <EmptyState
              icon="⚠️"
              title={t("No se pudo cargar la bandeja de entrada")}
              message={t("{error} Las señales capturadas siguen guardadas: la bandeja no está vacía, solo no se pudo leer. Si el sistema llevaba un rato sin uso o hay una vigilancia en curso, puede tardar un par de minutos. Se reintenta sola cada 20 segundos.", { error: loadError })}
              action={<Button onClick={retryLoad}>{t("Reintentar ahora")}</Button>}
            />
          </div>
        </Card>
      ) : items.length === 0 && view === "legacy" ? (
        <Card>
          <EmptyState icon="🗄️" title={t("Bandeja Legacy vacía")} message={t("No hay señales pendientes de fuentes del inventario anterior.")} />
        </Card>
      ) : items.length === 0 && view === "descartadas" ? (
        <Card>
          <EmptyState icon="🗂️" title={t("Sin descartadas")} message={t("No hay señales descartadas desde la bandeja.")} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="📥"
            title={query.q || query.source_id || query.channel || query.date_from || query.date_to ? t("Sin resultados") : t("La bandeja está vacía")}
            message={
              query.q || query.source_id || query.channel || query.date_from || query.date_to
                ? t("Ninguna señal sin asignar coincide con los filtros. Limpie la búsqueda, cambie de fuente o amplíe las fechas.")
                : t("Ejecute la vigilancia para capturar señales nuevas desde los referentes internacionales.")
            }
            action={
              query.q || query.source_id || query.channel || query.date_from || query.date_to ? (
                <Button variant="secondary" onClick={() => setFilters({ q: "", source_id: "", channel: "" })}>
                  {t("Limpiar filtros")}
                </Button>
              ) : (
                <Button onClick={() => navigate("/vigilancia")}>{t("Ir a vigilancia")}</Button>
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
                      aria-label={t("Seleccionar todas las filas cargadas")}
                    />
                  </th>
                  <th>{t("Señal")}</th>
                  <th>
                    <TermLabel tip={GLOSSARY.cluster}>{t("Clúster")}</TermLabel>
                  </th>
                  <th>
                    <TermLabel tip={GLOSSARY.tipologia}>{t("Tipología")}</TermLabel>
                  </th>
                  <th>
                    <TermLabel tip={GLOSSARY.fa_condicion}>{t("Condición")}</TermLabel>
                  </th>
                  <th>
                    <TermLabel tip={GLOSSARY.cribado}>{t("Cribado")}</TermLabel>
                  </th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const ready = Boolean(item.cluster_id && item.tech_type_id);
                  const name = item.commercial_name || item.inn_name || t("Señal #{id}", { id: item.id });
                  return (
                    <tr key={item.id} className={selected.has(item.id) ? "row-selected" : ""} data-testid={`staging-row-${item.id}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                          aria-label={t("Seleccionar {name}", { name: name.slice(0, 80) })}
                        />
                      </td>
                      <td style={{ maxWidth: 520 }}>
                        <ClampText className="staging-name" text={name} lines={2} expandable />
                        <ProductFacts item={item} />
                        <div className="staging-meta">
                          {item.source_title || t("Sin fuente")} ·{" "}
                          {/* captured_at se guarda en UTC; con SQLite llega sin zona. */}
                          {new Date(
                            /[zZ]|[+-]\d{2}:?\d{2}$/.test(item.captured_at)
                              ? item.captured_at
                              : `${item.captured_at}Z`,
                          ).toLocaleString(intlLocale(), {
                            timeZone: "America/Bogota",
                            dateStyle: "short",
                            timeStyle: "short",
                          })}{" "}
                          ·{" "}
                          {item.source_channel === "reactiva" ? t("Reactiva") : t("Proactiva")}
                          <span className="staging-links">
                            {item.signal_url && item.link_type !== "exacto" && item.evidence?.locator_url ? (
                              <a
                                className="staging-extlink"
                                href={item.evidence.locator_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid="staging-open-located"
                                title={t("Abre la página y resalta la señal «{text}» (la fuente no tiene enlace por ítem)", {
                                  text: item.evidence.locator_text || name.slice(0, 60),
                                })}
                                aria-label={t("Abrir la página y resaltar la señal {name}", { name: name.slice(0, 60) })}
                              >
                                <Icon name="search" size={13} />
                              </a>
                            ) : item.signal_url ? (
                              <a
                                className="staging-extlink"
                                href={item.signal_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid="staging-open-source"
                                title={
                                  item.link_type === "exacto"
                                    ? t("Enlace exacto: {url}", { url: item.signal_url })
                                    : item.link_type === "consulta"
                                      ? t("Página de consulta (la fuente no ofrece enlace directo): {url}", { url: item.signal_url })
                                      : t("Abrir la fuente original: {url}", { url: item.signal_url })
                                }
                                aria-label={
                                  item.link_type === "consulta"
                                    ? t("Abrir la página de consulta de {name}", { name: name.slice(0, 60) })
                                    : t("Abrir la fuente original de {name}", { name: name.slice(0, 60) })
                                }
                              >
                                <Icon name="external" size={13} />
                              </a>
                            ) : null}
                            {item.corroboration_count > 1 && (
                              <span
                                className="staging-corro"
                                title={t("También en: {sources}", {
                                  sources: (item.corroborating || []).map((c) => c.source_title).join(" · "),
                                })}
                              >
                                {t("En {n} fuentes", { n: item.corroboration_count })}
                              </span>
                            )}
                            {RELIABILITY_LABEL[item.reliability_verdict] && (
                              <span
                                className={`staging-rel staging-rel--${item.reliability_verdict}`}
                                title={t("Confiabilidad {score}/100", { score: item.reliability_score ?? "-" })}
                              >
                                {RELIABILITY_LABEL[item.reliability_verdict]}
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td>
                        {item.cluster_name ? (
                          <Badge tone="info">{item.cluster_name}</Badge>
                        ) : item.suggested_cluster_name ? (
                          <span className="staging-suggestion" title={ts(item.suggested_cluster_reason) || undefined}>
                            {t("Sugerido: {name}", { name: item.suggested_cluster_name })}
                          </span>
                        ) : (
                          <span className="staging-missing">{t("Sin clasificar")}</span>
                        )}
                      </td>
                      <td>
                        {item.tech_type_name || <span className="staging-missing">{t("Sin clasificar")}</span>}
                      </td>
                      <td>
                        {item.condition ? (
                          <Badge tone={item.condition}>{CONDITION_NAME[item.condition] || item.condition}</Badge>
                        ) : (
                          <span className="staging-missing">-</span>
                        )}
                      </td>
                      <td>
                        <span className="staging-score">{item.screening_score}</span>
                        {item.corroboration_bonus > 0 && (
                          <span
                            className="staging-bonus"
                            title={t("+{bonus} al orden por corroboración en {n} fuentes", {
                              bonus: item.corroboration_bonus,
                              n: item.corroboration_count,
                            })}
                          >
                            +{item.corroboration_bonus}
                          </span>
                        )}
                      </td>
                      <td>
                        {canWrite && view === "pendientes" && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                            {ready ? t("Editar") : t("Clasificar")}
                          </Button>
                        )}
                        {canAssign && view === "pendientes" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDiscard([item.id])}
                            title={t("Descartar: tecnología ya conocida")}
                            data-testid={`staging-discard-${item.id}`}
                          >
                            {t("Descartar")}
                          </Button>
                        )}
                        {canAssign && view === "legacy" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => doRecover([item.id])}
                            disabled={saving}
                            data-testid={`staging-recover-${item.id}`}
                          >
                            {t("Recuperar")}
                          </Button>
                        )}
                        {canAssign && view === "descartadas" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => doRestore([item.id])}
                            disabled={saving}
                            data-testid={`staging-restore-${item.id}`}
                          >
                            {t("Restaurar")}
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
              {view === "descartadas"
                ? t("Mostrando {n} de {total} señal(es) descartadas", { n: items.length, total })
                : view === "legacy"
                  ? t("Mostrando {n} de {total} señal(es) en Legacy", { n: items.length, total })
                  : t("Mostrando {n} de {total} señal(es) sin asignar", { n: items.length, total })}
              {selected.size ? ` · ${t("{n} seleccionada(s)", { n: selected.size })}` : ""}
            </span>
            {items.length < total && (
              <Button variant="secondary" size="sm" onClick={loadMore} loading={loadingMore}>
                {t("Cargar {n} más", { n: Math.min(PAGE_SIZE, total - items.length) })}
              </Button>
            )}
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={closeEdit}
        title={editing?.readOnly ? t("Detalle de la señal") : t("Clasificar señal")}
        width={720}
        footer={
          <>
            <Button variant="secondary" onClick={closeEdit}>
              {editing?.readOnly ? t("Cerrar") : t("Cancelar")}
            </Button>
            {!editing?.readOnly && (
              <Button onClick={saveEdit} loading={saving} data-testid="staging-save">
                {t("Guardar clasificación")}
              </Button>
            )}
          </>
        }
      >
        {editing && (
          <>
            {editing.readOnly && (
              <p className="muted-note" data-testid="staging-readonly">
                {t("Su perfil consulta la señal; clasificarla corresponde a los evaluadores.")}
              </p>
            )}
            <SignalOrigin
              tech={editing}
              canAnalyze={canWrite}
              onAssessed={(a, url) =>
                setItems((prev) =>
                  prev.map((i) =>
                    i.id === editing.id
                      ? { ...i, reliability_verdict: a.verdict, reliability_score: a.score, signal_url: url || i.signal_url }
                      : i
                  )
                )
              }
            />
            <div style={{ marginBottom: 14 }} hidden={editing.readOnly}>
              <HintButton
                variant="outline"
                size="sm"
                onClick={applySuggestion}
                loading={suggesting}
                hint={GLOSSARY.fa_sugerir}
              >
                <Icon name="pulse" size={15} /> {t("Sugerir clasificación")}
              </HintButton>
              {editing.suggested_cluster_reason && !suggestion && (
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>
                  {ts(editing.suggested_cluster_reason)}
                </div>
              )}
              <ClassificationSuggestion data={suggestion} />
            </div>

            <Input
              id="stg-commercial"
              disabled={editing.readOnly}
              label={t("Nombre comercial")}
              value={editing.commercial_name || ""}
              onChange={(e) => setEditing({ ...editing, commercial_name: e.target.value })}
            />
            <Input
              id="stg-inn"
              disabled={editing.readOnly}
              label={t("Denominación común internacional (DCI)")}
              hint={t("Nombre genérico del principio activo (INN). Mejora la desduplicación y el cruce con el INVIMA.")}
              value={editing.inn_name || ""}
              onChange={(e) => setEditing({ ...editing, inn_name: e.target.value })}
            />
            <Input
              id="stg-manufacturer"
              disabled={editing.readOnly}
              label={t("Fabricante")}
              value={editing.manufacturer || ""}
              onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })}
            />
            <fieldset className="staging-product">
              <legend>
                <TermLabel tip={GLOSSARY.fa_datos_producto}>{t("Datos de producto")}</TermLabel>
              </legend>
              <div className="form-two-col">
                <Input
                  id="stg-dosage-form"
                  disabled={editing.readOnly}
                  label={t("Forma farmacéutica")}
                  placeholder={t("Ej. tableta, solución inyectable")}
                  value={editing.dosage_form || ""}
                  onChange={(e) => setEditing({ ...editing, dosage_form: e.target.value })}
                />
                <Input
                  id="stg-strength"
                  disabled={editing.readOnly}
                  label={t("Concentración")}
                  placeholder={t("Ej. 100 mg, 2,5 mg/ml")}
                  value={editing.strength || ""}
                  onChange={(e) => setEditing({ ...editing, strength: e.target.value })}
                />
                <Input
                  id="stg-route"
                  disabled={editing.readOnly}
                  label={t("Vía de administración")}
                  placeholder={t("Ej. oral, intravenosa")}
                  value={editing.route || ""}
                  onChange={(e) => setEditing({ ...editing, route: e.target.value })}
                />
                <Input
                  id="stg-brand"
                  disabled={editing.readOnly}
                  label={t("Marca")}
                  value={editing.brand || ""}
                  onChange={(e) => setEditing({ ...editing, brand: e.target.value })}
                />
                <Input
                  id="stg-model"
                  disabled={editing.readOnly}
                  label={t("Modelo (dispositivos)")}
                  value={editing.device_model || ""}
                  onChange={(e) => setEditing({ ...editing, device_model: e.target.value })}
                />
              </div>
            </fieldset>
            {editing.corroboration_count > 1 && (
              <div className="staging-corro-list" role="note">
                <strong>
                  <TermLabel tip={GLOSSARY.fa_corroborada}>{t("Detectada en {n} fuentes", { n: editing.corroboration_count })}</TermLabel>
                </strong>
                <ul>
                  {(editing.corroborating || []).map((c) => (
                    <li key={c.technology_id}>
                      {c.source_title}: {c.name || t("Señal #{id}", { id: c.technology_id })}{" "}
                      <span className="staging-meta">
                        ({c.matched_on?.includes("nct") ? t("mismo NCT") : t("similitud {n} %", { n: Math.round(c.score) })})
                      </span>
                      {c.url && (
                        <>
                          {" "}
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("Abrir la señal en {source}", { source: c.source_title })}
                          >
                            <Icon name="external" size={12} />
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Input
              id="stg-indication"
              disabled={editing.readOnly}
              label={t("Indicación / patología")}
              hint={t("Enfermedad o condición a la que se destina. Alimenta la sugerencia de clúster (CIE-10 y MeSH).")}
              value={editing.indication || ""}
              onChange={(e) => setEditing({ ...editing, indication: e.target.value })}
            />

            <Select
              id="stg-cluster"
              disabled={editing.readOnly}
              label={t("Clúster de salud")}
              hint={GLOSSARY.cluster}
              required
              value={editing.cluster_id || ""}
              onChange={(e) => setEditing({ ...editing, cluster_id: e.target.value })}
            >
              <option value="">{t("Seleccione un clúster...")}</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>

            <Select
              id="stg-type"
              disabled={editing.readOnly}
              label={t("Tipología tecnológica")}
              hint={GLOSSARY.tipologia}
              required
              value={editing.tech_type_id || ""}
              onChange={(e) => setEditing({ ...editing, tech_type_id: e.target.value })}
            >
              <option value="">{t("Seleccione una tipología...")}</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>

            <Select
              id="stg-condition"
              disabled={editing.readOnly}
              label={t("Condición de la tecnología")}
              hint={GLOSSARY.fa_condicion}
              value={editing.condition || ""}
              onChange={(e) => setEditing({ ...editing, condition: e.target.value })}
            >
              <option value="">{t("Sin definir")}</option>
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
                label={t("Aprobación FDA")}
                hint={GLOSSARY.fa_fechas_regulatorias}
                type="date"
                value={editing.fda_approval_date || ""}
                onChange={(e) => setEditing({ ...editing, fda_approval_date: e.target.value })}
              />
              <Input
                id="stg-ema"
                disabled={editing.readOnly}
                label={t("Aprobación EMA")}
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
                label={t("Fin de fase III")}
                hint={GLOSSARY.fa_fechas_regulatorias}
                type="date"
                value={editing.phase3_completion_date || ""}
                onChange={(e) => setEditing({ ...editing, phase3_completion_date: e.target.value })}
              />
              <Input
                id="stg-regulatory"
                disabled={editing.readOnly}
                label={t("Estado regulatorio")}
                hint={GLOSSARY.fa_estado_regulatorio}
                placeholder={t("Sometido a FDA, en revisión EMA...")}
                value={editing.regulatory_status || ""}
                onChange={(e) => setEditing({ ...editing, regulatory_status: e.target.value })}
              />
            </div>
            <p style={{ fontSize: 12, color: "#64748B" }}>
              {t("Las fechas alimentan el pre-llenado de los criterios P1, P5 y P6 y el cálculo de time-to-market.")}
            </p>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(discardIds)}
        onClose={() => setDiscardIds(null)}
        title={t("Descartar: tecnología ya conocida")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDiscardIds(null)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              onClick={doDiscard}
              loading={saving}
              disabled={!discardReasonOk}
              disabledHint={t("El motivo es obligatorio (mínimo 5 caracteres).")}
              data-testid="staging-discard-confirm"
            >
              {t("Descartar {n}", { n: discardIds?.length || "" })}
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569" }}>
          {t("{n} señal(es) saldrán de la bandeja. No se borran: quedan en la pestaña «Descartadas» y el motivo se registra en la bitácora.", { n: discardIds?.length || 0 })}
        </p>
        <Textarea
          label={t("Motivo")}
          required
          rows={3}
          maxLength={1000}
          value={discardReason}
          onChange={(e) => setDiscardReason(e.target.value)}
          placeholder={t("Ej.: ya evaluada en el ciclo 2025; duplicado de la señal #123")}
          data-testid="staging-discard-reason"
        />
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={t("Asignar al ciclo")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              onClick={doAssign}
              loading={saving}
              disabled={selectedReady.length === 0}
              disabledHint={t("Ninguna de las señales seleccionadas tiene clúster y tipología. Clasifíquelas primero.")}
              data-testid="staging-assign-confirm"
            >
              {t("Asignar {n}", { n: selectedReady.length })}
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569" }}>
          {tr(
            "Se asignarán <b>{n}</b> de {total} señal(es) seleccionadas al ciclo <b>{code}</b>.",
            { n: selectedReady.length, total: selected.size, code: cycle?.code },
            { b: (c) => <strong>{c}</strong> }
          )}
        </p>
        {selected.size > selectedReady.length && (
          <div className="fa-notice fa-notice--warn" style={{ marginTop: 12 }}>
            {t("{n} señal(es) quedan fuera porque les falta clúster o tipología. La metodología exige ambos antes de entrar al ciclo.", { n: selected.size - selectedReady.length })}
          </div>
        )}
      </Modal>
    </div>
  );
}
