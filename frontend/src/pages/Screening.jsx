import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import ClampText from "../components/ClampText";
import Icon from "../components/Icon";
import InfoTip, { TermLabel } from "../components/InfoTip";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { Input, Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { downloadFromApi } from "../utils/download";
import { PERM, TECH_STATUS_LABELS } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import {
  TechLinkNotice,
  buildTechNotice,
  focusElement,
  locateTech,
  resolveTechLink,
  useTechDeepLink,
} from "../utils/techLink";

/**
 * Fase 3 del plan: depuracion del acervo del ciclo.
 *
 * Reune las tres funciones del modulo 2 en una sola pantalla porque en la
 * operacion son un mismo gesto: se limpian duplicados, se verifica que la
 * tecnologia sea nueva para el pais y se consolida el Listado Unico.
 */

const TABS = [
  { key: "duplicados", label: "Duplicados", icon: "layers", hint: GLOSSARY.desduplicacion },
  { key: "novedad", label: "Novedad y registro sanitario", icon: "shield", hint: GLOSSARY.novedad },
  { key: "listado", label: "Listado único", icon: "list", hint: GLOSSARY.listado_unico },
];

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function techLabel(tech) {
  if (!tech) return "—";
  return tech.inn_name || tech.commercial_name || `Tecnología #${tech.id}`;
}

/** Ficha de un registro dentro de una propuesta de fusion. */
function MergeCandidate({ tech, selected, onSelect, disabled }) {
  if (!tech) return <div className="merge-card">Registro no disponible</div>;
  return (
    <div className={`merge-card${selected ? " is-selected" : ""}`}>
      <div className="merge-card-head">
        <ClampText as="strong" text={techLabel(tech)} lines={3} expandable />
        <Badge tone="info">#{tech.id}</Badge>
      </div>
      <dl className="merge-fields">
        {tech.commercial_name && tech.commercial_name !== techLabel(tech) && (
          <>
            <dt>Comercial</dt>
            <dd>
              <ClampText text={tech.commercial_name} lines={2} expandable />
            </dd>
          </>
        )}
        {tech.manufacturer && (
          <>
            <dt>Fabricante</dt>
            <dd>{tech.manufacturer}</dd>
          </>
        )}
        {tech.atc_code && (
          <>
            <dt>ATC</dt>
            <dd>{tech.atc_code}</dd>
          </>
        )}
        {tech.nct_ids?.length > 0 && (
          <>
            <dt>Ensayos</dt>
            <dd>{tech.nct_ids.join(", ")}</dd>
          </>
        )}
        {tech.cluster_name && (
          <>
            <dt>Clúster</dt>
            <dd>{tech.cluster_name}</dd>
          </>
        )}
        {tech.source_name && (
          <>
            <dt>Fuente</dt>
            <dd>{tech.source_name}</dd>
          </>
        )}
        <dt>Estado</dt>
        <dd>{tech.status}</dd>
      </dl>
      <Button
        variant={selected ? "primary" : "secondary"}
        size="sm"
        disabled={disabled}
        onClick={onSelect}
        style={{ width: "100%" }}
      >
        {selected ? "Se conserva este" : "Conservar este"}
      </Button>
    </div>
  );
}

/** Desglose de los tres algoritmos, para que la propuesta sea explicable. */
function MatchEvidence({ proposal }) {
  const name = proposal.detail?.nombre;
  const manufacturer = proposal.detail?.fabricante;
  return (
    <div className="merge-evidence">
      {proposal.decisive ? (
        <p className="merge-evidence-decisive">
          Ambos registros comparten el ensayo clínico{" "}
          <strong>{(proposal.detail?.nct || []).join(", ")}</strong>. No es un parecido
          de nombres: es el mismo desarrollo.
        </p>
      ) : (
        <>
          {name && (
            <div className="merge-metrics">
              <span className="term-label">
                Levenshtein <strong>{name.levenshtein}</strong>
                <InfoTip text={GLOSSARY.fa_levenshtein} label="Qué es Levenshtein" />
              </span>
              <span className="term-label">
                Jaro-Winkler <strong>{name.jaro_winkler}</strong>
                <InfoTip text={GLOSSARY.fa_jaro} label="Qué es Jaro-Winkler" />
              </span>
              <span className="term-label">
                Token sorting <strong>{name.token_sort}</strong>
                <InfoTip text={GLOSSARY.fa_token_sort} label="Qué es token sorting" />
              </span>
            </div>
          )}
          {manufacturer && (
            <div className="merge-metrics">
              <span className="term-label">
                Fabricante <strong>{manufacturer.token_set}</strong>
                <InfoTip text={GLOSSARY.fa_fabricante_sim} label="Cómo pesa el fabricante" />
              </span>
            </div>
          )}
        </>
      )}
      <div className="merge-signals">
        {(proposal.matched_on || []).map((tag) => (
          <Badge key={tag} tone={tag === "fabricante_discrepante" ? "warning" : "info"}>
            {tag.replace(/_/g, " ")}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function DuplicatesTab({ canWrite, onChanged }) {
  const { cycleId, cycle, isClosed } = useCycle();
  const toast = useToast();
  const { version } = useRealtime();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [choice, setChoice] = useState({});
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/screening/merges", {
        params: { status: "propuesta", limit: 50 },
      });
      setProposals(data);
      setChoice((prev) => {
        const next = { ...prev };
        data.forEach((p) => {
          if (!next[p.id]) next[p.id] = p.technology_a_id;
        });
        return next;
      });
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las propuestas de fusión"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const scan = async () => {
    setScanning(true);
    try {
      const { data } = await api.post("/screening/merges/scan", null, {
        params: cycleId ? { cycle_id: cycleId } : {},
      });
      toast.success(
        `Barrido con umbral ${data.threshold}%: ${data.detected} pares detectados, ` +
          `${data.created} propuestas nuevas.`
      );
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar el barrido"));
    } finally {
      setScanning(false);
    }
  };

  const resolve = async (proposal, action) => {
    setBusyId(proposal.id);
    try {
      if (action === "confirm") {
        await api.post(`/screening/merges/${proposal.id}/confirm`, {
          keep_technology_id: choice[proposal.id],
          note: notes[proposal.id] || "",
        });
        toast.success("Registros fusionados. El absorbido queda trazado, no borrado.");
      } else {
        await api.post(`/screening/merges/${proposal.id}/discard`, {
          note: notes[proposal.id] || "",
        });
        toast.success("Propuesta descartada. El motor no volverá a proponerla.");
      }
      setConfirming(null);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo resolver la propuesta"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingBlock label="Cargando propuestas de fusión..." />;

  const keptTech = (p) =>
    choice[p.id] === p.technology_a_id ? p.technology_a : p.technology_b;
  const droppedTech = (p) =>
    choice[p.id] === p.technology_a_id ? p.technology_b : p.technology_a;

  return (
    <>
      <Card
        title="Detección de duplicados"
        hint="El hash exacto solo atrapa la misma página traída dos veces. La misma tecnología llega con nombres distintos según la fuente, y ese es el duplicado que contamina el Listado Único."
        padding={18}
        style={{ marginBottom: 18 }}
        actions={
          canWrite && (
            <HintButton
              onClick={scan}
              loading={scanning}
              disabled={!cycleId || isClosed}
              disabledHint={!cycleId ? "Seleccione un ciclo para barrer su acervo." : "El ciclo está cerrado: su acervo ya no cambia."}
              hint={`${GLOSSARY.fa_barrido} Barre ${cycle?.code || "el ciclo en pantalla"}.`}
              data-testid="dedup-scan"
            >
              <Icon name="refresh" size={16} /> Ejecutar barrido
            </HintButton>
          )
        }
      >
        <p className="muted-note">
          El sistema propone; una persona confirma. Ninguna fusión es automática y todas
          quedan en la bitácora con su autor.
        </p>
      </Card>

      {proposals.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Sin duplicados pendientes"
          message="No hay pares por revisar. Ejecute el barrido después de asignar nuevas señales al ciclo."
        />
      ) : (
        proposals.map((proposal) => (
          <Card key={proposal.id} padding={18} style={{ marginBottom: 16 }}>
            <div className="merge-head" data-testid={`merge-${proposal.id}`}>
              <div>
                <Badge tone={proposal.decisive ? "priorizada" : "asignada_a_ciclo"}>
                  {proposal.decisive ? "Mismo ensayo clínico" : `Similitud ${pct(proposal.score)}`}
                </Badge>
              </div>
              <span className="muted-note">Propuesta #{proposal.id}</span>
            </div>

            <MatchEvidence proposal={proposal} />

            <div className="merge-pair">
              <MergeCandidate
                tech={proposal.technology_a}
                selected={choice[proposal.id] === proposal.technology_a_id}
                disabled={!canWrite}
                onSelect={() =>
                  setChoice((p) => ({ ...p, [proposal.id]: proposal.technology_a_id }))
                }
              />
              <MergeCandidate
                tech={proposal.technology_b}
                selected={choice[proposal.id] === proposal.technology_b_id}
                disabled={!canWrite}
                onSelect={() =>
                  setChoice((p) => ({ ...p, [proposal.id]: proposal.technology_b_id }))
                }
              />
            </div>

            {canWrite && (
              <>
                <Input
                  aria-label={`Nota de la decisión de la propuesta ${proposal.id}`}
                  placeholder="Nota de la decisión (opcional)"
                  value={notes[proposal.id] || ""}
                  onChange={(e) => setNotes((p) => ({ ...p, [proposal.id]: e.target.value }))}
                  style={{ marginBottom: 10 }}
                />
                <div className="merge-actions">
                  <HintButton
                    onClick={() => setConfirming(proposal)}
                    loading={busyId === proposal.id}
                    hint={GLOSSARY.fa_confirmar_fusion}
                  >
                    Fusionar y conservar #{choice[proposal.id]}
                  </HintButton>
                  <HintButton
                    variant="secondary"
                    onClick={() => resolve(proposal, "discard")}
                    disabled={busyId === proposal.id}
                    hint={GLOSSARY.fa_descartar_fusion}
                  >
                    Son distintas
                  </HintButton>
                </div>
              </>
            )}
          </Card>
        ))
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={() => resolve(confirming, "confirm")}
        loading={Boolean(confirming) && busyId === confirming?.id}
        title="Confirmar fusión"
        confirmLabel="Fusionar"
        confirmVariant="primary"
        message={
          confirming
            ? `Se conserva #${keptTech(confirming)?.id} (${techLabel(keptTech(confirming)).slice(0, 90)}) y absorbe a #${droppedTech(confirming)?.id}, que sale del Listado Único con causa "duplicada". La fusión no se deshace.`
            : ""
        }
      />
    </>
  );
}

function InvimaPanel({ canSync, onChanged }) {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [syncs, setSyncs] = useState([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([
        api.get("/invima/status"),
        api.get("/invima/syncs", { params: { limit: 5 } }),
      ]);
      setStatus(s.data);
      setSyncs(h.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo consultar el índice del INVIMA"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const syncOnline = async () => {
    setBusy("online");
    try {
      const { data } = await api.post("/invima/sync");
      if (data.status === "error") {
        toast.error(data.message);
      } else {
        toast.success(
          `Índice actualizado: ${data.rows_ingested} nuevos, ${data.rows_updated} actualizados.`
        );
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo sincronizar"));
    } finally {
      setBusy("");
    }
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("file");
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await api.post("/invima/sync/file", form);
      if (data.status === "error") toast.error(data.message);
      else toast.success(`${data.rows_ingested} registros cargados desde el archivo.`);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar el archivo"));
    } finally {
      setBusy("");
      event.target.value = "";
    }
  };

  if (!status) return <LoadingBlock label="Consultando el índice..." />;

  return (
    <Card
      title="Índice local de registros sanitarios"
      hint="La verificación responde contra una copia local y no contra el servicio en línea: es la única forma de sostener el tiempo de respuesta y de seguir filtrando si la fuente no está disponible."
      padding={18}
      style={{ marginBottom: 18 }}
    >
      {status.warning && (
        <div className={`invima-alert${status.total_records === 0 ? " is-empty" : ""}`}>
          <Icon name="alert" />
          <span>{status.warning}</span>
        </div>
      )}

      <ModuleStatsRow
        items={[
          {
            label: "Registros",
            value: status.total_records.toLocaleString("es-CO"),
            hint: "Registros sanitarios en la copia local del índice del INVIMA.",
          },
          {
            label: "Antigüedad",
            value: status.age_days === null ? "—" : `${status.age_days} d`,
            sub: `Máximo ${status.stale_after_days} d`,
            color: status.stale ? "#EF4444" : "#059669",
            hint: "Días desde la última sincronización. Un índice viejo da falsos 'sin registro' en silencio.",
          },
          {
            label: "Última sincronización",
            value: status.last_source || "—",
            sub: status.last_status || "sin ejecutar",
            hint: "Origen y resultado de la última carga: datos.gov.co (Socrata) o archivo plano.",
          },
        ]}
      />

      {canSync ? (
        <div className="invima-actions">
          <HintButton
            onClick={syncOnline}
            loading={busy === "online"}
            hint="Descarga los conjuntos abiertos de datos.gov.co. Puede tardar varios minutos."
          >
            <Icon name="refresh" size={16} /> Sincronizar desde datos.gov.co
          </HintButton>
          <label className="invima-upload">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={uploadFile}
              disabled={busy === "file"}
            />
            <span>{busy === "file" ? "Cargando..." : "Cargar archivo plano (CSV)"}</span>
          </label>
        </div>
      ) : (
        <p className="muted-note">Solo los perfiles con permiso de sincronización actualizan el índice.</p>
      )}
      <p className="muted-note">
        La carga de archivo plano es la ruta de contingencia prevista mientras no se
        acuerde con el INVIMA el acceso estructurado al dato.
      </p>

      {syncs.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="invima-syncs">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Estado</th>
                <th>
                  <TermLabel tip="Filas nuevas / filas actualizadas en la carga.">Filas</TermLabel>
                </th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {syncs.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.started_at).toLocaleString("es-CO")}</td>
                  <td>{s.source}</td>
                  <td>
                    <Badge tone={s.status === "ok" ? "priorizada" : "warning"}>{s.status}</Badge>
                  </td>
                  <td>
                    {s.rows_ingested} / {s.rows_updated}
                  </td>
                  <td className="invima-message">{s.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function NoveltyTab({ canWrite, canSync, onChanged, exclusionReasons, focusId, onSelect }) {
  const { cycleId, isClosed } = useCycle();
  const toast = useToast();
  const { version } = useRealtime();
  const [queue, setQueue] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ option_code: "", justification: "", sala_concept: "", sala_ref: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [excluding, setExcluding] = useState(false);
  const [exclusion, setExclusion] = useState({ reason_code: "", note: "" });
  const focusedRef = useRef(null);

  const load = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    try {
      const { data, headers } = await api.get("/technologies", {
        params: { cycle_id: cycleId, cycle_status: "asignada_a_ciclo", limit: 500 },
      });
      setQueue(data);
      setTotal(Number(headers?.["x-total-count"] ?? data.length));
      setActiveId((current) =>
        current && data.some((t) => t.id === current) ? current : data[0]?.id || null
      );
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la cola de filtrado"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  useEffect(() => {
    load();
  }, [load, version]);

  // Enlace directo: abre la tecnologia pedida en la cola de novedad.
  useEffect(() => {
    if (!focusId || loading || focusedRef.current === focusId) return;
    if (!queue.some((t) => t.id === focusId)) return;
    focusedRef.current = focusId;
    setSearch("");
    setActiveId(focusId);
    focusElement(`novelty-item-${focusId}`);
  }, [focusId, loading, queue]);

  useEffect(() => {
    api
      .get("/screening/novelty/options")
      .then(({ data }) => setOptions(data))
      .catch(() => {});
  }, []);

  const loadDetail = useCallback(async () => {
    if (!cycleId || !activeId) {
      setDetail(null);
      return;
    }
    try {
      const { data } = await api.get(`/screening/novelty/${cycleId}/${activeId}`);
      setDetail(data);
      setForm({
        option_code: data.option_code || "",
        justification: data.justification || "",
        sala_concept: data.sala_especializada_concept || "",
        sala_ref: data.sala_especializada_ref || "",
      });
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la verificación de novedad"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, activeId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter((t) =>
      `${t.inn_name} ${t.commercial_name} ${t.cluster_name}`.toLowerCase().includes(q)
    );
  }, [queue, search]);

  const selectedOption = options.find((o) => o.code === form.option_code);
  const needsJustification = Boolean(selectedOption?.requires_justification);
  const justificationShort = needsJustification && form.justification.trim().length < 20;
  const dirty =
    detail &&
    (form.option_code !== (detail.option_code || "") ||
      form.justification !== (detail.justification || "") ||
      form.sala_concept !== (detail.sala_especializada_concept || "") ||
      form.sala_ref !== (detail.sala_especializada_ref || ""));

  const runCheck = async () => {
    setBusy("check");
    try {
      const { data } = await api.post(`/screening/novelty/${cycleId}/${activeId}/invima-check`);
      setDetail(data);
      toast.success(
        data.has_valid_registry
          ? "El INVIMA reporta registro sanitario vigente para esta tecnología."
          : "Sin registro sanitario vigente en el índice local."
      );
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo cruzar con el INVIMA"));
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      const { data } = await api.put(`/screening/novelty/${cycleId}/${activeId}`, {
        option_code: form.option_code,
        justification: form.justification,
        sala_especializada_concept: form.sala_concept,
        sala_especializada_ref: form.sala_ref,
      });
      setDetail(data);
      toast.success(
        data.can_qualify
          ? "Criterio de novedad registrado. Ya puede marcarla apta para priorización."
          : `Criterio registrado. ${data.blocking_reason}`
      );
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar el criterio de novedad"));
    } finally {
      setBusy("");
    }
  };

  const qualify = async () => {
    setBusy("qualify");
    try {
      await api.post(`/technologies/${activeId}/cycles/${cycleId}/qualify`);
      toast.success("Tecnología apta para priorización. Pasó a la cola P1 a P6.");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo calificar como apta"));
    } finally {
      setBusy("");
    }
  };

  const exclude = async () => {
    setBusy("exclude");
    try {
      await api.post(`/technologies/${activeId}/cycles/${cycleId}/exclude`, exclusion);
      toast.success("Tecnología excluida con causa registrada.");
      setExcluding(false);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, "No se pudo excluir"));
    } finally {
      setBusy("");
    }
  };

  if (loading) return <LoadingBlock label="Cargando cola de filtrado..." />;
  if (!cycleId)
    return (
      <EmptyState
        icon="🗓️"
        title="Sin ciclo activo"
        message="El filtrado ocurre dentro de un ciclo. Seleccione uno en la cabecera o abra uno nuevo."
      />
    );

  let qualifyBlock = "";
  if (dirty) qualifyBlock = "Guarde primero el criterio de novedad que modificó.";
  else if (detail && !detail.can_qualify) qualifyBlock = detail.blocking_reason;

  let saveBlock = "";
  if (!form.option_code) saveBlock = "Seleccione la vía de novedad que aplica.";
  else if (justificationShort) saveBlock = "La justificación debe tener al menos 20 caracteres.";

  return (
    <>
      <InvimaPanel canSync={canSync} onChanged={onChanged} />

      {queue.length === 0 ? (
        <EmptyState
          icon="✅"
          title="Nada pendiente de filtrar"
          message="No hay tecnologías en estado 'asignada al ciclo' esperando verificación de novedad. Asigne señales desde la bandeja de entrada o revise el Listado Único."
        />
      ) : (
        <div className="prio-layout">
          <Card padding={0} style={{ overflow: "hidden" }}>
            <div className="prio-list-head">Por filtrar · {total} tecnología(s)</div>
            <div className="fa-toolbar">
              <input
                type="search"
                aria-label="Buscar en la cola de filtrado"
                placeholder="Buscar por nombre o clúster..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="prio-list" data-testid="novelty-queue">
              {visible.map((tech) => (
                <button
                  key={tech.id}
                  type="button"
                  className={`prio-item ${tech.id === activeId ? "prio-item-active" : ""}`}
                  onClick={() => {
                    focusedRef.current = tech.id;
                    setActiveId(tech.id);
                    onSelect?.(tech.id);
                  }}
                  data-testid={`novelty-item-${tech.id}`}
                >
                  <ClampText
                    className="prio-item-name"
                    text={tech.inn_name || tech.commercial_name || `#${tech.id}`}
                    lines={3}
                  />
                  <div className="prio-item-meta">
                    {tech.cluster_name || "Sin clúster"} ·{" "}
                    {TECH_STATUS_LABELS[tech.cycle_status || tech.status] || tech.status}
                  </div>
                </button>
              ))}
              {visible.length === 0 && (
                <p className="muted-note" style={{ padding: 16 }}>
                  Ninguna tecnología coincide con la búsqueda.
                </p>
              )}
            </div>
          </Card>

          <div className="prio-detail">
            {!detail ? (
              <LoadingBlock label="Cargando..." />
            ) : (
              <Card padding={18}>
                <ClampText
                  as="h3"
                  className="prio-detail-title"
                  text={detail.technology_name}
                  lines={3}
                  expandable
                  style={{ margin: "0 0 4px", fontSize: 17 }}
                />
                <p className="muted-note" style={{ marginTop: 6 }}>
                  Una tecnología con registro sanitario vigente en Colombia no avanza a
                  priorización sin justificar por qué sigue siendo novedosa.
                </p>

                <div className="novelty-invima">
                  <div>
                    <span className="novelty-invima-label term-label">
                      Registro sanitario
                      <InfoTip text={GLOSSARY.invima} label="Qué es el registro sanitario" />
                    </span>
                    {detail.invima_checked_at ? (
                      <Badge tone={detail.has_valid_registry ? "warning" : "priorizada"}>
                        {detail.has_valid_registry ? "Vigente en Colombia" : "Sin registro vigente"}
                      </Badge>
                    ) : (
                      <Badge tone="info">Sin verificar</Badge>
                    )}
                    {detail.invima_checked_at && (
                      <span className="muted-note" style={{ marginLeft: 8 }}>
                        Cruzado {new Date(detail.invima_checked_at).toLocaleString("es-CO")}
                      </span>
                    )}
                  </div>
                  {canWrite && !isClosed && (
                    <HintButton
                      variant="secondary"
                      size="sm"
                      loading={busy === "check"}
                      onClick={runCheck}
                      hint={GLOSSARY.fa_cruce_invima}
                      data-testid="novelty-invima-check"
                    >
                      Cruzar con el INVIMA
                    </HintButton>
                  )}
                </div>

                {detail.matches?.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="novelty-matches">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Titular</th>
                          <th>Estado</th>
                          <th>
                            <TermLabel tip="Parecido entre el nombre de la tecnología y el producto registrado. Sobre el umbral invima.match_threshold se considera hallado.">
                              Similitud
                            </TermLabel>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.matches.map((m, i) => (
                          <tr key={`${m.registro}-${i}`}>
                            <td>{m.producto}</td>
                            <td>{m.titular}</td>
                            <td>{m.estado_registro}</td>
                            <td>{pct(m.score)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <Select
                  id="novelty-option"
                  label="Vía de novedad"
                  hint={GLOSSARY.fa_via_novedad}
                  value={form.option_code}
                  disabled={!canWrite || isClosed}
                  onChange={(e) => setForm((f) => ({ ...f, option_code: e.target.value }))}
                >
                  <option value="">Seleccione la vía que aplica...</option>
                  {options.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </Select>

                {needsJustification && (
                  <Textarea
                    id="novelty-justification"
                    label="Justificación explícita"
                    hint={GLOSSARY.fa_justificacion_novedad}
                    required
                    rows={3}
                    placeholder="Explique por qué la tecnología sigue siendo novedosa pese al registro existente."
                    value={form.justification}
                    error={
                      justificationShort && form.justification
                        ? `Faltan ${20 - form.justification.trim().length} caracteres.`
                        : undefined
                    }
                    disabled={!canWrite || isClosed}
                    onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                  />
                )}

                <details className="eval-versions" style={{ marginBottom: 12 }}>
                  <summary>
                    <span className="term-label">
                      Concepto de la Sala Especializada del INVIMA (opcional)
                      <InfoTip text={GLOSSARY.fa_sala_especializada} label="Qué es la Sala Especializada" />
                    </span>
                  </summary>
                  <Textarea
                    id="novelty-sala-concept"
                    label="Resumen del concepto"
                    rows={2}
                    value={form.sala_concept}
                    disabled={!canWrite || isClosed}
                    onChange={(e) => setForm((f) => ({ ...f, sala_concept: e.target.value }))}
                  />
                  <Input
                    id="novelty-sala-ref"
                    label="Referencia del acta"
                    placeholder="Acta No. 12 de 2026 o enlace al PDF"
                    value={form.sala_ref}
                    disabled={!canWrite || isClosed}
                    onChange={(e) => setForm((f) => ({ ...f, sala_ref: e.target.value }))}
                  />
                </details>

                {detail.blocking_reason && !dirty && (
                  <div className="novelty-block">
                    <Icon name="alert" />
                    <span>{detail.blocking_reason}</span>
                  </div>
                )}

                {canWrite && !isClosed && (
                  <div className="merge-actions">
                    <HintButton
                      onClick={save}
                      loading={busy === "save"}
                      disabled={Boolean(saveBlock)}
                      disabledHint={saveBlock}
                      data-testid="novelty-save"
                    >
                      Guardar criterio
                    </HintButton>
                    <HintButton
                      variant="success"
                      onClick={qualify}
                      loading={busy === "qualify"}
                      disabled={Boolean(qualifyBlock)}
                      disabledHint={qualifyBlock}
                      hint={GLOSSARY.fa_marcar_apta}
                      data-testid="novelty-qualify"
                    >
                      Marcar apta para priorización
                    </HintButton>
                    <HintButton
                      variant="secondary"
                      onClick={() => {
                        setExclusion({ reason_code: "", note: "" });
                        setExcluding(true);
                      }}
                      hint={GLOSSARY.fa_excluir}
                      style={{ color: "#B91C1C" }}
                      data-testid="novelty-exclude"
                    >
                      Excluir con causa
                    </HintButton>
                  </div>
                )}
                {isClosed && (
                  <div className="fa-notice fa-notice--ok" style={{ marginTop: 12 }}>
                    Ciclo cerrado: la verificación queda congelada como evidencia.
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal
        open={excluding}
        onClose={() => setExcluding(false)}
        title="Excluir del ciclo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcluding(false)}>
              Cancelar
            </Button>
            <HintButton
              variant="danger"
              onClick={exclude}
              loading={busy === "exclude"}
              disabled={!exclusion.reason_code}
              disabledHint="Seleccione el motivo tipificado: es obligatorio."
              data-testid="novelty-exclude-confirm"
            >
              Excluir
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
          <strong>{detail?.technology_name?.slice(0, 140)}</strong> saldrá del ciclo. La causa es
          obligatoria y no editable una vez registrada; queda con fecha y evaluador en la bitácora.
        </p>
        <Select
          id="novelty-exclusion-reason"
          label="Motivo tipificado"
          required
          value={exclusion.reason_code}
          onChange={(e) => setExclusion({ ...exclusion, reason_code: e.target.value })}
        >
          <option value="">Seleccione un motivo...</option>
          {Object.entries(exclusionReasons || {}).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
        <Textarea
          id="novelty-exclusion-note"
          label="Observación"
          rows={3}
          value={exclusion.note}
          onChange={(e) => setExclusion({ ...exclusion, note: e.target.value })}
        />
      </Modal>
    </>
  );
}

function UniqueListTab({ focusId }) {
  const { cycleId } = useCycle();
  const toast = useToast();
  const { version } = useRealtime();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFromApi(
        api,
        `/screening/unique-list/${cycleId}/export`,
        `listado_unico_${(data.cycle_code || cycleId).toString().replace(/[^A-Za-z0-9_.-]+/g, "_")}.csv`
      );
      toast.success("Listado Único exportado en CSV.");
    } catch (e) {
      toast.error(apiError(e, "No se pudo exportar el Listado Único"));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    api
      .get(`/screening/unique-list/${cycleId}`)
      .then(({ data: d }) => setData(d))
      .catch((e) => toast.error(apiError(e, "No se pudo generar el Listado Único")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, version]);

  useEffect(() => {
    if (focusId && data) focusElement(`unique-row-${focusId}`);
  }, [focusId, data]);

  if (loading) return <LoadingBlock label="Consolidando el Listado Único..." />;
  if (!cycleId || !data)
    return (
      <EmptyState
        icon="🗓️"
        title="Sin ciclo activo"
        message="El Listado Único es la salida consolidada de un ciclo."
      />
    );

  return (
    <>
      <Card
        title={`Listado Único por clúster · ${data.cycle_code}`}
        hint="Salida consolidada del filtrado: el acervo depurado del ciclo, sin duplicados ni exclusiones."
        padding={18}
        style={{ marginBottom: 18 }}
        actions={
          <HintButton
            variant="secondary"
            onClick={exportCsv}
            loading={exporting}
            disabled={data.total === 0}
            disabledHint="El listado está vacío: no hay nada que exportar todavía."
            hint={GLOSSARY.fa_listado_csv}
            data-testid="unique-export"
          >
            <Icon name="save" size={16} /> Exportar CSV
          </HintButton>
        }
      >
        <ModuleStatsRow
          items={[
            { label: "En el listado", value: data.total, color: "#059669", hint: GLOSSARY.listado_unico },
            { label: "Excluidas", value: data.excluded_count, color: "#94A3B8", hint: GLOSSARY.fa_excluidas },
            {
              label: "Fusionadas",
              value: data.merged_count,
              color: "#6366F1",
              hint: "Registros absorbidos por fusiones confirmadas (en todo el sistema). No aparecen en el listado.",
            },
            { label: "Clústeres", value: data.clusters.length, hint: GLOSSARY.cluster },
          ]}
        />
      </Card>

      {data.clusters.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Listado vacío"
          message="Ninguna tecnología del ciclo ha superado el filtrado todavía. Marque aptas en la pestaña de novedad."
        />
      ) : (
        data.clusters.map((group) => (
          <Card
            key={group.cluster_code}
            title={`${group.cluster_name} (${group.count})`}
            padding={0}
            style={{ marginBottom: 16, overflow: "hidden" }}
          >
            <div style={{ overflowX: "auto" }}>
              <table className="unique-list">
                <thead>
                  <tr>
                    <th>DCI / comercial</th>
                    <th>Fabricante</th>
                    <th>Tipología</th>
                    <th>
                      <TermLabel tip="Código ATC: clasificación anatómica, terapéutica y química de la OMS para medicamentos.">ATC</TermLabel>
                    </th>
                    <th>Estado</th>
                    <th>
                      <TermLabel tip={GLOSSARY.pct_p}>%P</TermLabel>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={item.technology_id} data-testid={`unique-row-${item.technology_id}`}>
                      <td style={{ maxWidth: 460 }}>
                        <ClampText as="strong" text={item.inn_name || item.commercial_name} lines={2} expandable />
                        {item.inn_name && item.commercial_name && (
                          <ClampText className="muted-note" text={item.commercial_name} lines={2} />
                        )}
                      </td>
                      <td>{item.manufacturer || "—"}</td>
                      <td>{item.tech_type_name || "—"}</td>
                      <td>{item.atc_code || "—"}</td>
                      <td>{TECH_STATUS_LABELS[item.status] || item.status}</td>
                      <td>{item.priority_pct === null ? "—" : pct(item.priority_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </>
  );
}

export default function Screening() {
  const [tab, setTab] = useState("duplicados");
  const [focusId, setFocusId] = useState(null);
  const [linkNotice, setLinkNotice] = useState(null);
  const selfSelected = useRef(null);
  const { techId, invalidParam, setTechId } = useTechDeepLink();
  const [stats, setStats] = useState(null);
  const { cycleId, cycle, setCycleId } = useCycle();
  const { can } = useAuth();
  const { version } = useRealtime();
  const navigate = useNavigate();

  const canWrite = can(PERM.SCREENING_WRITE);
  const canSync = can(PERM.INVIMA_SYNC);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get("/screening/stats", {
        params: cycleId ? { cycle_id: cycleId } : {},
      });
      setStats(data);
    } catch {
      /* los indicadores no bloquean la pantalla */
    }
  }, [cycleId]);

  useEffect(() => {
    loadStats();
  }, [loadStats, version]);

  // Enlace directo ?tecnologia=<id>: abre la pestana que corresponde a su estado
  // (novedad si esta asignada, Listado Unico si ya supero el filtro).
  const toast = useToast();
  useEffect(() => {
    if (invalidParam) {
      setLinkNotice({ tone: "warn", message: "El enlace de tecnología no es válido.", actions: [] });
      return;
    }
    if (!techId || !cycleId) return;
    if (selfSelected.current === techId) return;
    let cancelled = false;
    (async () => {
      try {
        const loc = await locateTech(api, techId);
        if (cancelled) return;
        const res = resolveTechLink(loc, { cycleId, accepts: () => true });
        if (res.kind !== "ok") {
          setFocusId(null);
          setLinkNotice(buildTechNotice(res, { id: techId, page: "filtrado", cycle, setCycleId, navigate }));
          return;
        }
        const { entry } = res;
        if (entry.status === "asignada_a_ciclo") {
          setLinkNotice(null);
          setTab("novedad");
        } else {
          setTab("listado");
          if (entry.status === "excluida") {
            const merged = loc.merged_into_id
              ? [
                  {
                    label: `Ver la tecnología que la absorbió (#${loc.merged_into_id})`,
                    testId: "tech-link-merged",
                    onClick: () => navigate(`/filtrado?tecnologia=${loc.merged_into_id}`),
                  },
                ]
              : [];
            setLinkNotice({
              tone: "info",
              message: `La tecnología "${loc.name.slice(0, 90)}" fue excluida de ${entry.cycle_code}${
                entry.exclusion_reason ? ` (causa: ${entry.exclusion_reason})` : ""
              }${loc.merged_into_id ? ` al fusionarse con la #${loc.merged_into_id}` : ""}. No aparece en el Listado Único.`,
              actions: merged,
            });
          } else {
            setLinkNotice(null);
          }
        }
        setFocusId(techId);
      } catch (e) {
        toast.error(apiError(e, "No se pudo abrir la tecnología del enlace"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techId, cycleId, invalidParam]);

  const statItems = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Fusiones por revisar", value: stats.pending_merges, color: "#D97706", hint: GLOSSARY.fa_fusiones_revisar },
      { label: "Fusiones confirmadas", value: stats.confirmed_merges, color: "#6366F1", hint: GLOSSARY.fa_fusiones_confirmadas },
      { label: "Por filtrar", value: stats.assigned, color: "#3B82F6", hint: GLOSSARY.fa_por_filtrar },
      { label: "Aptas", value: stats.qualified, color: "#059669", hint: GLOSSARY.fa_aptas },
      { label: "Excluidas", value: stats.excluded, color: "#94A3B8", hint: GLOSSARY.fa_excluidas },
      {
        label: "Novedad verificada",
        value: stats.novelty_assessed,
        sub: `${stats.invima_checked} cruzadas con INVIMA`,
        hint: GLOSSARY.fa_novedad_verificada,
      },
    ];
  }, [stats]);

  return (
    <div>
      <PageHeader
        title="Filtrado y depuración"
        titleHint={GLOSSARY.filtrado}
        subtitle={`Módulo 2 de la especificación${cycle ? ` en ${cycle.code}` : ""}: desduplicación difusa, criterio de novedad con verificación regulatoria y Listado Único por clúster.`}
      />

      <PhaseGuide
        phase="Módulo 2"
        hint={GLOSSARY.filtrado}
        tasks={[
          "Ejecutar el barrido difuso y resolver los pares propuestos: fusionar o declarar que son distintas.",
          "Cruzar cada tecnología con el índice del INVIMA y registrar por qué vía es novedosa.",
          "Marcar como apta lo que supera el filtro; excluir con causa tipificada lo que no.",
          "Consolidar y exportar el Listado Único por clúster.",
        ]}
        nextLabel="Priorización P1 a P6"
        onNext={() => navigate("/priorizacion")}
      />

      {statItems.length > 0 && <ModuleStatsRow items={statItems} />}

      <TechLinkNotice notice={linkNotice} onClose={() => setLinkNotice(null)} />

      <div className="screening-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            title={t.hint}
            className={`screening-tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "duplicados" && <DuplicatesTab canWrite={canWrite} onChanged={loadStats} />}
      {tab === "novedad" && (
        <NoveltyTab
          focusId={focusId}
          onSelect={(id) => {
            selfSelected.current = id;
            setLinkNotice(null);
            setTechId(id);
          }}
          canWrite={canWrite}
          canSync={canSync}
          onChanged={loadStats}
          exclusionReasons={stats?.exclusion_reasons}
        />
      )}
      {tab === "listado" && <UniqueListTab focusId={focusId} />}
    </div>
  );
}
