import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import PriorityMatrix from "../components/PriorityMatrix";
import { PERM, TECH_STATUS_LABELS } from "../constants/methodology";

/**
 * Fase 2 de la metodologia dentro de un ciclo: filtrado y calificacion con la
 * matriz oficial P1 a P6. Sustituye la heuristica continua como motor de
 * priorizacion; el puntaje de cribado solo ordena la cola.
 */
export default function Prioritization() {
  const [queue, setQueue] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [excluding, setExcluding] = useState(null);
  const [exclusionReasons, setExclusionReasons] = useState({});
  const [exclusionForm, setExclusionForm] = useState({ reason_code: "", note: "" });
  const [saving, setSaving] = useState(false);

  const { cycle, cycleId, isClosed } = useCycle();
  const { can, rateableCriteria } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const canScreen = can(PERM.SCREENING_WRITE);
  const canEvaluate = can(PERM.TECHNOLOGY_WRITE);

  const load = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      return;
    }
    try {
      const [q, s] = await Promise.all([
        api.get(`/priority/${cycleId}/queue`, { params: { only_pending: onlyMine } }),
        api.get(`/priority/${cycleId}/stats`),
      ]);
      setQueue(q.data);
      setStats(s.data);
      setActiveId((current) =>
        current && q.data.some((i) => i.technology_id === current)
          ? current
          : q.data[0]?.technology_id || null
      );
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la cola de priorizacion"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, onlyMine]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    api
      .get("/methodology/enums")
      .then(({ data }) => setExclusionReasons(data.exclusion_reasons || {}))
      .catch(() => {});
  }, []);

  const active = useMemo(
    () => queue.find((i) => i.technology_id === activeId) || null,
    [queue, activeId]
  );

  const submitExclusion = async () => {
    setSaving(true);
    try {
      await api.post(
        `/technologies/${excluding.technology_id}/cycles/${cycleId}/exclude`,
        exclusionForm
      );
      toast.success("Tecnologia excluida con causa registrada.");
      setExcluding(null);
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo excluir"));
    } finally {
      setSaving(false);
    }
  };

  const sendToEvaluation = async (item) => {
    try {
      await api.post(`/technologies/${item.technology_id}/cycles/${cycleId}/to-evaluation`);
      toast.success("Pasa a evaluacion temprana.");
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo enviar a evaluacion"));
    }
  };

  if (loading) return <LoadingBlock label="Cargando priorizacion..." />;

  if (!cycleId) {
    return (
      <div>
        <PageHeader
          title="Priorizacion"
          subtitle="La priorizacion ocurre siempre dentro de un ciclo operativo."
        />
        <Card>
          <EmptyState
            icon="🗓️"
            title="Seleccione un ciclo"
            message="La matriz P1 a P6 califica tecnologias asignadas a un ciclo. Cree o seleccione uno para comenzar."
            action={<Button onClick={() => navigate("/ciclos")}>Ir a ciclos</Button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Priorizacion"
        subtitle={`Matriz oficial de seis criterios binarios en ${cycle?.code}. El indice %P solo se calcula cuando los seis criterios estan validados por los perfiles habilitados.`}
        actions={
          <Button variant={onlyMine ? "primary" : "secondary"} onClick={() => setOnlyMine((v) => !v)}>
            <Icon name="filter" size={16} />
            {onlyMine ? "Viendo lo mio" : "Solo lo que me toca"}
          </Button>
        }
      />

      <PhaseGuide
        phase="Fase 2 · Priorizacion"
        tasks={[
          `Su perfil califica: ${rateableCriteria.length ? rateableCriteria.join(", ") : "ningun criterio"}.`,
          "Excluya con causa tipificada lo que no cumple el criterio de novedad.",
          "El estado se asigna solo (priorizada, bajo vigilancia o no priorizada) al completar los seis criterios.",
        ]}
        nextLabel="Caracterizacion"
        onNext={() => navigate("/caracterizacion")}
      />

      {stats && (
        <ModuleStatsRow
          items={[
            { label: "En cola", value: stats.rateable },
            { label: "Pendientes", value: stats.pending, color: stats.pending ? "#D97706" : undefined },
            { label: "Priorizadas", value: stats.prioritized, color: "#059669" },
            { label: "Bajo vigilancia", value: stats.watchlist, color: "#D97706" },
            { label: "No priorizadas", value: stats.not_prioritized },
          ]}
        />
      )}

      {isClosed && (
        <Card style={{ marginBottom: 18, background: "#F0FDF4", borderColor: "#BBF7D0" }} padding={14}>
          <div style={{ fontSize: 14, color: "#065F46" }}>
            <strong>Ciclo cerrado.</strong> Los puntajes estan congelados y la matriz es de solo
            lectura. Una reevaluacion se hace en un ciclo posterior.
          </div>
        </Card>
      )}

      {queue.length === 0 ? (
        <Card>
          <EmptyState
            icon="🧮"
            title={onlyMine ? "Nada pendiente para su perfil" : "No hay tecnologias en la cola"}
            message={
              onlyMine
                ? "Todas las tecnologias del ciclo ya tienen sus criterios calificados por usted."
                : "Asigne senales al ciclo desde la bandeja de entrada y marquelas como aptas para priorizacion."
            }
            action={<Button onClick={() => navigate("/bandeja-entrada")}>Ir a la bandeja</Button>}
          />
        </Card>
      ) : (
        <div className="prio-layout">
          <Card padding={0} style={{ overflow: "hidden" }}>
            <div className="prio-list-head">
              Cola del ciclo · {queue.length} tecnologia(s)
            </div>
            <div className="prio-list">
              {queue.map((item) => (
                <button
                  key={item.technology_id}
                  type="button"
                  className={`prio-item ${item.technology_id === activeId ? "prio-item-active" : ""}`}
                  onClick={() => setActiveId(item.technology_id)}
                >
                  <div className="prio-item-name">{item.name}</div>
                  <div className="prio-item-meta">
                    {item.cluster_name || "Sin cluster"} · {item.tech_type_name || "Sin tipologia"}
                  </div>
                  <div className="prio-item-foot">
                    <Badge tone={item.status}>{TECH_STATUS_LABELS[item.status]}</Badge>
                    {item.priority_pct != null ? (
                      <span className="prio-item-pct">{item.priority_pct}%</span>
                    ) : (
                      <span className="prio-item-progress">
                        {item.rated}/{item.total_criteria}
                      </span>
                    )}
                    {item.pending_for_me && <span className="prio-item-flag">Le toca</span>}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <div>
            {active ? (
              <Card>
                <div className="prio-detail-head">
                  <div>
                    <h2 className="prio-detail-title">{active.name}</h2>
                    <div className="prio-detail-meta">
                      {active.cluster_name || "Sin cluster"} ·{" "}
                      {active.tech_type_name || "Sin tipologia"}
                      {active.condition ? ` · ${active.condition}` : ""} · Cribado{" "}
                      {active.screening_score}
                    </div>
                  </div>
                  <div className="prio-detail-actions">
                    {canScreen && !isClosed && active.status !== "excluida" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setExcluding(active);
                          setExclusionForm({ reason_code: "", note: "" });
                        }}
                      >
                        Excluir
                      </Button>
                    )}
                    {canEvaluate && !isClosed && active.status === "priorizada" && (
                      <Button size="sm" onClick={() => sendToEvaluation(active)}>
                        Pasar a evaluacion
                      </Button>
                    )}
                  </div>
                </div>

                <PriorityMatrix
                  cycleId={cycleId}
                  technologyId={active.technology_id}
                  onChange={load}
                />
              </Card>
            ) : (
              <Card>
                <EmptyState title="Seleccione una tecnologia" message="Elija un elemento de la cola para calificar sus criterios." />
              </Card>
            )}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(excluding)}
        onClose={() => setExcluding(null)}
        title="Excluir del ciclo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcluding(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={submitExclusion}
              loading={saving}
              disabled={!exclusionForm.reason_code}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
          La causa de exclusion es obligatoria y no editable una vez registrada. Queda con
          marca de tiempo y evaluador en la bitacora inmutable.
        </p>
        <Select
          label="Motivo tipificado"
          required
          value={exclusionForm.reason_code}
          onChange={(e) => setExclusionForm({ ...exclusionForm, reason_code: e.target.value })}
        >
          <option value="">Seleccione un motivo...</option>
          {Object.entries(exclusionReasons).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
        <Textarea
          label="Observacion"
          rows={3}
          value={exclusionForm.note}
          onChange={(e) => setExclusionForm({ ...exclusionForm, note: e.target.value })}
        />
      </Modal>
    </div>
  );
}
