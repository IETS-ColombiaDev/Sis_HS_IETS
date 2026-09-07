import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { Input, Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import ModuleHeader from "../components/ModuleHeader";
import InfoTip from "../components/InfoTip";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";

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
  health_condition: "Condicion de salud",
  mechanism: "Mecanismo biologico o tecnologico",
  target_population_co: "Poblacion objetivo en Colombia",
  evidence_state: "Estado del arte de la evidencia clinica",
  comparators_sgsss: "Comparadores posibles en el SGSSS",
  adoption_risks: "Riesgos potenciales de adopcion",
  narrative: "Narrativa del informe",
  evidence_phases: "Fases de ensayos",
  efficacy_outcomes: "Desenlaces de eficacia",
  safety_outcomes: "Desenlaces de seguridad",
  pico_population: "PICO: poblacion",
  pico_intervention: "PICO: intervencion",
  pico_comparator: "PICO: comparador",
  pico_outcome: "PICO: desenlace",
  budget_year_1: "Impacto presupuestal anio 1",
  budget_year_2: "Impacto presupuestal anio 2",
  budget_year_3: "Impacto presupuestal anio 3",
  clinical_uncertainty: "Incertidumbre clinica",
  early_dialogue_notes: "Notas de dialogo temprano",
};

const EDITORIAL_STEPS = [
  { key: "borrador", label: "Borrador", help: GLOSSARY.borrador },
  { key: "revision_interna", label: "Interna", help: GLOSSARY.revision_interna },
  { key: "revision_externa", label: "Externa", help: GLOSSARY.revision_externa },
  { key: "con_observaciones", label: "Observado", help: GLOSSARY.observado },
  { key: "aprobado_comite", label: "Comite", help: GLOSSARY.comite },
  { key: "publicado", label: "Publicado", help: GLOSSARY.publicado },
];

const ASSIGNMENT_STATUS = {
  pendiente: "Pendiente",
  invitacion_enviada: "Invitacion enviada",
  en_lectura: "En lectura",
  aprobado: "Aprobado",
  observado: "Con observaciones",
};

const TRANSITION_LABELS = {
  revision_interna: "Enviar a revision interna",
  revision_externa: "Pasar a revision externa",
  con_observaciones: "Devolver con observaciones",
  aprobado_comite: "Aprobar en comite",
  publicado: "Publicar",
  borrador: "Regresar a borrador",
};

function fieldsFor(level) {
  if (level === "mini_hta") return [...FICHA, ...INFORME, ...PICO];
  if (level === "informe") return [...FICHA, ...INFORME];
  return [...FICHA];
}

