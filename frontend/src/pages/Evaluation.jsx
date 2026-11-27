import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { downloadFromApi } from "../utils/download";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import ClampText from "../components/ClampText";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import ActionMenu from "../components/ActionMenu";
import Icon from "../components/Icon";
import { Input, Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import ModuleHeader from "../components/ModuleHeader";
import InfoTip, { TermLabel } from "../components/InfoTip";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import {
  TechLinkNotice,
  buildTechNotice,
  focusElement,
  locateTech,
  resolveTechLink,
  useTechDeepLink,
} from "../utils/techLink";
import { t, tr, ts, fmtDate, fmtDateTime } from "../i18n";
import "./prioritization.css";
import "./evaluation.css";

const FICHA = [
  "health_condition",
  "mechanism",
  "target_population_co",
  "evidence_state",
  "comparators_sgsss",
  "adoption_risks",
];
const INFORME = ["narrative", "evidence_phases", "efficacy_outcomes", "safety_outcomes"];
const PICO = [
  "pico_population",
  "pico_intervention",
  "pico_comparator",
  "pico_outcome",
  "budget_year_1",
  "budget_year_2",
  "budget_year_3",
  "clinical_uncertainty",
];

const DEFAULT_LABELS = {
  health_condition: t("Condición de salud"),
  mechanism: t("Mecanismo biológico o tecnológico"),
  target_population_co: t("Población objetivo en Colombia"),
  evidence_state: t("Estado del arte de la evidencia clínica"),
  comparators_sgsss: t("Comparadores posibles en el SGSSS"),
  adoption_risks: t("Riesgos potenciales de adopción"),
  narrative: t("Narrativa del informe"),
  evidence_phases: t("Fases de ensayos"),
  efficacy_outcomes: t("Desenlaces de eficacia"),
  safety_outcomes: t("Desenlaces de seguridad"),
  pico_population: t("PICO: población"),
  pico_intervention: t("PICO: intervención"),
  pico_comparator: t("PICO: comparador"),
  pico_outcome: t("PICO: desenlace"),
  budget_year_1: t("Impacto presupuestal año 1"),
  budget_year_2: t("Impacto presupuestal año 2"),
  budget_year_3: t("Impacto presupuestal año 3"),
  clinical_uncertainty: t("Incertidumbre clínica"),
  early_dialogue_notes: t("Notas de diálogo temprano"),
};

// Ayuda por campo tecnico del expediente (RF13 y RF14).
const FIELD_HINTS = {
  health_condition: t("Enfermedad o problema de salud al que se dirige, con su carga en Colombia si se conoce."),
  mechanism: t("Cómo actúa la tecnología (mecanismo biológico o principio tecnológico)."),
  target_population_co: t("Quiénes la usarían en Colombia y cuántos pacientes aproximadamente."),
  evidence_state: t("Fases de ensayos disponibles y calidad de la evidencia de eficacia y seguridad."),
  comparators_sgsss: GLOSSARY.comparadores,
  adoption_risks: t("Riesgos para el sistema: presupuesto, infraestructura, entrenamiento, equidad."),
  narrative: t("Síntesis del informe en lenguaje para tomadores de decisión."),
  evidence_phases: t("Ensayos por fase, con identificadores (NCT) cuando existan."),
  efficacy_outcomes: t("Resultados de eficacia: desenlace, magnitud del efecto e incertidumbre."),
  safety_outcomes: t("Eventos adversos relevantes y su frecuencia."),
  pico_population: t("P de PICO: población de la pregunta de evaluación."),
  pico_intervention: t("I de PICO: la tecnología evaluada, dosis y vía."),
  pico_comparator: t("C de PICO: alternativa vigente en el SGSSS contra la que se compara."),
  pico_outcome: t("O de PICO: desenlaces que importan (clínicos y de calidad de vida)."),
  budget_year_1: t("Impacto presupuestal estimado del primer año, en COP (ej. 3.200 millones)."),
  budget_year_2: t("Impacto presupuestal estimado del segundo año, en COP."),
  budget_year_3: t("Impacto presupuestal estimado del tercer año, en COP."),
  clinical_uncertainty: t("Qué no se sabe todavía y cómo cambiaría la recomendación."),
  early_dialogue_notes: t("Registro opcional de diálogos tempranos con MSPS, INVIMA o desarrolladores (D-12)."),
};

const EDITORIAL_STEPS = [
  { key: "borrador", label: t("Borrador"), help: GLOSSARY.borrador },
  { key: "revision_interna", label: t("Interna"), help: GLOSSARY.revision_interna },
  { key: "revision_externa", label: t("Externa"), help: GLOSSARY.revision_externa },
  { key: "con_observaciones", label: t("Observado"), help: GLOSSARY.observado },
  { key: "aprobado_comite", label: t("Comité"), help: GLOSSARY.comite },
  { key: "publicado", label: t("Publicado"), help: GLOSSARY.publicado },
];

// Nombre completo de cada estado editorial, para el filtro de la cola.
const STATUS_LONG = {
  borrador: t("Borrador en redacción"),
  revision_interna: t("Revisión interna de calidad"),
  revision_externa: t("Revisión externa por pares"),
  con_observaciones: t("Con observaciones"),
  aprobado_comite: t("Aprobado por comité técnico"),
  publicado: t("Publicado"),
};

function daysUntil(value) {
  const raw = typeof value === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? `${value}Z` : value;
  const ms = new Date(raw).getTime() - Date.now();
  return Number.isNaN(ms) ? null : Math.ceil(ms / 86400000);
}

function sameBody(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) if (String(a?.[key] || "") !== String(b?.[key] || "")) return false;
  return true;
}

const ASSIGNMENT_STATUS = {
  invitado: t("Invitado"),
  pendiente: t("Pendiente"),
  invitacion_enviada: t("Invitación enviada por correo"),
  en_lectura: t("En lectura"),
  aprobado: t("Aprobado"),
  observado: t("Con observaciones"),
  revocado: t("Revocado"),
};

const TRANSITION_LABELS = {
  revision_interna: t("Enviar a revisión interna"),
  revision_externa: t("Pasar a revisión externa"),
  con_observaciones: t("Devolver con observaciones"),
  aprobado_comite: t("Aprobar en comité"),
  publicado: t("Publicar"),
  borrador: t("Regresar a borrador"),
};

const TRANSITION_HINTS = {
  revision_interna: GLOSSARY.fa_tr_revision_interna,
  revision_externa: GLOSSARY.fa_tr_revision_externa,
  con_observaciones: GLOSSARY.fa_tr_con_observaciones,
  aprobado_comite: GLOSSARY.fa_tr_aprobado_comite,
  publicado: GLOSSARY.fa_tr_publicado,
  borrador: GLOSSARY.fa_tr_borrador,
};

