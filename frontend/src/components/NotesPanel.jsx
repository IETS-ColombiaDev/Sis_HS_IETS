import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "./Toast";
import Button from "./Button";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import InfoTip from "./InfoTip";
import ConfirmDialog from "./ConfirmDialog";
import { Textarea } from "./Field";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";

const ENTITY_LABELS = {
  finding: "Señal",
  source: "Fuente",
  recommendation: "Informe",
  general: "General",
};

/** Puede editar o borrar: el autor o quien administra usuarios (superadmin). */
export function canManageNote(note, user, can) {
  if (!note || !user) return false;
  return (note.author_email || "").toLowerCase() === (user.email || "").toLowerCase() || can(PERM.USER_MANAGE);
}

/**
 * Panel de notas reutilizable: se incrusta en modales de senales, fuentes, etc.
 */
export default function NotesPanel({ entityType, entityId, compact = false }) {
  const { can, user, status } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const canWrite = can(PERM.NOTE_WRITE);
  const aiOn = Boolean(status?.ai_enabled ?? status?.gemini_enabled);

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [enhancingId, setEnhancingId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = { entity_type: entityType };
      if (entityId != null) params.entity_id = entityId;
      const { data } = await api.get("/notes", { params });
      setNotes(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las notas"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load, version]);

  const addNote = async () => {
    if (!draft.trim()) {
      toast.warning("Escriba el contenido de la nota");
      return;
    }
    setSaving(true);
    try {
      await api.post("/notes", {
        entity_type: entityType,
        entity_id: entityId ?? null,
        title: title.trim(),
        content: draft.trim(),
      });
      toast.success("Nota guardada");
      setDraft("");
      setTitle("");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar la nota"));
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (note) => {
    if (!editContent.trim()) {
      toast.warning("La nota no puede quedar vacía");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/notes/${note.id}`, { title: editTitle, content: editContent });
      toast.success("Nota actualizada");
      setEditId(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar"));
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (note) => {
    try {
      await api.put(`/notes/${note.id}`, { pinned: !note.pinned });
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo fijar la nota"));
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/notes/${confirmDel.id}`);
      toast.success("Nota eliminada");
      setConfirmDel(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const enhanceNote = async (note) => {
    setEnhancingId(note.id);
    try {
      await api.post(`/notes/${note.id}/enhance-ai`);
      toast.success("Nota mejorada con IA");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo mejorar con IA"));
    } finally {
      setEnhancingId(null);
    }
  };

  const downloadNote = (note) => {
    const text = `# ${note.title || "Nota"}\n\n${note.content}\n\n---\nAutor: ${note.author_name}\nActualizada: ${note.updated_at}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nota_${note.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="notes-panel" data-testid="notes-panel" style={{ marginTop: compact ? 0 : 18, borderTop: compact ? "none" : "1px solid #E2E8F0", paddingTop: compact ? 0 : 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Icon name="note" size={18} color="#4F46E5" />
        <h4 style={{ fontSize: 14, fontWeight: 700, flex: 1, display: "inline-flex", alignItems: "center", gap: 6 }}>
          Notas del equipo {notes.length > 0 && <span style={{ color: "#94A3B8", fontWeight: 500 }}>({notes.length})</span>}
          <InfoTip text={`${GLOSSARY.fb_nota_autor} ${GLOSSARY.fb_nota_fijar}`} label="Reglas de las notas" />
        </h4>
      </div>

      {canWrite ? (
        <div style={{ marginBottom: 14, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 12 }}>
          <input
            placeholder="Título opcional (ej. Seguimiento regulatorio)"
            aria-label="Título de la nota"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, marginBottom: 8 }}
          />
          <Textarea
            placeholder="Escriba una observación, seguimiento o decisión del equipo..."
            aria-label="Contenido de la nota"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={compact ? 2 : 3}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Button size="sm" onClick={addNote} loading={saving} disabled={!draft.trim()}>
              <Icon name="plus" size={14} /> Agregar nota
            </Button>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: "#94A3B8", margin: "0 0 10px" }}>
          Su perfil puede leer las notas pero no escribirlas (permiso note:write).
        </p>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "#94A3B8" }}>Cargando notas...</p>
      ) : notes.length === 0 ? (
        <p style={{ fontSize: 13, color: "#94A3B8", fontStyle: "italic" }}>
          {canWrite ? "Aún no hay notas. Use el cuadro de arriba para documentar observaciones del equipo." : "Sin notas registradas."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: compact ? 280 : 420, overflowY: "auto" }}>
          {notes.map((n) => {
            const own = canManageNote(n, user, can);
            return (
              <div
                key={n.id}
                data-testid={`note-${n.id}`}
                style={{
                  border: n.pinned ? "1px solid #FDE68A" : "1px solid #E2E8F0",
                  background: n.pinned ? "#FFFBEB" : "#fff",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                {editId === n.id ? (
                  <>
                    <input
                      value={editTitle}
                      aria-label="Título de la nota"
                      onChange={(e) => setEditTitle(e.target.value)}
                      style={{ width: "100%", padding: "6px 8px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13, marginBottom: 6 }}
                    />
                    <textarea
                      value={editContent}
                      aria-label="Contenido de la nota"
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      style={{ width: "100%", padding: "8px", border: "1px solid #E2E8F0", borderRadius: 6, fontSize: 13 }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <Button size="sm" onClick={() => saveEdit(n)} loading={saving}>Guardar</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditId(null)}>Cancelar</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <div>
                        {n.pinned && <span title="Nota fijada">📌 </span>}
                        {n.title && <strong style={{ fontSize: 13 }}>{n.title}</strong>}
                      </div>
                      <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>{new Date(n.updated_at).toLocaleString()}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "#334155", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{n.content}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>{n.author_name || n.author_email}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <IconAction label="Descargar nota" onClick={() => downloadNote(n)}><Icon name="doc" size={13} /></IconAction>
                        {canWrite && (
                          <>
                            <IconAction
                              label={!aiOn ? GLOSSARY.fb_ia_apagada : !own ? GLOSSARY.fb_nota_autor : "Mejorar redacción con IA"}
                              onClick={() => enhanceNote(n)}
                              disabled={!aiOn || !own || enhancingId === n.id}
                            >
                              <Icon name="spark" size={13} />
                            </IconAction>
                            <IconAction label={n.pinned ? "Soltar nota" : "Fijar nota"} onClick={() => togglePin(n)}>{n.pinned ? "📌" : "📍"}</IconAction>
                            <IconAction
                              label={own ? "Editar nota" : GLOSSARY.fb_nota_autor}
                              disabled={!own}
                              onClick={() => { setEditId(n.id); setEditContent(n.content); setEditTitle(n.title || ""); }}
                            >
                              <Icon name="edit" size={13} />
                            </IconAction>
                            <IconAction label={own ? "Eliminar nota" : GLOSSARY.fb_nota_autor} disabled={!own} danger onClick={() => setConfirmDel(n)}>
                              <Icon name="trash" size={13} />
                            </IconAction>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={remove}
        loading={deleting}
        title="Eliminar nota"
        message="La nota se eliminará para todo el equipo. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </div>
  );
}

function IconAction({ label, onClick, disabled = false, danger = false, children }) {
  return (
    <Tooltip text={label}>
      <span tabIndex={disabled ? 0 : -1} style={{ display: "inline-flex" }}>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          style={{ ...iconBtn, color: danger ? "#EF4444" : undefined, opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer", pointerEvents: disabled ? "none" : "auto" }}
        >
          {children}
        </button>
      </span>
    </Tooltip>
  );
}

const iconBtn = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 4,
  borderRadius: 6,
  display: "inline-flex",
  alignItems: "center",
};

export { ENTITY_LABELS };
