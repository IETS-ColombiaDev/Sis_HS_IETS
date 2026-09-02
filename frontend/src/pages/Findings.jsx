import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import DataTable from "../components/DataTable";
import TriageBoard, { ScreeningScore } from "../components/TriageBoard";
import FindingDetailModal from "../components/FindingDetailModal";
import { Input, Textarea, Select } from "../components/Field";
import Modal from "../components/Modal";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { SCREENING_QUEUE_THRESHOLD } from "../constants/methodology";

const HORIZONS = ["emergente", "transicional", "inminente"];
const TYPES = ["medicamento", "dispositivo", "digital", "otro"];
const STATUSES = ["nuevo", "revisado", "priorizado", "descartado"];

export default function Findings() {
  const { isEditor, status } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("kanban");
  const [filters, setFilters] = useState({ q: "", horizon: "", technology_type: "", status: "" });

  const [detail, setDetail] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [genId, setGenId] = useState(null);
  const [enhancingId, setEnhancingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const { data } = await api.get("/findings", { params });
      setFindings(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las senales"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    load();
  }, [load, version]);

  const openEdit = (f) => {
    setForm({ ...f });
    setEditOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/findings/${form.id}`, {
        title: form.title,
        summary: form.summary,
        technology: form.technology,
        technology_type: form.technology_type,
        horizon: form.horizon,
        phase: form.phase,
        therapeutic_area: form.therapeutic_area,
        published_date: form.published_date,
        status: form.status,
      });
      toast.success("Senal actualizada");
      setEditOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar"));
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (f, newStatus) => {
    try {
      await api.put(`/findings/${f.id}`, { status: newStatus });
      toast.success(`Marcado como ${newStatus}`);
      if (detail?.id === f.id) setDetail({ ...detail, status: newStatus });
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar"));
    }
  };

  const generateRec = async (f) => {
    setGenId(f.id);
    try {
      const { data } = await api.post("/recommendations/generate", { finding_id: f.id });
      toast.success(`Informe generado (${data.model_used})`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo generar el informe"));
    } finally {
      setGenId(null);
    }
  };

  const enhanceFinding = async (f) => {
    if (!status?.gemini_enabled) {
      toast.warning("Configure el token de Gemini en Configuracion");
      return;
    }
    setEnhancingId(f.id);
    try {
      const { data } = await api.post(`/findings/${f.id}/enhance-ai`);
      toast.success("Ficha enriquecida con IA");
      setDetail(data);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo enriquecer con IA"));
    } finally {
      setEnhancingId(null);
    }
  };

  const highPriorityCount = useMemo(
    () => findings.filter((f) => (f.screening_score || 0) >= SCREENING_QUEUE_THRESHOLD).length,
    [findings]
  );

  const statusCounts = useMemo(() => {
    const c = { nuevo: 0, revisado: 0, priorizado: 0, descartado: 0 };
    findings.forEach((f) => { if (c[f.status] !== undefined) c[f.status] += 1; });
    return c;
  }, [findings]);

  const columns = useMemo(
    () => [
      {
        key: "title",
        label: "Senal tecnologica",
        render: (f) => (
          <div>
            <button type="button" onClick={() => setDetail(f)} style={linkBtn}>
              {f.title}
            </button>
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              <ScreeningScore score={f.screening_score} compact />
              {f.recommendations_count > 0 && <Badge tone="priorizado">IA {f.recommendations_count}</Badge>}
            </div>
          </div>
        ),
      },
      { key: "type", width: 110, label: "Tipo", render: (f) => <Badge>{f.technology_type}</Badge> },
      { key: "horizon", width: 120, label: "Horizonte", render: (f) => (f.horizon ? <Badge>{f.horizon}</Badge> : "—") },
      { key: "status", width: 110, label: "Estado", render: (f) => <Badge tone={f.status}>{f.status}</Badge> },
      {
        key: "source",
        width: 160,
        label: "Fuente",
        render: (f) => <span style={{ fontSize: 13, color: "#64748B" }}>{f.source_title}</span>,
      },
      {
        key: "actions",
        width: isEditor ? 200 : 70,
        align: "right",
        label: "Acciones",
        render: (f) => (
          <div style={{ whiteSpace: "nowrap" }}>
            <Button size="sm" variant="ghost" onClick={() => setDetail(f)}>Ver</Button>
            {isEditor && (
              <>
                <Button size="sm" variant="ghost" onClick={() => openEdit(f)}><Icon name="edit" size={14} /></Button>
                <Button size="sm" variant="outline" loading={genId === f.id} onClick={() => generateRec(f)}>
                  <Icon name="pulse" size={14} />
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [isEditor, genId]
  );

  if (loading) return <LoadingBlock label="Cargando priorizacion..." />;

  return (
    <div>
      <ModuleHeader
        step="priorizacion"
        title="Priorizacion de senales"
        purpose={`Fase 2 IETS: filtrar tecnologias por impacto potencial. Umbral de prioridad: ${SCREENING_QUEUE_THRESHOLD}%. ${highPriorityCount} senales sobre el umbral.`}
        actions={
          isEditor && (
            <Button variant="secondary" onClick={() => navigate("/caracterizacion")}>
              Fase 3 · Caracterizar
            </Button>
          )
        }
      />

      <PhaseGuide
        phase="Fase 2 · Priorizacion"
        tasks={[
          "Revisar senales nuevas capturadas en la vigilancia.",
          "Evaluar impacto potencial (puntuacion >70% = prioridad alta para Colombia).",
          "Mover al tablero: revisado → priorizado → caracterizacion (Fase 3).",
        ]}
        nextLabel="Caracterizacion"
        onNext={() => navigate("/caracterizacion")}
      />

      <ModuleStatsRow
        items={[
          { label: "Nuevas", value: statusCounts.nuevo, color: statusCounts.nuevo > 0 ? "#6366F1" : undefined },
          { label: "En revision", value: statusCounts.revisado },
          { label: "Priorizadas", value: statusCounts.priorizado, color: "#10B981" },
          { label: "Alta prioridad", value: highPriorityCount, sub: `>${SCREENING_QUEUE_THRESHOLD}%`, color: "#EF4444" },
        ]}
      />

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Buscar tecnologia o senal..."
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="filter-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <select value={filters.horizon} onChange={(e) => setFilters({ ...filters, horizon: e.target.value })} className="filter-select">
            <option value="">Todos los horizontes</option>
            {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <select value={filters.technology_type} onChange={(e) => setFilters({ ...filters, technology_type: e.target.value })} className="filter-select">
            <option value="">Todos los tipos</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="filter-select">
            <option value="">Todos los estados</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 8 }}>
            <button type="button" className={`view-toggle${view === "kanban" ? " active" : ""}`} onClick={() => setView("kanban")}>Tablero</button>
            <button type="button" className={`view-toggle${view === "table" ? " active" : ""}`} onClick={() => setView("table")}>Tabla</button>
          </div>
          <span style={{ fontSize: 13, color: "#64748B" }}>{findings.length} senales</span>
        </div>
      </Card>

      {findings.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔭"
            title="Sin senales detectadas"
            message="Ejecute la vigilancia de fuentes (Fase 1) para capturar tecnologias emergentes."
            action={
              isEditor ? (
                <Button onClick={() => navigate("/vigilancia")}>
                  <Icon name="radar" size={16} /> Fase 1 · Vigilancia
                </Button>
              ) : null
            }
          />
        </Card>
      ) : view === "kanban" ? (
        <TriageBoard
          findings={findings}
          isEditor={isEditor}
          onOpen={setDetail}
          onStatus={quickStatus}
          onGenerate={generateRec}
        />
      ) : (
        <Card padding={0}>
          <DataTable columns={columns} rows={findings.map((f) => ({ key: f.id, data: f }))} minWidth={960} />
        </Card>
      )}

      <FindingDetailModal
        finding={detail}
        onClose={() => setDetail(null)}
        isEditor={isEditor}
        status={status}
        enhancingId={enhancingId}
        onEnhance={enhanceFinding}
        onQuickStatus={quickStatus}
      />

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar ficha de senal" width={620}
        footer={<><Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={save} loading={saving}>Guardar</Button></>}
      >
        {form && (
          <>
            <Input label="Titulo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input label="Tecnologia" value={form.technology} onChange={(e) => setForm({ ...form, technology: e.target.value })} />
            <Textarea label="Resumen / evidencia" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Select label="Tipo" value={form.technology_type} onChange={(e) => setForm({ ...form, technology_type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Select label="Horizonte temporal" value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })}>
                <option value="">Sin clasificar</option>
                {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Input label="Fase de desarrollo" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
              <Input label="Area terapeutica" value={form.therapeutic_area} onChange={(e) => setForm({ ...form, therapeutic_area: e.target.value })} />
            </div>
            <Select label="Estado de triage" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            {form.screening_score != null && (
              <p style={{ fontSize: 13, color: "#64748B", marginTop: 8 }}>
                Puntuacion de impacto: <strong>{form.screening_score}%</strong> (se recalcula al guardar)
              </p>
            )}
          </>
        )}
      </Modal>
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
};
