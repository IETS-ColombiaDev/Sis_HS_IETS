import { useCallback, useEffect, useState } from "react";
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
import Modal from "../components/Modal";
import Markdown from "../components/Markdown";
import ConfirmDialog from "../components/ConfirmDialog";
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
  const navigate = useNavigate();

  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [edit, setEdit] = useState(null); // recomendacion en edicion
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [impactFilter, setImpactFilter] = useState("");

  const filtered = recs.filter((r) => !impactFilter || r.impact === impactFilter);
  const impactStats = {
    alto: recs.filter((r) => r.impact === "alto").length,
    medio: recs.filter((r) => r.impact === "medio").length,
    bajo: recs.filter((r) => r.impact === "bajo").length,
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/recommendations");
      setRecs(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar los informes"));
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
      <ModuleHeader
        step="diseminacion"
        title="Diseminacion e informes"
        purpose="Fase 4 IETS: recomendaciones de adopcion para Colombia a partir de tecnologias caracterizadas."
      />

      <PhaseGuide
        phase="Fase 4 · Diseminacion"
        tasks={[
          "Generar informes de adopcion para el sistema de salud colombiano (Gemini + revision humana).",
          "Clasificar impacto esperado: alto / medio / bajo.",
          "Documentar decisiones del equipo en notas vinculadas.",
        ]}
        nextLabel="Notas del equipo"
        onNext={() => navigate("/notas")}
      />

      <ModuleStatsRow
        items={[
          { label: "Informes emitidos", value: recs.length },
          { label: "Impacto alto", value: impactStats.alto, color: "#EF4444" },
          { label: "Impacto medio", value: impactStats.medio, color: "#F59E0B" },
          { label: "Impacto bajo", value: impactStats.bajo },
        ]}
      />

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
            title="Sin informes de diseminacion"
            message="Genere informes desde senales priorizadas y caracterizadas en las fases anteriores."
            action={
              <Button onClick={() => navigate("/priorizacion")}>
                <Icon name="layers" size={16} /> Ir a Priorizacion
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card padding={16} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>Filtrar por impacto:</span>
              {["", "alto", "medio", "bajo"].map((i) => (
                <button
                  key={i || "all"}
                  type="button"
                  className={`view-toggle${impactFilter === i ? " active" : ""}`}
                  onClick={() => setImpactFilter(i)}
                >
                  {i || "Todos"}
                </button>
              ))}
            </div>
          </Card>
          <div className="informe-list">
          {filtered.map((r) => (
            <Card key={r.id} padding={0} className="informe-card">
              <div className="informe-card-inner">
                <div className="informe-card-head">
                  <div>
                    {r.impact ? <Badge tone={r.impact}>Impacto {r.impact}</Badge> : <Badge tone="viewer">Sin impacto</Badge>}
                    <span className="informe-meta">Informe #{r.id} · {new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  <Badge tone="viewer">🤖 {r.model_used}</Badge>
                </div>
                <h3 className="informe-title">{r.title}</h3>
                <p className="informe-excerpt">
                  {r.content.replace(/[#*`>]/g, "").slice(0, 280)}…
                </p>
                <div className="informe-actions">
                  <Button size="sm" onClick={() => setDetail(r)}>Leer informe completo</Button>
                  {isEditor && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Icon name="edit" size={14} /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" style={{ color: "#EF4444" }} onClick={() => setConfirmDel(r)}>
                        <Icon name="trash" size={15} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
          </div>
        </>
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
            <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 12px" }}>
              Markdown soportado. Ajuste titulo, contenido e impacto segun relevancia para Colombia.
            </p>
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