function fieldsFor(level) {
  if (level === "mini_hta") return [...FICHA, ...INFORME, ...PICO];
  if (level === "informe") return [...FICHA, ...INFORME];
  return [...FICHA];
}

function fieldGroups(level) {
  const groups = [{ title: t("Ficha técnica"), keys: FICHA }];
  if (level === "informe" || level === "mini_hta") {
    groups.push({ title: t("Informe de evaluación"), keys: INFORME });
  }
  if (level === "mini_hta") {
    groups.push({ title: t("Mini-HTA: PICO e impacto presupuestal"), keys: PICO });
  }
  return groups;
}

function ReportPreview({ title, levelLabel, statusLabel, cycleCode, labels, body, groups }) {
  return (
    <article className="iets-dossier">
      <header className="iets-dossier-mast">
        <div className="iets-dossier-brand">IETS</div>
        <div style={{ minWidth: 0 }}>
          <p className="iets-dossier-kicker">Instituto de Evaluación Tecnológica en Salud · Colombia</p>
          <ClampText as="h2" text={title} lines={3} expandable />
          <p className="iets-dossier-sub">
            {cycleCode || t("Ciclo institucional")} · {levelLabel} · {statusLabel}
          </p>
        </div>
      </header>
      {groups.map((group, index) => (
        <section key={group.title} className="iets-dossier-chapter">
          <div className="iets-dossier-num">0{index + 1}</div>
          <h3>{group.title}</h3>
          {group.keys.map((key) => {
            const paras = String(body[key] || "").split("\n").map((p) => p.trim()).filter(Boolean);
            return (
              <article key={key} className="iets-dossier-block">
                <h4>{ts(labels[key] || key)}</h4>
                {(paras.length ? paras : ["-"]).map((para, i) => (
                  <p key={`${key}-${i}`}>{para}</p>
                ))}
              </article>
            );
          })}
        </section>
      ))}
    </article>
  );
}

function EditorialStepper({ status }) {
  const idx = EDITORIAL_STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="editorial-stepper" aria-label={t("Flujo editorial")}>
      {EDITORIAL_STEPS.map((step, i) => (
        <li key={step.key} className={i < idx ? "is-done" : i === idx ? "is-current" : ""}>
          <span>{i + 1}</span>
          <span className="term-label">
            {step.label}
            <InfoTip text={step.help} label={t("Qué es {termino}", { termino: step.label })} />
          </span>
        </li>
      ))}
    </ol>
  );
}

const EMPTY_COI = { accepted: false, has_conflict: false, statement: "" };
const EMPTY_INVITE = { kind: "externo", reviewer_name: "", reviewer_email: "" };

