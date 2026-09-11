import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import DataTable from "../components/DataTable";
import TriageBoard, { ScreeningScore } from "../components/TriageBoard";
import FindingDetailModal from "../components/FindingDetailModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { Input, Textarea, Select } from "../components/Field";
import Modal from "../components/Modal";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { PERM, SCREENING_QUEUE_THRESHOLD } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";

const HORIZONS = ["emergente", "transicional", "inminente"];
const TYPES = ["medicamento", "dispositivo", "digital", "otro"];
const STATUSES = ["nuevo", "revisado", "priorizado", "descartado"];
const PAGE = 100;
const EMPTY_FILTERS = { q: "", horizon: "", technology_type: "", status: "" };

export default function Findings() {
  const { can, status, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const isEditor = can(PERM.TECHNOLOGY_WRITE);
  const canReport = can(PERM.REPORT_WRITE);
  const aiOn = Boolean(status?.ai_enabled ?? status?.gemini_enabled);

  const [findings, setFindings] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState("kanban");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [query, setQuery] = useState(EMPTY_FILTERS);

  const [detail, setDetail] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [genId, setGenId] = useState(null);
  const [enhancingId, setEnhancingId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const debounce = useRef(null);

  // La busqueda de texto espera a que el usuario deje de escribir.
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(filters), filters.q !== query.q ? 350 : 0);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const params = useMemo(() => Object.fromEntries(Object.entries(query).filter(([, v]) => v)), [query]);

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([
        api.get("/findings", { params: { ...params, limit: PAGE, offset: 0 } }),
        api.get("/findings/stats", { params }),
      ]);
      setFindings(list.data);
      setStats(st.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las señales"));
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
      const { data } = await api.get("/findings", { params: { ...params, limit: PAGE, offset: findings.length } });
      setFindings((prev) => [...prev, ...data.filter((f) => !prev.some((p) => p.id === f.id))]);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar más señales"));
    } finally {
      setLoadingMore(false);
    }
  };

  const openEdit = (f) => {
    setFormError("");
    setForm({ ...f });
    setEditOpen(true);
  };

  const save = async () => {
    if (!form.title?.trim()) {
      setFormError("El título de la señal es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/findings/${form.id}`, {
        title: form.title.trim(),
        summary: form.summary,
        technology: form.technology,
        technology_type: form.technology_type,
        horizon: form.horizon,
        phase: form.phase,
        therapeutic_area: form.therapeutic_area,
        published_date: form.published_date,
        status: form.status,
      });
      toast.success("Señal actualizada");
      setEditOpen(false);
      if (detail?.id === data.id) setDetail(data);
      load();
    } catch (e) {
      setFormError(apiError(e, "No se pudo actualizar"));
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (f, newStatus) => {
    try {
      const { data } = await api.put(`/findings/${f.id}`, { status: newStatus });
      toast.success(`Marcada como ${newStatus}`);
      if (detail?.id === f.id) setDetail(data);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar"));
    }
  };

  const generateRec = async (f) => {
    setGenId(f.id);
    try {
      const { data } = await api.post("/recommendations/generate", { finding_id: f.id });
      const preliminary = /sin IA|fallback/i.test(data.model_used || "");
      if (preliminary) toast.warning("IA no configurada: se creó un informe preliminar para completar en Diseminación.");
      else toast.success(`Informe generado (${data.model_used})`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo generar el informe"));
    } finally {
      setGenId(null);
    }
  };

  const enhanceFinding = async (f) => {
    setEnhancingId(f.id);
    try {
      const { data } = await api.post(`/findings/${f.id}/enhance-ai`);
      toast.success("Ficha enriquecida con IA. Revise el resultado.");
      setDetail(data);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo enriquecer con IA"));
    } finally {
      setEnhancingId(null);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/findings/${confirmDel.id}`);
      toast.success("Señal eliminada");
      setConfirmDel(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar la señal"));
      setConfirmDel(null);
    } finally {
      setDeleting(false);
    }
  };

  const counts = stats?.by_status || {};
  const total = stats?.total ?? findings.length;
  const hasFilters = Object.values(filters).some(Boolean);

  const columns = [
    {
      key: "title",
      label: "Señal tecnológica",
      render: (f) => (
        <div>
          <button type="button" onClick={() => setDetail(f)} style={linkBtn}>
            {f.title}
          </button>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <ScreeningScore score={f.screening_score} compact />
            {f.recommendations_count > 0 && <span title="Recomendaciones de adopción ya generadas"><Badge tone="priorizado">Informes {f.recommendations_count}</Badge></span>}
            {f.notes_count > 0 && <span title="Notas del equipo"><Badge>Notas {f.notes_count}</Badge></span>}
          </div>
        </div>
      ),
    },
    { key: "type", width: 110, label: "Tipo", render: (f) => <Badge>{f.technology_type || "otro"}</Badge> },
    { key: "horizon", width: 120, label: "Horizonte", tip: <InfoTip text={GLOSSARY.horizonte} label="Qué es el horizonte" />, render: (f) => (f.horizon ? <Badge>{f.horizon}</Badge> : "—") },
    { key: "status", width: 110, label: "Estado", tip: <InfoTip text={GLOSSARY.fb_estado_senal} label="Qué es el estado" />, render: (f) => <Badge tone={f.status}>{f.status}</Badge> },
    { key: "source", width: 160, label: "Fuente", render: (f) => <span style={{ fontSize: 13, color: "#64748B" }}>{f.source_title}</span> },
    {
      key: "actions",
      width: isEditor ? 250 : 80,
      align: "right",
      label: "Acciones",
      render: (f) => (
        <div className="fb-toolbar" style={{ justifyContent: "flex-end", gap: 2 }}>
          <Button size="sm" variant="ghost" onClick={() => setDetail(f)}>Ver</Button>
          {isEditor && (
            <>
              <HintButton size="sm" variant="ghost" hint="Editar la señal" onClick={() => openEdit(f)} aria-label={`Editar ${f.title}`}>
                <Icon name="edit" size={14} />
              </HintButton>
              <HintButton size="sm" variant="outline" hint={GLOSSARY.fb_generar_informe} disabled={!canReport} disabledHint="Su perfil no redacta informes (permiso report:write)." loading={genId === f.id} onClick={() => generateRec(f)} aria-label={`Generar informe de ${f.title}`}>
                <Icon name="pulse" size={14} /> Informe
              </HintButton>
              <HintButton size="sm" variant="ghost" style={{ color: "#DC2626" }} hint={GLOSSARY.fb_eliminar_senal} onClick={() => setConfirmDel(f)} aria-label={`Eliminar ${f.title}`}>
                <Icon name="trash" size={14} />
              </HintButton>
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <LoadingBlock label="Cargando señales..." />;

  return (
    <div>
      <ModuleHeader
        step="priorizacion"
        title="Señales capturadas"
        titleHint={GLOSSARY.senal}
        purpose={`Cola de cribado: revise, siga o descarte lo que trae la vigilancia. El puntaje de cribado (destaque desde ${SCREENING_QUEUE_THRESHOLD}) solo ordena la cola; la priorización oficial es la matriz P1-P6 del ciclo.`}
        actions={
          <div className="fb-toolbar">
            <Button variant="secondary" onClick={() => navigate("/bandeja-entrada")}>
              <Icon name="inbox" size={16} /> Bandeja de entrada
            </Button>
            <Button variant="secondary" onClick={() => navigate("/priorizacion")}>
              Matriz P1-P6
            </Button>
          </div>
        }
      />

      {!isEditor && (
        <div className="fb-readonly-note" data-testid="findings-readonly">
          <Icon name="info" size={16} />
          <span>
            Modo consulta: su perfil ({user?.role_label || user?.role}) no edita señales (permiso technology:write). Puede leerlas
            {can(PERM.NOTE_WRITE) ? " y dejar notas en cada ficha." : "."}
          </span>
        </div>
      )}

      <PhaseGuide
        phase="Señales · Cola de cribado"
        hint={GLOSSARY.cribado}
        tasks={[
          "Revise las señales nuevas que trajo la vigilancia; las de mayor cribado primero.",
          "Marque 'Seguir' lo pertinente y 'Descartar' el ruido: descartar no borra.",
          "Lo que vale la pena pasa por la Bandeja de entrada al ciclo, donde se clasifica y se prioriza con P1-P6.",
        ]}
        nextLabel="Bandeja de entrada"
        onNext={() => navigate("/bandeja-entrada")}
      />

      <ModuleStatsRow
        items={[
          { label: "Nuevas", value: counts.nuevo || 0, color: counts.nuevo ? "#6366F1" : undefined, hint: "Señales que nadie ha revisado todavía.", testId: "findings-kpi-nuevas" },
          { label: "En revisión", value: counts.revisado || 0, hint: "Señales ya leídas por el equipo, pendientes de decidir si se siguen." },
          { label: "A seguir", value: counts.priorizado || 0, color: "#10B981", hint: "Marcadas para seguimiento (estado 'priorizado'). No es la priorización oficial P1-P6." },
          { label: "Cribado alto", value: stats?.high_priority || 0, sub: `>= ${SCREENING_QUEUE_THRESHOLD}`, color: "#EF4444", hint: GLOSSARY.fb_cribado },
        ]}
      />

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div className="fb-toolbar">
          <input
            placeholder="Buscar tecnología o señal..."
            aria-label="Buscar señal"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="filter-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <select value={filters.horizon} onChange={(e) => setFilters({ ...filters, horizon: e.target.value })} className="filter-select" aria-label="Filtrar por horizonte">
            <option value="">Todos los horizontes</option>
            {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <select value={filters.technology_type} onChange={(e) => setFilters({ ...filters, technology_type: e.target.value })} className="filter-select" aria-label="Filtrar por tipo">
            <option value="">Todos los tipos</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="filter-select" aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {hasFilters && <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar</Button>}
          <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 8 }}>
            <button type="button" className={`view-toggle${view === "kanban" ? " active" : ""}`} onClick={() => setView("kanban")}>Tablero</button>
            <button type="button" className={`view-toggle${view === "table" ? " active" : ""}`} onClick={() => setView("table")}>Tabla</button>
          </div>
          <span style={{ fontSize: 13, color: "#64748B" }} data-testid="findings-count">
            {findings.length < total ? `${findings.length} de ${total} señales` : `${total} señales`}
          </span>
        </div>
      </Card>

      {findings.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔭"
            title={hasFilters ? "Ninguna señal coincide" : "Sin señales capturadas"}
            message={hasFilters ? "Ajuste o limpie los filtros." : "Ejecute la vigilancia de fuentes (Fase 1) para capturar tecnologías emergentes."}
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar filtros</Button>
              ) : (
                <Button onClick={() => navigate("/vigilancia")}>
                  <Icon name="radar" size={16} /> Ir a vigilancia
                </Button>
              )
            }
          />
        </Card>
      ) : view === "kanban" ? (
        <TriageBoard findings={findings} isEditor={isEditor} onOpen={setDetail} onStatus={quickStatus} onGenerate={generateRec} counts={query.status ? null : counts} />
      ) : (
        <Card padding={0}>
          <DataTable stack columns={columns} rows={findings.map((f) => ({ key: f.id, data: f }))} minWidth={980} />
        </Card>
      )}

      {findings.length < total && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
            Cargar más ({total - findings.length} restantes)
          </Button>
        </div>
      )}

      <FindingDetailModal
        finding={detail}
        onClose={() => setDetail(null)}
        isEditor={isEditor}
        status={status}
        enhancingId={enhancingId}
        onEnhance={enhanceFinding}
        onQuickStatus={quickStatus}
        onEdit={openEdit}
        onDelete={(f) => setConfirmDel(f)}
        onGenerate={canReport ? generateRec : undefined}
        canGenerate={canReport}
        generating={genId === detail?.id}
      />

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar ficha de señal"
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} loading={saving}>Guardar</Button>
          </>
        }
      >
        {form && (
          <>
            {formError && <p className="public-submit-error" role="alert">{formError}</p>}
            <Input id="finding-title" label="Título" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input id="finding-technology" label="Tecnología" value={form.technology || ""} onChange={(e) => setForm({ ...form, technology: e.target.value })} />
            <Textarea id="finding-summary" label="Resumen / evidencia" value={form.summary || ""} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} />
            <div className="fb-grid-2">
              <Select id="finding-type" label="Tipo" value={form.technology_type || "otro"} onChange={(e) => setForm({ ...form, technology_type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Select id="finding-horizon" label="Horizonte temporal" hint={GLOSSARY.horizonte} value={form.horizon || ""} onChange={(e) => setForm({ ...form, horizon: e.target.value })}>
                <option value="">Sin clasificar</option>
                {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
              <Input id="finding-phase" label="Fase de desarrollo" hint={GLOSSARY.fase} value={form.phase || ""} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
              <Input id="finding-area" label="Área terapéutica" value={form.therapeutic_area || ""} onChange={(e) => setForm({ ...form, therapeutic_area: e.target.value })} />
            </div>
            <Select id="finding-status" label="Estado de triage" hint={GLOSSARY.fb_estado_senal} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            {form.screening_score != null && (
              <p style={{ fontSize: 13, color: "#64748B", marginTop: 8 }}>
                Puntaje de cribado actual: <strong>{form.screening_score}</strong> (se recalcula al guardar). {aiOn ? "" : "La IA no está configurada: el enriquecimiento automático no está disponible."}
              </p>
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Eliminar señal"
        message={`Se eliminará "${confirmDel?.title?.slice(0, 120)}" con sus notas. Solo es posible si su tecnología sigue en la bandeja sin asignar; si ya entró a un ciclo, márquela como descartada.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}

const linkBtn = {
  border: "none",
  background: "none",
  textAlign: "left",
  padding: 0,
  fontWeight: 600,
  color: "#0F172A",
  cursor: "pointer",
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};
