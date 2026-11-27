import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { downloadFromApi } from "../utils/download";
import { fmtDateTime, intlLocale, t, tr, ts } from "../i18n";
import "./prioritization.css";
import "./cycles.css";

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

const STEP_LABEL = {
  en_configuracion: t("Preparación"),
  en_filtrado: t("Filtrado"),
  en_priorizacion: t("Priorización"),
  en_evaluacion: t("Evaluación"),
  cerrado_consolidado: t("Cierre"),
};

const STATUS_HINT = {
  en_configuracion: GLOSSARY.fa_ciclo_en_configuracion,
  en_filtrado: GLOSSARY.fa_ciclo_en_filtrado,
  en_priorizacion: GLOSSARY.fa_ciclo_en_priorizacion,
  en_evaluacion: GLOSSARY.fa_ciclo_en_evaluacion,
  cerrado_consolidado: GLOSSARY.fa_ciclo_cerrado_consolidado,
};

const HISTORY_ICON = {
  created: "plus",
  edited: "edit",
  advanced: "chevron",
  returned: "refresh",
  closed: "check",
  carried_in: "layers",
  carried_out: "layers",
};

const DAY = 1000 * 60 * 60 * 24;

function addWeeks(dateStr, weeks) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function weeksBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round(((new Date(b) - new Date(a)) / (DAY * 7)) * 10) / 10;
}

// Las fechas del ciclo son dias sin hora: se comparan como dias en UTC para no depender del huso.
function dayNumber(iso) {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
}

function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

function isOpen(cycle) {
  return !cycle.is_historic && cycle.status !== "cerrado_consolidado";
}

