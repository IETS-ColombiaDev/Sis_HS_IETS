import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import HelpNote from "../components/HelpNote";
import DataTable from "../components/DataTable";
import NotesPanel from "../components/NotesPanel";
import { Input, Textarea, Select } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";

const HORIZONS = ["emergente", "transicional", "inminente"];
const TYPES = ["medicamento", "dispositivo", "digital", "otro"];
const STATUSES = ["nuevo", "revisado", "priorizado", "descartado"];

export default function Findings() {
  const { isEditor, status } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();

  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
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
      toast.error(apiError(e, "No se pudieron cargar los hallazgos"));
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
      toast.success("Hallazgo actualizado");
      setEditOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar"));
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (f, status) => {
    try {
      await api.put(`/findings/${f.id}`, { status });
      toast.success(`Marcado como ${status}`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar"));
    }
  };

  const generateRec = async (f) => {
    setGenId(f.id);
    try {
      const { data } = await api.post("/recommendations/generate", { finding_id: f.id });
      toast.success(`Recomendacion generada (${data.model_used})`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo generar la recomendacion"));
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
      toast.success("Hallazgo enriquecido con IA");
      setDetail(data);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo enriquecer con IA"));
    } finally {
      setEnhancingId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "title",
        label: "Hallazgo",
        render: (f) => (
          <div>
            <button
              type="button"
              onClick={() => setDetail(f)}
              title="Ver detalle y notas"
              style={{ border: "none", background: "none", textAlign: "left", padding: 0, fontWeight: 600, color: "#0F172A", cursor: "pointer", lineHeight: 1.35 }}
            >
              {f.title}
            </button>
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              {f.recommendations_count > 0 && (
                <Tooltip text={`${f.recommendations_count} recomendacion(es) IA`}>
                  <Badge tone="priorizado">IA {f.recommendations_count}</Badge>
                </Tooltip>
              )}
              {f.notes_count > 0 && (
                <Tooltip text={`${f.notes_count} nota(s) del equipo`}>
                  <Badge tone="viewer"><Icon name="note" size={11} /> {f.notes_count}</Badge>
                </Tooltip>
              )}
            </div>
          </div>
        ),
      },
      {
        key: "type",
        width: 120,
        label: (
          <>
            Tipo
            <Tooltip text="Medicamento, dispositivo, salud digital u otro.">
              <span className="th-tip">?</span>
            </Tooltip>
          </>
        ),
        render: (f) => <Badge>{f.technology_type}</Badge>,
      },
      {
        key: "horizon",
        width: 130,
        label: (
          <>
            Horizonte
            <Tooltip text="Emergente (lejano), transicional (en camino) o inminente (proximo).">
              <span className="th-tip">?</span>
            </Tooltip>
          </>
        ),
        render: (f) => (f.horizon ? <Badge>{f.horizon}</Badge> : <span style={{ color: "#CBD5E1" }}>—</span>),
      },
      {
        key: "status",
        width: 120,
        label: "Estado",
        render: (f) => <Badge tone={f.status}>{f.status}</Badge>,
      },
      {
        key: "source",
        width: 180,
        label: "Fuente",
        render: (f) => (
          <span style={{ fontSize: 13, color: "#64748B", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.source_title}>
            {f.source_title}
          </span>
        ),
      },
      {
        key: "actions",
        width: isEditor ? 220 : 80,
        align: "right",
        label: "Acciones",
        render: (f) => (
          <div style={{ whiteSpace: "nowrap" }}>
            <Button size="sm" variant="ghost" onClick={() => setDetail(f)}>Ver</Button>
            {isEditor && (
              <>
                <Tooltip text="Editar clasificacion">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(f)}><Icon name="edit" size={14} /></Button>
                </Tooltip>
                <Tooltip text="Generar recomendacion IA">
                  <Button size="sm" variant="outline" loading={genId === f.id} onClick={() => generateRec(f)}>
                    <Icon name="pulse" size={14} /> IA
                  </Button>
                </Tooltip>
              </>
            )}
          </div>
        ),
      },
    ],
    [isEditor, genId]
  );

  if (loading) return <LoadingBlock label="Cargando hallazgos..." />;

  return (
    <div>
      <PageHeader
        title="Hallazgos de escaneo"
        subtitle="Tecnologias y senales emergentes detectadas por la vigilancia de fuentes."
      />

      <HelpNote id="findings-intro">
        Cada fila es una <strong>tecnologia o senal</strong> detectada automaticamente en las fuentes vigiladas.
        Haga clic en el titulo para ver el detalle, abrir el enlace y <strong>agregar notas del equipo</strong>.
        Use <strong>Editar</strong> para corregir la clasificacion y <strong>Generar IA</strong> para crear una
        recomendacion de adopcion. Filtre por horizonte, tipo y estado.
      </HelpNote>

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Buscar hallazgo..."
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
          <span style={{ fontSize: 13, color: "#64748B" }}>{findings.length} hallazgos</span>
        </div>
      </Card>

      {findings.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔭"
            title="Sin hallazgos"
            message="Ejecute un escaneo de las fuentes para detectar tecnologias emergentes."
          />
        </Card>
      ) : (
        <Card padding={0}>
          <DataTable
            columns={columns}
            rows={findings.map((f) => ({ key: f.id, data: f }))}
            minWidth={960}
          />
        </Card>
      )}

      {/* Detalle */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle del hallazgo" width={720}>
        {detail && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <Badge>{detail.technology_type}</Badge>
              {detail.horizon && <Badge>{detail.horizon}</Badge>}
              <Badge tone={detail.status}>{detail.status}</Badge>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>{detail.title}</h3>
            {detail.summary && <p style={{ color: "#475569", fontSize: 14, marginBottom: 12, lineHeight: 1.6 }}>{detail.summary}</p>}
            <DL label="Tecnologia" value={detail.technology} />
            <DL label="Area terapeutica" value={detail.therapeutic_area} />
            <DL label="Fase" value={detail.phase} />
            <DL label="Publicado" value={detail.published_date} />
            <DL label="Fuente" value={detail.source_title} />
            {detail.url && (
              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href={detail.url} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm"><Icon name="external" size={14} /> Abrir enlace original</Button>
                </a>
                {status?.gemini_enabled && isEditor && (
                  <Button variant="outline" size="sm" loading={enhancingId === detail.id} onClick={() => enhanceFinding(detail)}>
                    <Icon name="spark" size={14} /> Enriquecer con IA
                  </Button>
                )}
                {detail.source_url && detail.source_url !== detail.url && (
                  <a href={detail.source_url} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm"><Icon name="globe" size={14} /> Ver fuente</Button>
                  </a>
                )}
              </div>
            )}
            {isEditor && (
              <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #F1F5F9", paddingTop: 14 }}>
                {STATUSES.map((s) => (
                  <Button key={s} size="sm" variant={detail.status === s ? "primary" : "secondary"} onClick={() => { quickStatus(detail, s); setDetail({ ...detail, status: s }); }}>
                    {s}
                  </Button>
                ))}
              </div>
            )}
            <NotesPanel entityType="finding" entityId={detail.id} />
          </div>
        )}
      </Modal>

      {/* Edicion */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar hallazgo"
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} loading={saving}>Guardar</Button>
          </>
        }
      >
        {form && (
          <>
            <Input label="Titulo" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input label="Tecnologia" value={form.technology} onChange={(e) => setForm({ ...form, technology: e.target.value })} />
            <Textarea label="Resumen" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Select label="Tipo" value={form.technology_type} onChange={(e) => setForm({ ...form, technology_type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Select label="Horizonte" value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })}>
                <option value="">Sin clasificar</option>
                {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Input label="Fase" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
              <Input label="Area terapeutica" value={form.therapeutic_area} onChange={(e) => setForm({ ...form, therapeutic_area: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Input label="Fecha de publicacion" value={form.published_date} onChange={(e) => setForm({ ...form, published_date: e.target.value })} />
              <Select label="Estado" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function DL({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 14 }}>
      <div style={{ width: 140, color: "#94A3B8", flexShrink: 0 }}>{label}</div>
      <div style={{ color: "#0F172A" }}>{value}</div>
    </div>
  );
}
