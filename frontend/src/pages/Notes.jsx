import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import PhaseGuide from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { Textarea } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { downloadFromApi } from "../utils/download";
import { ENTITY_LABELS } from "../components/NotesPanel";

const FILTERS = [
  { value: "", label: "Todas" },
  { value: "finding", label: "Senales tecnologicas" },
  { value: "source", label: "Referentes" },
  { value: "recommendation", label: "Informes" },
  { value: "general", label: "Generales" },
];

export default function Notes() {
  const { isEditor } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ title: "", content: "", entity_type: "general" });
  const [saving, setSaving] = useState(false);

  const [exporting, setExporting] = useState(false);

  const exportNotes = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, "/notes/export?format=csv", "notas_iets.csv");
      toast.success("Notas descargadas");
    } catch (e) {
      toast.error(apiError(e, "No se pudo descargar"));
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const params = {};
      if (typeFilter) params.entity_type = typeFilter;
      if (q.trim()) params.q = q.trim();
      const { data } = await api.get("/notes", { params });
      setNotes(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las notas"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, q]);

  useEffect(() => {
    load();
  }, [load, version]);

  const create = async () => {
    if (!form.content.trim()) {
      toast.warning("Escriba el contenido de la nota");
      return;
    }
    setSaving(true);
    try {
      await api.post("/notes", form);
      toast.success("Nota creada");
      setCreateOpen(false);
      setForm({ title: "", content: "", entity_type: "general" });
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo crear"));
    } finally {
      setSaving(false);
    }
  };

  const entityLink = (n) => {
    if (n.entity_type === "finding" && n.entity_id) return `/priorizacion`;
    if (n.entity_type === "source" && n.entity_id) return `/fuentes`;
    if (n.entity_type === "recommendation" && n.entity_id) return `/diseminacion`;
    return null;
  };

  const columns = useMemo(
    () => [
      {
        key: "note",
        label: "Nota",
        render: (n) => (
          <div>
            <button
              type="button"
              onClick={() => setDetail(n)}
              style={{ border: "none", background: "none", padding: 0, fontWeight: 600, color: "#0F172A", cursor: "pointer", textAlign: "left" }}
            >
              {n.pinned && "📌 "}{n.title || n.content.slice(0, 80)}
            </button>
            {!n.title && n.content.length > 80 && (
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{n.content.slice(0, 120)}…</div>
            )}
          </div>
        ),
      },
      {
        key: "type",
        width: 130,
        label: "Vinculada a",
        render: (n) => <Badge>{ENTITY_LABELS[n.entity_type] || n.entity_type}</Badge>,
      },
      {
        key: "author",
        width: 160,
        label: "Autor",
        render: (n) => <span style={{ fontSize: 13, color: "#64748B" }}>{n.author_name || n.author_email}</span>,
      },
      {
        key: "updated",
        width: 150,
        label: "Actualizada",
        render: (n) => <span style={{ fontSize: 12, color: "#94A3B8" }}>{new Date(n.updated_at).toLocaleDateString()}</span>,
      },
      {
        key: "actions",
        width: 90,
        align: "right",
        label: "Ver",
        render: (n) => (
          <Button size="sm" variant="ghost" onClick={() => setDetail(n)}>Abrir</Button>
        ),
      },
    ],
    []
  );

  if (loading) return <LoadingBlock label="Cargando notas..." />;

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title="Notas del equipo"
        titleHint="Notas internas del equipo, vinculadas a senales, fuentes o informes. No son el informe publico."
        purpose="Documentacion colaborativa vinculada a senales, fuentes e informes de diseminacion."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={exportNotes} loading={exporting}>
              <Icon name="doc" size={16} /> Descargar CSV
            </Button>
            {isEditor && (
              <Button onClick={() => setCreateOpen(true)}>
                <Icon name="plus" size={16} /> Nueva nota
              </Button>
            )}
          </div>
        }
      />

      <PhaseGuide
        phase="Soporte a diseminacion"
        hint={GLOSSARY.diseminacion}
        tasks={[
          "Registrar observaciones del equipo sobre senales e informes.",
          "Documentar decisiones de comite y seguimiento regulatorio (INVIMA, ETS).",
          "Vincular notas a la entidad correspondiente del pipeline.",
        ]}
      />

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Buscar en notas..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="filter-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="filter-select">
            {FILTERS.map((f) => (
              <option key={f.value || "all"} value={f.value}>{f.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: "#64748B" }}>{notes.length} notas</span>
        </div>
      </Card>

      {notes.length === 0 ? (
        <Card>
          <EmptyState
            icon="📝"
            title="Sin notas"
            message={isEditor ? "Cree la primera nota para documentar observaciones del equipo." : "Aun no hay notas registradas."}
            action={
              isEditor ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Icon name="plus" size={16} /> Nueva nota
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card padding={0}>
          <DataTable
            columns={columns}
            rows={notes.map((n) => ({ key: n.id, data: n }))}
            minWidth={760}
          />
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || "Nota"} width={640}>
        {detail && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <Badge>{ENTITY_LABELS[detail.entity_type]}</Badge>
              {detail.pinned && <Badge tone="medio">Fijada</Badge>}
            </div>
            {detail.entity_label && detail.entity_type !== "general" && (
              <p style={{ fontSize: 13, color: "#64748B", marginBottom: 10 }}>
                Vinculada a: <strong>{detail.entity_label}</strong>
                {entityLink(detail) && (
                  <> · <Link to={entityLink(detail)} style={{ color: "#4F46E5" }}>Ir al modulo</Link></>
                )}
              </p>
            )}
            <p style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", color: "#334155" }}>{detail.content}</p>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #F1F5F9", fontSize: 12, color: "#94A3B8" }}>
              {detail.author_name} · {new Date(detail.updated_at).toLocaleString()}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nueva nota general"
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={create} loading={saving}>Guardar nota</Button>
          </>
        }
      >
        <input
          placeholder="Titulo (opcional)"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          style={{ width: "100%", padding: "10px 12px", border: "2px solid #E2E8F0", borderRadius: 8, fontSize: 14, marginBottom: 12 }}
        />
        <Textarea
          label="Contenido"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          rows={5}
          placeholder="Documente una observacion, seguimiento o decision del equipo..."
        />
      </Modal>
    </div>
  );
}
