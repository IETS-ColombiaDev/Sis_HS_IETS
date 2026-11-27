import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { AI_TIMEOUT, apiError } from "../api/client";
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
import { t, tr, ts, fmtDate, fmtDateTime } from "../i18n";
import "./prioritization.css";
import "./recommendations.css";

const IMPACTS = ["", "alto", "medio", "bajo"];
const EMPTY_NEW = { title: "", content: "", impact: "", finding_id: "" };
// Etiquetas para mostrar el impacto; el valor que viaja al servidor no cambia.
const IMPACT_LABELS = { alto: t("alto"), medio: t("medio"), bajo: t("bajo") };
const IMPACT_BADGES = { alto: t("Impacto alto"), medio: t("Impacto medio"), bajo: t("Impacto bajo") };
const impactBadge = (impact) => IMPACT_BADGES[impact] || t("Impacto {nivel}", { nivel: impact });

const STATUS_TABS = [
  { key: "", label: t("Todos") },
  { key: "borrador", label: t("Por validar") },
  { key: "validado", label: t("Validados") },
];
const ORIGIN_LABELS = { manual: t("Redactado a mano"), ia: t("Generado con IA"), preliminar: t("Preliminar sin IA") };
const HISTORY_ICON = { created: "plus", validated: "check", reopened: "refresh", edited: "edit" };

function StatusBadge({ rec }) {
  return rec.status === "validado" ? (
    <span className="rec-status is-validado">
      <Icon name="check" size={12} /> {t("Validado")}
    </span>
  ) : (
    <span className="rec-status is-borrador">{t("Borrador")}</span>
  );
}