function fieldGroups(level) {
  const groups = [{ title: "Ficha tecnica", keys: FICHA }];
  if (level === "informe" || level === "mini_hta") {
    groups.push({ title: "Informe de evaluacion", keys: INFORME });
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
        <div>
          <p className="iets-dossier-kicker">Instituto de Evaluacion Tecnologica en Salud · Colombia</p>
          <h2>{title}</h2>
          <p className="iets-dossier-sub">
            {cycleCode || "Ciclo institucional"} · {levelLabel} · {statusLabel}
          </p>
        </div>
      </header>
      {groups.map((group, index) => (
        <section key={group.title} className="iets-dossier-chapter">
          <div className="iets-dossier-num">0{index + 1}</div>
          <h3>{group.title}</h3>
          {group.keys.map((key) => (
            <article key={key} className="iets-dossier-block">
              <h4>{labels[key] || key}</h4>
              {(String(body[key] || "").split("\n").map((p) => p.trim()).filter(Boolean).length
                ? String(body[key] || "").split("\n").map((p) => p.trim()).filter(Boolean)
                : ["—"]
              ).map((para, i) => (
                <p key={`${key}-${i}`}>{para}</p>
              ))}
            </article>
          ))}
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
        <li
          key={step.key}
          className={i < idx ? "is-done" : i === idx ? "is-current" : ""}
        >
          <span>{i + 1}</span>
          <span className="term-label">
            {step.label}
            <InfoTip text={step.help} label={`Que es ${step.label}`} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Evaluation() {
  const { cycle, cycleId, isClosed } = useCycle();
  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();

  const canWrite = can(PERM.REPORT_WRITE);
  const canInvite = can(PERM.CYCLE_WRITE);
  const canReview = can(PERM.REVIEW_SUBMIT) || can(PERM.REPORT_WRITE);

  const [queue, setQueue] = useState([]);
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [doc, setDoc] = useState(null);
  const [body, setBody] = useState({});
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("ficha");
  const [confidential, setConfidential] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coi, setCoi] = useState({ accepted: false, has_conflict: false, statement: "" });
  const [invite, setInvite] = useState({ kind: "externo", reviewer_name: "", reviewer_email: "" });
  const [inviteLink, setInviteLink] = useState("");
  const [comment, setComment] = useState({ field_key: "", body: "" });
  const [versions, setVersions] = useState([]);
  const [showDossier, setShowDossier] = useState(true);

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
      toast.error(apiError(e, "No se pudo cargar la cola de evaluacion"));
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

  const openDoc = useCallback(
    async (item) => {
      if (!item) {
        setDoc(null);
        return;
      }
      try {
        let id = item.doc_id;
        if (!id && canWrite) {
          const created = await api.post("/reports", {
            cycle_id: cycleId,
            technology_id: item.technology_id,
            product_level: item.suggested_level,
          });
          id = created.data.id;
        }
        if (!id) {
          setDoc(null);
          return;
        }
        const { data } = await api.get(`/reports/${id}`);
        setDoc(data);
        setTitle(data.title || "");
        setLevel(data.product_level || "ficha");
        setConfidential(Boolean(data.confidential));
        setBody(data.body || {});
        setShowDossier(data.status === "publicado" || !["borrador", "con_observaciones"].includes(data.status));
        setInviteLink("");
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
      }
    },
    [canWrite, cycleId, toast]
  );

  useEffect(() => {
    if (active) openDoc(active);
    else setDoc(null);
  }, [active, openDoc]);

  const editable = canWrite && doc && !doc.coi_required && ["borrador", "con_observaciones"].includes(doc.status);

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
      const { data } = await api.post(`/reports/${doc.id}/coi`, coi);
      setDoc(data);
      setBody(data.body || {});
      toast.success("Declaracion registrada. Ya puede leer el informe.");
      openDoc(active);
    } catch (e) {
      toast.error(apiError(e, "No se pudo firmar el conflicto de interes"));
    }
  };

  const move = async (status) => {
    if (!doc) return;
    try {
      const { data } = await api.post(`/reports/${doc.id}/transition`, { status });
      setDoc(data);
      toast.success(data.status_label);
      loadQueue();
    } catch (e) {
      toast.error(apiError(e, "La transicion fue rechazada"));
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!doc) return;
    try {
      const { data } = await api.post(`/reports/${doc.id}/invite`, invite);
      setInvite({ kind: "externo", reviewer_name: "", reviewer_email: "" });
      if (data.invite_path) {
        const url = `${window.location.origin}${data.invite_path}`;
        setInviteLink(url);
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Invitacion creada. El enlace se copio al portapapeles.");
        } catch {
          toast.success("Invitacion creada. Copie el enlace ahora: solo se muestra una vez.");
        }
      } else {
        toast.success("Revisor interno asignado");
      }
      const refreshed = await api.get(`/reports/${doc.id}`);
      setDoc(refreshed.data);
    } catch (err) {
      toast.error(apiError(err, "No se pudo invitar"));
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
      toast.success("Observacion registrada");
    } catch (err) {
      toast.error(apiError(err, "No se pudo comentar"));
    }
  };

  const exportHtml = async () => {
    if (!doc) return;
    try {
      const { data } = await api.get(`/reports/${doc.id}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(apiError(e, "No se pudo exportar"));
    }
  };

  if (!cycleId) {
    return (
      <EmptyState
        title="Seleccione un ciclo"
        description="La evaluacion vive dentro del ciclo operativo."
      />
    );
  }

  if (loading) return <LoadingBlock label="Cargando evaluacion..." />;

  const stats = [
    { label: "En cola", value: queue.length },
    { label: "Con expediente", value: queue.filter((i) => i.doc_id).length },
    { label: "Publicados", value: queue.filter((i) => i.doc_status === "publicado").length },
  ];

  return (
    <div>
      <ModuleHeader
        step="caracterizacion"
        title="Evaluacion"
        titleHint={GLOSSARY.evaluacion}
        purpose={
          cycle
            ? `Fase 3 · ${cycle.code}. Expediente editorial: ficha, informe o Mini-HTA con revision por pares.`
            : "Fase 3 · Expediente editorial: ficha, informe o Mini-HTA con revision por pares."
        }
      />
      <PhaseGuide
        phase="Fase 3"
        hint={GLOSSARY.evaluacion}
        tasks={[
          "Complete la ficha, el informe o el Mini-HTA segun el puntaje de priorizacion",
          "Declare conflicto de interes antes de leer o editar el expediente",
          "Invite un revisor interno y uno externo. El enlace externo dura 10 dias.",
        ]}
        nextLabel="Diseminacion"
        nextTo="/diseminacion"
      />
      <ModuleStatsRow items={stats} />

      {queue.length === 0 ? (
        <EmptyState
          title="Nada en evaluacion"
          description="Pase tecnologias priorizadas a evaluacion desde la matriz P1 a P6."
        />
      ) : (
        <div className="eval-layout">
          <Card>
            <h3 style={{ marginTop: 0 }}>Cola del ciclo</h3>
            <ul className="eval-queue">
              {queue.map((item) => (
                <li key={item.technology_id}>
                  <button
                    type="button"
                    className={item.technology_id === activeId ? "is-active" : ""}
                    onClick={() => setActiveId(item.technology_id)}
                  >
                    <strong>{item.commercial_name || item.inn_name}</strong>
                    <span>
                      {item.suggested_level_label}
                      {item.doc_status_label ? ` · ${item.doc_status_label}` : " · sin abrir"}
                    </span>
                    <em>{item.completeness_pct}%</em>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div>
            {!doc && (
              <EmptyState
                title="Abra el expediente"
                description="Necesita permiso de escritura de informes para crear la ficha."
              />
            )}

            {doc?.coi_required && (
              <Card>
                <h3 style={{ marginTop: 0 }}>Declaracion de conflicto de interes</h3>
                <p>
                  Sin declaracion firmada no se habilita la lectura del informe, tampoco
                  para el evaluador interno.
                </p>
                <label className="public-check">
                  <input
                    type="checkbox"
                    checked={coi.accepted}
                    onChange={(e) => setCoi({ ...coi, accepted: e.target.checked })}
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
                  label="Detalle del conflicto (si aplica)"
                  rows={3}
                  value={coi.statement}
                  onChange={(e) => setCoi({ ...coi, statement: e.target.value })}
                />
                <Button onClick={signCoi} disabled={!coi.accepted}>
                  Firmar y continuar
                </Button>
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
                    <span className="eval-version">
                      v{doc.version_major}.{doc.version_minor}
                    </span>
                  </div>
                  <div className="eval-actions">
                    {editable && (
                      <Button onClick={save} loading={saving} disabled={isClosed}>
                        Guardar
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => setShowDossier((v) => !v)}>
                      {showDossier ? "Ver campos" : "Ver expediente"}
                    </Button>
                    <Button variant="secondary" onClick={exportHtml}>
                      Exportar HTML institucional
                    </Button>
                    {(doc.allowed_transitions || []).map((status) => (
                      <Button key={status} variant="outline" onClick={() => move(status)}>
                        {TRANSITION_LABELS[status] || status}
                      </Button>
                    ))}
                  </div>
                </div>

                <Input
                  label="Titulo"
                  value={title}
                  disabled={!editable}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Select
                  label="Nivel de producto (sugerido por puntaje; se puede cambiar)"
                  hint={GLOSSARY.mini_hta}
                  value={level}
                  disabled={!editable}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  <option value="ficha">Ficha tecnica</option>
                  <option value="informe">Informe de evaluacion temprana</option>
                  <option value="mini_hta">Mini-HTA</option>
                </Select>
                <label className="public-check">
                  <input
                    type="checkbox"
                    checked={confidential}
                    disabled={!editable}
                    onChange={(e) => setConfidential(e.target.checked)}
                  />
                  Marcar como confidencial. No se publicara en el catalogo de expedientes.
                </label>

                {doc.completeness && (
                  <p className="eval-complete">
                    Completitud {doc.completeness.pct}%
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
                        ? [{ title: "Dialogo temprano", keys: ["early_dialogue_notes"] }]
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
                            label={labels[key] || key}
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
                      <h4>Dialogo temprano</h4>
                      <Textarea
                        label={labels.early_dialogue_notes}
                        rows={3}
                        value={body.early_dialogue_notes || ""}
                        disabled={!editable}
                        onChange={(e) => setBody({ ...body, early_dialogue_notes: e.target.value })}
                      />
                    </section>
                  </>
                )}

                {canInvite && (
                  <form onSubmit={sendInvite} className="eval-invite">
                    <h4>Invitar revisor</h4>
                    <Select
                      label="Tipo"
                      value={invite.kind}
                      onChange={(e) => setInvite({ ...invite, kind: e.target.value })}
                    >
                      <option value="externo">Externo (sin cuenta institucional, enlace de 10 dias)</option>
                      <option value="interno">Interno</option>
                    </Select>
                    <Input
                      label="Nombre"
                      required
                      value={invite.reviewer_name}
                      onChange={(e) => setInvite({ ...invite, reviewer_name: e.target.value })}
                    />
                    <Input
                      label="Correo"
                      type="email"
                      required
                      value={invite.reviewer_email}
                      onChange={(e) => setInvite({ ...invite, reviewer_email: e.target.value })}
                    />
                    <Button type="submit">Generar invitacion</Button>
                    {inviteLink && (
                      <p className="eval-link">
                        Enlace de un solo vistazo: <code>{inviteLink}</code>
                      </p>
                    )}
                  </form>
                )}

                <h4>Revisores</h4>
                <ul className="eval-reviewers">
                  {(doc.assignments || []).map((a) => (
                    <li key={a.id}>
                      {a.reviewer_name} ({a.kind === "externo" ? "externo" : "interno"}) ·{" "}
                      {a.coi_signed ? "COI firmado" : "sin COI"} · {ASSIGNMENT_STATUS[a.status] || a.status}
                    </li>
                  ))}
                </ul>

                {canReview && (
                  <form onSubmit={addComment}>
                    <h4>Observacion en linea</h4>
                    <Select
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
                      label="Comentario"
                      required
                      rows={3}
                      value={comment.body}
                      onChange={(e) => setComment({ ...comment, body: e.target.value })}
                    />
                    <Button type="submit" variant="secondary">
                      Registrar observacion
                    </Button>
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
                    <summary>Historial de versiones ({versions.length})</summary>
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
    </div>
  );
}
