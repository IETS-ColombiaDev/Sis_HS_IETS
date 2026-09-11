import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
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
  health_condition: "Condición de salud",
  mechanism: "Mecanismo biológico o tecnológico",
  target_population_co: "Población objetivo en Colombia",
  evidence_state: "Estado del arte de la evidencia clínica",
  comparators_sgsss: "Comparadores posibles en el SGSSS",
  adoption_risks: "Riesgos potenciales de adopción",
  narrative: "Narrativa del informe",
  evidence_phases: "Fases de ensayos",
  efficacy_outcomes: "Desenlaces de eficacia",
  safety_outcomes: "Desenlaces de seguridad",
  pico_population: "PICO: población",
  pico_intervention: "PICO: intervención",
  pico_comparator: "PICO: comparador",
  pico_outcome: "PICO: desenlace",
  budget_year_1: "Impacto presupuestal año 1",
  budget_year_2: "Impacto presupuestal año 2",
  budget_year_3: "Impacto presupuestal año 3",
  clinical_uncertainty: "Incertidumbre clínica",
  early_dialogue_notes: "Notas de diálogo temprano",
};

// Ayuda por campo tecnico del expediente (RF13 y RF14).
const FIELD_HINTS = {
  health_condition: "Enfermedad o problema de salud al que se dirige, con su carga en Colombia si se conoce.",
  mechanism: "Cómo actúa la tecnología (mecanismo biológico o principio tecnológico).",
  target_population_co: "Quiénes la usarían en Colombia y cuántos pacientes aproximadamente.",
  evidence_state: "Fases de ensayos disponibles y calidad de la evidencia de eficacia y seguridad.",
  comparators_sgsss: GLOSSARY.comparadores,
  adoption_risks: "Riesgos para el sistema: presupuesto, infraestructura, entrenamiento, equidad.",
  narrative: "Síntesis del informe en lenguaje para tomadores de decisión.",
  evidence_phases: "Ensayos por fase, con identificadores (NCT) cuando existan.",
  efficacy_outcomes: "Resultados de eficacia: desenlace, magnitud del efecto e incertidumbre.",
  safety_outcomes: "Eventos adversos relevantes y su frecuencia.",
  pico_population: "P de PICO: población de la pregunta de evaluación.",
  pico_intervention: "I de PICO: la tecnología evaluada, dosis y vía.",
  pico_comparator: "C de PICO: alternativa vigente en el SGSSS contra la que se compara.",
  pico_outcome: "O de PICO: desenlaces que importan (clínicos y de calidad de vida).",
  budget_year_1: "Impacto presupuestal estimado del primer año, en COP (ej. 3.200 millones).",
  budget_year_2: "Impacto presupuestal estimado del segundo año, en COP.",
  budget_year_3: "Impacto presupuestal estimado del tercer año, en COP.",
  clinical_uncertainty: "Qué no se sabe todavía y cómo cambiaría la recomendación.",
  early_dialogue_notes: "Registro opcional de diálogos tempranos con MSPS, INVIMA o desarrolladores (D-12).",
};

const EDITORIAL_STEPS = [
  { key: "borrador", label: "Borrador", help: GLOSSARY.borrador },
  { key: "revision_interna", label: "Interna", help: GLOSSARY.revision_interna },
  { key: "revision_externa", label: "Externa", help: GLOSSARY.revision_externa },
  { key: "con_observaciones", label: "Observado", help: GLOSSARY.observado },
  { key: "aprobado_comite", label: "Comité", help: GLOSSARY.comite },
  { key: "publicado", label: "Publicado", help: GLOSSARY.publicado },
];

const ASSIGNMENT_STATUS = {
  invitado: "Invitado",
  pendiente: "Pendiente",
  invitacion_enviada: "Invitación enviada por correo",
  en_lectura: "En lectura",
  aprobado: "Aprobado",
  observado: "Con observaciones",
  revocado: "Revocado",
};

