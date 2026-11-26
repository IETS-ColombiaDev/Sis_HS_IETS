import { useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import Tooltip from "../components/Tooltip";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { Input, Select, Textarea } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import { CYCLE_STATUS_LABELS, PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import { t, tr, ts } from "../i18n";

const FUNNEL = [
  { key: "assigned", label: t("Asignadas"), hint: GLOSSARY.fa_embudo_asignadas },
  { key: "filtered", label: t("Filtradas"), hint: GLOSSARY.fa_embudo_filtradas },
  { key: "prioritized", label: t("Priorizadas"), hint: GLOSSARY.fa_embudo_priorizadas },
  { key: "watchlist", label: t("Bajo vigilancia"), hint: GLOSSARY.fa_embudo_vigilancia },
  { key: "in_evaluation", label: t("En evaluación"), hint: GLOSSARY.fa_embudo_evaluacion },
  { key: "published", label: t("Publicadas"), hint: GLOSSARY.fa_embudo_publicadas },
];

// Orden de la maquina de estados: sirve para distinguir avanzar de retroceder.
const STATUS_ORDER = [
  "en_configuracion",
  "en_filtrado",
  "en_priorizacion",
  "en_evaluacion",
  "cerrado_consolidado",
];

const STATUS_HINT = {
  en_configuracion: GLOSSARY.fa_ciclo_en_configuracion,
  en_filtrado: GLOSSARY.fa_ciclo_en_filtrado,
  en_priorizacion: GLOSSARY.fa_ciclo_en_priorizacion,
  en_evaluacion: GLOSSARY.fa_ciclo_en_evaluacion,
  cerrado_consolidado: GLOSSARY.fa_ciclo_cerrado_consolidado,
};

function addWeeks(dateStr, weeks) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function weeksBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round(((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24 * 7)) * 10) / 10;
}

function paramValue(params, key, fallback) {
  const row = params.find((p) => p.key === key);
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
              <span className="term-label">
                {f.label}
                <InfoTip text={f.hint} label={t("Qué cuenta {label}", { label: f.label })} />
              </span>
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

function CycleCard({
  cycle,
  isSelected,
  onSelect,
  onTransition,
  onCarryOver,
  onEdit,
  onDelete,
  canWrite,
  canClose,
}) {
  const closing = cycle.bulletin_due_on || cycle.data_cutoff_on;
  const weeks = weeksBetween(cycle.opened_on, closing);
  const isClosed = cycle.status === "cerrado_consolidado";
  const currentIdx = STATUS_ORDER.indexOf(cycle.status);
  const hasWork = (cycle.summary?.total || 0) > 0;

  return (
    <Card
      style={isSelected ? { borderColor: "#2563EB", boxShadow: "0 0 0 3px #EFF6FF" } : undefined}
    >
      <div className="cycle-card-head" data-testid={`cycle-card-${cycle.id}`}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{cycle.code}</h3>
            <Tooltip text={STATUS_HINT[cycle.status]}>
              <Badge tone={cycle.status}>
                {ts(cycle.status_label) || CYCLE_STATUS_LABELS[cycle.status] || cycle.status}
              </Badge>
            </Tooltip>
            {cycle.is_historic && <Badge tone="historico">{t("Histórico")}</Badge>}
            {isSelected && <Badge tone="info">{t("Ciclo en pantalla")}</Badge>}
          </div>
          <p className="cycle-card-dates">
            {cycle.bulletin_due_on
              ? t("Apertura {apertura} · Corte {corte} · Boletín {boletin}", {
                  apertura: cycle.opened_on,
                  corte: cycle.data_cutoff_on,
                  boletin: cycle.bulletin_due_on,
                })
              : t("Apertura {apertura} · Corte {corte}", { apertura: cycle.opened_on, corte: cycle.data_cutoff_on })} ·{" "}
            <span className="term-label">
              {t("Ventana {n} semanas", { n: weeks })}
              <InfoTip text={GLOSSARY.fa_ventana} label={t("Qué es la ventana operativa")} />
            </span>
          </p>
        </div>
        {!isSelected && (
          <Tooltip text={t("Todas las pantallas del flujo (bandeja, filtrado, priorización, evaluación) pasan a trabajar sobre este ciclo.")}>
            <Button variant="outline" size="sm" onClick={() => onSelect(cycle.id)}>
              {t("Trabajar aquí")}
            </Button>
          </Tooltip>
        )}
      </div>

      <CycleFunnel summary={cycle.summary} />

      {cycle.notes && <p className="cycle-card-notes">{cycle.notes}</p>}

      {canWrite && !cycle.is_historic && (
        <div className="cycle-card-actions">
          {(cycle.allowed_transitions || []).map((target) => {
            const isClose = target === "cerrado_consolidado";
            const backwards = STATUS_ORDER.indexOf(target) < currentIdx;
            if (isClose && !canClose) {
              return (
                <HintButton
                  key={target}
                  size="sm"
                  variant="secondary"
                  disabled
                  disabledHint={t("Solo el superadministrador cierra y consolida un ciclo.")}
                >
                  {t("Cerrar y consolidar")}
                </HintButton>
              );
            }
            return (
              <HintButton
                key={target}
                variant={isClose ? "primary" : "secondary"}
                size="sm"
                hint={
                  isClose
                    ? GLOSSARY.fa_cerrar
                    : `${
                        backwards
                          ? t("Retrocede a '{estado}'.", { estado: CYCLE_STATUS_LABELS[target] })
                          : t("Avanza a '{estado}'.", { estado: CYCLE_STATUS_LABELS[target] })
                      } ${STATUS_HINT[target] || ""}`
                }
                onClick={() => onTransition(cycle, target)}
              >
                {isClose
                  ? t("Cerrar y consolidar")
                  : backwards
                  ? t("Devolver a: {estado}", { estado: CYCLE_STATUS_LABELS[target] })
                  : t("Pasar a: {estado}", { estado: CYCLE_STATUS_LABELS[target] })}
              </HintButton>
            );
          })}
          {!isClosed && (
            <HintButton variant="ghost" size="sm" hint={t("Corrija código, fechas o notas del ciclo.")} onClick={() => onEdit(cycle)}>
              <Icon name="edit" size={14} /> {t("Editar")}
            </HintButton>
          )}
          {cycle.status === "en_configuracion" && (
            <HintButton
              variant="ghost"
              size="sm"
              style={{ color: "#DC2626" }}
              disabled={hasWork}
              hint={GLOSSARY.fa_eliminar_ciclo}
              disabledHint={t("Tiene tecnologías asignadas: ya no se elimina. Edite sus datos o aváncelo.")}
              onClick={() => onDelete(cycle)}
            >
              <Icon name="trash" size={14} /> {t("Eliminar")}
            </HintButton>
          )}
          {isClosed && (cycle.summary?.watchlist || 0) > 0 && (
            <HintButton variant="outline" size="sm" hint={GLOSSARY.fa_arrastre} onClick={() => onCarryOver(cycle)}>
              <Icon name="layers" size={15} /> {t("Arrastrar {n} bajo vigilancia", { n: cycle.summary.watchlist })}
            </HintButton>
          )}
        </div>
      )}
    </Card>
  );
}

function emptyForm(cycles) {
  const today = new Date().toISOString().slice(0, 10);
  const year = new Date().getFullYear();
  const formalCount = cycles.filter((c) => !c.is_historic && c.year === year).length;
  const roman = ["I", "II", "III", "IV", "V"][formalCount] || String(formalCount + 1);
  return {
    id: null,
    code: `Ciclo ${roman} - ${year}`,
    opened_on: today,
    data_cutoff_on: addWeeks(today, 10),
    bulletin_due_on: addWeeks(today, 12),
    notes: "",
  };
}

export default function Cycles() {
  const { cycles, cycleId, setCycleId, reload, loading } = useCycle();
  const { can } = useAuth();
  const toast = useToast();

  const canWrite = can(PERM.CYCLE_WRITE);
  const canClose = can(PERM.CYCLE_CLOSE);

  const [params, setParams] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeCheck, setCloseCheck] = useState(null);
  const [justification, setJustification] = useState("");
  const [carrySource, setCarrySource] = useState(null);
  const [carryTarget, setCarryTarget] = useState("");
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    api
      .get("/methodology/params")
      .then(({ data }) => setParams(Array.isArray(data) ? data : []))
      .catch(() => setParams([]));
  }, []);

  const wmin = paramValue(params, "cycle.window_weeks_min", 10);
  const wmax = paramValue(params, "cycle.window_weeks_max", 16);
  const quota = paramValue(params, "cycle.max_per_year", 3);

  const openCycles = useMemo(
    () => cycles.filter((c) => !c.is_historic && c.status !== "cerrado_consolidado"),
    [cycles]
  );

  const startCreate = () => {
    setForm(emptyForm(cycles));
    setFormOpen(true);
  };

  const startEdit = (cycle) => {
    setForm({
      id: cycle.id,
      code: cycle.code,
      opened_on: cycle.opened_on,
      data_cutoff_on: cycle.data_cutoff_on,
      bulletin_due_on: cycle.bulletin_due_on || "",
      notes: cycle.notes || "",
    });
    setFormOpen(true);
  };

  // Validacion en vivo: la misma que aplica el backend, para no descubrirla por un rechazo.
  const formCheck = useMemo(() => {
    if (!form) return { errors: {}, window: 0, yearCount: 0, year: null };
    const errors = {};
    if (!form.code?.trim()) errors.code = t("El código es obligatorio.");
    else if (cycles.some((c) => c.code.trim() === form.code.trim() && c.id !== form.id))
      errors.code = t("Ya existe un ciclo con este código.");
    if (!form.opened_on) errors.opened_on = t("Indique la fecha de apertura.");
    if (!form.data_cutoff_on) errors.data_cutoff_on = t("Indique el corte de datos.");
    else if (form.opened_on && form.data_cutoff_on <= form.opened_on)
      errors.data_cutoff_on = t("El corte debe ser posterior a la apertura.");
    if (form.bulletin_due_on && form.data_cutoff_on && form.bulletin_due_on < form.data_cutoff_on)
      errors.bulletin_due_on = t("El boletín no puede ser anterior al corte de datos.");
    const window = weeksBetween(form.opened_on, form.bulletin_due_on || form.data_cutoff_on);
    if (form.opened_on && form.data_cutoff_on && (window < wmin || window > wmax))
      errors.window = t("La ventana es de {n} semanas y debe estar entre {min} y {max}.", { n: window, min: wmin, max: wmax });
    const year = form.opened_on ? Number(form.opened_on.slice(0, 4)) : null;
    const yearCount = cycles.filter((c) => !c.is_historic && c.year === year && c.id !== form.id).length;
    if (year && yearCount >= quota)
      errors.quota = t("El año {year} ya tiene {n} ciclos formales (máximo {max}). Use otro año o cierre uno existente.", {
        year,
        n: yearCount,
        max: quota,
      });
    return { errors, window, yearCount, year };
  }, [form, cycles, wmin, wmax, quota]);

  const firstError = Object.values(formCheck.errors)[0];

  const submitForm = async () => {
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      opened_on: form.opened_on,
      data_cutoff_on: form.data_cutoff_on,
      bulletin_due_on: form.bulletin_due_on || null,
      notes: form.notes || "",
    };
    try {
      if (form.id) {
        const { data } = await api.put(`/cycles/${form.id}`, payload);
        toast.success(t("Ciclo {code} actualizado.", { code: data.code }));
      } else {
        const { data } = await api.post("/cycles", payload);
        toast.success(t("Ciclo {code} creado.", { code: data.code }));
        setCycleId(data.id);
      }
      setFormOpen(false);
      await reload();
    } catch (e) {
      toast.error(apiError(e, form.id ? t("No se pudo actualizar el ciclo") : t("No se pudo crear el ciclo")));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      await api.delete(`/cycles/${deleting.id}`);
      toast.success(t("Ciclo {code} eliminado.", { code: deleting.code }));
      setDeleting(null);
      await reload();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar el ciclo")));
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
        toast.error(apiError(e, t("No se pudo verificar el cierre")));
      }
      return;
    }
    try {
      await api.put(`/cycles/${cycle.id}/status`, { status: target, justification: "" });
      toast.success(`${cycle.code}: ${CYCLE_STATUS_LABELS[target]}.`);
      await reload();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cambiar el estado")));
    }
  };

  const confirmClose = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/cycles/${closeTarget.id}/status`, {
        status: "cerrado_consolidado",
        justification,
      });
      toast.success(t("{code} cerrado. Puntajes congelados y boletín compilado.", { code: closeTarget.code }));
      setCloseTarget(null);
      await reload();
      if ((data.summary?.watchlist || 0) > 0) {
        toast.info(
          t('{n} tecnología(s) quedaron bajo vigilancia. Use "Arrastrar" en la tarjeta del ciclo para proponerlas en un ciclo abierto.', {
            n: data.summary.watchlist,
          })
        );
      }
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cerrar el ciclo")));
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
      if (data.carried > 0) toast.success(ts(data.message));
      else toast.info(t("No había tecnologías nuevas por arrastrar: ya estaban en el ciclo destino."));
      setCarrySource(null);
      await reload();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo arrastrar el monitoreo activo")));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label={t("Cargando ciclos...")} />;

  const windowOk = !formCheck.errors.window;

  return (
    <div>
      <PageHeader
        title={t("Ciclos de escaneo")}
        titleHint={GLOSSARY.ciclo}
        subtitle={t(
          "Eje de la metodología. Máximo {max} ciclos formales por año, con ventana de {wmin} a {wmax} semanas. Al cerrar, los puntajes quedan congelados y las tecnologías bajo vigilancia se pueden arrastrar al ciclo siguiente.",
          { max: quota, wmin, wmax }
        )}
        actions={
          canWrite && (
            <Button onClick={startCreate} data-testid="cycle-new">
              <Icon name="plus" size={17} /> {t("Nuevo ciclo")}
            </Button>
          )
        }
      />

      {cycles.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗓️"
            title={t("Todavía no hay ciclos")}
            message={t("El ciclo operativo ordena el filtrado, la priorización, la evaluación y la diseminación. Cree el primero para habilitar el flujo metodológico completo.")}
            action={canWrite && <Button onClick={startCreate}>{t("Crear el primer ciclo")}</Button>}
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
              onEdit={startEdit}
              onDelete={setDeleting}
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form?.id ? t("Editar {name}", { name: form.code }) : t("Nuevo ciclo de escaneo")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              onClick={submitForm}
              loading={saving}
              disabled={Boolean(firstError)}
              disabledHint={firstError}
              data-testid="cycle-submit"
            >
              {form?.id ? t("Guardar cambios") : t("Crear ciclo")}
            </HintButton>
          </>
        }
      >
        {form && (
          <>
            <Input
              id="cycle-code"
              label={t("Código del ciclo")}
              hint={GLOSSARY.fa_codigo_ciclo}
              required
              value={form.code}
              error={formCheck.errors.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              id="cycle-opened"
              label={t("Fecha de apertura")}
              hint={GLOSSARY.fa_apertura}
              type="date"
              required
              value={form.opened_on}
              error={formCheck.errors.opened_on}
              onChange={(e) => setForm({ ...form, opened_on: e.target.value })}
            />
            <Input
              id="cycle-cutoff"
              label={t("Corte de datos")}
              hint={GLOSSARY.corte_datos}
              type="date"
              required
              value={form.data_cutoff_on}
              error={formCheck.errors.data_cutoff_on}
              onChange={(e) => setForm({ ...form, data_cutoff_on: e.target.value })}
            />
            <Input
              id="cycle-bulletin"
              label={t("Fecha proyectada de boletín")}
              hint={GLOSSARY.boletin}
              type="date"
              value={form.bulletin_due_on || ""}
              error={formCheck.errors.bulletin_due_on}
              onChange={(e) => setForm({ ...form, bulletin_due_on: e.target.value || "" })}
            />
            <div
              data-testid="cycle-window"
              style={{
                fontSize: 13,
                marginBottom: 8,
                color: windowOk ? "#065F46" : "#B45309",
                fontWeight: 600,
              }}
            >
              <span className="term-label">
                {t("Ventana operativa: {n} semanas", { n: formCheck.window })}
                <InfoTip text={GLOSSARY.fa_ventana} label={t("Qué es la ventana operativa")} />
              </span>
              {windowOk
                ? " " + t("(dentro del rango metodológico)")
                : " - " + t("el sistema exige entre {min} y {max} semanas", { min: wmin, max: wmax })}
            </div>
            {formCheck.year && (
              <div
                data-testid="cycle-quota"
                style={{
                  fontSize: 13,
                  marginBottom: 14,
                  color: formCheck.errors.quota ? "#B91C1C" : "#475569",
                }}
              >
                <span className="term-label">
                  {t("Ciclos formales en {year}: {n} de {max}", { year: formCheck.year, n: formCheck.yearCount, max: quota })}
                  <InfoTip text={GLOSSARY.fa_cuota} label={t("Qué es la cuota anual")} />
                </span>
                {formCheck.errors.quota ? ` - ${formCheck.errors.quota}` : ""}
              </div>
            )}
            <Textarea
              id="cycle-notes"
              label={t("Notas")}
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={saving}
        title={t("Eliminar {name}", { name: deleting?.code || "" })}
        message={t("El ciclo está en configuración y no tiene trabajo asociado. Se eliminará de forma definitiva; la baja queda registrada en la bitácora.")}
        confirmLabel={t("Eliminar ciclo")}
      />

      <Modal
        open={Boolean(closeTarget)}
        onClose={() => setCloseTarget(null)}
        title={t("Cerrar {name}", { name: closeTarget?.code || "" })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseTarget(null)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              onClick={confirmClose}
              loading={saving}
              disabled={Boolean(closeCheck && !closeCheck.can_close && !justification.trim())}
              disabledHint={t("Registre la justificación de cierre: hay tecnologías en evaluación sin informe publicado.")}
              data-testid="cycle-close-confirm"
            >
              {t("Cerrar y consolidar")}
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
          {tr(
            "Al cerrar, todos los puntajes del ciclo quedan congelados, se compila el boletín y se refresca el tablero. Una reevaluación posterior crea registros nuevos y nunca modifica los actuales. <b>Esta acción no se deshace.</b>",
            null,
            { b: (c) => <strong>{c}</strong> }
          )}
        </p>
        {closeCheck && !closeCheck.can_close && (
          <>
            <div className="fa-notice fa-notice--warn">
              <div>
                <strong>{ts(closeCheck.message)}</strong>
                <div style={{ marginTop: 4 }}>
                  {t("Publique el informe correspondiente o registre la justificación de cierre. La justificación queda en la bitácora inmutable.")}
                </div>
              </div>
            </div>
            <Textarea
              id="cycle-close-justification"
              label={t("Justificación de cierre")}
              required
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder={t("Motivo por el cual el ciclo se cierra con tecnologías en evaluación")}
            />
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(carrySource)}
        onClose={() => setCarrySource(null)}
        title={t("Arrastrar monitoreo activo")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCarrySource(null)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              onClick={confirmCarryOver}
              loading={saving}
              disabled={!carryTarget}
              disabledHint={t("Cree o reabra un ciclo destino antes de arrastrar.")}
              data-testid="cycle-carry-confirm"
            >
              {t("Arrastrar")}
            </HintButton>
          </>
        }
      >
        <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>{GLOSSARY.fa_arrastre}</p>
        {openCycles.length ? (
          <Select
            id="cycle-carry-target"
            label={t("Ciclo destino")}
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
          <div className="fa-notice fa-notice--warn">
            {t("No hay ciclos abiertos. Cree un ciclo destino antes de arrastrar el monitoreo activo.")}
          </div>
        )}
      </Modal>
    </div>
  );
}
