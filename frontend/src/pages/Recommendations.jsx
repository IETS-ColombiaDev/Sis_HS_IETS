import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import Markdown from "../components/Markdown";
import ConfirmDialog from "../components/ConfirmDialog";
import HelpNote from "../components/HelpNote";
import NotesPanel from "../components/NotesPanel";
import Icon from "../components/Icon";
import { Select } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";

const IMPACTS = ["", "alto", "medio", "bajo"];

export default function Recommendations() {
  const { isEditor, status } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();

  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [edit, setEdit] = useState(null); // recomendacion en edicion
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/recommendations");
      setRecs(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las recomendaciones"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/recommendations/${confirmDel.id}`);
      toast.success("Recomendacion eliminada");
      setConfirmDel(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (r) => {
    setEdit({ ...r });
    setShowPreview(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/recommendations/${edit.id}`, {
        title: edit.title,
        content: edit.content,
        impact: edit.impact || "",
      });
      toast.success("Recomendacion actualizada");
      setEdit(null);
      setDetail((d) => (d && d.id === data.id ? data : d));
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando recomendaciones..." />;

  return (
    <div>
      <PageHeader
        title="Recomendaciones de adopcion"
        subtitle="Analisis generados con IA (Gemini) sobre como podrian adoptarse en Colombia las tecnologias detectadas."
      />

      <HelpNote id="recs-intro">
        Cada tarjeta es una <strong>recomendacion de adopcion</strong> para Colombia generada por la IA a
        partir de un hallazgo. Puede <strong>editarla</strong> para ajustar el texto, corregir datos o
        cambiar el nivel de <strong>impacto</strong>. Para crear nuevas, vaya a <strong>Hallazgos</strong> y
        pulse el boton <em>Generar IA</em>.
      </HelpNote>

      {status && !status.gemini_enabled && (
        <Card style={{ marginBottom: 16, borderLeft: "4px solid #F59E0B", background: "#FFFBEB" }}>
          <div style={{ fontSize: 14, color: "#92400E" }}>
            <strong>IA no configurada.</strong> Defina el token de Gemini en <strong>Configuracion</strong> para
            generar recomendaciones enriquecidas. Sin ella se generan recomendaciones preliminares.
          </div>
        </Card>
      )}

      {recs.length === 0 ? (
        <Card>
          <EmptyState
            icon="💡"
            title="Sin recomendaciones"
            message="Vaya a Hallazgos y use el boton 'Generar IA' para crear una recomendacion de adopcion."
          />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {recs.map((r) => (
            <Card key={r.id} padding={20} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                {r.impact ? <Badge tone={r.impact}>Impacto {r.impact}</Badge> : <span />}
                <span style={{ fontSize: 11, color: "#94A3B8" }}>{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{r.title}</h3>
              <p
                style={{
                  fontSize: 13,
                  color: "#64748B",
                  marginTop: 8,
                  flex: 1,
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {r.content.replace(/[#*`>]/g, "").slice(0, 240)}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid #F1F5F9" }}>
                <span style={{ fontSize: 11, color: "#94A3B8" }} title={`Generado con ${r.model_used}`}>🤖 {r.model_used}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>Ver</Button>
                  {isEditor && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Icon name="edit" size={14} /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" style={{ color: "#EF4444" }} title="Eliminar" onClick={() => setConfirmDel(r)}>
                        <Icon name="trash" size={15} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Detalle */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title || "Recomendacion"}
        width={720}
        footer={
          detail && isEditor ? (
            <Button variant="secondary" onClick={() => { openEdit(detail); }}>
              <Icon name="edit" size={15} /> Editar recomendacion
            </Button>
          ) : null
        }
      >
        {detail && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {detail.impact && <Badge tone={detail.impact}>Impacto {detail.impact}</Badge>}
              <Badge tone="viewer">🤖 {detail.model_used}</Badge>
              <Badge tone="viewer">{new Date(detail.created_at).toLocaleString()}</Badge>
            </div>
            <Markdown>{detail.content}</Markdown>
            <NotesPanel entityType="recommendation" entityId={detail.id} />
          </div>
        )}
      </Modal>

      {/* Edicion */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Editar recomendacion"
        width={860}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveEdit} loading={saving}>
              <Icon name="save" size={15} /> Guardar cambios
            </Button>
          </>
        }
      >
        {edit && (
          <div>
            <HelpNote id="recs-edit" tone="tip" dismissible={false}>
              Escriba en <strong>Markdown</strong> (use <code>##</code> para titulos, <code>-</code> para listas,
              <code>**negrita**</code>). La vista previa muestra como se vera. Ajuste el <strong>impacto</strong> segun
              la relevancia para el sistema de salud colombiano.
            </HelpNote>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>Titulo</label>
                <input
                  value={edit.title}
                  onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                  style={inp}
                />
              </div>
              <Select
                label="Impacto"
                value={edit.impact || ""}
                onChange={(e) => setEdit({ ...edit, impact: e.target.value })}
              >
                {IMPACTS.map((i) => (
                  <option key={i || "none"} value={i}>{i ? i : "Sin definir"}</option>
                ))}
              </Select>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={lbl}>Contenido (Markdown)</label>
              <button
                onClick={() => setShowPreview((s) => !s)}
                style={{ border: "none", background: "transparent", color: "#4F46E5", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon name={showPreview ? "eyeOff" : "eye"} size={14} />
                {showPreview ? "Ocultar vista previa" : "Ver vista previa"}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: showPreview ? "1fr 1fr" : "1fr", gap: 14 }}>
              <textarea
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
                spellCheck={false}
                style={{
                  width: "100%",
                  minHeight: 360,
                  padding: "12px 14px",
                  border: "2px solid #E2E8F0",
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  lineHeight: 1.6,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              {showPreview && (
                <div
                  style={{
                    minHeight: 360,
                    maxHeight: 480,
                    overflowY: "auto",
                    padding: "12px 16px",
                    border: "1px solid #E2E8F0",
                    borderRadius: 10,
                    background: "#F8FAFC",
                  }}
                >
                  <Markdown>{edit.content || "_Vista previa..._"}</Markdown>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Eliminar recomendacion"
        message="Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
      />
    </div>
  );
}

const lbl = { display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 };
const inp = {
  width: "100%",
  padding: "10px 12px",
  border: "2px solid #E2E8F0",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
};
