import { useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import { Input, Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import { CYCLE_STATUS_LABELS, PERM } from "../constants/methodology";

const FUNNEL = [
  { key: "assigned", label: "Asignadas" },
  { key: "filtered", label: "Filtradas" },
  { key: "prioritized", label: "Priorizadas" },
  { key: "watchlist", label: "Bajo vigilancia" },
  { key: "in_evaluation", label: "En evaluacion" },
  { key: "published", label: "Publicadas" },
];

function addWeeks(dateStr, weeks) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function weeksBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round(((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24 * 7)) * 10) / 10;
}

function CycleFunnel({ summary }) {
  const max = Math.max(1, ...FUNNEL.map((f) => summary?.[f.key] || 0));
  return (
    <div className="cycle-funnel">
      {FUNNEL.map((f) => {
        const value = summary?.[f.key] || 0;
        return (
          <div key={f.key} className="cycle-funnel-item">
            <div className="cycle-funnel-meta">
              <span>{f.label}</span>
              <strong>{value}</strong>
            </div>
            <div className="cycle-funnel-track">
              <div className="cycle-funnel-bar" style={{ width: `${(value / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CycleCard({ cycle, isSelected, onSelect, onTransition, onCarryOver, canWrite, canClose }) {
  const weeks = weeksBetween(cycle.opened_on, cycle.bulletin_due_on || cycle.data_cutoff_on);

  return (
    <Card style={isSelected ? { borderColor: "#6366F1", boxShadow: "0 0 0 3px #EEF2FF" } : undefined}>
      <div className="cycle-card-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{cycle.code}</h3>
            <Badge tone={cycle.status}>
              {cycle.status_label || CYCLE_STATUS_LABELS[cycle.status] || cycle.status}
            </Badge>
            {cycle.is_historic && <Badge tone="historico">Historico</Badge>}
            {isSelected && <Badge tone="info">Ciclo en pantalla</Badge>}
          </div>
          <p className="cycle-card-dates">
            Apertura {cycle.opened_on} · Corte {cycle.data_cutoff_on}
            {cycle.bulletin_due_on ? ` · Boletin ${cycle.bulletin_due_on}` : ""} · Ventana {weeks} semanas
          </p>
        </div>
        {!isSelected && (
          <Button variant="outline" size="sm" onClick={() => onSelect(cycle.id)}>
            Trabajar aqui
          </Button>
        )}
      </div>

      <CycleFunnel summary={cycle.summary} />

      {cycle.notes && <p className="cycle-card-notes">{cycle.notes}</p>}

      {canWrite && !cycle.is_historic && (
        <div className="cycle-card-actions">
          {(cycle.allowed_transitions || []).map((target) => {
            const isClose = target === "cerrado_consolidado";
            if (isClose && !canClose) return null;
            return (
              <Button
                key={target}
                variant={isClose ? "primary" : "secondary"}
                size="sm"
                onClick={() => onTransition(cycle, target)}
              >
                {isClose ? "Cerrar y consolidar" : `Pasar a: ${CYCLE_STATUS_LABELS[target]}`}
              </Button>
            );
          })}
          {cycle.status === "cerrado_consolidado" && (cycle.summary?.watchlist || 0) > 0 && (
            <Button variant="outline" size="sm" onClick={() => onCarryOver(cycle)}>
              <Icon name="layers" size={15} /> Arrastrar {cycle.summary.watchlist} bajo vigilancia
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Cycles() {
  const { cycles, cycleId, setCycleId, reload, loading } = useCycle();
  const { can } = useAuth();
  const toast = useToast();

  const canWrite = can(PERM.CYCLE_WRITE);
  const canClose = can(PERM.CYCLE_CLOSE);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeCheck, setCloseCheck] = useState(null);
  const [justification, setJustification] = useState("");
  const [carrySource, setCarrySource] = useState(null);
  const [carryTarget, setCarryTarget] = useState("");

  const openCycles = useMemo(
    () => cycles.filter((c) => !c.is_historic && c.status !== "cerrado_consolidado"),
    [cycles]
  );

  const startCreate = () => {
    const today = new Date().toISOString().slice(0, 10);
    const year = new Date().getFullYear();
    const formalCount = cycles.filter((c) => !c.is_historic && c.year === year).length;
    const roman = ["I", "II", "III", "IV"][formalCount] || String(formalCount + 1);
    setForm({
      code: `Ciclo ${roman} - ${year}`,
      opened_on: today,
      data_cutoff_on: addWeeks(today, 8),
      bulletin_due_on: addWeeks(today, 12),
      notes: "",
    });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/cycles", form);
      toast.success(`Ciclo ${data.code} creado.`);
      setCreateOpen(false);
      setCycleId(data.id);
      await reload();
    } catch (e) {
      toast.error(apiError(e, "No se pudo crear el ciclo"));
    } finally {
      setSaving(false);
    }
  };

  const handleTransition = async (cycle, target) => {
    if (target === "cerrado_consolidado") {
      try {
        const { data } = await api.get(`/cycles/${cycle.id}/close-check`);
        setCloseCheck(data);
        setCloseTarget(cycle);
        setJustification("");
      } catch (e) {
        toast.error(apiError(e, "No se pudo verificar el cierre"));
      }
      return;
    }
    try {
      await api.put(`/cycles/${cycle.id}/status`, { status: target, justification: "" });
      toast.success(`${cycle.code}: ${CYCLE_STATUS_LABELS[target]}.`);
      await reload();
    } catch (e) {
      toast.error(apiError(e, "No se pudo cambiar el estado"));
    }
  };

  const confirmClose = async () => {
    setSaving(true);
    try {
      await api.put(`/cycles/${closeTarget.id}/status`, {
        status: "cerrado_consolidado",
        justification,
      });
      toast.success(`${closeTarget.code} cerrado. Puntajes congelados.`);
      setCloseTarget(null);
      await reload();
    } catch (e) {
      toast.error(apiError(e, "No se pudo cerrar el ciclo"));
    } finally {
      setSaving(false);
    }
  };

  const confirmCarryOver = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/cycles/${carrySource.id}/carry-over`, {
        target_cycle_id: Number(carryTarget),
      });
      toast.success(data.message);
      setCarrySource(null);
      await reload();
    } catch (e) {
      toast.error(apiError(e, "No se pudo arrastrar el monitoreo activo"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando ciclos..." />;

  const currentWindow = form
    ? weeksBetween(form.opened_on, form.bulletin_due_on || form.data_cutoff_on)
    : 0;

  return (
    <div>
      <PageHeader
        title="Ciclos de escaneo"
        subtitle="Eje de la metodologia. Maximo tres ciclos formales por ano y ventana operativa de 10 a 16 semanas. Al cerrar, los puntajes quedan congelados y las tecnologias bajo vigilancia se proponen para el ciclo siguiente."
        actions={
          canWrite && (
            <Button onClick={startCreate}>
              <Icon name="plus" size={17} /> Nuevo ciclo
            </Button>
          )
        }
      />

      {cycles.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗓️"
            title="Todavia no hay ciclos"
            message="El ciclo operativo ordena la priorizacion, la caracterizacion y la diseminacion. Cree el primero para habilitar el flujo metodologico completo."
            action={canWrite && <Button onClick={startCreate}>Crear el primer ciclo</Button>}
          />
        </Card>
      ) : (
        <div className="cycle-grid">
          {cycles.map((c) => (
            <CycleCard
              key={c.id}
              cycle={c}
              isSelected={c.id === cycleId}
              onSelect={setCycleId}
              onTransition={handleTransition}
              onCarryOver={(cy) => {
                setCarrySource(cy);
                setCarryTarget(openCycles[0]?.id ? String(openCycles[0].id) : "");
              }}
              canWrite={canWrite}
              canClose={canClose}
            />
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo ciclo de escaneo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} loading={saving} disabled={!form?.code?.trim()}>
              Crear ciclo
            </Button>
          </>
        }
      >
        {form && (
          <>
            <Input
              label="Codigo del ciclo"
              required
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="Fecha de apertura"
              type="date"
              value={form.opened_on}
              onChange={(e) => setForm({ ...form, opened_on: e.target.value })}
            />
            <Input
              label="Corte de datos"
              type="date"
              value={form.data_cutoff_on}
              onChange={(e) => setForm({ ...form, data_cutoff_on: e.target.value })}
            />
            <Input
              label="Fecha proyectada de boletin"
              type="date"
              value={form.bulletin_due_on || ""}
              onChange={(e) => setForm({ ...form, bulletin_due_on: e.target.value || null })}
            />
            <div
              style={{
                fontSize: 13,
                marginBottom: 14,
                color: currentWindow >= 10 && currentWindow <= 16 ? "#065F46" : "#B45309",
                fontWeight: 600,
              }}
            >
              Ventana operativa: {currentWindow} semanas
              {currentWindow >= 10 && currentWindow <= 16
                ? " (dentro del rango metodologico)"
                : " — el sistema exige entre 10 y 16 semanas"}
            </div>
            <Textarea
              label="Notas"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(closeTarget)}
        onClose={() => setCloseTarget(null)}
        title={`Cerrar ${closeTarget?.code || ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmClose}
              loading={saving}
              disabled={closeCheck && !closeCheck.can_close && !justification.trim()}
            >
              Cerrar y consolidar
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
          Al cerrar, todos los puntajes del ciclo quedan congelados. Una reevaluacion posterior
          crea registros nuevos y nunca modifica los actuales.
        </p>
        {closeCheck && !closeCheck.can_close && (
          <>
            <div
              style={{
                background: "#FEF3C7",
                border: "1px solid #FDE68A",
                borderRadius: 8,
                padding: 12,
                marginBottom: 14,
                fontSize: 13,
                color: "#92400E",
              }}
            >
              <strong>{closeCheck.message}</strong>
              <div style={{ marginTop: 4 }}>
                Publique el informe correspondiente o registre la justificacion de cierre. La
                justificacion queda en la bitacora inmutable.
              </div>
            </div>
            <Textarea
              label="Justificacion de cierre"
              required
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Motivo por el cual el ciclo se cierra con tecnologias en evaluacion"
            />
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(carrySource)}
        onClose={() => setCarrySource(null)}
        title="Arrastrar monitoreo activo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCarrySource(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmCarryOver} loading={saving} disabled={!carryTarget}>
              Arrastrar
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
          Las tecnologias bajo vigilancia se proponen en el ciclo destino con su calificacion
          previa visible como referencia. Los registros del ciclo cerrado no se modifican.
        </p>
        {openCycles.length ? (
          <Select
            label="Ciclo destino"
            value={carryTarget}
            onChange={(e) => setCarryTarget(e.target.value)}
          >
            {openCycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        ) : (
          <div style={{ fontSize: 13, color: "#B45309" }}>
            No hay ciclos abiertos. Cree un ciclo destino antes de arrastrar el monitoreo activo.
          </div>
        )}
      </Modal>
    </div>
  );
}