function downloadMarkdown(rec) {
  const blob = new Blob([`# ${rec.title}\n\n${rec.content || ""}\n`], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `informe_${rec.id}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Recommendations() {
  const { can, status, user } = useAuth();
  const { cycles, cycleId } = useCycle();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const canWrite = can(PERM.REPORT_WRITE);
  const canPackage = canWrite || can(PERM.RESTRICTED_ANALYTICS);
  const aiOn = Boolean(status?.ai_enabled ?? status?.gemini_enabled);
  const noWrite = t("Su perfil ({perfil}) puede leer los informes pero no redactarlos (permiso report:write).", {
    perfil: ts(user?.role_label) || user?.role,
  });

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
  const [statusFilter, setStatusFilter] = useState("");
  const [originFilter, setOriginFilter] = useState("");
  const [onlyCycle, setOnlyCycle] = useState(false);
  const [history, setHistory] = useState(null);
  const [acting, setActing] = useState(false);
  const [reopening, setReopening] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState(null);

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
      const { data } = await api.get("/recommendations", {
        params: onlyCycle && cycleId ? { cycle_id: cycleId } : undefined,
      });
      setRecs(data);
      // La ventana de detalle sigue al informe aunque otra persona lo cambie.
      setDetail((d) => (d ? data.find((r) => r.id === d.id) || d : d));
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron cargar los informes")));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyCycle, cycleId]);

  useEffect(() => {
    load();
  }, [load, version]);

  // Qué traería el paquete del ciclo elegido, antes de descargarlo.
  useEffect(() => {
    if (!pkgCycle || !canPackage) {
      setPreview(null);
      return undefined;
    }
    let cancelled = false;
    api
      .get(`/recommendations/package/${pkgCycle}/preview`, { params: { include_drafts: pkgDrafts } })
      .then(({ data }) => !cancelled && setPreview(data))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [pkgCycle, pkgDrafts, canPackage, version]);

  const detailId = detail?.id || null;
  const detailStamp = `${detail?.status}|${detail?.updated_at}`;
  useEffect(() => {
    if (!detailId) {
      setHistory(null);
      return undefined;
    }
    let cancelled = false;
    api
      .get(`/recommendations/${detailId}/history`)
      .then(({ data }) => !cancelled && setHistory(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [detailId, detailStamp]);

  useEffect(() => {
    if (!createMode) return undefined;
    const timer = setTimeout(() => {
      api
        .get("/findings", { params: { q: findingQuery || undefined, limit: 50 } })
        .then(({ data }) => setFindings(data))
        .catch((e) => toast.error(apiError(e, t("No se pudieron cargar las señales"))));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createMode, findingQuery]);

  const filtered = recs.filter(
    (r) =>
      (!impactFilter || r.impact === impactFilter) &&
      (!statusFilter || r.status === statusFilter) &&
      (!originFilter || r.origin === originFilter) &&
      (!search ||
        `${r.title} ${r.content} ${r.finding_title} ${r.technology_name}`.toLowerCase().includes(search.toLowerCase()))
  );
  const countByStatus = { "": recs.length, borrador: recs.filter((r) => r.status !== "validado").length, validado: recs.filter((r) => r.status === "validado").length };
  const unreviewedAi = recs.filter((r) => r.origin !== "manual" && !r.edited && r.status !== "validado").length;
  const anyFilter = Boolean(impactFilter || statusFilter || originFilter || search);
  const clearFilters = () => {
    setImpactFilter("");
    setStatusFilter("");
    setOriginFilter("");
    setSearch("");
  };

  const validate = async (rec) => {
    setActing(true);
    try {
      const { data } = await api.post(`/recommendations/${rec.id}/validate`);
      toast.success(t("Informe validado. Ya viaja en el paquete de su ciclo."));
      setDetail((d) => (d && d.id === data.id ? data : d));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo validar el informe")));
    } finally {
      setActing(false);
    }
  };

  const reopen = async () => {
    setActing(true);
    try {
      const { data } = await api.post(`/recommendations/${reopening.rec.id}/reopen`, { reason: reopening.reason });
      toast.success(t("Informe devuelto a borrador"));
      setReopening(null);
      setDetail((d) => (d && d.id === data.id ? data : d));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo devolver el informe a borrador")));
    } finally {
      setActing(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, "/recommendations/export.csv", "informes_diseminacion.csv", {
        params: { cycle_id: onlyCycle && cycleId ? cycleId : undefined, status: statusFilter || undefined },
      });
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descargar el listado")));
    } finally {
      setExporting(false);
    }
  };
  const impactStats = {
    alto: recs.filter((r) => r.impact === "alto").length,
    medio: recs.filter((r) => r.impact === "medio").length,
    bajo: recs.filter((r) => r.impact === "bajo").length,
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/recommendations/${confirmDel.id}`);
      toast.success(t("Informe eliminado"));
      setConfirmDel(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar")));
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
      toast.warning(t("El título y el contenido no pueden quedar vacíos"));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/recommendations/${edit.id}`, { title: edit.title, content: edit.content, impact: edit.impact || "" });
      toast.success(
        edit.status === "validado" && data.status !== "validado"
          ? t("Informe actualizado. Volvió a borrador: valídelo de nuevo.")
          : t("Informe actualizado")
      );
      setEdit(null);
      setDetail((d) => (d && d.id === data.id ? data : d));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar")));
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
        setFormError(t("Elija la señal sobre la que se genera el informe."));
        return;
      }
    } else if (!draft.title.trim() || !draft.content.trim()) {
      setFormError(t("El título y el contenido son obligatorios."));
      return;
    }
    setSaving(true);
    try {
      let data;
      if (createMode === "ia") {
        ({ data } = await api.post("/recommendations/generate", { finding_id: Number(draft.finding_id) }, { timeout: AI_TIMEOUT }));
        if (/sin IA|fallback/i.test(data.model_used || "")) toast.warning(t("IA no configurada: se creó un informe preliminar para completar a mano."));
        else toast.success(t("Informe generado con {modelo}", { modelo: data.model_used }));
      } else {
        ({ data } = await api.post("/recommendations", {
          title: draft.title.trim(),
          content: draft.content.trim(),
          impact: draft.impact,
          finding_id: draft.finding_id ? Number(draft.finding_id) : null,
        }));
        toast.success(t("Informe creado"));
      }
      setCreateMode(null);
      await load();
      setDetail(data);
    } catch (e) {
      setFormError(apiError(e, t("No se pudo crear el informe")));
    } finally {
      setSaving(false);
    }
  };

  const downloadPackage = async () => {
    if (!pkgCycle) {
      toast.warning(t("Elija un ciclo"));
      return;
    }
    setPackaging(true);
    try {
      const res = await downloadFromApi(api, `/recommendations/package/${pkgCycle}`, "paquete_diseminacion.zip", {
        params: { include_drafts: pkgDrafts },
      });
      const recsN = res.headers?.["x-package-recommendations"];
      const docsN = res.headers?.["x-package-evaluation-docs"];
      toast.success(
        recsN != null
          ? t("Paquete descargado: {docs} informe(s) de evaluación y {recs} recomendación(es)", { docs: docsN, recs: recsN })
          : t("Paquete descargado")
      );
    } catch (e) {
      toast.error(apiError(e, t("No se pudo generar el paquete")));
    } finally {
      setPackaging(false);
    }
  };

  if (loading) return <LoadingBlock label={t("Cargando informes...")} />;

  const findingOptions = findings.map((f) => ({ id: f.id, label: f.title }));

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title={t("Diseminación e informes")}
        titleHint={GLOSSARY.diseminacion}
        purpose={t("Recomendaciones de adopción para Colombia a partir de las señales, y paquete de diseminación por ciclo.")}
        actions={
          <div className="fb-toolbar">
            <HintButton variant="secondary" hint={t("Redactar un informe a mano, con o sin señal de origen")} disabled={!canWrite} disabledHint={noWrite} onClick={() => openCreate("manual")}>
              <Icon name="plus" size={16} /> {t("Nuevo informe")}
            </HintButton>
            <HintButton hint={GLOSSARY.fb_generar_informe} disabled={!canWrite} disabledHint={noWrite} onClick={() => openCreate("ia")}>
              <Icon name="spark" size={16} /> {t("Generar desde una señal")}
            </HintButton>
            <HintButton
              variant="secondary"
              hint={t("Descarga el listado de informes con estado, impacto, origen, señal y quién validó. La descarga queda en la bitácora.")}
              disabled={!recs.length}
              disabledHint={t("Aún no hay informes para exportar.")}
              loading={exporting}
              onClick={exportCsv}
              data-testid="recs-export"
            >
              <Icon name="doc" size={16} /> {t("Exportar CSV")}
            </HintButton>
          </div>
        }
      />

      <PhaseGuide
        phase={t("Fase 4 · Diseminación")}
        hint={GLOSSARY.diseminacion}
        tasks={[
          t("Generar informes de adopción para el sistema de salud colombiano (IA como borrador + revisión humana)."),
          t("Clasificar el impacto esperado: alto, medio o bajo."),
          t("Validar cada informe: solo los validados viajan en el paquete."),
          t("Descargar el paquete del ciclo para compartirlo con quien decide."),
        ]}
        nextLabel={t("Notas del equipo")}
        onNext={() => navigate("/notas")}
      />

      <ModuleStatsRow
        items={[
          { label: t("Informes"), value: recs.length, hint: onlyCycle ? t("Informes de las señales del ciclo actual.") : t("Recomendaciones de adopción registradas, de todos los ciclos.") },
          {
            label: t("Por validar"),
            value: countByStatus.borrador,
            color: countByStatus.borrador ? "#D97706" : undefined,
            sub: countByStatus.borrador ? t("No viajan en el paquete") : undefined,
            hint: t("Informes en borrador. Una persona debe revisarlos y validarlos para que se incluyan en el paquete del ciclo."),
            testId: "recs-kpi-draft",
          },
          {
            label: t("Validados"),
            value: countByStatus.validado,
            color: countByStatus.validado ? "#059669" : undefined,
            hint: t("Informes que una persona revisó y aprobó para difundir."),
            testId: "recs-kpi-validated",
          },
          {
            label: t("IA sin revisar"),
            value: unreviewedAi,
            color: unreviewedAi ? "#DC2626" : undefined,
            sub: unreviewedAi ? t("Sin edición ni validación") : undefined,
            hint: t("Informes generados desde una señal que nadie ha editado ni validado. Son borradores automáticos."),
          },
          { label: t("Impacto alto"), value: impactStats.alto, color: "#EF4444", hint: GLOSSARY.fb_impacto },
          { label: t("Impacto medio"), value: impactStats.medio, color: "#F59E0B", hint: GLOSSARY.fb_impacto },
          { label: t("Impacto bajo"), value: impactStats.bajo, hint: GLOSSARY.fb_impacto },
        ]}
      />

      {status && !aiOn && (
        <Card style={{ marginBottom: 16, borderLeft: "4px solid #F59E0B", background: "#FFFBEB" }}>
          <div style={{ fontSize: 14, color: "#92400E" }}>
            {tr(
              "<b>IA no configurada.</b> Los informes generados desde una señal saldrán como versión preliminar para completar a mano. Un superadministrador puede activar la IA en Configuración.",
              null,
              { b: (c) => <strong>{c}</strong> }
            )}
          </div>
        </Card>
      )}

      <Card padding={0} style={{ marginBottom: 16, overflow: "hidden" }}>
        <div className="rec-package" data-testid="package-card">
          <div className="rec-package-top">
            <div className="rec-package-title">
              <strong>
                <Icon name="layers" size={16} /> {t("Paquete de diseminación del ciclo")} <InfoTip text={GLOSSARY.fb_paquete} label={t("Qué es el paquete")} />
              </strong>
              <p>{t("ZIP con Listado Único, informes de evaluación, recomendaciones, notas y boletín publicado.")}</p>
            </div>
            <div className="rec-package-controls">
              <Select id="package-cycle" aria-label={t("Ciclo del paquete")} value={pkgCycle} onChange={(e) => setPkgCycle(e.target.value)} style={{ marginBottom: 0 }}>
                {formalCycles.length === 0 && <option value="">{t("No hay ciclos")}</option>}
                {formalCycles.map((c) => (
                  <option key={c.id} value={c.id}>{c.code}</option>
                ))}
              </Select>
              <label className="rec-package-check">
                <input type="checkbox" checked={pkgDrafts} onChange={(e) => setPkgDrafts(e.target.checked)} />
                <TermLabel tip={t("Incluye también los informes de evaluación en redacción o revisión y las recomendaciones sin validar. Los confidenciales nunca se incluyen.")}>{t("Incluir borradores")}</TermLabel>
              </label>
              <HintButton
                hint={GLOSSARY.fb_paquete}
                disabled={!canPackage || !pkgCycle}
                disabledHint={!canPackage ? t("Su perfil no puede descargar el paquete: trae notas internas del equipo (requiere report:write o analytics:restricted).") : t("No hay ciclos para empaquetar.")}
                loading={packaging}
                onClick={downloadPackage}
              >
                <Icon name="doc" size={15} /> {t("Descargar ZIP")}
              </HintButton>
            </div>
          </div>
          {preview && (
            <div className="rec-package-preview" data-testid="package-preview">
              <span className="rec-package-label">{t("Qué trae")}</span>
              <ul>
                <li><b>{preview.unique_list}</b> {t("en el Listado Único")}</li>
                <li><b>{preview.evaluation_docs}</b> {t("informe(s) de evaluación")}</li>
                <li className={preview.recommendations ? "" : "is-empty"}><b>{preview.recommendations}</b> {t("recomendación(es)")}</li>
                <li><b>{preview.notes}</b> {t("nota(s) del equipo")}</li>
                <li className={preview.bulletin ? "is-ok" : "is-empty"}>{preview.bulletin ? t("Boletín publicado") : t("Sin boletín publicado")}</li>
              </ul>
              {(preview.recommendations_skipped_draft > 0 || preview.evaluation_docs_skipped_draft > 0 || preview.evaluation_docs_skipped_confidential > 0) && (
                <p className="rec-package-skipped" data-testid="package-skipped">
                  {t("Se quedan por fuera:")}{" "}
                  {[
                    preview.recommendations_skipped_draft > 0 && t("{n} recomendación(es) sin validar", { n: preview.recommendations_skipped_draft }),
                    preview.evaluation_docs_skipped_draft > 0 && t("{n} informe(s) de evaluación en redacción o revisión", { n: preview.evaluation_docs_skipped_draft }),
                    preview.evaluation_docs_skipped_confidential > 0 && t("{n} informe(s) confidencial(es)", { n: preview.evaluation_docs_skipped_confidential }),
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}
        </div>
      </Card>

      {recs.length === 0 ? (
        <Card>
          <EmptyState
            icon="💡"
            title={t("Sin informes de diseminación")}
            message={t("Genere el primero desde una señal, o redáctelo a mano.")}
            action={
              canWrite ? (
                <Button onClick={() => openCreate("ia")}><Icon name="spark" size={16} /> {t("Generar desde una señal")}</Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate("/senales")}>{t("Ver señales")}</Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <Card padding={16} style={{ marginBottom: 16 }}>
            <div className="screening-tabs rec-tabs">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key || "all"}
                  type="button"
                  className={`screening-tab${statusFilter === tab.key ? " is-active" : ""}`}
                  onClick={() => setStatusFilter(tab.key)}
                  data-testid={`recs-tab-${tab.key || "todos"}`}
                >
                  {tab.label}
                  <span className="eval-tab-count">{countByStatus[tab.key]}</span>
                </button>
              ))}
            </div>
            <div className="fb-toolbar">
              <input placeholder={t("Buscar en informes...")} aria-label={t("Buscar informe")} value={search} onChange={(e) => setSearch(e.target.value)} className="filter-input" style={{ flex: 1, minWidth: 180 }} />
              <select aria-label={t("Filtrar por origen")} value={originFilter} onChange={(e) => setOriginFilter(e.target.value)} className="filter-input rec-select">
                <option value="">{t("Cualquier origen")}</option>
                {Object.entries(ORIGIN_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>
                <TermLabel tip={GLOSSARY.fb_impacto}>{t("Impacto")}</TermLabel>
              </span>
              {IMPACTS.map((i) => (
                <button key={i || "all"} type="button" className={`view-toggle${impactFilter === i ? " active" : ""}`} onClick={() => setImpactFilter(i)}>
                  {i ? IMPACT_LABELS[i] : t("Todos")}
                </button>
              ))}
              {cycleId ? (
                <label className="rec-package-check">
                  <input type="checkbox" checked={onlyCycle} onChange={(e) => setOnlyCycle(e.target.checked)} data-testid="recs-only-cycle" />
                  {t("Solo del ciclo actual")}
                </label>
              ) : null}
              <span style={{ fontSize: 13, color: "#64748B" }} data-testid="recs-count">{t("{n} informes", { n: filtered.length })}</span>
            </div>
          </Card>
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon="🔎"
                title={t("Ningún informe coincide")}
                message={t("Ajuste la búsqueda o los filtros.")}
                action={anyFilter ? <Button variant="secondary" size="sm" onClick={clearFilters}>{t("Limpiar filtros")}</Button> : null}
              />
            </Card>
          ) : (
            <div className="informe-list">
              {filtered.map((r) => (
                <Card key={r.id} padding={0} className={`informe-card rec-card is-${r.status === "validado" ? "validado" : "borrador"}`}>
                  <div className="informe-card-inner" data-testid={`rec-${r.id}`}>
                    <div className="informe-card-head">
                      <div>
                        <div className="rec-card-badges">
                          <StatusBadge rec={r} />
                          {r.impact ? <Badge tone={r.impact}>{impactBadge(r.impact)}</Badge> : <Badge tone="viewer">{t("Sin impacto")}</Badge>}
                        </div>
                        <span className="informe-meta">{t("Informe #{id}", { id: r.id })} · {fmtDate(r.created_at)}</span>
                      </div>
                      <span title={GLOSSARY.fb_origen_informe}><Badge tone="viewer">{ts(r.model_used) || t("manual")}</Badge></span>
                    </div>
                    <h3 className="informe-title">{r.title}</h3>
                    {(r.technology_name || r.finding_title) && (
                      <p className="rec-source" title={r.finding_title}>
                        <Icon name="link" size={13} />
                        {r.technology_name ? <b>{r.technology_name}</b> : null}
                        <span>{r.finding_title}</span>
                      </p>
                    )}
                    <p className="informe-excerpt">
                      {r.content.replace(/[#*`>]/g, "").slice(0, 280)}
                      {r.content.length > 280 ? "…" : ""}
                    </p>
                    {r.status === "validado" && (
                      <p className="rec-validated-by">{t("Validado por {quien} el {fecha}", { quien: r.validated_by || "-", fecha: fmtDate(r.validated_at) })}</p>
                    )}
                    <div className="informe-actions">
                      <Button size="sm" onClick={() => setDetail(r)}>{t("Leer informe completo")}</Button>
                      {canWrite && (
                        <>
                          <HintButton size="sm" variant="outline" hint={r.status === "validado" ? t("Corregir título, contenido e impacto. Al guardar cambios, el informe vuelve a borrador.") : t("Corregir título, contenido e impacto")} onClick={() => openEdit(r)}>
                            <Icon name="edit" size={14} /> {t("Editar")}
                          </HintButton>
                          <HintButton
                            size="sm"
                            variant="ghost"
                            style={{ color: "#EF4444" }}
                            hint={t("Eliminar el informe")}
                            disabled={r.status === "validado"}
                            disabledHint={t("Un informe validado no se elimina. Devuélvalo a borrador primero.")}
                            onClick={() => setConfirmDel(r)}
                            aria-label={t("Eliminar informe {id}", { id: r.id })}
                          >
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
        title={detail?.title || t("Informe")}
        width={980}
        footer={
          detail ? (
            <>
              {canWrite && detail.status !== "validado" && (
                <Button variant="ghost" style={{ color: "#EF4444" }} onClick={() => setConfirmDel(detail)}>
                  <Icon name="trash" size={15} /> {t("Eliminar")}
                </Button>
              )}
              <Button variant="secondary" onClick={() => downloadMarkdown(detail)} data-testid="rec-download-md">
                <Icon name="doc" size={15} /> {t("Descargar Markdown")}
              </Button>
              {canWrite && (
                <Button variant="secondary" onClick={() => openEdit(detail)}>
                  <Icon name="edit" size={15} /> {t("Editar informe")}
                </Button>
              )}
            </>
          ) : null
        }
      >
        {detail && (
          <div className="rec-detail">
            <div className="rec-detail-main" data-testid="rec-detail">
              {detail.status !== "validado" && detail.origin !== "manual" && (
                <div className="fa-notice fa-notice--info" style={{ marginBottom: 12 }}>
                  {detail.edited
                    ? t("Borrador generado automáticamente y ya editado por una persona. Falta validarlo.")
                    : t("Borrador generado automáticamente: revíselo, corríjalo y valídelo antes de difundirlo.")}
                </div>
              )}
              <Markdown>{detail.content}</Markdown>
              <NotesPanel entityType="recommendation" entityId={detail.id} />
            </div>
            <aside className="rec-detail-side">
              <section>
                <h4>{t("Estado")}</h4>
                <div className="rec-card-badges">
                  <StatusBadge rec={detail} />
                  {detail.impact ? <Badge tone={detail.impact}>{impactBadge(detail.impact)}</Badge> : <Badge tone="viewer">{t("Sin impacto")}</Badge>}
                </div>
                {detail.status === "validado" ? (
                  <>
                    <p className="rec-side-note">{t("Validado por {quien} el {fecha}", { quien: detail.validated_by || "-", fecha: fmtDateTime(detail.validated_at) })}</p>
                    {canWrite && (
                      <Button size="sm" variant="secondary" onClick={() => setReopening({ rec: detail, reason: "" })} data-testid="rec-reopen">
                        {t("Devolver a borrador")}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="rec-side-note">{t("Mientras esté en borrador no viaja en el paquete del ciclo.")}</p>
                    {canWrite && (
                      <HintButton
                        size="sm"
                        loading={acting}
                        disabled={!detail.impact}
                        disabledHint={t("Defina el impacto (alto, medio o bajo) antes de validar.")}
                        hint={t("Usted confirma que revisó el contenido y responde por él. Desde aquí el informe viaja en el paquete.")}
                        onClick={() => validate(detail)}
                        data-testid="rec-validate"
                      >
                        <Icon name="check" size={14} /> {t("Validar informe")}
                      </HintButton>
                    )}
                  </>
                )}
              </section>
              <section>
                <h4>{t("Datos")}</h4>
                <dl className="rec-facts">
                  <dt>{t("Origen")}</dt>
                  <dd title={GLOSSARY.fb_origen_informe}>{ORIGIN_LABELS[detail.origin] || detail.origin}{detail.edited ? ` · ${t("editado")}` : ""}</dd>
                  <dt>{t("Creado")}</dt>
                  <dd>{fmtDateTime(detail.created_at)}{detail.created_by ? ` · ${detail.created_by}` : ""}</dd>
                  {detail.updated_at && (
                    <>
                      <dt>{t("Última edición")}</dt>
                      <dd>{fmtDateTime(detail.updated_at)}{detail.updated_by ? ` · ${detail.updated_by}` : ""}</dd>
                    </>
                  )}
                  <dt>{t("Señal de origen")}</dt>
                  <dd>{detail.finding_title || t("Sin señal (informe general)")}</dd>
                  {detail.technology_name && (
                    <>
                      <dt>{t("Tecnología")}</dt>
                      <dd>{detail.technology_name}</dd>
                    </>
                  )}
                  <dt>{t("Extensión")}</dt>
                  <dd>{t("{n} palabras", { n: detail.words })}</dd>
                </dl>
              </section>
              <section>
                <h4>{t("Recorrido")}</h4>
                {history == null ? (
                  <p className="rec-side-note">{t("Cargando el recorrido...")}</p>
                ) : history.length === 0 ? (
                  <p className="rec-side-note">{t("Sin eventos registrados.")}</p>
                ) : (
                  <ol className="prio-history rec-history" data-testid="rec-history">
                    {history.map((ev, i) => (
                      <li key={`${ev.at}-${i}`} className={`is-${ev.kind}`}>
                        <span className="prio-history-dot" aria-hidden="true">
                          <Icon name={HISTORY_ICON[ev.kind] || "info"} size={13} />
                        </span>
                        <div>
                          <strong>{ts(ev.label)}</strong>
                          <span className="prio-history-meta">
                            {fmtDateTime(ev.at)}
                            {ev.by ? ` · ${ev.by}` : ""}
                          </span>
                          {ev.detail && <p>{ts(ev.detail)}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </aside>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(reopening)}
        onClose={() => setReopening(null)}
        title={t("Devolver a borrador")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopening(null)} disabled={acting}>{t("Cancelar")}</Button>
            <Button onClick={reopen} loading={acting} data-testid="rec-reopen-confirm">{t("Devolver a borrador")}</Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginTop: 0 }}>
          {t("El informe deja de estar validado y sale del paquete del ciclo hasta que alguien lo valide de nuevo.")}
        </p>
        <Input
          id="rec-reopen-reason"
          label={t("Motivo (opcional)")}
          maxLength={300}
          value={reopening?.reason || ""}
          onChange={(e) => setReopening((r) => ({ ...r, reason: e.target.value }))}
        />
      </Modal>

      {/* Alta: manual o desde una senal */}
      <Modal
        open={!!createMode}
        onClose={() => setCreateMode(null)}
        title={createMode === "ia" ? t("Generar informe desde una señal") : t("Nuevo informe")}
        width={760}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateMode(null)} disabled={saving}>{t("Cancelar")}</Button>
            <Button onClick={submitCreate} loading={saving}>{createMode === "ia" ? (aiOn ? t("Generar con IA") : t("Crear versión preliminar")) : t("Guardar informe")}</Button>
          </>
        }
      >
        {formError && <p className="public-submit-error" role="alert">{formError}</p>}
        {createMode === "ia" && (
          <p style={{ fontSize: 13, color: aiOn ? "#64748B" : "#92400E", marginTop: 0 }}>
            {aiOn ? t("La IA redacta un borrador de recomendación para Colombia; revise y edite antes de difundirlo.") : `${GLOSSARY.fb_ia_apagada} ${t("Se creará una versión preliminar.")}`}
          </p>
        )}
        <div className="fb-grid-2">
          <Input id="rec-finding-search" label={t("Buscar señal")} placeholder={t("Nombre de la tecnología...")} value={findingQuery} onChange={(e) => setFindingQuery(e.target.value)} />
          <Select id="rec-finding" label={createMode === "ia" ? t("Señal de origen") : t("Señal de origen (opcional)")} required={createMode === "ia"} value={draft.finding_id} onChange={(e) => setDraft({ ...draft, finding_id: e.target.value })}>
            <option value="">{createMode === "ia" ? t("Seleccione una señal...") : t("Sin señal (informe general)")}</option>
            {findingOptions.map((o) => (
              <option key={o.id} value={o.id}>{(o.label || `#${o.id}`).slice(0, 90)}</option>
            ))}
          </Select>
        </div>
        {createMode === "manual" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 170px", gap: 12 }}>
              <Input id="rec-title" label={t("Título")} required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <Select id="rec-impact" label={t("Impacto")} hint={GLOSSARY.fb_impacto} value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: e.target.value })}>
                {IMPACTS.map((i) => <option key={i || "none"} value={i}>{i ? IMPACT_LABELS[i] : t("Sin definir")}</option>)}
              </Select>
            </div>
            <label htmlFor="rec-content" style={lbl}>{t("Contenido (Markdown) *")}</label>
            <textarea id="rec-content" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} rows={10} style={{ ...inp, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} placeholder={`## ${t("Síntesis")}`} />
          </>
        )}
      </Modal>

      {/* Edicion */}
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={t("Editar informe")}
        width={860}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)} disabled={saving}>{t("Cancelar")}</Button>
            <Button onClick={saveEdit} loading={saving}>
              <Icon name="save" size={15} /> {t("Guardar cambios")}
            </Button>
          </>
        }
      >
        {edit && (
          <div>
            <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 12px" }}>
              {t("Markdown soportado. Ajuste título, contenido e impacto según relevancia para Colombia.")}
            </p>
            {edit.status === "validado" && (
              <div className="fa-notice fa-notice--info" style={{ marginBottom: 12 }} data-testid="rec-edit-warning">
                {t("Este informe está validado. Si cambia el título, el contenido o el impacto, vuelve a borrador y habrá que validarlo de nuevo.")}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 160px", gap: 12, marginBottom: 12 }}>
              <div>
                <label htmlFor="edit-rec-title" style={lbl}>{t("Título")}</label>
                <input id="edit-rec-title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} style={inp} />
              </div>
              <Select id="edit-rec-impact" label={t("Impacto")} hint={GLOSSARY.fb_impacto} value={edit.impact || ""} onChange={(e) => setEdit({ ...edit, impact: e.target.value })}>
                {IMPACTS.map((i) => (
                  <option key={i || "none"} value={i}>{i ? IMPACT_LABELS[i] : t("Sin definir")}</option>
                ))}
              </Select>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label htmlFor="edit-rec-content" style={lbl}>{t("Contenido (Markdown)")}</label>
              <button
                type="button"
                onClick={() => setShowPreview((s) => !s)}
                style={{ border: "none", background: "transparent", color: "#1D4ED8", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Icon name={showPreview ? "eyeOff" : "eye"} size={14} />
                {showPreview ? t("Ocultar vista previa") : t("Ver vista previa")}
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
                  <Markdown>{edit.content || `_${t("Vista previa...")}_`}</Markdown>
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
        title={t("Eliminar informe")}
        message={t('Se eliminará "{titulo}". Esta acción no se puede deshacer.', {
          titulo: confirmDel?.title?.slice(0, 120),
        })}
        confirmLabel={t("Eliminar")}
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
