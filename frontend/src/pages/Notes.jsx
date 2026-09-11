import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import { PERM } from "../constants/methodology";
import PhaseGuide from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { Input, Select, Textarea } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { downloadFromApi } from "../utils/download";
import { ENTITY_LABELS, canManageNote } from "../components/NotesPanel";

const FILTERS = [
  { value: "", label: "Todas" },
  { value: "finding", label: "Señales" },
  { value: "source", label: "Fuentes" },
  { value: "recommendation", label: "Informes" },
  { value: "general", label: "Generales" },
];
const LINK_PATH = { finding: "/senales", source: "/fuentes", recommendation: "/diseminacion" };
const EMPTY_FORM = { title: "", content: "", entity_type: "general", entity_id: "", pinned: false };

export default function Notes() {
  const { can, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const canWrite = can(PERM.NOTE_WRITE);
  const noWrite = `Su perfil (${user?.role_label || user?.role}) puede leer las notas pero no escribirlas (permiso note:write).`;

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(debounce.current);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (typeFilter) params.entity_type = typeFilter;
      if (query) params.q = query;
      const { data } = await api.get("/notes", { params });
      setNotes(data);
      setDetail((d) => (d ? data.find((n) => n.id === d.id) || null : d));
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las notas"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, query]);

  useEffect(() => {
    load();
  }, [load, version]);

  // Opciones del vinculo segun el tipo elegido en el formulario.
  useEffect(() => {
    if (!formOpen || editing || form.entity_type === "general") {
      setOptions([]);
      return;
    }
    let alive = true;
    setOptionsLoading(true);
    const path = { finding: "/findings", source: "/sources", recommendation: "/recommendations" }[form.entity_type];
    api
      .get(path, { params: form.entity_type === "finding" ? { limit: 300 } : {} })
      .then(({ data }) => {
        if (alive) setOptions(data.map((x) => ({ id: x.id, label: x.title })));
      })
      .catch((e) => toast.error(apiError(e, "No se pudieron cargar las opciones del vínculo")))
      .finally(() => alive && setOptionsLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, editing, form.entity_type]);

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

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (n) => {
    setEditing(n);
    setForm({ title: n.title || "", content: n.content, entity_type: n.entity_type, entity_id: n.entity_id || "", pinned: n.pinned });
    setFormError("");
    setFormOpen(true);
  };

  const save = async () => {
    setFormError("");
    if (!form.content.trim()) {
      setFormError("Escriba el contenido de la nota.");
      return;
    }
    if (!editing && form.entity_type !== "general" && !form.entity_id) {
      setFormError("Elija el elemento al que se vincula la nota, o cambie el tipo a 'General'.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/notes/${editing.id}`, { title: form.title, content: form.content, pinned: form.pinned });
        toast.success("Nota actualizada");
      } else {
        await api.post("/notes", {
          title: form.title,
          content: form.content,
          pinned: form.pinned,
          entity_type: form.entity_type,
          entity_id: form.entity_type === "general" ? null : Number(form.entity_id),
        });
        toast.success("Nota creada");
      }
      setFormOpen(false);
      load();
    } catch (e) {
      setFormError(apiError(e, "No se pudo guardar la nota"));
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (n) => {
    try {
      await api.put(`/notes/${n.id}`, { pinned: !n.pinned });
      toast.success(n.pinned ? "Nota soltada" : "Nota fijada");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo fijar la nota"));
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/notes/${confirmDel.id}`);
      toast.success("Nota eliminada");
      setConfirmDel(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const NoteActions = ({ n }) => {
    const own = canManageNote(n, user, can);
    if (!canWrite) return null;
    return (
      <div className="fb-toolbar" style={{ justifyContent: "flex-end", gap: 2 }}>
        <HintButton size="sm" variant="ghost" hint={GLOSSARY.fb_nota_fijar} onClick={() => togglePin(n)} aria-label={n.pinned ? "Soltar nota" : "Fijar nota"}>
          {n.pinned ? "Soltar" : "Fijar"}
        </HintButton>
        <HintButton size="sm" variant="ghost" hint="Editar la nota" disabled={!own} disabledHint={GLOSSARY.fb_nota_autor} onClick={() => openEdit(n)} aria-label="Editar nota">
          <Icon name="edit" size={14} />
        </HintButton>
        <HintButton size="sm" variant="ghost" style={{ color: own ? "#DC2626" : undefined }} hint="Eliminar la nota" disabled={!own} disabledHint={GLOSSARY.fb_nota_autor} onClick={() => setConfirmDel(n)} aria-label="Eliminar nota">
          <Icon name="trash" size={14} />
        </HintButton>
      </div>
    );
  };

  const columns = [
      {
        key: "note",
        label: "Nota",
        render: (n) => (
          <div>
            <button
              type="button"
              onClick={() => setDetail(n)}
              style={{ border: "none", background: "none", padding: 0, fontWeight: 600, color: "#0F172A", cursor: "pointer", textAlign: "left", overflowWrap: "anywhere" }}
            >
              {n.pinned && "📌 "}{n.title || n.content.slice(0, 80)}
            </button>
            {!n.title && n.content.length > 80 && <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{n.content.slice(0, 120)}…</div>}
          </div>
        ),
      },
      {
        key: "type",
        width: 200,
        label: "Vinculada a",
        tip: <InfoTip text={GLOSSARY.fb_nota_vinculo} label="Qué es el vínculo" />,
        render: (n) => (
          <div>
            <Badge>{ENTITY_LABELS[n.entity_type] || n.entity_type}</Badge>
            {n.entity_type !== "general" && <div style={{ fontSize: 12, color: "#64748B", marginTop: 2, overflowWrap: "anywhere" }}>{n.entity_label}</div>}
          </div>
        ),
      },
      { key: "author", width: 160, label: "Autor", render: (n) => <span style={{ fontSize: 13, color: "#64748B" }}>{n.author_name || n.author_email}</span> },
      { key: "updated", width: 110, label: "Actualizada", render: (n) => <span style={{ fontSize: 12, color: "#94A3B8" }}>{new Date(n.updated_at).toLocaleDateString()}</span> },
      { key: "actions", width: 190, align: "right", label: "Acciones", render: (n) => <NoteActions n={n} /> },
  ];

  if (loading) return <LoadingBlock label="Cargando notas..." />;

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title="Notas del equipo"
        titleHint="Notas internas del equipo, vinculadas a señales, fuentes o informes. No son el informe público."
        purpose="Documentación colaborativa vinculada a señales, fuentes e informes de diseminación."
        actions={
          <div className="fb-toolbar">
            <HintButton variant="secondary" hint="Descarga todas las notas en CSV (abre en Excel)" onClick={exportNotes} loading={exporting}>
              <Icon name="doc" size={16} /> Descargar CSV
            </HintButton>
            <HintButton hint="Crear una nota general o vinculada a una señal, fuente o informe" disabled={!canWrite} disabledHint={noWrite} onClick={openCreate}>
              <Icon name="plus" size={16} /> Nueva nota
            </HintButton>
          </div>
        }
      />

      <PhaseGuide
        phase="Soporte a diseminación"
        hint={GLOSSARY.diseminacion}
        tasks={[
          "Registrar observaciones del equipo sobre señales e informes.",
          "Documentar decisiones de comité y seguimiento regulatorio (INVIMA, ETS).",
          "Vincular cada nota a la entidad correspondiente del pipeline.",
        ]}
      />

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div className="fb-toolbar">
          <input placeholder="Buscar en notas..." aria-label="Buscar en notas" value={q} onChange={(e) => setQ(e.target.value)} className="filter-input" style={{ flex: 1, minWidth: 200 }} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="filter-select" aria-label="Filtrar por vínculo">
            {FILTERS.map((f) => (
              <option key={f.value || "all"} value={f.value}>{f.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: "#64748B" }} data-testid="notes-count">{notes.length} notas</span>
        </div>
      </Card>

      {notes.length === 0 ? (
        <Card>
          <EmptyState
            icon="📝"
            title={q || typeFilter ? "Ninguna nota coincide" : "Sin notas"}
            message={canWrite ? "Cree una nota para documentar observaciones del equipo." : "Aún no hay notas registradas."}
            action={canWrite ? <Button onClick={openCreate}><Icon name="plus" size={16} /> Nueva nota</Button> : null}
          />
        </Card>
      ) : (
        <Card padding={0}>
          <DataTable stack columns={columns} rows={notes.map((n) => ({ key: n.id, data: n }))} minWidth={860} />
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || "Nota"} width={640} footer={detail ? <NoteActions n={detail} /> : null}>
        {detail && (
          <div data-testid="note-detail">
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <Badge>{ENTITY_LABELS[detail.entity_type]}</Badge>
              {detail.pinned && <Badge tone="medio">Fijada</Badge>}
            </div>
            {detail.entity_type !== "general" && (
              <p style={{ fontSize: 13, color: "#64748B", marginBottom: 10 }}>
                Vinculada a: <strong>{detail.entity_label}</strong>
                {LINK_PATH[detail.entity_type] && (
                  <> · <Link to={LINK_PATH[detail.entity_type]} style={{ color: "#4F46E5" }}>Ir al módulo</Link></>
                )}
              </p>
            )}
            <p style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", color: "#334155" }}>{detail.content}</p>
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #F1F5F9", fontSize: 12, color: "#94A3B8" }}>
              {detail.author_name || detail.author_email} · {new Date(detail.updated_at).toLocaleString()}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar nota" : "Nueva nota"}
        width={600}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} loading={saving}>{editing ? "Guardar cambios" : "Guardar nota"}</Button>
          </>
        }
      >
        {formError && <p className="public-submit-error" role="alert">{formError}</p>}
        {!editing && (
          <div className="fb-grid-2">
            <Select id="note-entity-type" label="Vincular a" hint={GLOSSARY.fb_nota_vinculo} value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value, entity_id: "" })}>
              <option value="general">Nota general</option>
              <option value="finding">Una señal</option>
              <option value="source">Una fuente</option>
              <option value="recommendation">Un informe de diseminación</option>
            </Select>
            {form.entity_type !== "general" && (
              <Select id="note-entity-id" label="Elemento" required value={form.entity_id} onChange={(e) => setForm({ ...form, entity_id: e.target.value })} disabled={optionsLoading}>
                <option value="">{optionsLoading ? "Cargando..." : options.length ? "Seleccione..." : "No hay elementos"}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{(o.label || `#${o.id}`).slice(0, 90)}</option>
                ))}
              </Select>
            )}
          </div>
        )}
        {editing && editing.entity_type !== "general" && (
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 0 }}>Vinculada a: <strong>{editing.entity_label}</strong> (el vínculo no se cambia).</p>
        )}
        <Input id="note-title" label="Título (opcional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea id="note-content" label="Contenido" required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} placeholder="Documente una observación, seguimiento o decisión del equipo..." />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
          Fijar la nota <InfoTip text={GLOSSARY.fb_nota_fijar} />
        </label>
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Eliminar nota"
        message="La nota se eliminará para todo el equipo. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </div>
  );
}
