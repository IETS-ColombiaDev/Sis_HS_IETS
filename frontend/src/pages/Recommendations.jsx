import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import { PERM } from "../constants/methodology";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import Markdown from "../components/Markdown";
import ConfirmDialog from "../components/ConfirmDialog";
import NotesPanel from "../components/NotesPanel";
import Icon from "../components/Icon";
import InfoTip, { TermLabel } from "../components/InfoTip";
import { Input, Select } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { downloadFromApi } from "../utils/download";

const IMPACTS = ["", "alto", "medio", "bajo"];
const EMPTY_NEW = { title: "", content: "", impact: "", finding_id: "" };

export default function Recommendations() {
  const { can, status, user } = useAuth();
  const { cycles, cycleId } = useCycle();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canWrite = can(PERM.REPORT_WRITE);
  const canPackage = canWrite || can(PERM.RESTRICTED_ANALYTICS);
  const aiOn = Boolean(status?.ai_enabled ?? status?.gemini_enabled);
  const noWrite = `Su perfil (${user?.role_label || user?.role}) puede leer los informes pero no redactarlos (permiso report:write).`;

  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [impactFilter, setImpactFilter] = useState("");
  const [search, setSearch] = useState("");

  const [createMode, setCreateMode] = useState(null); // "manual" | "ia"
  const [draft, setDraft] = useState(EMPTY_NEW);
  const [findings, setFindings] = useState([]);
  const [findingQuery, setFindingQuery] = useState("");
  const [formError, setFormError] = useState("");

  const [pkgCycle, setPkgCycle] = useState("");
  const [pkgDrafts, setPkgDrafts] = useState(false);
  const [packaging, setPackaging] = useState(false);

  const formalCycles = useMemo(() => cycles.filter((c) => !c.is_historic), [cycles]);
  useEffect(() => {
    if (!pkgCycle && (cycleId || formalCycles[0])) setPkgCycle(String(cycleId || formalCycles[0].id));
  }, [cycleId, formalCycles, pkgCycle]);

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

  useEffect(() => {
    if (!createMode) return undefined;
    const t = setTimeout(() => {
      api
        .get("/findings", { params: { q: findingQuery || undefined, limit: 50 } })
        .then(({ data }) => setFindings(data))
        .catch((e) => toast.error(apiError(e, "No se pudieron cargar las señales")));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createMode, findingQuery]);

  const filtered = recs.filter(
    (r) =>
      (!impactFilter || r.impact === impactFilter) &&
      (!search || `${r.title} ${r.content}`.toLowerCase().includes(search.toLowerCase()))
  );
  const impactStats = {
    alto: recs.filter((r) => r.impact === "alto").length,
    medio: recs.filter((r) => r.impact === "medio").length,
    bajo: recs.filter((r) => r.impact === "bajo").length,
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/recommendations/${confirmDel.id}`);
      toast.success("Informe eliminado");
      setConfirmDel(null);
      setDetail(null);
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
    if (!edit.title.trim() || !edit.content.trim()) {
      toast.warning("El título y el contenido no pueden quedar vacíos");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/recommendations/${edit.id}`, { title: edit.title, content: edit.content, impact: edit.impact || "" });
      toast.success("Informe actualizado");
      setEdit(null);
      setDetail((d) => (d && d.id === data.id ? data : d));
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const openCreate = (mode) => {
    setCreateMode(mode);
    setDraft(EMPTY_NEW);
    setFindingQuery("");
    setFormError("");
  };

  const submitCreate = async () => {
    setFormError("");
    if (createMode === "ia") {
      if (!draft.finding_id) {
        setFormError("Elija la señal sobre la que se genera el informe.");
        return;
      }
    } else if (!draft.title.trim() || !draft.content.trim()) {
      setFormError("El título y el contenido son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      let data;
      if (createMode === "ia") {
        ({ data } = await api.post("/recommendations/generate", { finding_id: Number(draft.finding_id) }));
        if (/sin IA|fallback/i.test(data.model_used || "")) toast.warning("IA no configurada: se creó un informe preliminar para completar a mano.");
        else toast.success(`Informe generado con ${data.model_used}`);
      } else {
        ({ data } = await api.post("/recommendations", {
          title: draft.title.trim(),
          content: draft.content.trim(),
          impact: draft.impact,
          finding_id: draft.finding_id ? Number(draft.finding_id) : null,
        }));
        toast.success("Informe creado");
      }
      setCreateMode(null);
      await load();
      setDetail(data);
    } catch (e) {
      setFormError(apiError(e, "No se pudo crear el informe"));
    } finally {
      setSaving(false);
    }
  };

  const downloadPackage = async () => {
    if (!pkgCycle) {
      toast.warning("Elija un ciclo");
      return;
    }
    setPackaging(true);
    try {
      const res = await downloadFromApi(api, `/recommendations/package/${pkgCycle}`, "paquete_diseminacion.zip", {
        params: { include_drafts: pkgDrafts },
      });
      const recsN = res.headers?.["x-package-recommendations"];
      const docsN = res.headers?.["x-package-evaluation-docs"];
      toast.success(`Paquete descargado${recsN != null ? `: ${docsN} informe(s) de evaluación y ${recsN} recomendación(es)` : ""}`);
    } catch (e) {
      toast.error(apiError(e, "No se pudo generar el paquete"));
    } finally {
      setPackaging(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando informes..." />;

  const findingOptions = findings.map((f) => ({ id: f.id, label: f.title }));

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title="Diseminación e informes"
        titleHint={GLOSSARY.diseminacion}
        purpose="Recomendaciones de adopción para Colombia a partir de las señales, y paquete de diseminación por ciclo."
        actions={
          <div className="fb-toolbar">
            <HintButton variant="secondary" hint="Redactar un informe a mano, con o sin señal de origen" disabled={!canWrite} disabledHint={noWrite} onClick={() => openCreate("manual")}>
              <Icon name="plus" size={16} /> Nuevo informe
            </HintButton>
            <HintButton hint={GLOSSARY.fb_generar_informe} disabled={!canWrite} disabledHint={noWrite} onClick={() => openCreate("ia")}>
              <Icon name="spark" size={16} /> Generar desde una señal
            </HintButton>
          </div>
        }
      />

      <PhaseGuide
        phase="Fase 4 · Diseminación"
        hint={GLOSSARY.diseminacion}
        tasks={[
          "Generar informes de adopción para el sistema de salud colombiano (IA como borrador + revisión humana).",
          "Clasificar el impacto esperado: alto, medio o bajo.",
          "Descargar el paquete del ciclo para compartirlo con quien decide.",
        ]}
        nextLabel="Notas del equipo"
        onNext={() => navigate("/notas")}
      />

      <ModuleStatsRow
        items={[
          { label: "Informes emitidos", value: recs.length, hint: "Recomendaciones de adopción registradas, de todos los ciclos." },
          { label: "Impacto alto", value: impactStats.alto, color: "#EF4444", hint: GLOSSARY.fb_impacto },
          { label: "Impacto medio", value: impactStats.medio, color: "#F59E0B", hint: GLOSSARY.fb_impacto },
          { label: "Impacto bajo", value: impactStats.bajo, hint: GLOSSARY.fb_impacto },
        ]}
      />

      {status && !aiOn && (
        <Card style={{ marginBottom: 16, borderLeft: "4px solid #F59E0B", background: "#FFFBEB" }}>
          <div style={{ fontSize: 14, color: "#92400E" }}>
            <strong>IA no configurada.</strong> Los informes generados desde una señal saldrán como versión preliminar para
            completar a mano. Un superadministrador puede activar la IA en Configuración.
          </div>
        </Card>
      )}

      <Card padding={18} style={{ marginBottom: 16 }}>
        <div className="fb-inline-row" data-testid="package-card">
          <div style={{ flex: "2 1 260px" }}>
            <strong style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <Icon name="layers" size={16} /> Paquete de diseminación del ciclo <InfoTip text={GLOSSARY.fb_paquete} label="Qué es el paquete" />
            </strong>
            <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>ZIP con Listado Único, informes de evaluación, recomendaciones, notas y boletín publicado.</p>
          </div>
          <Select id="package-cycle" aria-label="Ciclo del paquete" value={pkgCycle} onChange={(e) => setPkgCycle(e.target.value)} style={{ marginBottom: 0 }}>
            {formalCycles.length === 0 && <option value="">No hay ciclos</option>}
            {formalCycles.map((c) => (
              <option key={c.id} value={c.id}>{c.code}</option>
            ))}
          </Select>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, flex: "0 1 auto", marginBottom: 14 }}>
            <input type="checkbox" checked={pkgDrafts} onChange={(e) => setPkgDrafts(e.target.checked)} />
            <TermLabel tip="Incluye también los informes que aún están en redacción o revisión. Los confidenciales nunca se incluyen.">Incluir borradores</TermLabel>
          </label>
          <div style={{ flex: "0 0 auto", marginBottom: 14 }}>
            <HintButton
              variant="outline"
              hint={GLOSSARY.fb_paquete}
              disabled={!canPackage || !pkgCycle}
              disabledHint={!canPackage ? "Su perfil no puede descargar el paquete: trae notas internas del equipo (requiere report:write o analytics:restricted)." : "No hay ciclos para empaquetar."}
              loading={packaging}
              onClick={downloadPackage}
            >
              <Icon name="doc" size={15} /> Descargar ZIP
            </HintButton>
          </div>
        </div>
      </Card>

      {recs.length === 0 ? (
        <Card>
          <EmptyState
            icon="💡"
            title="Sin informes de diseminación"
            message="Genere el primero desde una señal, o redáctelo a mano."
            action={
              canWrite ? (
                <Button onClick={() => openCreate("ia")}><Icon name="spark" size={16} /> Generar desde una señal</Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate("/senales")}>Ver señales</Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <Card padding={16} style={{ marginBottom: 16 }}>
            <div className="fb-toolbar">
              <input placeholder="Buscar en informes..." aria-label="Buscar informe" value={search} onChange={(e) => setSearch(e.target.value)} className="filter-input" style={{ flex: 1, minWidth: 180 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>
                <TermLabel tip={GLOSSARY.fb_impacto}>Impacto</TermLabel>
              </span>
              {IMPACTS.map((i) => (
                <button key={i || "all"} type="button" className={`view-toggle${impactFilter === i ? " active" : ""}`} onClick={() => setImpactFilter(i)}>
                  {i || "Todos"}
                </button>
              ))}
              <span style={{ fontSize: 13, color: "#64748B" }} data-testid="recs-count">{filtered.length} informes</span>
            </div>
          </Card>
          {filtered.length === 0 ? (
            <Card><EmptyState icon="🔎" title="Ningún informe coincide" message="Ajuste la búsqueda o el filtro de impacto." /></Card>
          ) : (
            <div className="informe-list">
              {filtered.map((r) => (
                <Card key={r.id} padding={0} className="informe-card">
                  <div className="informe-card-inner" data-testid={`rec-${r.id}`}>
                    <div className="informe-card-head">
                      <div>
                        {r.impact ? <Badge tone={r.impact}>Impacto {r.impact}</Badge> : <Badge tone="viewer">Sin impacto</Badge>}
                        <span className="informe-meta">Informe #{r.id} · {new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      <span title={GLOSSARY.fb_origen_informe}><Badge tone="viewer">{r.model_used || "manual"}</Badge></span>
                    </div>
                    <h3 className="informe-title">{r.title}</h3>
                    <p className="informe-excerpt">
                      {r.content.replace(/[#*`>]/g, "").slice(0, 280)}
                      {r.content.length > 280 ? "…" : ""}
                    </p>
                    <div className="informe-actions">
                      <Button size="sm" onClick={() => setDetail(r)}>Leer informe completo</Button>
                      {canWrite && (
                        <>
                          <HintButton size="sm" variant="outline" hint="Corregir título, contenido e impacto" onClick={() => openEdit(r)}>
                            <Icon name="edit" size={14} /> Editar
                          </HintButton>
                          <HintButton size="sm" variant="ghost" style={{ color: "#EF4444" }} hint="Eliminar el informe" onClick={() => setConfirmDel(r)} aria-label={`Eliminar informe ${r.id}`}>
                            <Icon name="trash" size={15} />
                          </HintButton>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Detalle */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title || "Informe"}
        width={720}
        footer={
          detail && canWrite ? (
            <>
              <Button variant="ghost" style={{ color: "#EF4444" }} onClick={() => setConfirmDel(detail)}>
                <Icon name="trash" size={15} /> Eliminar
              </Button>
              <Button variant="secondary" onClick={() => openEdit(detail)}>
                <Icon name="edit" size={15} /> Editar informe
              </Button>
            </>
          ) : null
        }
      >
        {detail && (
          <div data-testid="rec-detail">
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {detail.impact && <Badge tone={detail.impact}>Impacto {detail.impact}</Badge>}
              <span title={GLOSSARY.fb_origen_informe}><Badge tone="viewer">{detail.model_used || "manual"}</Badge></span>
              <Badge tone="viewer">{new Date(detail.created_at).toLocaleString()}</Badge>
              {detail.created_by && <Badge tone="viewer">{detail.created_by}</Badge>}
            </div>
            <Markdown>{detail.content}</Markdown>
            <NotesPanel entityType="recommendation" entityId={detail.id} />
          </div>
        )}
      </Modal>

      {/* Alta: manual o desde una senal */}
      <Modal
        open={!!createMode}
        onClose={() => setCreateMode(null)}
        title={createMode === "ia" ? "Generar informe desde una señal" : "Nuevo informe"}
        width={760}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateMode(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={submitCreate} loading={saving}>{createMode === "ia" ? (aiOn ? "Generar con IA" : "Crear versión preliminar") : "Guardar informe"}</Button>
          </>
        }
      >
        {formError && <p className="public-submit-error" role="alert">{formError}</p>}
        {createMode === "ia" && (
          <p style={{ fontSize: 13, color: aiOn ? "#64748B" : "#92400E", marginTop: 0 }}>
            {aiOn ? "La IA redacta un borrador de recomendación para Colombia; revise y edite antes de difundirlo." : `${GLOSSARY.fb_ia_apagada} Se creará una versión preliminar.`}
          </p>
        )}
        <div className="fb-grid-2">
          <Input id="rec-finding-search" label="Buscar señal" placeholder="Nombre de la tecnología..." value={findingQuery} onChange={(e) => setFindingQuery(e.target.value)} />
          <Select id="rec-finding" label={createMode === "ia" ? "Señal de origen" : "Señal de origen (opcional)"} required={createMode === "ia"} value={draft.finding_id} onChange={(e) => setDraft({ ...draft, finding_id: e.target.value })}>
            <option value="">{createMode === "ia" ? "Seleccione una señal..." : "Sin señal (informe general)"}</option>
            {findingOptions.map((o) => (
              <option key={o.id} value={o.id}>{(o.label || `#${o.id}`).slice(0, 90)}</option>
            ))}
          </Select>
        </div>
        {createMode === "manual" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 170px", gap: 12 }}>
              <Input id="rec-title" label="Título" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <Select id="rec-impact" label="Impacto" hint={GLOSSARY.fb_impacto} value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: e.target.value })}>
                {IMPACTS.map((i) => <option key={i || "none"} value={i}>{i || "Sin definir"}</option>)}
              </Select>
            </div>
            <label htmlFor="rec-content" style={lbl}>Contenido (Markdown) *</label>
            <textarea id="rec-content" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} rows={10} style={{ ...inp, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} placeholder="## Síntesis" />
          </>
        )}
      </Modal>

      {/* Edicion */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Editar informe"
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
              Markdown soportado. Ajuste título, contenido e impacto según relevancia para Colombia.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 160px", gap: 12, marginBottom: 12 }}>
              <div>
                <label htmlFor="edit-rec-title" style={lbl}>Título</label>
                <input id="edit-rec-title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} style={inp} />
              </div>
              <Select id="edit-rec-impact" label="Impacto" hint={GLOSSARY.fb_impacto} value={edit.impact || ""} onChange={(e) => setEdit({ ...edit, impact: e.target.value })}>
                {IMPACTS.map((i) => (
                  <option key={i || "none"} value={i}>{i || "Sin definir"}</option>
                ))}
              </Select>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label htmlFor="edit-rec-content" style={lbl}>Contenido (Markdown)</label>
              <button
                type="button"
                onClick={() => setShowPreview((s) => !s)}
                style={{ border: "none", background: "transparent", color: "#4F46E5", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon name={showPreview ? "eyeOff" : "eye"} size={14} />
                {showPreview ? "Ocultar vista previa" : "Ver vista previa"}
              </button>
            </div>

            <div className={showPreview ? "fb-grid-2" : ""}>
              <textarea
                id="edit-rec-content"
                value={edit.content}
                onChange={(e) => setEdit({ ...edit, content: e.target.value })}
                spellCheck={false}
                style={{ ...inp, minHeight: 360, fontSize: 13.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.6, resize: "vertical" }}
              />
              {showPreview && (
                <div style={{ minHeight: 360, maxHeight: 480, overflowY: "auto", padding: "12px 16px", border: "1px solid #E2E8F0", borderRadius: 10, background: "#F8FAFC" }}>
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
        title="Eliminar informe"
        message={`Se eliminará "${confirmDel?.title?.slice(0, 120)}". Esta acción no se puede deshacer.`}
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