function paramValue(params, key, fallback) {
  const row = params.find((p) => p.key === key);
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** En qué punto de su ventana está un ciclo abierto. */
function scheduleOf(cycle, today) {
  const closing = cycle.bulletin_due_on || cycle.data_cutoff_on;
  const span = Math.max(1, daysBetween(cycle.opened_on, closing));
  const pct = Math.max(0, Math.min(100, Math.round((daysBetween(cycle.opened_on, today) / span) * 100)));
  const toOpen = daysBetween(today, cycle.opened_on);
  const toCutoff = daysBetween(today, cycle.data_cutoff_on);
  const toClosing = daysBetween(today, closing);
  if (toOpen > 0) return { pct: 0, tone: "idle", text: t("Abre en {n} día(s)", { n: toOpen }) };
  if (toCutoff > 0) return { pct, tone: "ok", text: t("Faltan {n} día(s) para el corte de datos", { n: toCutoff }) };
  if (toCutoff === 0) return { pct, tone: "soon", text: t("El corte de datos es hoy") };
  if (toClosing > 0)
    return { pct, tone: "soon", text: t("Corte de datos cumplido · faltan {n} día(s) para el boletín", { n: toClosing }) };
  if (toClosing === 0) return { pct: 100, tone: "soon", text: t("La ventana termina hoy") };
  return { pct: 100, tone: "late", text: t("La ventana terminó hace {n} día(s) y el ciclo sigue abierto", { n: -toClosing }) };
}

/** Lo que conviene saber antes de avanzar de etapa. Avisa; no impide. */
function advanceWarnings(cycle, target) {
  const s = cycle.summary || {};
  const out = [];
  if (target === "en_priorizacion" || target === "en_evaluacion") {
    if (s.assigned > 0) out.push(t("{n} tecnología(s) siguen sin filtrar.", { n: s.assigned }));
  }
  if (target === "en_evaluacion") {
    if (s.filtered > 0) out.push(t("{n} tecnología(s) aptas siguen sin calificar.", { n: s.filtered }));
    if (!((s.prioritized || 0) + (s.in_evaluation || 0) + (s.published || 0)))
      out.push(t("Ninguna tecnología quedó priorizada todavía."));
  }
  return out;
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

function CycleSteps({ status }) {
  const current = STATUS_ORDER.indexOf(status);
  return (
    <ol className="cy-steps" aria-label={t("Etapas del ciclo")}>
      {STATUS_ORDER.map((key, i) => {
        const state = i < current || status === "cerrado_consolidado" ? "done" : i === current ? "current" : "todo";
        return (
          <li key={key} className={`is-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="cy-step-dot" aria-hidden="true">
              {state === "done" ? <Icon name="check" size={11} /> : i + 1}
            </span>
            <span className="cy-step-label">{STEP_LABEL[key]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CycleHistory({ cycle }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(null);
  const [failed, setFailed] = useState(false);
  // Cambia cuando el ciclo cambia: el recorrido abierto se vuelve a pedir.
  const version = `${cycle.status}|${cycle.code}|${cycle.opened_on}|${cycle.data_cutoff_on}|${cycle.bulletin_due_on}|${cycle.notes}|${cycle.summary?.total}`;

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setFailed(false);
    api
      .get(`/cycles/${cycle.id}/history`)
      .then(({ data }) => alive && setEvents(Array.isArray(data) ? data : []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, cycle.id, version]);

  return (
    <details className="prio-history-fold cy-history-fold" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary data-testid={`cycle-history-toggle-${cycle.id}`}>
        <Icon name="clock" size={14} /> {t("Recorrido del ciclo")}
        <span>{t("Creación, ediciones, cambios de etapa, cierre y arrastres")}</span>
      </summary>
      {failed ? (
        <p className="prio-history-empty">{t("No se pudo cargar el recorrido del ciclo.")}</p>
      ) : events == null ? (
        <p className="prio-history-empty">{t("Cargando el recorrido...")}</p>
      ) : events.length === 0 ? (
        <p className="prio-history-empty">{t("Este ciclo es anterior al registro de eventos: no tiene recorrido guardado.")}</p>
      ) : (
        <ol className="prio-history cy-history" data-testid={`cycle-history-${cycle.id}`}>
          {events.map((ev, i) => (
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
    </details>
  );
}

function CycleCard({
  cycle,
  today,
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
  const schedule = isOpen(cycle) ? scheduleOf(cycle, today) : null;

  return (
    <Card
      style={isSelected ? { borderColor: "#2563EB", boxShadow: "0 0 0 3px #EFF6FF" } : undefined}
    >
      <div className="cycle-card-head" id={`cycle-${cycle.id}`} data-testid={`cycle-card-${cycle.id}`}>
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

      {!cycle.is_historic && <CycleSteps status={cycle.status} />}

      {schedule && (
        <div className={`cy-schedule is-${schedule.tone}`} data-testid={`cycle-schedule-${cycle.id}`}>
          <div className="cy-schedule-track" role="img" aria-label={t("{pct}% de la ventana transcurrido", { pct: schedule.pct })}>
            <div style={{ width: `${schedule.pct}%` }} />
          </div>
          <p>
            <Icon name={schedule.tone === "late" ? "alert" : "calendar"} size={13} /> {schedule.text}
          </p>
        </div>
      )}
      {isClosed && cycle.closed_at && (
        <p className="cy-closed" data-testid={`cycle-closed-${cycle.id}`}>
          <Icon name="check" size={13} />{" "}
          {cycle.closed_by_name
            ? t("Cerrado el {fecha} por {persona}", { fecha: fmtDateTime(cycle.closed_at), persona: cycle.closed_by_name })
            : t("Cerrado el {fecha}", { fecha: fmtDateTime(cycle.closed_at) })}
        </p>
      )}

      <CycleFunnel summary={cycle.summary} />
      <p className="cy-total">
        {t("{n} tecnología(s) en el ciclo", { n: cycle.summary?.total || 0 })}
        {(cycle.summary?.excluded || 0) > 0 && ` · ${t("{n} excluida(s)", { n: cycle.summary.excluded })}`}
        {(cycle.summary?.not_prioritized || 0) > 0 && ` · ${t("{n} no priorizada(s)", { n: cycle.summary.not_prioritized })}`}
        {" · "}
        <Link to={`/dashboards?ciclo=${cycle.id}`}>{t("Ver tablero")}</Link>
      </p>

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

      <CycleHistory cycle={cycle} />
    </Card>
  );
}

/** Ventanas de los ciclos formales de un año, sobre los doce meses. */
function YearCalendar({ cycles, year, years, onYear, today, cycleId, onPick }) {
  const start = dayNumber(`${year}-01-01`);
  const total = dayNumber(`${year + 1}-01-01`) - start;
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2020, m, 1)).toLocaleDateString(intlLocale(), { month: "short", timeZone: "UTC" })),
    []
  );
  const rows = cycles
    .filter((c) => !c.is_historic)
    .map((c) => {
      const from = dayNumber(c.opened_on) - start;
      const to = dayNumber(c.bulletin_due_on || c.data_cutoff_on) - start;
      return { cycle: c, from: Math.max(0, from), to: Math.min(total, to) };
    })
    .filter((r) => r.to > 0 && r.from < total)
    .sort((a, b) => a.from - b.from);
  const todayOffset = dayNumber(today) - start;

  return (
    <Card padding={16} style={{ marginBottom: 16 }}>
      <div className="cy-cal-head">
        <h3>
          <span className="term-label">
            {t("Calendario de ciclos")}
            <InfoTip
              text={t("La barra de cada ciclo va de su apertura a la fecha del boletín (o al corte de datos, si no hay boletín). Sirve para ver cuándo se cruzan y cuánto del año queda libre.")}
              label={t("Qué muestra el calendario de ciclos")}
            />
          </span>
        </h3>
        <select
          className="filter-input cy-year"
          aria-label={t("Año del calendario")}
          value={year}
          onChange={(e) => onYear(Number(e.target.value))}
          data-testid="cycles-year"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="cy-cal" data-testid="cycles-calendar">
        <div className="cy-cal-row cy-cal-months" aria-hidden="true">
          <span />
          <div>
            {months.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="cy-cal-empty">{t("No hay ciclos formales en {year}.", { year })}</p>
        ) : (
          rows.map(({ cycle, from, to }) => (
            <div key={cycle.id} className="cy-cal-row">
              <span className="cy-cal-label" title={cycle.code}>
                {cycle.code}
              </span>
              <div className="cy-cal-track">
                {todayOffset >= 0 && todayOffset <= total && (
                  <i className="cy-cal-today" style={{ left: `${(todayOffset / total) * 100}%` }} aria-hidden="true" />
                )}
                <button
                  type="button"
                  className={`cy-cal-bar tone-${cycle.status}${cycle.id === cycleId ? " is-selected" : ""}`}
                  style={{ left: `${(from / total) * 100}%`, width: `${Math.max(1.5, ((to - from) / total) * 100)}%` }}
                  title={`${cycle.code}: ${cycle.opened_on} → ${cycle.bulletin_due_on || cycle.data_cutoff_on}`}
                  aria-label={t("Ir a {code}: del {desde} al {hasta}", {
                    code: cycle.code,
                    desde: cycle.opened_on,
                    hasta: cycle.bulletin_due_on || cycle.data_cutoff_on,
                  })}
                  onClick={() => onPick(cycle)}
                  data-testid={`cycles-bar-${cycle.id}`}
                />
              </div>
            </div>
          ))
        )}
      </div>
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

const TABS = [
  { key: "todos", label: t("Todos"), match: () => true },
  { key: "abiertos", label: t("Abiertos"), match: (c) => isOpen(c) },
  { key: "cerrados", label: t("Cerrados"), match: (c) => !c.is_historic && c.status === "cerrado_consolidado" },
  { key: "historico", label: t("Histórico"), match: (c) => c.is_historic },
];

export default function Cycles() {
  const { cycles, cycleId, setCycleId, reload, loading } = useCycle();
  const { can } = useAuth();
  const toast = useToast();

  const canWrite = can(PERM.CYCLE_WRITE);
  const canClose = can(PERM.CYCLE_CLOSE);
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));

  const [params, setParams] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeCheck, setCloseCheck] = useState(null);
  const [justification, setJustification] = useState("");
  const [carrySource, setCarrySource] = useState(null);
  const [carryTarget, setCarryTarget] = useState("");
  const [carryPreview, setCarryPreview] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [tab, setTab] = useState("todos");
  const [search, setSearch] = useState("");
  const [calYear, setCalYear] = useState(null);
  const [exporting, setExporting] = useState("");
  // { cycle, target, warnings } al avanzar con avisos; { cycle, target, back: true } al devolver.
  const [move, setMove] = useState(null);
  const [moveReason, setMoveReason] = useState("");

  useEffect(() => {
    api
      .get("/methodology/params")
      .then(({ data }) => setParams(Array.isArray(data) ? data : []))
      .catch(() => setParams([]));
  }, []);

  const wmin = paramValue(params, "cycle.window_weeks_min", 10);
  const wmax = paramValue(params, "cycle.window_weeks_max", 16);
  const quota = paramValue(params, "cycle.max_per_year", 3);

  const openCycles = useMemo(() => cycles.filter(isOpen), [cycles]);

  const counts = useMemo(() => Object.fromEntries(TABS.map((x) => [x.key, cycles.filter(x.match).length])), [cycles]);
  const visible = useMemo(() => {
    const match = TABS.find((x) => x.key === tab)?.match || (() => true);
    const q = search.trim().toLowerCase();
    return cycles.filter((c) => match(c) && (!q || `${c.code} ${c.notes || ""} ${c.year}`.toLowerCase().includes(q)));
  }, [cycles, tab, search]);

  const years = useMemo(() => {
    const set = new Set([thisYear]);
    cycles.filter((c) => !c.is_historic).forEach((c) => {
      set.add(Number(c.opened_on.slice(0, 4)));
      set.add(Number((c.bulletin_due_on || c.data_cutoff_on).slice(0, 4)));
    });
    return [...set].sort((a, b) => b - a);
  }, [cycles, thisYear]);
  const selected = cycles.find((c) => c.id === cycleId);
  const year = calYear ?? (selected && !selected.is_historic ? Number(selected.opened_on.slice(0, 4)) : thisYear);

  const stats = useMemo(() => {
    const formal = cycles.filter((c) => !c.is_historic);
    const late = openCycles.filter((c) => daysBetween(today, c.bulletin_due_on || c.data_cutoff_on) < 0).length;
    return {
      thisYear: formal.filter((c) => c.year === thisYear).length,
      open: openCycles.length,
      late,
      closed: formal.filter((c) => c.status === "cerrado_consolidado").length,
      inOpen: openCycles.reduce((sum, c) => sum + (c.summary?.total || 0), 0),
    };
  }, [cycles, openCycles, today, thisYear]);

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
    if (!form) return { errors: {}, window: 0, yearCount: 0, year: null, overlaps: [] };
    const errors = {};
    if (!form.code?.trim()) errors.code = t("El código es obligatorio.");
    else if (form.code.trim().length > 120) errors.code = t("El código admite hasta 120 caracteres.");
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
    if ((form.notes || "").length > 4000) errors.notes = t("Las notas admiten hasta 4000 caracteres.");
    // Cruce de ventanas con otros ciclos formales: se avisa, no se impide.
    const closing = form.bulletin_due_on || form.data_cutoff_on;
    const overlaps =
      form.opened_on && closing && closing > form.opened_on
        ? cycles.filter(
            (c) =>
              !c.is_historic &&
              c.id !== form.id &&
              c.opened_on <= closing &&
              (c.bulletin_due_on || c.data_cutoff_on) >= form.opened_on
          )
        : [];
    return { errors, window, yearCount, year, overlaps };
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
        setTab("todos");
        setSearch("");
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

  const applyTransition = async (cycle, target, reason = "") => {
    setSaving(true);
    try {
      await api.put(`/cycles/${cycle.id}/status`, { status: target, justification: reason });
      toast.success(`${cycle.code}: ${CYCLE_STATUS_LABELS[target]}.`);
      setMove(null);
      await reload();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cambiar el estado")));
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
    const back = STATUS_ORDER.indexOf(target) < STATUS_ORDER.indexOf(cycle.status);
    if (back) {
      setMoveReason("");
      setMove({ cycle, target, back: true, warnings: [] });
      return;
    }
    const warnings = advanceWarnings(cycle, target);
    if (warnings.length) {
      setMove({ cycle, target, back: false, warnings });
      return;
    }
    await applyTransition(cycle, target);
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

  // Vista previa del arrastre: qué viaja y qué ya está en el destino.
  useEffect(() => {
    if (!carrySource) {
      setCarryPreview(null);
      return undefined;
    }
    let alive = true;
    setCarryPreview(null);
    api
      .get(`/cycles/${carrySource.id}/carry-over/preview`, { params: { target_cycle_id: carryTarget || undefined } })
      .then(({ data }) => alive && setCarryPreview(data))
      .catch(() => alive && setCarryPreview({ failed: true, items: [] }));
    return () => {
      alive = false;
    };
  }, [carrySource, carryTarget]);

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

  const exportList = async (format) => {
    setExporting(format);
    try {
      await downloadFromApi(api, "/cycles/export", `ciclos_de_escaneo.${format}`, { params: { format } });
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descargar el listado de ciclos")));
    } finally {
      setExporting("");
    }
  };

  const goToCycle = (cycle) => {
    setTab("todos");
    setSearch("");
    // La tarjeta puede no estar en pantalla hasta que se quite el filtro.
    window.setTimeout(() => {
      document.getElementById(`cycle-${cycle.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
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
        <>
          <div className="cy-tiles" data-testid="cycles-tiles">
            <div className={`cy-tile${stats.thisYear >= quota ? " is-full" : ""}`} data-testid="cycles-tile-quota">
              <span className="term-label">
                {t("Ciclos formales en {year}", { year: thisYear })}
                <InfoTip text={GLOSSARY.fa_cuota} label={t("Qué es la cuota anual")} />
              </span>
              <strong>{t("{n} de {max}", { n: stats.thisYear, max: quota })}</strong>
              <em>
                {stats.thisYear >= quota
                  ? t("Cuota del año completa")
                  : t("Queda(n) {n} por abrir este año", { n: quota - stats.thisYear })}
              </em>
            </div>
            <div className={`cy-tile${stats.late ? " is-late" : ""}`} data-testid="cycles-tile-open">
              <span>{t("Ciclos abiertos")}</span>
              <strong>{stats.open}</strong>
              <em>{stats.late ? t("{n} con la ventana vencida", { n: stats.late }) : t("Ninguno con la ventana vencida")}</em>
            </div>
            <div className="cy-tile">
              <span>{t("Tecnologías en ciclos abiertos")}</span>
              <strong>{stats.inOpen}</strong>
              <em>{t("Suma de los ciclos que siguen en curso")}</em>
            </div>
            <div className="cy-tile">
              <span>{t("Ciclos cerrados")}</span>
              <strong>{stats.closed}</strong>
              <em>{t("Con puntajes congelados")}</em>
            </div>
          </div>

          <YearCalendar
            cycles={cycles}
            year={year}
            years={years}
            onYear={setCalYear}
            today={today}
            cycleId={cycleId}
            onPick={goToCycle}
          />

          <Card padding={16} style={{ marginBottom: 16 }}>
            <div className="screening-tabs cy-tabs">
              {TABS.map((x) => (
                <button
                  key={x.key}
                  type="button"
                  className={`screening-tab${tab === x.key ? " is-active" : ""}`}
                  onClick={() => setTab(x.key)}
                  data-testid={`cycles-tab-${x.key}`}
                >
                  {x.label}
                  <span className="cy-count">{counts[x.key]}</span>
                </button>
              ))}
            </div>
            <div className="fb-toolbar">
              <input
                placeholder={t("Buscar por código, año o notas...")}
                aria-label={t("Buscar ciclo")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="filter-input"
                style={{ flex: 1, minWidth: 180 }}
                data-testid="cycles-search"
              />
              <Button variant="outline" size="sm" loading={exporting === "csv"} onClick={() => exportList("csv")} data-testid="cycles-export-csv">
                {t("Exportar CSV")}
              </Button>
              <Button variant="outline" size="sm" loading={exporting === "xlsx"} onClick={() => exportList("xlsx")} data-testid="cycles-export-xlsx">
                {t("Exportar Excel")}
              </Button>
            </div>
          </Card>

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon="🔎"
                title={t("Ningún ciclo coincide")}
                message={t("Cambie la pestaña o borre la búsqueda para ver los demás ciclos.")}
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTab("todos");
                      setSearch("");
                    }}
                  >
                    {t("Ver todos los ciclos")}
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="cycle-grid">
              {visible.map((c) => (
                <CycleCard
                  key={c.id}
                  cycle={c}
                  today={today}
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
        </>
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
            {formCheck.overlaps.length > 0 && (
              <div className="fa-notice fa-notice--info" data-testid="cycle-overlap" style={{ marginBottom: 14 }}>
                <div>
                  <strong>
                    {t("La ventana se cruza con: {ciclos}.", { ciclos: formCheck.overlaps.map((c) => c.code).join(", ") })}
                  </strong>
                  <div style={{ marginTop: 4 }}>
                    {t("Se puede guardar así. Tenga en cuenta que el equipo trabajará dos ciclos al mismo tiempo en esas fechas.")}
                  </div>
                </div>
              </div>
            )}
            <Textarea
              id="cycle-notes"
              label={t("Notas")}
              rows={3}
              value={form.notes}
              error={formCheck.errors.notes}
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
        open={Boolean(move)}
        onClose={() => setMove(null)}
        title={
          move?.back
            ? t("Devolver {code} a: {estado}", { code: move.cycle.code, estado: CYCLE_STATUS_LABELS[move.target] })
            : t("Pasar {code} a: {estado}", { code: move?.cycle.code || "", estado: CYCLE_STATUS_LABELS[move?.target] || "" })
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setMove(null)}>
              {t("Cancelar")}
            </Button>
            <HintButton
              onClick={() => applyTransition(move.cycle, move.target, move.back ? moveReason.trim() : "")}
              loading={saving}
              disabled={Boolean(move?.back && !moveReason.trim())}
              disabledHint={t("Escriba el motivo de la devolución.")}
              data-testid="cycle-move-confirm"
            >
              {move?.back ? t("Devolver el ciclo") : t("Avanzar de todos modos")}
            </HintButton>
          </>
        }
      >
        {move?.back ? (
          <>
            <p style={{ fontSize: 14, color: "#475569", marginBottom: 14 }}>
              {t("El ciclo vuelve a una etapa anterior. No se borra nada de lo ya trabajado. El motivo queda en el recorrido del ciclo y en la bitácora.")}
            </p>
            <Textarea
              id="cycle-move-reason"
              label={t("Motivo de la devolución")}
              required
              rows={3}
              maxLength={500}
              value={moveReason}
              onChange={(e) => setMoveReason(e.target.value)}
              placeholder={t("Por ejemplo: faltó depurar duplicados antes de calificar")}
            />
          </>
        ) : (
          move && (
            <div className="fa-notice fa-notice--warn" data-testid="cycle-move-warnings">
              <div>
                <strong>{t("Antes de avanzar, tenga en cuenta:")}</strong>
                <ul className="cy-list">
                  {move.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 6 }}>
                  {t("Puede avanzar y terminar ese trabajo después: la etapa del ciclo no bloquea las pantallas anteriores.")}
                </div>
              </div>
            </div>
          )
        )}
      </Modal>

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
        {closeCheck && (
          <ul className="cy-list cy-close-facts" data-testid="cycle-close-facts">
            <li>{t("Se congelan {n} puntaje(s).", { n: closeCheck.to_freeze ?? 0 })}</li>
            {(closeCheck.watchlist || 0) > 0 && (
              <li>{t("{n} tecnología(s) quedan bajo vigilancia y se podrán arrastrar a otro ciclo.", { n: closeCheck.watchlist })}</li>
            )}
            {(closeCheck.pending_screening || 0) > 0 && (
              <li className="is-warn">{t("{n} tecnología(s) quedan sin filtrar: no pasan solas al ciclo siguiente.", { n: closeCheck.pending_screening })}</li>
            )}
            {(closeCheck.pending_rating || 0) > 0 && (
              <li className="is-warn">{t("{n} tecnología(s) aptas quedan sin calificar.", { n: closeCheck.pending_rating })}</li>
            )}
          </ul>
        )}
        {closeCheck && !closeCheck.can_close && (
          <>
            <div className="fa-notice fa-notice--warn">
              <div>
                <strong>{ts(closeCheck.message)}</strong>
                {(closeCheck.blocking || []).length > 0 && (
                  <ul className="cy-list" data-testid="cycle-close-blocking">
                    {closeCheck.blocking.slice(0, 8).map((b) => (
                      <li key={b.technology_id}>{b.name}</li>
                    ))}
                    {closeCheck.blocking.length > 8 && <li>{t("y {n} más", { n: closeCheck.blocking.length - 8 })}</li>}
                  </ul>
                )}
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
        {carryPreview && !carryPreview.failed && carryPreview.items.length > 0 && (
          <div className="cy-carry" data-testid="cycle-carry-preview">
            <strong>
              {carryTarget
                ? t("Se arrastran {n} de {total}", { n: carryPreview.to_carry, total: carryPreview.total })
                : t("{total} tecnología(s) bajo vigilancia", { total: carryPreview.total })}
            </strong>
            <ul>
              {carryPreview.items.slice(0, 12).map((item) => (
                <li key={item.technology_id} className={item.already_in_target ? "is-skip" : ""}>
                  <span>{item.name}</span>
                  <em>
                    {item.already_in_target
                      ? t("ya está en el destino")
                      : item.priority_pct != null
                      ? t("calificación previa {pct}%", { pct: item.priority_pct })
                      : t("sin calificación previa")}
                  </em>
                </li>
              ))}
              {carryPreview.items.length > 12 && <li>{t("y {n} más", { n: carryPreview.items.length - 12 })}</li>}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
