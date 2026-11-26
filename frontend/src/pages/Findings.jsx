import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { AI_TIMEOUT, apiError } from "../api/client";
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
import LinkReport from "../components/LinkReport";
import ConfirmDialog from "../components/ConfirmDialog";
import { Input, Textarea, Select } from "../components/Field";
import Modal from "../components/Modal";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import { t, tr, ts } from "../i18n";

const HORIZONS = ["emergente", "transicional", "inminente"];
const TYPES = ["medicamento", "dispositivo", "digital", "otro"];
const STATUSES = ["nuevo", "revisado", "priorizado", "descartado"];
const PAGE = 100;
const EMPTY_FILTERS = { q: "", horizon: "", technology_type: "", status: "" };
// Etiquetas de los valores: el valor en español es el que se guarda y se envía al servidor.
const HORIZON_NAME = { emergente: t("emergente"), transicional: t("transicional"), inminente: t("inminente") };
const TYPE_NAME = { medicamento: t("medicamento"), dispositivo: t("dispositivo"), digital: t("digital"), otro: t("otro") };
const STATUS_NAME = { nuevo: t("nuevo"), revisado: t("revisado"), priorizado: t("priorizado"), descartado: t("descartado") };
// Badge elige el color por el valor: se le pasa como tono para que la etiqueta traducida no lo cambie.
const toneOf = (value) => String(value || "").toLowerCase();

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
  const firstLoad = useRef(true);
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
      if (firstLoad.current) toast.error(apiError(e, t("No se pudieron cargar las señales")));
    } finally {
      firstLoad.current = false;
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
      toast.error(apiError(e, t("No se pudieron cargar más señales")));
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
      setFormError(t("El título de la señal es obligatorio."));
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
      toast.success(t("Señal actualizada"));
      setEditOpen(false);
      if (detail?.id === data.id) setDetail(data);
      load();
    } catch (e) {
      setFormError(apiError(e, t("No se pudo actualizar")));
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (f, newStatus) => {
    try {
      const { data } = await api.put(`/findings/${f.id}`, { status: newStatus });
      toast.success(t("Marcada como {status}", { status: STATUS_NAME[newStatus] || newStatus }));
      if (detail?.id === f.id) setDetail(data);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo actualizar")));
    }
  };

  const generateRec = async (f) => {
    setGenId(f.id);
    try {
      const { data } = await api.post("/recommendations/generate", { finding_id: f.id }, { timeout: AI_TIMEOUT });
      const preliminary = /sin IA|fallback/i.test(data.model_used || "");
      if (preliminary) toast.warning(t("IA no configurada: se creó un informe preliminar para completar en Diseminación."));
      else toast.success(t("Informe generado ({model})", { model: data.model_used }));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo generar el informe")));
    } finally {
      setGenId(null);
    }
  };

  const enhanceFinding = async (f) => {
    setEnhancingId(f.id);
    try {
      const { data } = await api.post(`/findings/${f.id}/enhance-ai`, null, { timeout: AI_TIMEOUT });
      toast.success(t("Ficha enriquecida con IA. Revise el resultado."));
      setDetail(data);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo enriquecer con IA")));
    } finally {
      setEnhancingId(null);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/findings/${confirmDel.id}`);
      toast.success(t("Señal eliminada"));
      setConfirmDel(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar la señal")));
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
      label: t("Señal tecnológica"),
      render: (f) => (
        <div>
          <button type="button" onClick={() => setDetail(f)} style={linkBtn}>
            {f.title}
          </button>
          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <ScreeningScore score={f.screening_score} compact />
            {f.recommendations_count > 0 && <span title={t("Recomendaciones de adopción ya generadas")}><Badge tone="priorizado">{t("Informes {n}", { n: f.recommendations_count })}</Badge></span>}
            {f.notes_count > 0 && <span title={t("Notas del equipo")}><Badge>{t("Notas {n}", { n: f.notes_count })}</Badge></span>}
          </div>
        </div>
      ),
    },
    { key: "type", width: 110, label: t("Tipo"), render: (f) => <Badge tone={toneOf(f.technology_type || "otro")}>{TYPE_NAME[f.technology_type || "otro"] || f.technology_type}</Badge> },
    { key: "horizon", width: 120, label: t("Horizonte"), tip: <InfoTip text={GLOSSARY.horizonte} label={t("Qué es el horizonte")} />, render: (f) => (f.horizon ? <Badge tone={toneOf(f.horizon)}>{HORIZON_NAME[f.horizon] || f.horizon}</Badge> : "-") },
    { key: "status", width: 110, label: t("Estado"), tip: <InfoTip text={GLOSSARY.fb_estado_senal} label={t("Qué es el estado")} />, render: (f) => <Badge tone={f.status}>{STATUS_NAME[f.status] || f.status}</Badge> },
    { key: "source", width: 160, label: t("Fuente"), render: (f) => <span style={{ fontSize: 13, color: "#64748B" }}>{f.source_title}</span> },
    {
      key: "actions",
      width: isEditor ? 250 : 80,
      align: "right",
      label: t("Acciones"),
      render: (f) => (
        <div className="fb-toolbar" style={{ justifyContent: "flex-end", gap: 2 }}>
          <Button size="sm" variant="ghost" onClick={() => setDetail(f)}>{t("Ver")}</Button>
          {isEditor && (
            <>
              <HintButton size="sm" variant="ghost" hint={t("Editar la señal")} onClick={() => openEdit(f)} aria-label={t("Editar {title}", { title: f.title })}>
                <Icon name="edit" size={14} />
              </HintButton>
              <HintButton size="sm" variant="outline" hint={GLOSSARY.fb_generar_informe} disabled={!canReport} disabledHint={t("Su perfil no redacta informes (permiso report:write).")} loading={genId === f.id} onClick={() => generateRec(f)} aria-label={t("Generar informe de {title}", { title: f.title })}>
                <Icon name="pulse" size={14} /> {t("Informe")}
              </HintButton>
              <HintButton size="sm" variant="ghost" style={{ color: "#DC2626" }} hint={GLOSSARY.fb_eliminar_senal} onClick={() => setConfirmDel(f)} aria-label={t("Eliminar {title}", { title: f.title })}>
                <Icon name="trash" size={14} />
              </HintButton>
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <LoadingBlock label={t("Cargando señales...")} />;

  return (
    <div>
      <ModuleHeader
        step="priorizacion"
        title={t("Señales capturadas")}
        titleHint={GLOSSARY.senal}
        purpose={t("Cola de cribado: revise, siga o descarte lo que trae la vigilancia. El puntaje de cribado (destaque desde {n}) solo ordena la cola; la priorización oficial es la matriz P1-P6 del ciclo.", { n: stats?.threshold ?? 70 })}
        actions={
          <div className="fb-toolbar">
            <Button variant="secondary" onClick={() => navigate("/bandeja-entrada")}>
              <Icon name="inbox" size={16} /> {t("Bandeja de entrada")}
            </Button>
            <Button variant="secondary" onClick={() => navigate("/priorizacion")}>
              {t("Matriz P1-P6")}
            </Button>
          </div>
        }
      />

      <LinkReport canWrite={isEditor} toast={toast} />

      {!isEditor && (
        <div className="fb-readonly-note" data-testid="findings-readonly">
          <Icon name="info" size={16} />
          <span>
            {can(PERM.NOTE_WRITE)
              ? t("Modo consulta: su perfil ({role}) no edita señales (permiso technology:write). Puede leerlas y dejar notas en cada ficha.", { role: ts(user?.role_label) || user?.role })
              : t("Modo consulta: su perfil ({role}) no edita señales (permiso technology:write). Puede leerlas.", { role: ts(user?.role_label) || user?.role })}
          </span>
        </div>
      )}

      <PhaseGuide
        phase={t("Señales · Cola de cribado")}
        hint={GLOSSARY.cribado}
        tasks={[
          t("Revise las señales nuevas que trajo la vigilancia; las de mayor cribado primero."),
          t("Marque 'Seguir' lo pertinente y 'Descartar' el ruido: descartar no borra."),
          t("Lo que vale la pena pasa por la Bandeja de entrada al ciclo, donde se clasifica y se prioriza con P1-P6."),
        ]}
        nextLabel={t("Bandeja de entrada")}
        onNext={() => navigate("/bandeja-entrada")}
      />

      <ModuleStatsRow
        items={[
          { label: t("Nuevas"), value: counts.nuevo || 0, color: counts.nuevo ? "#2563EB" : undefined, hint: t("Señales que nadie ha revisado todavía."), testId: "findings-kpi-nuevas" },
          { label: t("En revisión"), value: counts.revisado || 0, hint: t("Señales ya leídas por el equipo, pendientes de decidir si se siguen.") },
          { label: t("A seguir"), value: counts.priorizado || 0, color: "#10B981", hint: t("Marcadas para seguimiento (estado 'priorizado'). No es la priorización oficial P1-P6.") },
          { label: t("Cribado alto"), value: stats?.high_priority || 0, sub: `>= ${stats?.threshold ?? 70}`, color: "#EF4444", hint: GLOSSARY.fb_cribado },
        ]}
      />

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div className="fb-toolbar">
          <input
            placeholder={t("Buscar tecnología o señal...")}
            aria-label={t("Buscar señal")}
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="filter-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <select value={filters.horizon} onChange={(e) => setFilters({ ...filters, horizon: e.target.value })} className="filter-select" aria-label={t("Filtrar por horizonte")}>
            <option value="">{t("Todos los horizontes")}</option>
            {HORIZONS.map((h) => <option key={h} value={h}>{HORIZON_NAME[h]}</option>)}
          </select>
          <select value={filters.technology_type} onChange={(e) => setFilters({ ...filters, technology_type: e.target.value })} className="filter-select" aria-label={t("Filtrar por tipo")}>
            <option value="">{t("Todos los tipos")}</option>
            {TYPES.map((ty) => <option key={ty} value={ty}>{TYPE_NAME[ty]}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className="filter-select" aria-label={t("Filtrar por estado")}>
            <option value="">{t("Todos los estados")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_NAME[s]}</option>)}
          </select>
          {hasFilters && <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>{t("Limpiar")}</Button>}
          <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 8 }}>
            <button type="button" className={`view-toggle${view === "kanban" ? " active" : ""}`} onClick={() => setView("kanban")}>{t("Tablero##vista")}</button>
            <button type="button" className={`view-toggle${view === "table" ? " active" : ""}`} onClick={() => setView("table")}>{t("Tabla")}</button>
          </div>
          <span style={{ fontSize: 13, color: "#64748B" }} data-testid="findings-count">
            {findings.length < total ? t("{n} de {total} señales", { n: findings.length, total }) : t("{total} señales", { total })}
          </span>
        </div>
      </Card>

      {findings.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔭"
            title={hasFilters ? t("Ninguna señal coincide") : t("Sin señales capturadas")}
            message={hasFilters ? t("Ajuste o limpie los filtros.") : t("Ejecute la vigilancia de fuentes (Fase 1) para capturar tecnologías emergentes.")}
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>{t("Limpiar filtros")}</Button>
              ) : (
                <Button onClick={() => navigate("/vigilancia")}>
                  <Icon name="radar" size={16} /> {t("Ir a vigilancia")}
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
            {t("Cargar más ({n} restantes)", { n: total - findings.length })}
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
        title={t("Editar ficha de señal")}
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>{t("Cancelar")}</Button>
            <Button onClick={save} loading={saving}>{t("Guardar")}</Button>
          </>
        }
      >
        {form && (
          <>
            {formError && <p className="public-submit-error" role="alert">{formError}</p>}
            <Input id="finding-title" label={t("Título")} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input id="finding-technology" label={t("Tecnología")} value={form.technology || ""} onChange={(e) => setForm({ ...form, technology: e.target.value })} />
            <Textarea id="finding-summary" label={t("Resumen / evidencia")} value={form.summary || ""} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={3} />
            <div className="fb-grid-2">
              <Select id="finding-type" label={t("Tipo")} value={form.technology_type || "otro"} onChange={(e) => setForm({ ...form, technology_type: e.target.value })}>
                {TYPES.map((ty) => <option key={ty} value={ty}>{TYPE_NAME[ty]}</option>)}
              </Select>
              <Select id="finding-horizon" label={t("Horizonte temporal")} hint={GLOSSARY.horizonte} value={form.horizon || ""} onChange={(e) => setForm({ ...form, horizon: e.target.value })}>
                <option value="">{t("Sin clasificar")}</option>
                {HORIZONS.map((h) => <option key={h} value={h}>{HORIZON_NAME[h]}</option>)}
              </Select>
              <Input id="finding-phase" label={t("Fase de desarrollo")} hint={GLOSSARY.fase} value={form.phase || ""} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
              <Input id="finding-area" label={t("Área terapéutica")} value={form.therapeutic_area || ""} onChange={(e) => setForm({ ...form, therapeutic_area: e.target.value })} />
            </div>
            <Select id="finding-status" label={t("Estado de triage")} hint={GLOSSARY.fb_estado_senal} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_NAME[s]}</option>)}
            </Select>
            {form.screening_score != null && (
              <p style={{ fontSize: 13, color: "#64748B", marginTop: 8 }}>
                {tr("Puntaje de cribado actual: <b>{score}</b> (se recalcula al guardar).", { score: form.screening_score }, { b: (c) => <strong>{c}</strong> })}{" "}
                {aiOn ? "" : t("La IA no está configurada: el enriquecimiento automático no está disponible.")}
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
        title={t("Eliminar señal")}
        message={t('Se eliminará "{title}" con sus notas. Solo es posible si su tecnología sigue en la bandeja sin asignar; si ya entró a un ciclo, márquela como descartada.', { title: confirmDel?.title?.slice(0, 120) })}
        confirmLabel={t("Eliminar")}
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