export default function Evaluation() {
  const { cycle, cycleId, isClosed, setCycleId } = useCycle();
  const { techId, invalidParam, setTechId } = useTechDeepLink();
  const [linkNotice, setLinkNotice] = useState(null);
  const handledLink = useRef("");
  const dirtyRef = useRef(false);
  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const canWrite = can(PERM.REPORT_WRITE);
  const canInvite = can(PERM.CYCLE_WRITE);
  const canReview = can(PERM.REVIEW_SUBMIT) || can(PERM.REPORT_WRITE);

  const [queue, setQueue] = useState([]);
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);
  const [activeId, setActiveId] = useState(null);
  const [doc, setDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [body, setBody] = useState({});
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("ficha");
  const [confidential, setConfidential] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [coi, setCoi] = useState(EMPTY_COI);
  const [invite, setInvite] = useState(EMPTY_INVITE);
  const [inviteResult, setInviteResult] = useState(null);
  const [comment, setComment] = useState({ field_key: "", body: "" });
  const [versions, setVersions] = useState([]);
  const [showDossier, setShowDossier] = useState(true);
  const [confirmMove, setConfirmMove] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [tab, setTab] = useState("documento");
  const [qSearch, setQSearch] = useState("");
  const [qStatus, setQStatus] = useState("");
  const [commentFilter, setCommentFilter] = useState("abiertas");
  const [pendingSwitch, setPendingSwitch] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [viewVersion, setViewVersion] = useState(null);
  const [exporting, setExporting] = useState(false);

  const loadQueue = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/reports", { params: { cycle_id: cycleId } });
      setQueue(data);
      setActiveId((current) =>
        current && data.some((i) => i.technology_id === current)
          ? current
          : data[0]?.technology_id || null
      );
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudo cargar la cola de evaluación")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, [cycleId, toast]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue, version]);

  useEffect(() => {
    api
      .get("/methodology/enums")
      .then(({ data }) => {
        if (data.evaluation_fields) setLabels({ ...DEFAULT_LABELS, ...data.evaluation_fields });
      })
      .catch(() => {});
  }, []);

  const active = useMemo(
    () => queue.find((i) => i.technology_id === activeId) || null,
    [queue, activeId]
  );

  // Enlace directo ?tecnologia=<id>: abre su expediente; si no esta en la cola
  // de este ciclo, explica donde esta y ofrece cambiar de ciclo o de pantalla.
  useEffect(() => {
    if (invalidParam) {
      setLinkNotice({ tone: "warn", message: t("El enlace de tecnología no es válido."), actions: [] });
      return;
    }
    if (!techId || !cycleId || loading) return;
    const key = `${cycleId}:${techId}`;
    if (queue.some((i) => i.technology_id === techId)) {
      // Siempre se limpia: al cambiar de ciclo la cola nueva puede llegar antes que
      // la consulta de ubicacion (que se cancela) y el aviso viejo quedaba en pantalla.
      setLinkNotice(null);
      if (handledLink.current === key) return;
      handledLink.current = key;
      setActiveId(techId);
      focusElement(`eval-item-${techId}`);
      return;
    }
    if (handledLink.current === key) return;
    if (handledLink.current === `${key}:retry`) {
      handledLink.current = key;
      setLinkNotice({
        tone: "info",
        message: t("La tecnología #{id} no aparece en la cola de evaluación de {ciclo}.", {
          id: techId,
          ciclo: cycle?.code || t("este ciclo"),
        }),
        actions: [],
      });
      return;
    }
    handledLink.current = key;
    let cancelled = false;
    (async () => {
      try {
        const loc = await locateTech(api, techId);
        if (cancelled) return;
        const res = resolveTechLink(loc, {
          cycleId,
          accepts: (status) => ["priorizada", "en_evaluacion", "publicada"].includes(status),
        });
        if (res.kind === "ok") {
          // La cola estaba desactualizada: se recarga una vez y el efecto la abre.
          handledLink.current = `${key}:retry`;
          loadQueue();
          return;
        }
        setLinkNotice(buildTechNotice(res, { id: techId, page: "evaluacion", cycle, setCycleId, navigate }));
      } catch (e) {
        toast.error(apiError(e, t("No se pudo abrir la tecnología del enlace")));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techId, cycleId, loading, queue, invalidParam]);

  const goTo = (id) => {
    handledLink.current = `${cycleId}:${id}`;
    setLinkNotice(null);
    setActiveId(id);
    setTechId(id);
  };
  const selectItem = (id) => {
    if (id === activeId) return;
    // Con cambios sin guardar se pregunta antes de perderlos.
    if (dirtyRef.current) setPendingSwitch(id);
    else goTo(id);
  };
  const activeDocId = active?.doc_id || null;

  const fetchDoc = useCallback(
    async (id) => {
      setDocLoading(true);
      try {
        const { data } = await api.get(`/reports/${id}`);
        setDoc(data);
        setTitle(data.title || "");
        setLevel(data.product_level || "ficha");
        setConfidential(Boolean(data.confidential));
        setBody(data.body || {});
        setShowDossier(!["borrador", "con_observaciones"].includes(data.status));
        if (!data.coi_required) {
          api
            .get(`/reports/${id}/versions`)
            .then((r) => setVersions(r.data))
            .catch(() => setVersions([]));
        } else {
          setVersions([]);
        }
      } catch (e) {
        toast.error(apiError(e, t("No se pudo abrir el expediente")));
      } finally {
        setDocLoading(false);
      }
    },
    [toast]
  );

  // Seleccionar una tecnologia solo lee su expediente. Antes, entrar a la
  // pantalla creaba expedientes en silencio para la primera priorizada.
  useEffect(() => {
    setInviteResult(null);
    setCoi(EMPTY_COI);
    setComment({ field_key: "", body: "" });
    setTab("documento");
    setCommentFilter("abiertas");
    if (activeDocId) fetchDoc(activeDocId);
    else {
      setDoc(null);
      setVersions([]);
    }
  }, [activeDocId, fetchDoc]);

  const openDossier = async () => {
    if (!active) return;
    setOpening(true);
    try {
      const { data } = await api.post("/reports", {
        cycle_id: cycleId,
        technology_id: active.technology_id,
        product_level: active.suggested_level,
      });
      toast.success(
        t("Expediente abierto como {nivel}. Firme el COI para empezar.", { nivel: ts(data.product_level_label) })
      );
      await loadQueue();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo abrir el expediente")));
    } finally {
      setOpening(false);
    }
  };

  const editable =
    canWrite && doc && !doc.coi_required && ["borrador", "con_observaciones"].includes(doc.status);
  const dirty = Boolean(
    editable &&
      (title !== (doc.title || "") ||
        level !== (doc.product_level || "ficha") ||
        confidential !== Boolean(doc.confidential) ||
        !sameBody(body, doc.body))
  );
  dirtyRef.current = dirty;

  // Cerrar o recargar la pestaña con cambios sin guardar avisa antes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const loadVersions = (id) =>
    api
      .get(`/reports/${id}/versions`)
      .then((r) => setVersions(r.data))
      .catch(() => setVersions([]));

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/reports/${doc.id}`, {
        title,
        product_level: level,
        body,
        confidential,
      });
      setDoc(data);
      setBody(data.body || {});
      toast.success(t("Guardado v{version}", { version: `${data.version_major}.${data.version_minor}` }));
      setTitle(data.title || "");
      loadVersions(data.id);
      loadQueue();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar")));
    } finally {
      setSaving(false);
    }
  };

  const signCoi = async () => {
    if (!doc) return;
    try {
      await api.post(`/reports/${doc.id}/coi`, coi);
      toast.success(t("Declaración registrada. Ya puede leer el informe."));
      await fetchDoc(doc.id);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo firmar el conflicto de interés")));
    }
  };

  const move = async (status) => {
    if (!doc) return;
    try {
      const { data } = await api.post(`/reports/${doc.id}/transition`, { status });
      setDoc(data);
      setConfirmMove(null);
      toast.success(t("Estado editorial: {estado}", { estado: ts(data.status_label) }));
      loadVersions(data.id);
      loadQueue();
    } catch (e) {
      toast.error(apiError(e, t("La transición fue rechazada")));
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!doc) return;
    try {
      const { data } = await api.post(`/reports/${doc.id}/invite`, invite);
      setInvite(EMPTY_INVITE);
      if (data.invite_path) {
        const url = `${window.location.origin}${data.invite_path}`;
        let copied = false;
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch {
          copied = false;
        }
        setInviteResult({ url, email_sent: data.email_sent, detail: data.email_detail, copied });
        if (data.email_sent)
          toast.success(t("Invitación enviada por correo a {correo}.", { correo: data.assignment.reviewer_email }));
        else if (copied) toast.success(t("Invitación creada. El enlace se copió al portapapeles."));
        else toast.success(t("Invitación creada. Copie el enlace ahora: solo se muestra una vez."));
      } else {
        setInviteResult(null);
        toast.success(t("Revisor interno asignado. Debe firmar su COI al abrir el expediente."));
      }
      await fetchDoc(doc.id);
    } catch (err) {
      toast.error(apiError(err, t("No se pudo invitar")));
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteResult.url);
      setInviteResult((r) => ({ ...r, copied: true }));
      toast.success(t("Enlace copiado."));
    } catch {
      toast.warning(t("El navegador no permitió copiar. Seleccione el enlace y cópielo a mano."));
    }
  };

  const revoke = async () => {
    try {
      const { data } = await api.post(`/reports/${doc.id}/assignments/${revoking.id}/revoke`);
      setDoc(data);
      setRevoking(null);
      toast.success(t("Invitación revocada. El enlace ya no abre el portal."));
    } catch (err) {
      toast.error(apiError(err, t("No se pudo revocar la invitación")));
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!doc) return;
    try {
      await api.post(`/reports/${doc.id}/comments`, comment);
      setComment({ field_key: "", body: "" });
      const { data } = await api.get(`/reports/${doc.id}`);
      setDoc(data);
      setCommentFilter("abiertas");
      toast.success(t("Observación registrada"));
      loadQueue();
    } catch (err) {
      toast.error(apiError(err, t("No se pudo comentar")));
    }
  };

  const resolveComment = async () => {
    try {
      const { data } = await api.post(`/reports/${doc.id}/comments/${resolving.comment.id}/resolve`, {
        note: resolving.note,
      });
      setDoc(data);
      setResolving(null);
      toast.success(t("Observación resuelta"));
      loadQueue();
    } catch (err) {
      toast.error(apiError(err, t("No se pudo resolver la observación")));
    }
  };

  const reopenComment = async (row) => {
    try {
      const { data } = await api.post(`/reports/${doc.id}/comments/${row.id}/reopen`);
      setDoc(data);
      toast.success(t("Observación reabierta"));
      loadQueue();
    } catch (err) {
      toast.error(apiError(err, t("No se pudo reabrir la observación")));
    }
  };

  const exportQueue = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, "/reports/export.csv", `evaluacion_${cycle?.code || cycleId}.csv`, {
        params: { cycle_id: cycleId },
      });
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descargar el estado editorial")));
    } finally {
      setExporting(false);
    }
  };

  const exportHtml = async () => {
    if (!doc) return;
    try {
      const { data } = await api.get(`/reports/${doc.id}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const win = window.open(url, "_blank", "noopener");
      if (!win) toast.info(t("Si no se abrió una pestaña nueva, permita las ventanas emergentes para este sitio."));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo exportar")));
    }
  };

  const exportPdf = async () => {
    if (!doc) return;
    try {
      await downloadFromApi(api, `/reports/${doc.id}/export?format=pdf`, `iets-evaluacion-${doc.id}.pdf`);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo generar el PDF")));
    }
  };

  if (!cycleId) {
    return (
      <Card>
        <EmptyState
          icon="🗓️"
          title={t("Seleccione un ciclo")}
          message={t("La evaluación vive dentro del ciclo operativo. Elija uno en la cabecera o en Ciclos de escaneo.")}
          action={<Button onClick={() => navigate("/ciclos")}>{t("Ir a ciclos")}</Button>}
        />
      </Card>
    );
  }

  if (loading) return <LoadingBlock label={t("Cargando evaluación...")} />;

  const withDoc = queue.filter((i) => i.doc_id);
  const countBy = (...statuses) => queue.filter((i) => statuses.includes(i.doc_status)).length;
  const openObservations = queue.reduce((sum, i) => sum + (i.open_comments || 0), 0);
  const expiring = queue.reduce((sum, i) => sum + (i.invites_expiring || 0), 0);
  const stats = [
    { label: t("En cola##tecnologias"), value: queue.length, hint: t("Tecnologías priorizadas, en evaluación o publicadas en este ciclo.") },
    {
      label: t("Sin expediente"),
      value: queue.length - withDoc.length,
      color: queue.length - withDoc.length ? "#D97706" : undefined,
      hint: t("Priorizadas que aún no tienen ficha, informe o Mini-HTA abierto."),
      testId: "eval-kpi-none",
    },
    {
      label: t("En redacción"),
      value: countBy("borrador", "con_observaciones"),
      sub: countBy("con_observaciones") ? t("{n} devuelto(s) con observaciones", { n: countBy("con_observaciones") }) : undefined,
      hint: t("Expedientes en borrador o devueltos con observaciones: los tiene quien redacta."),
    },
    {
      label: t("En revisión"),
      value: countBy("revision_interna", "revision_externa"),
      color: countBy("revision_interna", "revision_externa") ? "#2563EB" : undefined,
      sub: expiring ? t("{n} invitación(es) vence(n) en 3 días", { n: expiring }) : undefined,
      hint: t("Expedientes en revisión interna de calidad o en revisión externa por pares."),
    },
    {
      label: t("Observaciones abiertas"),
      value: openObservations,
      color: openObservations ? "#DC2626" : undefined,
      hint: t("Observaciones de revisión que nadie ha marcado como resueltas, en todos los expedientes del ciclo."),
      testId: "eval-kpi-open",
    },
    {
      label: t("En comité"),
      value: countBy("aprobado_comite"),
      sub: countBy("aprobado_comite") ? t("Listos para publicar") : undefined,
      hint: GLOSSARY.comite,
    },
    { label: t("Publicados"), value: countBy("publicado"), color: countBy("publicado") ? "#059669" : undefined, hint: GLOSSARY.publicado },
  ];

  const needle = qSearch.trim().toLowerCase();
  const visible = queue.filter((i) => {
    if (qStatus === "sin_expediente" && i.doc_id) return false;
    if (qStatus && qStatus !== "sin_expediente" && i.doc_status !== qStatus) return false;
    if (!needle) return true;
    return `${i.commercial_name} ${i.inn_name} ${i.cluster_name}`.toLowerCase().includes(needle);
  });

  const activeAssignments = (doc?.assignments || []).filter((a) => a.status !== "revocado");
  const hints = doc?.transition_hints || {};
  const comments = doc?.comments || [];
  const openComments = comments.filter((c) => !c.resolved_at);
  const shownComments = commentFilter === "abiertas" ? openComments : comments;
  const openByField = openComments.reduce((acc, c) => {
    if (c.field_key) acc[c.field_key] = (acc[c.field_key] || 0) + 1;
    return acc;
  }, {});
  const groups = fieldGroups(level);
  const filled = (key) => Boolean(String(body[key] || "").trim());
  const TABS = [
    { key: "documento", label: t("Documento") },
    { key: "revision", label: t("Revisión por pares"), count: activeAssignments.length },
    { key: "observaciones", label: t("Observaciones"), count: openComments.length, alert: openComments.length > 0 },
    { key: "versiones", label: t("Versiones"), count: versions.length },
  ];
  const requestMove = (status) => {
    if (status === "publicado" || (status === "aprobado_comite" && openComments.length > 0)) setConfirmMove(status);
    else move(status);
  };

  return (
    <div>
      <ModuleHeader
        step="caracterizacion"
        title={t("Evaluación")}
        titleHint={GLOSSARY.evaluacion}
        purpose={
          cycle
            ? t("Fase 3 · {ciclo}. Expediente editorial: ficha, informe o Mini-HTA con revisión por pares.", {
                ciclo: cycle.code,
              })
            : t("Fase 3 · Expediente editorial: ficha, informe o Mini-HTA con revisión por pares.")
        }
        actions={
          <HintButton
            variant="secondary"
            onClick={exportQueue}
            loading={exporting}
            disabled={!queue.length}
            disabledHint={t("Aún no hay tecnologías en evaluación en este ciclo.")}
            hint={t("Descarga el estado editorial del ciclo: producto, estado, completitud, observaciones abiertas y revisiones de cada expediente. La descarga queda en la bitácora.")}
            data-testid="eval-export-queue"
          >
            <Icon name="doc" size={16} /> {t("Exportar CSV")}
          </HintButton>
        }
      />
      <PhaseGuide
        phase={t("Fase 3")}
        hint={GLOSSARY.evaluacion}
        tasks={[
          t("Abra el expediente de cada priorizada y complete la ficha, el informe o el Mini-HTA según el puntaje."),
          t("Declare conflicto de interés antes de leer o editar el expediente."),
          t("Invite un revisor interno y uno externo. El enlace externo dura 10 días."),
        ]}
        nextLabel={t("Boletines del ciclo")}
        onNext={() => navigate("/boletines")}
      />
      <ModuleStatsRow items={stats} />
      <TechLinkNotice notice={linkNotice} onClose={() => setLinkNotice(null)} />

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            icon="📄"
            title={t("Nada en evaluación")}
            message={t("Pase tecnologías priorizadas a evaluación desde la matriz P1 a P6.")}
            action={<Button onClick={() => navigate("/priorizacion")}>{t("Ir a priorización")}</Button>}
          />
        </Card>
      ) : (
        <div className="eval-layout">
          <Card padding={0} style={{ overflow: "hidden" }}>
            <div className="prio-list-head">{t("Cola del ciclo · {total} tecnología(s)", { total: queue.length })}</div>
            <div className="fa-toolbar">
              <input
                type="search"
                aria-label={t("Buscar en la cola de evaluación")}
                placeholder={t("Buscar por nombre, DCI o clúster...")}
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
                data-testid="eval-search"
              />
              <select aria-label={t("Filtrar por estado editorial")} value={qStatus} onChange={(e) => setQStatus(e.target.value)} data-testid="eval-status">
                <option value="">{t("Todos los estados")}</option>
                <option value="sin_expediente">{t("Sin expediente")}</option>
                {EDITORIAL_STEPS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {STATUS_LONG[s.key]}
                  </option>
                ))}
              </select>
            </div>
            {visible.length === 0 ? (
              <div style={{ padding: 16 }}>
                <EmptyState
                  title={t("Sin resultados")}
                  message={t("Ninguna tecnología coincide con los filtros actuales.")}
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setQSearch("");
                        setQStatus("");
                      }}
                    >
                      {t("Limpiar filtros")}
                    </Button>
                  }
                />
              </div>
            ) : (
              <ul className="eval-queue" data-testid="eval-queue">
                {visible.map((item) => (
                  <li key={item.technology_id}>
                    <button
                      type="button"
                      className={item.technology_id === activeId ? "is-active" : ""}
                      onClick={() => selectItem(item.technology_id)}
                      data-testid={`eval-item-${item.technology_id}`}
                    >
                      <ClampText as="strong" text={item.commercial_name || item.inn_name} lines={3} />
                      <span className="eval-q-meta">
                        {ts(item.suggested_level_label)}
                        {item.doc_status_label ? ` · ${ts(item.doc_status_label)}` : ` · ${t("sin expediente")}`}
                      </span>
                      {item.doc_id ? (
                        <>
                          <span className={`eval-q-bar is-${item.doc_status}`} aria-hidden="true">
                            <span style={{ width: `${item.completeness_pct}%` }} />
                          </span>
                          <span className="eval-q-foot">
                            <em title={GLOSSARY.fa_completitud}>{item.completeness_pct}%</em>
                            {item.open_comments > 0 && (
                              <span className="eval-q-chip is-alert" title={t("Observaciones de revisión sin resolver")}>
                                {t("{n} obs.", { n: item.open_comments })}
                              </span>
                            )}
                            {item.reviews_pending > 0 && (
                              <span className="eval-q-chip" title={t("Revisores externos invitados que aún no entregan su veredicto")}>
                                {t("{n} en revisión", { n: item.reviews_pending })}
                              </span>
                            )}
                            {item.confidential && <span className="eval-q-chip is-soft">{t("Confidencial")}</span>}
                          </span>
                        </>
                      ) : (
                        <span className="eval-q-foot">
                          <em>-</em>
                          <span className="eval-q-chip is-soft">{t("{n} puntos", { n: item.priority_points ?? "-" })}</span>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div>
            {active && !active.doc_id && (
              <Card>
                <ClampText as="h3" text={active.commercial_name || active.inn_name} lines={3} expandable style={{ marginTop: 0 }} />
                <p style={{ fontSize: 14, color: "#475569" }}>
                  {tr(
                    "Esta tecnología priorizada ({puntos} puntos) aún no tiene expediente. Se sugiere <b>{nivel}</b>.",
                    { puntos: active.priority_points ?? "-", nivel: ts(active.suggested_level_label) },
                    { b: (c) => <strong>{c}</strong> }
                  )}
                </p>
                {canWrite ? (
                  <HintButton
                    onClick={openDossier}
                    loading={opening}
                    disabled={isClosed}
                    disabledHint={t("El ciclo está cerrado: no se abren expedientes nuevos.")}
                    hint={GLOSSARY.fa_abrir_expediente}
                    data-testid="eval-open"
                  >
                    {t("Abrir expediente")}
                  </HintButton>
                ) : (
                  <p className="muted-note">{t("Su perfil no redacta informes; un evaluador debe abrirlo.")}</p>
                )}
              </Card>
            )}

            {active?.doc_id && docLoading && !doc && <LoadingBlock label={t("Abriendo expediente...")} />}

            {doc?.coi_required && (
              <Card>
                <h3 style={{ marginTop: 0 }} className="term-label">
                  {t("Declaración de conflicto de interés")}
                  <InfoTip text={GLOSSARY.coi} label={t("Qué es el conflicto de interés")} />
                </h3>
                <p>
                  {t("Sin declaración firmada no se habilita la lectura del informe, tampoco para el evaluador interno.")}
                </p>
                <label className="public-check">
                  <input
                    type="checkbox"
                    checked={coi.accepted}
                    onChange={(e) => setCoi({ ...coi, accepted: e.target.checked })}
                    data-testid="eval-coi-accept"
                  />
                  {t("Declaro no tener conflicto, o lo describo abajo, y acepto la confidencialidad.")}
                </label>
                <label className="public-check">
                  <input
                    type="checkbox"
                    checked={coi.has_conflict}
                    onChange={(e) => setCoi({ ...coi, has_conflict: e.target.checked })}
                  />
                  {t("Tengo un conflicto que debo declarar")}
                </label>
                <Textarea
                  id="eval-coi-statement"
                  label={t("Detalle del conflicto (si aplica)")}
                  rows={3}
                  value={coi.statement}
                  onChange={(e) => setCoi({ ...coi, statement: e.target.value })}
                />
                <HintButton
                  onClick={signCoi}
                  disabled={!coi.accepted || (coi.has_conflict && !coi.statement.trim())}
                  disabledHint={
                    !coi.accepted
                      ? t("Marque la aceptación de la declaración para continuar.")
                      : t("Describa el conflicto que declara.")
                  }
                  data-testid="eval-coi-sign"
                >
                  {t("Firmar y continuar")}
                </HintButton>
              </Card>
            )}

            {doc && !doc.coi_required && (
              <Card>
                <div className="eval-head">
                  <div className="eval-head-main">
                    <ClampText as="h2" className="eval-head-title" text={title || doc.title} lines={2} expandable />
                    <div className="eval-head-badges">
                      <Badge>{ts(doc.status_label)}</Badge>
                      <Badge>{ts(doc.product_level_label)}</Badge>
                      {doc.confidential && <Badge tone="warning">{t("Confidencial")}</Badge>}
                      <span className="eval-version" title={GLOSSARY.fa_historial}>
                        v{doc.version_major}.{doc.version_minor}
                      </span>
                    </div>
                    <p className="eval-head-meta">
                      {t("Última edición: {fecha}", { fecha: fmtDateTime(doc.updated_at) })}
                      {doc.updated_by ? ` · ${doc.updated_by}` : ""}
                      {active?.status_since ? ` · ${t("En este estado desde el {fecha}", { fecha: fmtDate(active.status_since) })}` : ""}
                    </p>
                  </div>
                  <div className="eval-actions">
                    {dirty && (
                      <span className="eval-dirty" data-testid="eval-dirty">
                        {t("Cambios sin guardar")}
                      </span>
                    )}
                    {editable && (
                      <HintButton
                        onClick={save}
                        loading={saving}
                        disabled={isClosed}
                        disabledHint={t("El ciclo está cerrado: el documento no se edita.")}
                        data-testid="eval-save"
                      >
                        {t("Guardar")}
                      </HintButton>
                    )}
                    {(doc.allowed_transitions || []).map((status) => {
                      const block = hints[status] || (dirty ? t("Guarde los cambios antes de mover el documento.") : "");
                      return (
                        <HintButton
                          key={status}
                          variant={status === "publicado" ? "success" : "outline"}
                          disabled={Boolean(block)}
                          disabledHint={ts(block)}
                          hint={TRANSITION_HINTS[status]}
                          onClick={() => requestMove(status)}
                          data-testid={`eval-move-${status}`}
                        >
                          {TRANSITION_LABELS[status] || status}
                        </HintButton>
                      );
                    })}
                    <ActionMenu
                      label={t("Exportar")}
                      icon="doc"
                      align="right"
                      testId="eval-export-menu"
                      items={[
                        {
                          key: "html",
                          label: t("Exportar HTML institucional"),
                          description: GLOSSARY.fa_exportar_html,
                          icon: "external",
                          onSelect: exportHtml,
                          testId: "eval-export-html",
                        },
                        {
                          key: "pdf",
                          label: t("Descargar PDF"),
                          description: t("Descarga el documento institucional en PDF (A4)."),
                          icon: "print",
                          onSelect: exportPdf,
                          testId: "eval-export-pdf",
                        },
                      ]}
                    />
                  </div>
                </div>

                <EditorialStepper status={doc.status} />

                <div className="screening-tabs eval-tabs" role="tablist">
                  {TABS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === item.key}
                      className={`screening-tab${tab === item.key ? " is-active" : ""}`}
                      onClick={() => setTab(item.key)}
                      data-testid={`eval-tab-${item.key}`}
                    >
                      {item.label}
                      {item.count != null && <span className={`eval-tab-count${item.alert ? " is-alert" : ""}`}>{item.count}</span>}
                    </button>
                  ))}
                </div>

                {tab === "documento" && (
                  <div data-testid="eval-panel-documento">
                    <div className="eval-settings">
                      <Input
                        id="eval-title"
                        label={t("Título")}
                        value={title}
                        disabled={!editable}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                      <Select
                        id="eval-level"
                        label={t("Nivel de producto (sugerido por puntaje; se puede cambiar)")}
                        hint={GLOSSARY.fa_nivel_producto}
                        value={level}
                        disabled={!editable}
                        onChange={(e) => setLevel(e.target.value)}
                      >
                        <option value="ficha">{t("Ficha técnica")}</option>
                        <option value="informe">{t("Informe de evaluación temprana")}</option>
                        <option value="mini_hta">{t("Mini-HTA")}</option>
                      </Select>
                    </div>
                    <label className="public-check">
                      <input
                        type="checkbox"
                        checked={confidential}
                        disabled={!editable}
                        onChange={(e) => setConfidential(e.target.checked)}
                      />
                      <span className="term-label">
                        {t("Marcar como confidencial. No se publicará en el catálogo de expedientes.")}
                        <InfoTip text={GLOSSARY.fa_confidencial} label={t("Qué implica confidencial")} />
                      </span>
                    </label>

                    {doc.completeness && (
                      <div className="eval-progress">
                        <div className="eval-progress-top">
                          <p className="eval-complete" data-testid="eval-completeness">
                            <TermLabel tip={GLOSSARY.fa_completitud}>
                              {t("Completitud {pct}%", { pct: doc.completeness.pct })}
                            </TermLabel>
                            {doc.completeness.missing?.length
                              ? ` · ${t("Faltan: {campos}", {
                                  campos: doc.completeness.missing.map((k) => ts(labels[k] || k)).join(", "),
                                })}`
                              : ""}
                          </p>
                          <Button variant="outline" size="sm" onClick={() => setShowDossier((v) => !v)}>
                            {showDossier ? t("Ver campos") : t("Ver expediente")}
                          </Button>
                        </div>
                        <div className="eval-progress-track" aria-hidden="true">
                          <div style={{ width: `${doc.completeness.pct}%` }} />
                        </div>
                        <ul className="eval-sections">
                          {groups.map((group) => {
                            const done = group.keys.filter(filled).length;
                            return (
                              <li key={group.title} className={done === group.keys.length ? "is-done" : ""}>
                                <b>{group.title}</b>
                                <span>
                                  {t("{n} de {total} campos", { n: done, total: group.keys.length })}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {showDossier ? (
                      <ReportPreview
                        title={title}
                        levelLabel={ts(doc.product_level_label)}
                        statusLabel={ts(doc.status_label)}
                        cycleCode={cycle?.code}
                        labels={labels}
                        body={body}
                        groups={[
                          ...groups,
                          ...(body.early_dialogue_notes
                            ? [{ title: t("Diálogo temprano"), keys: ["early_dialogue_notes"] }]
                            : []),
                        ]}
                      />
                    ) : (
                      <>
                        {groups.map((group) => (
                          <section key={group.title} className="eval-field-group">
                            <h4>{group.title}</h4>
                            {group.keys.map((key) => (
                              <div key={key} className={`eval-field${filled(key) ? " is-filled" : ""}`}>
                                <Textarea
                                  id={`eval-field-${key}`}
                                  label={ts(labels[key] || key)}
                                  hint={FIELD_HINTS[key]}
                                  required
                                  rows={key.startsWith("budget") ? 2 : 4}
                                  value={body[key] || ""}
                                  disabled={!editable}
                                  onChange={(e) => setBody({ ...body, [key]: e.target.value })}
                                />
                                <div className="eval-field-foot">
                                  {openByField[key] ? (
                                    <button type="button" className="eval-field-obs" onClick={() => setTab("observaciones")}>
                                      {t("{n} observación(es) abierta(s) sobre este campo", { n: openByField[key] })}
                                    </button>
                                  ) : (
                                    <span />
                                  )}
                                  <span>{t("{n} caracteres", { n: String(body[key] || "").length })}</span>
                                </div>
                              </div>
                            ))}
                          </section>
                        ))}
                        <section className="eval-field-group">
                          <h4>{t("Diálogo temprano")}</h4>
                          <Textarea
                            id="eval-field-early_dialogue_notes"
                            label={ts(labels.early_dialogue_notes)}
                            hint={FIELD_HINTS.early_dialogue_notes}
                            rows={3}
                            value={body.early_dialogue_notes || ""}
                            disabled={!editable}
                            onChange={(e) => setBody({ ...body, early_dialogue_notes: e.target.value })}
                          />
                        </section>
                      </>
                    )}
                  </div>
                )}

                {tab === "revision" && (
                  <div className="eval-review" data-testid="eval-panel-revision">
                    <div>
                      <h4 className="term-label">
                        {t("Revisores")}
                        <InfoTip text={GLOSSARY.revision_pares} label={t("Qué es la revisión por pares")} />
                      </h4>
                      {activeAssignments.length === 0 && (
                        <p className="muted-note">{t("Todavía no hay revisores asignados.")}</p>
                      )}
                      <ul className="eval-reviewers" data-testid="eval-reviewers">
                        {(doc.assignments || []).map((a) => {
                          const days = a.expires_at && a.kind === "externo" ? daysUntil(a.expires_at) : null;
                          const waiting = !["aprobado", "observado", "revocado"].includes(a.status);
                          return (
                            <li key={a.id} className={`eval-reviewer is-${a.status}`}>
                              <div className="eval-reviewer-main">
                                <strong>{a.reviewer_name}</strong>
                                <span className="eval-reviewer-mail">{a.reviewer_email}</span>
                                <div className="eval-reviewer-tags">
                                  <span className="eval-q-chip is-soft">{a.kind === "externo" ? t("externo") : t("interno")}</span>
                                  <span className={`eval-q-chip ${a.coi_signed ? "is-ok" : ""}`}>
                                    {a.coi_signed ? t("COI firmado") : t("sin COI")}
                                  </span>
                                  {a.coi_has_conflict && <span className="eval-q-chip is-alert">{t("Declaró conflicto")}</span>}
                                  <span className={`eval-q-chip is-state-${a.status}`}>{ASSIGNMENT_STATUS[a.status] || a.status}</span>
                                </div>
                                <span className="eval-reviewer-dates">
                                  {a.submitted_at ? t("Entregó el {fecha}", { fecha: fmtDate(a.submitted_at) }) : null}
                                  {!a.submitted_at && days != null && waiting
                                    ? days < 0
                                      ? t("El enlace venció el {fecha}", { fecha: fmtDate(a.expires_at) })
                                      : t("vence {fecha}", { fecha: fmtDate(a.expires_at) }) + ` · ${t("quedan {n} día(s)", { n: days })}`
                                    : null}
                                </span>
                              </div>
                              {canInvite && a.kind === "externo" && waiting && doc.status !== "publicado" && (
                                <HintButton
                                  size="sm"
                                  variant="ghost"
                                  style={{ color: "#B91C1C" }}
                                  hint={GLOSSARY.fa_revocar}
                                  onClick={() => setRevoking(a)}
                                >
                                  {t("Revocar")}
                                </HintButton>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {canInvite && doc.status !== "publicado" && (
                      <form onSubmit={sendInvite} className="eval-invite">
                        <h4 className="term-label">
                          {t("Invitar revisor")}
                          <InfoTip text={GLOSSARY.fa_invitar_revisor} label={t("Cómo funciona la invitación")} />
                        </h4>
                        <Select
                          id="eval-invite-kind"
                          label={t("Tipo")}
                          value={invite.kind}
                          onChange={(e) => setInvite({ ...invite, kind: e.target.value })}
                        >
                          <option value="externo">{t("Externo (sin cuenta institucional, enlace de 10 días)")}</option>
                          <option value="interno">{t("Interno")}</option>
                        </Select>
                        <Input
                          id="eval-invite-name"
                          label={t("Nombre")}
                          required
                          value={invite.reviewer_name}
                          onChange={(e) => setInvite({ ...invite, reviewer_name: e.target.value })}
                        />
                        <Input
                          id="eval-invite-email"
                          label={t("Correo")}
                          type="email"
                          required
                          value={invite.reviewer_email}
                          onChange={(e) => setInvite({ ...invite, reviewer_email: e.target.value })}
                        />
                        <Button type="submit" data-testid="eval-invite-submit">
                          {t("Generar invitación")}
                        </Button>
                        {inviteResult && (
                          <div className="fa-notice fa-notice--info" style={{ marginTop: 12, display: "block" }} data-testid="eval-invite-result">
                            {inviteResult.email_sent ? (
                              <div>{t("La invitación salió por correo. Guarde el enlace por si el revisor no la recibe.")}</div>
                            ) : (
                              <div>
                                {ts(inviteResult.detail) || t("Sin correo configurado.")}{" "}
                                {t("El enlace es personal y solo se muestra ahora.")}
                              </div>
                            )}
                            <div className="fa-link-box">
                              <code data-testid="eval-invite-link">{inviteResult.url}</code>
                              <Button type="button" size="sm" variant="secondary" onClick={copyInvite}>
                                {inviteResult.copied ? t("Copiado") : t("Copiar enlace")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </form>
                    )}
                  </div>
                )}

                {tab === "observaciones" && (
                  <div data-testid="eval-panel-observaciones">
                    {canReview && doc.status !== "publicado" && (
                      <form onSubmit={addComment} className="eval-obs-form">
                        <h4 className="term-label">
                          {t("Observación en línea")}
                          <InfoTip text={GLOSSARY.fa_observacion} label={t("Qué es una observación en línea")} />
                        </h4>
                        <Select
                          id="eval-comment-field"
                          label={t("Campo")}
                          value={comment.field_key}
                          onChange={(e) => setComment({ ...comment, field_key: e.target.value })}
                        >
                          <option value="">{t("Documento completo")}</option>
                          {fieldsFor(level).map((key) => (
                            <option key={key} value={key}>
                              {ts(labels[key] || key)}
                            </option>
                          ))}
                        </Select>
                        <Textarea
                          id="eval-comment-body"
                          label={t("Comentario")}
                          required
                          rows={3}
                          maxLength={4000}
                          value={comment.body}
                          onChange={(e) => setComment({ ...comment, body: e.target.value })}
                        />
                        <HintButton
                          type="submit"
                          variant="secondary"
                          disabled={!comment.body.trim()}
                          disabledHint={t("Escriba el comentario antes de registrarlo.")}
                        >
                          {t("Registrar observación")}
                        </HintButton>
                      </form>
                    )}

                    <div className="eval-obs-bar">
                      <div className="prio-view" role="group" aria-label={t("Observaciones a mostrar")}>
                        <button type="button" aria-pressed={commentFilter === "abiertas"} onClick={() => setCommentFilter("abiertas")}>
                          {t("Abiertas ({n})", { n: openComments.length })}
                        </button>
                        <button type="button" aria-pressed={commentFilter === "todas"} onClick={() => setCommentFilter("todas")}>
                          {t("Todas ({n})", { n: comments.length })}
                        </button>
                      </div>
                    </div>
                    {shownComments.length === 0 ? (
                      <p className="muted-note">
                        {comments.length === 0
                          ? t("Este expediente no tiene observaciones.")
                          : t("No quedan observaciones abiertas.")}
                      </p>
                    ) : (
                      <ul className="eval-obs" data-testid="eval-comments">
                        {shownComments.map((c) => (
                          <li key={c.id} className={c.resolved_at ? "is-resolved" : "is-open"} data-testid={`eval-comment-${c.id}`}>
                            <div className="eval-obs-head">
                              <strong>{c.author}</strong>
                              <span>
                                {fmtDateTime(c.created_at)}
                                {c.version_label ? ` · ${c.version_label}` : ""}
                              </span>
                              <span className={`eval-q-chip ${c.resolved_at ? "is-ok" : "is-alert"}`}>
                                {c.resolved_at ? t("Resuelta") : t("Abierta")}
                              </span>
                            </div>
                            <div className="eval-obs-field">
                              {c.field_key ? ts(labels[c.field_key] || c.field_key) : t("Documento completo")}
                            </div>
                            <p>{c.body}</p>
                            {c.resolved_at && (
                              <div className="eval-obs-answer">
                                {t("Resuelta por {quien} el {fecha}", { quien: c.resolved_by || "-", fecha: fmtDateTime(c.resolved_at) })}
                                {c.resolution_note ? <p>{c.resolution_note}</p> : null}
                              </div>
                            )}
                            {doc.status !== "publicado" && (
                              <div className="eval-obs-actions">
                                {!c.resolved_at && canWrite && (
                                  <Button size="sm" variant="secondary" onClick={() => setResolving({ comment: c, note: "" })}>
                                    {t("Resolver")}
                                  </Button>
                                )}
                                {c.resolved_at && canReview && (
                                  <Button size="sm" variant="ghost" onClick={() => reopenComment(c)}>
                                    {t("Reabrir")}
                                  </Button>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {tab === "versiones" && (
                  <div data-testid="eval-panel-versiones">
                    {versions.length === 0 ? (
                      <p className="muted-note">{t("Aún no hay versiones guardadas.")}</p>
                    ) : (
                      <ol className="eval-vers" data-testid="eval-versions">
                        {[...versions].reverse().map((v) => (
                          <li key={v.id}>
                            <span className="eval-version">
                              v{v.major}.{v.minor}
                            </span>
                            <div className="eval-vers-main">
                              <strong>{ts(v.status_label || v.status)}</strong>
                              <span className="eval-vers-meta">
                                {fmtDateTime(v.created_at)}
                                {v.created_by ? ` · ${v.created_by}` : ""}
                              </span>
                              {v.note ? <p>{ts(v.note)}</p> : null}
                              {v.changed_fields?.length > 0 && (
                                <div className="eval-vers-changes">
                                  <span>{t("Cambió:")}</span>
                                  {v.changed_fields.map((k) => (
                                    <span key={k} className="eval-q-chip is-soft">
                                      {ts(labels[k] || k)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Button size="sm" variant="ghost" onClick={() => setViewVersion(v)}>
                              {t("Ver esta versión")}
                            </Button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmMove)}
        onClose={() => setConfirmMove(null)}
        onConfirm={() => move(confirmMove)}
        title={confirmMove === "publicado" ? t("Publicar documento") : t("Aprobar con observaciones abiertas")}
        confirmVariant={confirmMove === "publicado" ? "success" : "primary"}
        confirmLabel={confirmMove === "publicado" ? t("Publicar") : t("Aprobar en comité")}
        message={
          confirmMove === "publicado"
            ? t("El documento quedará publicado en la plataforma y, si no es confidencial, en el catálogo público de expedientes. La publicación no se deshace.")
            : t("Este expediente tiene {n} observación(es) sin resolver. Puede aprobarlo así o volver a la pestaña Observaciones para responderlas primero.", { n: openComments.length })
        }
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={revoke}
        title={t("Revocar invitación")}
        confirmLabel={t("Revocar")}
        message={t("El enlace de {nombre} dejará de abrir el portal. La invitación queda en el historial.", {
          nombre: revoking?.reviewer_name || t("este revisor"),
        })}
      />
      <ConfirmDialog
        open={pendingSwitch != null}
        onClose={() => setPendingSwitch(null)}
        onConfirm={() => {
          const id = pendingSwitch;
          setPendingSwitch(null);
          goTo(id);
        }}
        title={t("Cambios sin guardar")}
        confirmLabel={t("Descartar y cambiar")}
        message={t("Este expediente tiene cambios que no se han guardado. Si cambia de tecnología, se pierden.")}
      />
      <Modal
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
        title={t("Resolver observación")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolving(null)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={resolveComment} data-testid="eval-resolve-confirm">
              {t("Marcar como resuelta")}
            </Button>
          </>
        }
      >
        <p className="eval-resolve-quote">{resolving?.comment.body}</p>
        <Textarea
          id="eval-resolve-note"
          label={t("Respuesta (opcional)")}
          hint={t("Qué se cambió en el documento o por qué no aplica. Queda visible para quien revisa.")}
          rows={3}
          maxLength={2000}
          value={resolving?.note || ""}
          onChange={(e) => setResolving((r) => ({ ...r, note: e.target.value }))}
        />
      </Modal>
      <Modal
        open={Boolean(viewVersion)}
        onClose={() => setViewVersion(null)}
        title={viewVersion ? t("Versión v{version}", { version: `${viewVersion.major}.${viewVersion.minor}` }) : ""}
        width={920}
      >
        {viewVersion && (
          <ReportPreview
            title={title}
            levelLabel={ts(doc?.product_level_label)}
            statusLabel={ts(viewVersion.status_label || viewVersion.status)}
            cycleCode={cycle?.code}
            labels={labels}
            body={viewVersion.body || {}}
            groups={groups}
          />
        )}
      </Modal>
    </div>
  );
}