const TRANSITION_LABELS = {
  revision_interna: "Enviar a revisión interna",
  revision_externa: "Pasar a revisión externa",
  con_observaciones: "Devolver con observaciones",
  aprobado_comite: "Aprobar en comité",
  publicado: "Publicar",
  borrador: "Regresar a borrador",
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
  const groups = [{ title: "Ficha técnica", keys: FICHA }];
  if (level === "informe" || level === "mini_hta") {
    groups.push({ title: "Informe de evaluación", keys: INFORME });
  }
  if (level === "mini_hta") {
    groups.push({ title: "Mini-HTA: PICO e impacto presupuestal", keys: PICO });
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
            {cycleCode || "Ciclo institucional"} · {levelLabel} · {statusLabel}
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
                <h4>{labels[key] || key}</h4>
                {(paras.length ? paras : ["—"]).map((para, i) => (
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
    <ol className="editorial-stepper" aria-label="Flujo editorial">
      {EDITORIAL_STEPS.map((step, i) => (
        <li key={step.key} className={i < idx ? "is-done" : i === idx ? "is-current" : ""}>
          <span>{i + 1}</span>
          <span className="term-label">
            {step.label}
            <InfoTip text={step.help} label={`Qué es ${step.label}`} />
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
      toast.error(apiError(e, "No se pudo cargar la cola de evaluación"));
    } finally {
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
      setLinkNotice({ tone: "warn", message: "El enlace de tecnología no es válido.", actions: [] });
      return;
    }
    if (!techId || !cycleId || loading) return;
    const key = `${cycleId}:${techId}`;
    if (queue.some((i) => i.technology_id === techId)) {
      if (handledLink.current === key) return;
      handledLink.current = key;
      setLinkNotice(null);
      setActiveId(techId);
      focusElement(`eval-item-${techId}`);
      return;
    }
    if (handledLink.current === key) return;
    if (handledLink.current === `${key}:retry`) {
      handledLink.current = key;
      setLinkNotice({
        tone: "info",
        message: `La tecnología #${techId} no aparece en la cola de evaluación de ${cycle?.code || "este ciclo"}.`,
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
        toast.error(apiError(e, "No se pudo abrir la tecnología del enlace"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techId, cycleId, loading, queue, invalidParam]);

  const selectItem = (id) => {
    handledLink.current = `${cycleId}:${id}`;
    setLinkNotice(null);
    setActiveId(id);
    setTechId(id);
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
        toast.error(apiError(e, "No se pudo abrir el expediente"));
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
      toast.success(`Expediente abierto como ${data.product_level_label}. Firme el COI para empezar.`);
      await loadQueue();
    } catch (e) {
      toast.error(apiError(e, "No se pudo abrir el expediente"));
    } finally {
      setOpening(false);
    }
  };

  const editable =
    canWrite && doc && !doc.coi_required && ["borrador", "con_observaciones"].includes(doc.status);

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
      toast.success(`Guardado v${data.version_major}.${data.version_minor}`);
      loadQueue();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const signCoi = async () => {
    if (!doc) return;
    try {
      await api.post(`/reports/${doc.id}/coi`, coi);
      toast.success("Declaración registrada. Ya puede leer el informe.");
      await fetchDoc(doc.id);
    } catch (e) {
      toast.error(apiError(e, "No se pudo firmar el conflicto de interés"));
    }
  };

  const move = async (status) => {
    if (!doc) return;
    try {
      const { data } = await api.post(`/reports/${doc.id}/transition`, { status });
      setDoc(data);
      setConfirmMove(null);
      toast.success(`Estado editorial: ${data.status_label}`);
      loadQueue();
    } catch (e) {
      toast.error(apiError(e, "La transición fue rechazada"));
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
        if (data.email_sent) toast.success(`Invitación enviada por correo a ${data.assignment.reviewer_email}.`);
        else if (copied) toast.success("Invitación creada. El enlace se copió al portapapeles.");
        else toast.success("Invitación creada. Copie el enlace ahora: solo se muestra una vez.");
      } else {
        setInviteResult(null);
        toast.success("Revisor interno asignado. Debe firmar su COI al abrir el expediente.");
      }
      await fetchDoc(doc.id);
    } catch (err) {
      toast.error(apiError(err, "No se pudo invitar"));
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteResult.url);
      setInviteResult((r) => ({ ...r, copied: true }));
      toast.success("Enlace copiado.");
    } catch {
      toast.warning("El navegador no permitió copiar. Seleccione el enlace y cópielo a mano.");
    }
  };

  const revoke = async () => {
    try {
      const { data } = await api.post(`/reports/${doc.id}/assignments/${revoking.id}/revoke`);
      setDoc(data);
      setRevoking(null);
      toast.success("Invitación revocada. El enlace ya no abre el portal.");
    } catch (err) {
      toast.error(apiError(err, "No se pudo revocar la invitación"));
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
      toast.success("Observación registrada");
    } catch (err) {
      toast.error(apiError(err, "No se pudo comentar"));
    }
  };

  const exportHtml = async () => {
    if (!doc) return;
    try {
      const { data } = await api.get(`/reports/${doc.id}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const win = window.open(url, "_blank", "noopener");
      if (!win) toast.info("Si no se abrió una pestaña nueva, permita las ventanas emergentes para este sitio.");
    } catch (e) {
      toast.error(apiError(e, "No se pudo exportar"));
    }
  };

  if (!cycleId) {
    return (
      <Card>
        <EmptyState
          icon="🗓️"
          title="Seleccione un ciclo"
          message="La evaluación vive dentro del ciclo operativo. Elija uno en la cabecera o en Ciclos de escaneo."
          action={<Button onClick={() => navigate("/ciclos")}>Ir a ciclos</Button>}
        />
      </Card>
    );
  }

  if (loading) return <LoadingBlock label="Cargando evaluación..." />;

  const stats = [
    { label: "En cola", value: queue.length, hint: "Tecnologías priorizadas, en evaluación o publicadas en este ciclo." },
    {
      label: "Con expediente",
      value: queue.filter((i) => i.doc_id).length,
      hint: "Tienen ficha, informe o Mini-HTA abierto.",
    },
    {
      label: "Publicados",
      value: queue.filter((i) => i.doc_status === "publicado").length,
      hint: GLOSSARY.publicado,
    },
  ];

  const activeAssignments = (doc?.assignments || []).filter((a) => a.status !== "revocado");
  const hints = doc?.transition_hints || {};

  return (
    <div>
      <ModuleHeader
        step="caracterizacion"
        title="Evaluación"
        titleHint={GLOSSARY.evaluacion}
        purpose={
          cycle
            ? `Fase 3 · ${cycle.code}. Expediente editorial: ficha, informe o Mini-HTA con revisión por pares.`
            : "Fase 3 · Expediente editorial: ficha, informe o Mini-HTA con revisión por pares."
        }
      />
      <PhaseGuide
        phase="Fase 3"
        hint={GLOSSARY.evaluacion}
        tasks={[
          "Abra el expediente de cada priorizada y complete la ficha, el informe o el Mini-HTA según el puntaje.",
          "Declare conflicto de interés antes de leer o editar el expediente.",
          "Invite un revisor interno y uno externo. El enlace externo dura 10 días.",
        ]}
        nextLabel="Boletines del ciclo"
        onNext={() => navigate("/boletines")}
      />
      <ModuleStatsRow items={stats} />
      <TechLinkNotice notice={linkNotice} onClose={() => setLinkNotice(null)} />

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            icon="📄"
            title="Nada en evaluación"
            message="Pase tecnologías priorizadas a evaluación desde la matriz P1 a P6."
            action={<Button onClick={() => navigate("/priorizacion")}>Ir a priorización</Button>}
          />
        </Card>
      ) : (
        <div className="eval-layout">
          <Card>
            <h3 style={{ marginTop: 0 }}>Cola del ciclo</h3>
            <ul className="eval-queue" data-testid="eval-queue">
              {queue.map((item) => (
                <li key={item.technology_id}>
                  <button
                    type="button"
                    className={item.technology_id === activeId ? "is-active" : ""}
                    onClick={() => selectItem(item.technology_id)}
                    data-testid={`eval-item-${item.technology_id}`}
                  >
                    <ClampText as="strong" text={item.commercial_name || item.inn_name} lines={3} />
                    <span>
                      {item.suggested_level_label}
                      {item.doc_status_label ? ` · ${item.doc_status_label}` : " · sin expediente"}
                    </span>
                    <em title={GLOSSARY.fa_completitud}>{item.doc_id ? `${item.completeness_pct}%` : "—"}</em>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div>
            {active && !active.doc_id && (
              <Card>
                <ClampText as="h3" text={active.commercial_name || active.inn_name} lines={3} expandable style={{ marginTop: 0 }} />
                <p style={{ fontSize: 14, color: "#475569" }}>
                  Esta tecnología priorizada ({active.priority_points ?? "—"} puntos) aún no tiene
                  expediente. Se sugiere <strong>{active.suggested_level_label}</strong>.
                </p>
                {canWrite ? (
                  <HintButton
                    onClick={openDossier}
                    loading={opening}
                    disabled={isClosed}
                    disabledHint="El ciclo está cerrado: no se abren expedientes nuevos."
                    hint={GLOSSARY.fa_abrir_expediente}
                    data-testid="eval-open"
                  >
                    Abrir expediente
                  </HintButton>
                ) : (
                  <p className="muted-note">Su perfil no redacta informes; un evaluador debe abrirlo.</p>
                )}
              </Card>
            )}

            {active?.doc_id && docLoading && !doc && <LoadingBlock label="Abriendo expediente..." />}

            {doc?.coi_required && (
              <Card>
                <h3 style={{ marginTop: 0 }} className="term-label">
                  Declaración de conflicto de interés
                  <InfoTip text={GLOSSARY.coi} label="Qué es el conflicto de interés" />
                </h3>
                <p>
                  Sin declaración firmada no se habilita la lectura del informe, tampoco
                  para el evaluador interno.
                </p>
                <label className="public-check">
                  <input
                    type="checkbox"
                    checked={coi.accepted}
                    onChange={(e) => setCoi({ ...coi, accepted: e.target.checked })}
                    data-testid="eval-coi-accept"
                  />
                  Declaro no tener conflicto, o lo describo abajo, y acepto la confidencialidad.
                </label>
                <label className="public-check">
                  <input
                    type="checkbox"
                    checked={coi.has_conflict}
                    onChange={(e) => setCoi({ ...coi, has_conflict: e.target.checked })}
                  />
                  Tengo un conflicto que debo declarar
                </label>
                <Textarea
                  id="eval-coi-statement"
                  label="Detalle del conflicto (si aplica)"
                  rows={3}
                  value={coi.statement}
                  onChange={(e) => setCoi({ ...coi, statement: e.target.value })}
                />
                <HintButton
                  onClick={signCoi}
                  disabled={!coi.accepted || (coi.has_conflict && !coi.statement.trim())}
                  disabledHint={
                    !coi.accepted
                      ? "Marque la aceptación de la declaración para continuar."
                      : "Describa el conflicto que declara."
                  }
                  data-testid="eval-coi-sign"
                >
                  Firmar y continuar
                </HintButton>
              </Card>
            )}

            {doc && !doc.coi_required && (
              <Card>
                <EditorialStepper status={doc.status} />
                <div className="eval-doc-head">
                  <div>
                    <Badge>{doc.status_label}</Badge>
                    <Badge>{doc.product_level_label}</Badge>
                    {doc.confidential && <Badge tone="warning">Confidencial</Badge>}
                    <span className="eval-version" title={GLOSSARY.fa_historial}>
                      v{doc.version_major}.{doc.version_minor}
                    </span>
                  </div>
                  <div className="eval-actions">
                    {editable && (
                      <HintButton
                        onClick={save}
                        loading={saving}
                        disabled={isClosed}
                        disabledHint="El ciclo está cerrado: el documento no se edita."
                        data-testid="eval-save"
                      >
                        Guardar
                      </HintButton>
                    )}
                    <Button variant="outline" onClick={() => setShowDossier((v) => !v)}>
                      {showDossier ? "Ver campos" : "Ver expediente"}
                    </Button>
                    <HintButton variant="secondary" onClick={exportHtml} hint={GLOSSARY.fa_exportar_html}>
                      Exportar HTML institucional
                    </HintButton>
                    {(doc.allowed_transitions || []).map((status) => {
                      const block = hints[status] || "";
                      return (
                        <HintButton
                          key={status}
                          variant={status === "publicado" ? "success" : "outline"}
                          disabled={Boolean(block)}
                          disabledHint={block}
                          hint={TRANSITION_HINTS[status]}
                          onClick={() => (status === "publicado" ? setConfirmMove(status) : move(status))}
                          data-testid={`eval-move-${status}`}
                        >
                          {TRANSITION_LABELS[status] || status}
                        </HintButton>
                      );
                    })}
                  </div>
                </div>

                <Input
                  id="eval-title"
                  label="Título"
                  value={title}
                  disabled={!editable}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Select
                  id="eval-level"
                  label="Nivel de producto (sugerido por puntaje; se puede cambiar)"
                  hint={GLOSSARY.fa_nivel_producto}
                  value={level}
                  disabled={!editable}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="ficha">Ficha técnica</option>
                  <option value="informe">Informe de evaluación temprana</option>
                  <option value="mini_hta">Mini-HTA</option>
                </Select>
                <label className="public-check">
                  <input
                    type="checkbox"
                    checked={confidential}
                    disabled={!editable}
                    onChange={(e) => setConfidential(e.target.checked)}
                  />
                  <span className="term-label">
                    Marcar como confidencial. No se publicará en el catálogo de expedientes.
                    <InfoTip text={GLOSSARY.fa_confidencial} label="Qué implica confidencial" />
                  </span>
                </label>

                {doc.completeness && (
                  <p className="eval-complete" data-testid="eval-completeness">
                    <TermLabel tip={GLOSSARY.fa_completitud}>Completitud {doc.completeness.pct}%</TermLabel>
                    {doc.completeness.missing?.length
                      ? ` · Faltan: ${doc.completeness.missing.map((k) => labels[k] || k).join(", ")}`
                      : ""}
                  </p>
                )}

                {showDossier ? (
                  <ReportPreview
                    title={title}
                    levelLabel={doc.product_level_label}
                    statusLabel={doc.status_label}
                    cycleCode={cycle?.code}
                    labels={labels}
                    body={body}
                    groups={[
                      ...fieldGroups(level),
                      ...(body.early_dialogue_notes
                        ? [{ title: "Diálogo temprano", keys: ["early_dialogue_notes"] }]
                        : []),
                    ]}
                  />
                ) : (
                  <>
                    {fieldGroups(level).map((group) => (
                      <section key={group.title} className="eval-field-group">
                        <h4>{group.title}</h4>
                        {group.keys.map((key) => (
                          <Textarea
                            key={key}
                            id={`eval-field-${key}`}
                            label={labels[key] || key}
                            hint={FIELD_HINTS[key]}
                            required
                            rows={key.startsWith("budget") ? 2 : 4}
                            value={body[key] || ""}
                            disabled={!editable}
                            onChange={(e) => setBody({ ...body, [key]: e.target.value })}
                          />
                        ))}
                      </section>
                    ))}
                    <section className="eval-field-group">
                      <h4>Diálogo temprano</h4>
                      <Textarea
                        id="eval-field-early_dialogue_notes"
                        label={labels.early_dialogue_notes}
                        hint={FIELD_HINTS.early_dialogue_notes}
                        rows={3}
                        value={body.early_dialogue_notes || ""}
                        disabled={!editable}
                        onChange={(e) => setBody({ ...body, early_dialogue_notes: e.target.value })}
                      />
                    </section>
                  </>
                )}

                {canInvite && doc.status !== "publicado" && (
                  <form onSubmit={sendInvite} className="eval-invite">
                    <h4 className="term-label">
                      Invitar revisor
                      <InfoTip text={GLOSSARY.fa_invitar_revisor} label="Cómo funciona la invitación" />
                    </h4>
                    <Select
                      id="eval-invite-kind"
                      label="Tipo"
                      value={invite.kind}
                      onChange={(e) => setInvite({ ...invite, kind: e.target.value })}
                    >
                      <option value="externo">Externo (sin cuenta institucional, enlace de 10 días)</option>
                      <option value="interno">Interno</option>
                    </Select>
                    <Input
                      id="eval-invite-name"
                      label="Nombre"
                      required
                      value={invite.reviewer_name}
                      onChange={(e) => setInvite({ ...invite, reviewer_name: e.target.value })}
                    />
                    <Input
                      id="eval-invite-email"
                      label="Correo"
                      type="email"
                      required
                      value={invite.reviewer_email}
                      onChange={(e) => setInvite({ ...invite, reviewer_email: e.target.value })}
                    />
                    <Button type="submit" data-testid="eval-invite-submit">
                      Generar invitación
                    </Button>
                    {inviteResult && (
                      <div className="fa-notice fa-notice--info" style={{ marginTop: 12, display: "block" }} data-testid="eval-invite-result">
                        {inviteResult.email_sent ? (
                          <div>La invitación salió por correo. Guarde el enlace por si el revisor no la recibe.</div>
                        ) : (
                          <div>
                            {inviteResult.detail || "Sin correo configurado."} El enlace es personal y solo se
                            muestra ahora.
                          </div>
                        )}
                        <div className="fa-link-box">
                          <code data-testid="eval-invite-link">{inviteResult.url}</code>
                          <Button type="button" size="sm" variant="secondary" onClick={copyInvite}>
                            {inviteResult.copied ? "Copiado" : "Copiar enlace"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </form>
                )}

                <h4 className="term-label">
                  Revisores
                  <InfoTip text={GLOSSARY.revision_pares} label="Qué es la revisión por pares" />
                </h4>
                {activeAssignments.length === 0 && (
                  <p className="muted-note">Todavía no hay revisores asignados.</p>
                )}
                <ul className="eval-reviewers" data-testid="eval-reviewers">
                  {(doc.assignments || []).map((a) => (
                    <li key={a.id} className="fa-reviewer-row">
                      <span>
                        {a.reviewer_name} ({a.kind === "externo" ? "externo" : "interno"}) ·{" "}
                        {a.coi_signed ? "COI firmado" : "sin COI"} · {ASSIGNMENT_STATUS[a.status] || a.status}
                        {a.expires_at && a.kind === "externo"
                          ? ` · vence ${new Date(a.expires_at).toLocaleDateString("es-CO")}`
                          : ""}
                      </span>
                      {canInvite &&
                        a.kind === "externo" &&
                        !["aprobado", "observado", "revocado"].includes(a.status) &&
                        doc.status !== "publicado" && (
                          <HintButton
                            size="sm"
                            variant="ghost"
                            style={{ color: "#B91C1C" }}
                            hint={GLOSSARY.fa_revocar}
                            onClick={() => setRevoking(a)}
                          >
                            Revocar
                          </HintButton>
                        )}
                    </li>
                  ))}
                </ul>

                {canReview && (
                  <form onSubmit={addComment}>
                    <h4 className="term-label">
                      Observación en línea
                      <InfoTip text={GLOSSARY.fa_observacion} label="Qué es una observación en línea" />
                    </h4>
                    <Select
                      id="eval-comment-field"
                      label="Campo"
                      value={comment.field_key}
                      onChange={(e) => setComment({ ...comment, field_key: e.target.value })}
                    >
                      <option value="">Documento completo</option>
                      {fieldsFor(level).map((key) => (
                        <option key={key} value={key}>
                          {labels[key] || key}
                        </option>
                      ))}
                    </Select>
                    <Textarea
                      id="eval-comment-body"
                      label="Comentario"
                      required
                      rows={3}
                      value={comment.body}
                      onChange={(e) => setComment({ ...comment, body: e.target.value })}
                    />
                    <HintButton
                      type="submit"
                      variant="secondary"
                      disabled={!comment.body.trim()}
                      disabledHint="Escriba el comentario antes de registrarlo."
                    >
                      Registrar observación
                    </HintButton>
                  </form>
                )}

                {(doc.comments || []).length > 0 && (
                  <ul className="eval-comments">
                    {doc.comments.map((c) => (
                      <li key={c.id}>
                        <strong>{c.author}</strong>
                        {c.field_key ? ` · ${labels[c.field_key] || c.field_key}` : ""}
                        <p>{c.body}</p>
                      </li>
                    ))}
                  </ul>
                )}

                {versions.length > 0 && (
                  <details className="eval-versions">
                    <summary title={GLOSSARY.fa_historial}>Historial de versiones ({versions.length})</summary>
                    <ol>
                      {versions.map((v) => (
                        <li key={v.id}>
                          v{v.major}.{v.minor} · {v.status} · {v.note} · {v.created_by}
                        </li>
                      ))}
                    </ol>
                  </details>
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
        title="Publicar documento"
        confirmVariant="success"
        confirmLabel="Publicar"
        message="El documento quedará publicado en la plataforma y, si no es confidencial, en el catálogo público de expedientes. La publicación no se deshace."
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        onConfirm={revoke}
        title="Revocar invitación"
        confirmLabel="Revocar"
        message={`El enlace de ${revoking?.reviewer_name || "este revisor"} dejará de abrir el portal. La invitación queda en el historial.`}
      />
    </div>
  );
}
