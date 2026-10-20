import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, SectionTitle } from "../components/Card";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import { Input, Select } from "../components/Field";
import ModuleHeader from "../components/ModuleHeader";
import InfoTip, { TermLabel } from "../components/InfoTip";
import ClampText from "../components/ClampText";
import StrategyGraph from "../components/StrategyGraph";
import { PERM, TECH_STATUS_LABELS } from "../constants/methodology";
import "./dashboards.css";

// --------------------------------------------------------------------------- //
//  Catalogos del tablero (coinciden con strategy_service y ttm.py)
// --------------------------------------------------------------------------- //
const PHASES = [
  ["fase_i", "Fase I"],
  ["fase_ii", "Fase II"],
  ["fase_iii", "Fase III"],
  ["fase_iv", "Fase IV"],
  ["autorizada", "Autorizada / en mercado"],
  ["sin_fase", "Sin fase declarada"],
];
const BANDS = [
  ["inminente", "Inminente"],
  ["transicion", "Transición"],
  ["emergente", "Emergente"],
  ["lejano", "Lejano"],
  ["desconocido", "Sin dato suficiente"],
];
const STAGES = [
  ["captured", "Capturadas"],
  ["filtered", "Filtradas"],
  ["prioritized", "Priorizadas"],
  ["evaluated", "Evaluadas"],
  ["published", "Publicadas"],
];
const STAGE_ORDER = STAGES.map(([code]) => code);
const PHASE_LABEL = Object.fromEntries(PHASES);
const BAND_LABEL = Object.fromEntries(BANDS);
const STAGE_LABEL = Object.fromEntries(STAGES);

const C = {
  ink: "#0F172A",
  muted: "#64748B",
  faint: "#94A3B8",
  grid: "#E2E8F0",
  indigo: "#4F46E5",
  violet: "#6366F1",
  blue: "#3B82F6",
  cyan: "#06B6D4",
  green: "#059669",
  amber: "#D97706",
  red: "#DC2626",
  slate: "#CBD5E1",
};
const BAND_COLORS = {
  inminente: "#4F46E5",
  transicion: "#3B82F6",
  emergente: "#06B6D4",
  lejano: "#94A3B8",
  desconocido: "#CBD5E1",
};
// Estado de priorizacion: lo que mas le importa a quien decide de cada tecnologia.
const PRIORITY_GROUPS = [
  { key: "prio", label: "Priorizada (4-6 puntos)", color: C.indigo },
  { key: "watch", label: "Bajo vigilancia (3)", color: "#F59E0B" },
  { key: "rest", label: "No priorizada o sin calificar", color: C.slate },
];
// Etapa en la que esta cada tecnologia (no la alcanzada): para ver donde se acumula el trabajo.
const STAGE_SEGMENTS = [
  { key: "pending", label: "Sin priorizar", color: C.slate, stages: ["captured", "filtered"] },
  { key: "prioritized", label: "Priorizada, sin expediente", color: "#818CF8", stages: ["prioritized"] },
  { key: "evaluated", label: "En evaluación", color: C.blue, stages: ["evaluated"] },
  { key: "published", label: "Publicada", color: C.green, stages: ["published"] },
];
const FUNNEL_COLORS = ["#94A3B8", "#818CF8", "#6366F1", "#3B82F6", "#059669"];
const DOC_STATUSES = [
  ["borrador", "Borrador"],
  ["revision_interna", "Rev. interna"],
  ["revision_externa", "Rev. externa"],
  ["con_observaciones", "Observaciones"],
  ["aprobado_comite", "Comité"],
  ["publicado", "Publicado"],
];
const DOC_LEVELS = [
  ["ficha", "Ficha"],
  ["informe", "Informe"],
  ["mini_hta", "Mini-HTA"],
];

const FILTER_KEYS = ["cluster_id", "tech_type_id", "phase", "status", "band", "stage", "priority_min", "date_from", "date_to"];
const SECONDARY_FILTERS = ["phase", "status", "priority_min", "date_from", "date_to"];
const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((k) => [k, ""]));
const PAGE_SIZE = 25;
const GRAPH_KEY = "iets_dc_graph_open";
const MORE_KEY = "iets_dc_more_filters";

const fmt1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const fmt0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const HELP = {
  tablero:
    "Tablero de gobernanza anticipatoria (RF17): resume el ciclo para quien decide. Qué se priorizó, qué llega pronto al mercado, dónde está el trabajo de evaluación y cuánto podría costarle al sistema de salud.",
  datamart:
    "Datamart: copia de las cifras del ciclo guardada al cerrarlo (con el time-to-market de ese momento). El tablero y sus filtros la usan sin volver a recorrer la base transaccional.",
  recalcular:
    "Vuelve a calcular las cifras y el time-to-market con los datos actuales y reemplaza la copia guardada. Use esto si cambiaron fechas o informes después del cierre.",
  en_vivo:
    "Cálculo en vivo: el ciclo está abierto, así que las cifras se arman ahora mismo con los datos actuales y los filtros elegidos.",
  capturadas: "Qué mide: tecnologías asignadas a este ciclo. Cómo se calcula: todas las del recorte, sin importar su estado.",
  filtradas:
    "Qué mide: tecnologías que pasaron el filtro de novedad. Cómo se calcula: estado en el ciclo apta, priorizada, bajo vigilancia, no priorizada, en evaluación o publicada.",
  priorizadas:
    "Qué mide: tecnologías que superaron el umbral de puntos P1-P6. Cómo se calcula: estado en el ciclo priorizada, en evaluación o publicada.",
  evaluadas:
    "Qué mide: priorizadas con ficha, informe o Mini-HTA abierto en este ciclo. Cómo se calcula: estado en evaluación o publicada, o expediente del ciclo abierto.",
  publicadas: "Qué mide: evaluadas cuyo informe se publicó en este ciclo. Cómo se calcula: estado publicada o expediente del ciclo publicado.",
  gobernanza:
    "Recorte el tablero por clúster, tipología, etapa, cercanía al mercado y más. Todos los indicadores, gráficos y la tabla se recalculan. También puede hacer clic en una barra, una columna o un indicador. El enlace de la página guarda el recorte.",
  cluster: "Clúster: grupo de enfermedades o problemas de salud (cáncer, huérfanas, alto costo, etc.) que organiza las tecnologías.",
  tipologia: "Tipología: tipo de tecnología (medicamento, terapia avanzada, dispositivo, diagnóstico, procedimiento o salud digital).",
  fase: "Fase clínica agrupada a partir de la fase declarada (I, II, III, IV o autorizada). Si menciona varias, cuenta la más avanzada.",
  estado: "Estado de la tecnología dentro de este ciclo: asignada, apta, priorizada, bajo vigilancia, en evaluación, publicada, etc.",
  etapa: "Etapa alcanzada del embudo: al elegir 'Priorizadas' quedan también las evaluadas y publicadas, porque pasaron por esa etapa.",
  ttm: "Time-to-market: meses estimados hasta la llegada al mercado, desde la aprobación FDA/EMA o desde el fin de fase III más el plazo de revisión regulatoria.",
  puntos: "Puntos P1 a P6: seis preguntas oficiales de priorización; cada sí vale 1 punto. Las tecnologías sin calificación completa quedan fuera de este filtro.",
  captura_desde: "Solo tecnologías cuya señal se capturó desde esta fecha (hora de Colombia).",
  captura_hasta: "Solo tecnologías cuya señal se capturó hasta esta fecha, inclusive.",
  embudo:
    "Cómo leerlo: cuántas tecnologías del recorte alcanzaron cada etapa y cuántas se quedaron entre una y otra. Clic en una etapa para ver solo las que la alcanzaron.",
  lectura: "Frases calculadas con el recorte actual: dónde se pierde el ciclo, dónde se concentra lo priorizado y qué falta para decidir.",
  atencion:
    "Listas de trabajo que salen del recorte: tecnologías que llegan pronto sin priorizar, priorizadas sin expediente, aprobadas afuera sin informe y expedientes devueltos con observaciones.",
  llegada:
    "Cómo leerlo: cada columna es una franja de cercanía al mercado y se divide por el resultado de la priorización. Lo más urgente es la parte azul oscura de 'Inminente': priorizadas que llegan en menos de un año. Clic en una columna para filtrar.",
  matriz:
    "Cómo leerlo: cada punto es una tecnología. Hacia la izquierda llega antes al mercado; hacia arriba tiene más puntos P1-P6. El cuadrante 'Actuar ya' reúne lo priorizado que llega antes del tope de 'inminente'. Clic en un punto para ubicarlo en la tabla.",
  clusteres:
    "Cómo leerlo: cada barra es un clúster dividido por la etapa en que están hoy sus tecnologías. Muestra dónde se concentra lo priorizado y dónde está detenido el trabajo. Clic en una barra para filtrar.",
  expedientes:
    "Cómo leerlo: fichas, informes y Mini-HTA del recorte según su estado editorial, de borrador a publicado. Las columnas de revisión muestran dónde está el cuello de botella.",
  tipo_chart: "Cuántas tecnologías del recorte hay por tipología. Clic para filtrar.",
  fase_chart: "Cuántas tecnologías del recorte hay por fase clínica. Clic para filtrar.",
  calor:
    "Cómo leerlo: suma del impacto presupuestal estimado (años 1, 2 y 3) de los expedientes del recorte, por clúster. Más oscuro = mayor monto. Los montos salen de los campos de impacto presupuestal de fichas, informes y Mini-HTA.",
  top_presupuesto: "Las tecnologías con mayor impacto presupuestal acumulado en tres años, según sus expedientes.",
  recorte: "Listado de las tecnologías que coinciden con los filtros. El nombre abre el módulo donde se trabaja la tecnología según su estado.",
  comparadores:
    "Comparadores del SGSSS: tratamientos que ya se usan en Colombia para la misma condición, contra los que se compara la nueva tecnología.",
  restringido:
    "Los montos presupuestales y los comparadores solo los ven perfiles con acceso restringido (MinSalud, INVIMA, administración). El resto ve el tablero agregado, también en las exportaciones.",
  exportar: "Descarga las tecnologías del recorte actual con sus dimensiones. Sin acceso restringido, el archivo no incluye montos presupuestales.",
};

// --------------------------------------------------------------------------- //
//  Utilidades
// --------------------------------------------------------------------------- //
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function sanitize(params) {
  const out = { ...EMPTY_FILTERS };
  const intOk = (v) => /^\d+$/.test(v);
  const get = (k) => (params.get(k) || "").trim();
  if (intOk(get("cluster_id"))) out.cluster_id = get("cluster_id");
  if (intOk(get("tech_type_id"))) out.tech_type_id = get("tech_type_id");
  if (PHASE_LABEL[get("phase")]) out.phase = get("phase");
  if (BAND_LABEL[get("band")]) out.band = get("band");
  if (STAGE_LABEL[get("stage")]) out.stage = get("stage");
  if (TECH_STATUS_LABELS[get("status")]) out.status = get("status");
  if (intOk(get("priority_min")) && Number(get("priority_min")) <= 6) out.priority_min = get("priority_min");
  if (ISO_DATE.test(get("date_from"))) out.date_from = get("date_from");
  if (ISO_DATE.test(get("date_to"))) out.date_to = get("date_to");
  return out;
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

function moneyShort(value) {
  const n = Number(value || 0);
  if (!n) return "—";
  if (n >= 1e12) return `$${fmt1.format(n / 1e12)} billones`;
  if (n >= 1e9) return `$${fmt1.format(n / 1e9)} mil M`;
  if (n >= 1e6) return `$${fmt0.format(n / 1e6)} M`;
  return `$${fmt0.format(n)}`;
}

function moneyFull(value) {
  const n = Number(value || 0);
  return n ? `$ ${fmt0.format(n)} COP` : "Sin monto";
}

function monthsText(row) {
  if (row.months == null) return "Sin dato";
  return `${fmt1.format(Number(row.months))} m`;
}

function ttmNote(row) {
  if (row.months == null) return "Falta fecha de fin de fase III o de aprobación";
  if (row.basis === "registro_invima") return "Ya tiene registro INVIMA";
  if (row.approved) return `Ya aprobada (FDA/EMA ${fmtDate(row.reference_date)})`;
  if (row.overdue) return `Fecha esperada vencida (${fmtDate(row.reference_date)})`;
  if (row.reference_date) return `Llegada esperada ${fmtDate(row.reference_date)}`;
  return "";
}

function priorityGroup(row) {
  if (row.points_rated && Number(row.points) >= 4) return "prio";
  if (row.points_rated && Number(row.points) === 3) return "watch";
  return "rest";
}

function stageIndex(row) {
  const i = STAGE_ORDER.indexOf(row.stage || "captured");
  return i < 0 ? 0 : i;
}

function plural(n, one, many) {
  return `${fmt0.format(n)} ${n === 1 ? one : many}`;
}

function actionFor(row) {
  const id = row.technology_id;
  switch (row.status) {
    case "asignada_a_ciclo":
    case "excluida":
      return `/filtrado?tecnologia=${id}`;
    case "filtrada_apta_priorizacion":
    case "bajo_vigilancia":
    case "no_priorizada":
      return `/priorizacion?tecnologia=${id}`;
    case "priorizada":
    case "en_evaluacion":
    case "publicada":
      return `/evaluacion?tecnologia=${id}`;
    default:
      return `/bandeja-entrada?tecnologia=${id}`;
  }
}

function useLocalFlag(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? initial : raw === "1";
    } catch {
      return initial;
    }
  });
  const update = (next) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* almacenamiento no disponible */
    }
  };
  return [value, update];
}

// --------------------------------------------------------------------------- //
//  Piezas comunes
// --------------------------------------------------------------------------- //
function ChartCard({ title, hint, hasData = true, empty, children, testId, right, className }) {
  return (
    <Card style={{ minWidth: 0 }} className={className}>
      <div className="dc-chart-card" data-testid={testId}>
        <SectionTitle hint={hint} right={right}>
          {title}
        </SectionTitle>
        {hasData ? children : empty}
      </div>
    </Card>
  );
}

/** Burbuja comun de los graficos: por encima de todo y sin salirse de la tarjeta. */
function ChartTip({ title, lines }) {
  return (
    <div className="dc-tip">
      {title && <strong>{title}</strong>}
      {lines.filter(Boolean).map((line, i) => (
        <div key={i} className="dc-tip-line">
          {line.color && <i style={{ background: line.color }} />}
          <span>{line.label}</span>
          {line.value != null && <b>{line.value}</b>}
        </div>
      ))}
    </div>
  );
}
const TIP_WRAPPER = { zIndex: 40, outline: "none" };

// `name` tambien arma los data-testid (pick-cluster-...): la etiqueta visible va aparte.
const DATALIST_LABELS = { cluster: "clúster", tipologia: "tipología", stage: "etapa", franja: "franja", fase: "fase" };

/** Botonera accesible bajo cada grafico: mismos datos, operable con teclado. */
function DataList({ items, activeValue, onPick, color, name }) {
  return (
    <ul className="dc-datalist" aria-label={`Filtrar por ${DATALIST_LABELS[name] || name}`}>
      {items.map((item) => {
        const active = activeValue !== "" && String(activeValue) === String(item.value);
        return (
          <li key={String(item.value)}>
            <button
              type="button"
              aria-pressed={active}
              title={`${item.label}: ${item.count}. ${active ? "Quitar filtro" : "Filtrar por este valor"}`}
              onClick={() => onPick(item.value)}
              data-testid={`pick-${name}-${item.value}`}
            >
              <i style={{ background: typeof color === "function" ? color(item) : color }} />
              <span>{item.label}</span>
              <strong>{fmt0.format(item.count)}</strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Lista de barras en HTML: legible con nombres largos y operable con teclado. */
function BarList({ items, activeValue, onPick, color, name }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const total = items.reduce((acc, i) => acc + i.count, 0) || 1;
  const anyActive = activeValue !== "";
  return (
    <ul className="dc-barlist" aria-label={`Filtrar por ${DATALIST_LABELS[name] || name}`}>
      {items.map((item) => {
        const active = anyActive && String(activeValue) === String(item.value);
        return (
          <li key={String(item.value)}>
            <button
              type="button"
              aria-pressed={active}
              data-dim={anyActive && !active ? "true" : undefined}
              onClick={() => onPick(item.value)}
              data-testid={`pick-${name}-${item.value}`}
              title={`${item.label}: ${item.count}. ${active ? "Quitar filtro" : "Filtrar por este valor"}`}
            >
              <span className="dc-barlist-label">{item.label}</span>
              <span className="dc-barlist-track" aria-hidden="true">
                <i style={{ width: `${(100 * item.count) / max}%`, background: typeof color === "function" ? color(item) : color }} />
              </span>
              <span className="dc-barlist-value">
                <b>{fmt0.format(item.count)}</b>
                <small>{Math.round((100 * item.count) / total)}%</small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Legend({ items }) {
  return (
    <div className="dc-legend" aria-hidden="true">
      {items.map((it) => (
        <span key={it.label}>
          <i style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Resumen ejecutivo
// --------------------------------------------------------------------------- //
function DecisionTile({ label, value, sub, tone, onClick, hint, testId }) {
  const body = (
    <>
      <span className="dc-tile-label">{label}</span>
      <span className="dc-tile-value" data-long={String(value).length > 6 ? "true" : undefined}>{value}</span>
      {sub && <span className="dc-tile-sub">{sub}</span>}
    </>
  );
  return (
    <div className="dc-tile" data-tone={tone} data-testid={testId}>
      {onClick ? (
        <button type="button" onClick={onClick} className="dc-tile-btn">
          {body}
        </button>
      ) : (
        <div className="dc-tile-btn">{body}</div>
      )}
      {hint && (
        <span className="dc-tile-tip">
          <InfoTip text={hint} label={`Qué es ${label}`} />
        </span>
      )}
    </div>
  );
}

/** Embudo con lo que se pierde entre etapas: el dato que mas sirve para gestionar el ciclo. */
function FunnelFlow({ funnel, total, activeStage, onPick }) {
  const captured = funnel[0]?.count || 0;
  const pct = (n) => (captured ? Math.round((100 * n) / captured) : 0);
  return (
    <ol className="dc-funnel" data-testid="chart-funnel" aria-label="Embudo del ciclo">
      {funnel.map((step, i) => {
        const prev = i > 0 ? funnel[i - 1].count : null;
        const lost = prev != null ? prev - step.count : 0;
        const active = i > 0 && activeStage === step.id;
        return (
          <li key={step.id}>
            {i > 0 && (
              <span className="dc-funnel-drop" title={`${lost} no pasaron de ${funnel[i - 1].label.toLowerCase()} a ${step.label.toLowerCase()}`}>
                {lost > 0 ? `−${fmt0.format(lost)}` : "0"}
              </span>
            )}
            <button
              type="button"
              className="dc-funnel-step"
              aria-pressed={active}
              data-testid={`pick-stage-${step.id}`}
              aria-label={`${step.label}: ${step.count}. ${i === 0 ? "Quitar filtro de etapa" : "Filtrar por las que alcanzaron esta etapa"}`}
              onClick={() => onPick(i === 0 ? "" : step.id)}
            >
              <span className="dc-funnel-head">
                <span>{step.label}</span>
                <InfoTip text={step.hint} label={`Qué es ${step.label}`} />
              </span>
              <span className="dc-funnel-value">{fmt0.format(step.count)}</span>
              <span className="dc-funnel-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(captured ? (100 * step.count) / captured : 0, step.count ? 3 : 0)}%`, background: step.color }} />
              </span>
              <span className="dc-funnel-sub">{i === 0 ? `de ${fmt0.format(total)} en el ciclo` : `${pct(step.count)}% de las capturadas`}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function buildInsights({ funnel, rows, clusterStages }) {
  const out = [];
  // Mayor corte del embudo.
  let worst = null;
  for (let i = 1; i < funnel.length; i++) {
    const lost = funnel[i - 1].count - funnel[i].count;
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { lost, from: funnel[i - 1], to: funnel[i] };
  }
  if (worst) {
    out.push({
      tone: "info",
      text: `El mayor corte del ciclo está entre ${worst.from.label.toLowerCase()} y ${worst.to.label.toLowerCase()}: ${fmt0.format(worst.lost)} de ${fmt0.format(worst.from.count)} no avanzaron.`,
    });
  }
  const prio = rows.filter((r) => stageIndex(r) >= 2);
  if (prio.length) {
    const top = [...clusterStages].sort((a, b) => b.reached - a.reached)[0];
    if (top && top.reached > 0) {
      out.push({
        tone: "info",
        text: `${top.label} concentra ${fmt0.format(top.reached)} de las ${fmt0.format(prio.length)} priorizadas (${Math.round((100 * top.reached) / prio.length)}%).`,
      });
    }
  }
  const soonPrio = rows.filter((r) => r.band === "inminente" && priorityGroup(r) === "prio").length;
  if (soonPrio) out.push({ tone: "alert", text: `${plural(soonPrio, "priorizada llega", "priorizadas llegan")} al mercado en menos de un año.` });
  const approvedOpen = rows.filter((r) => r.approved && r.stage !== "published").length;
  if (approvedOpen) out.push({ tone: "warn", text: `${plural(approvedOpen, "tecnología ya aprobada", "tecnologías ya aprobadas")} por FDA/EMA sin informe publicado.` });
  const noDoc = rows.filter((r) => r.stage === "prioritized").length;
  if (noDoc) out.push({ tone: "warn", text: `${plural(noDoc, "priorizada", "priorizadas")} todavía sin ficha, informe ni Mini-HTA abierto.` });
  const noTtm = rows.filter((r) => r.months == null).length;
  if (noTtm) out.push({ tone: "muted", text: `${plural(noTtm, "tecnología no tiene", "tecnologías no tienen")} fecha de fase III ni de aprobación: no se puede estimar su llegada.` });
  return out;
}

function AttentionList({ title, rows, empty, tone, action }) {
  return (
    <div className="dc-attn" data-tone={tone}>
      <div className="dc-attn-head">
        <span className="dc-attn-count">{fmt0.format(rows.length)}</span>
        <span className="dc-attn-title">{title}</span>
      </div>
      {rows.length ? (
        <ul>
          {rows.slice(0, 4).map((r) => (
            <li key={r.technology_id}>
              <Link to={actionFor(r)} title={r.name}>
                {r.name}
              </Link>
              <small>
                {r.cluster}
                {r.months != null ? ` · ${monthsText(r)}` : ""}
                {r.points_rated ? ` · ${r.points} pts` : ""}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dc-attn-empty">{empty}</p>
      )}
      {rows.length > 4 && action}
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Graficos
// --------------------------------------------------------------------------- //
function ArrivalChart({ rows, thresholds, activeBand, onPick }) {
  const inm = Number(thresholds?.inminente ?? 12);
  const tra = Number(thresholds?.transicion ?? 24);
  const eme = Number(thresholds?.emergente ?? 36);
  const range = {
    inminente: `≤ ${fmt0.format(inm)} m`,
    transicion: `${fmt0.format(inm)}–${fmt0.format(tra)} m`,
    emergente: `${fmt0.format(tra)}–${fmt0.format(eme)} m`,
    lejano: `> ${fmt0.format(eme)} m`,
    desconocido: "sin fecha",
  };
  const data = BANDS.map(([code, label]) => {
    const inBand = rows.filter((r) => (r.band || "desconocido") === code);
    const bucket = { id: code, label, range: range[code], total: inBand.length, prio: 0, watch: 0, rest: 0 };
    inBand.forEach((r) => {
      bucket[priorityGroup(r)] += 1;
    });
    return bucket;
  });
  const anyActive = activeBand !== "";
  const Tick = ({ x, y, payload }) => {
    const d = data.find((b) => b.label === payload.value);
    return (
      <g transform={`translate(${x},${y})`}>
        <text y={12} textAnchor="middle" fontSize={12} fontWeight={600} fill={C.ink}>
          {payload.value === "Sin dato suficiente" ? "Sin dato" : payload.value}
        </text>
        <text y={27} textAnchor="middle" fontSize={11} fill={C.muted}>
          {d?.range}
        </text>
      </g>
    );
  };
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <ChartTip
        title={`${d.label} · ${d.range}`}
        lines={[
          ...PRIORITY_GROUPS.map((g) => ({ label: g.label, value: fmt0.format(d[g.key]), color: g.color })),
          { label: "Total", value: fmt0.format(d.total) },
        ]}
      />
    );
  };
  return (
    <>
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={data} margin={{ top: 22, right: 8, bottom: 22, left: -12 }} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" interval={0} tick={<Tick />} tickLine={false} axisLine={{ stroke: C.grid }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
          <Tooltip content={<Tip />} cursor={{ fill: "#F1F5F9" }} wrapperStyle={TIP_WRAPPER} />
          {PRIORITY_GROUPS.map((g, gi) => (
            <Bar
              key={g.key}
              dataKey={g.key}
              stackId="a"
              fill={g.color}
              cursor="pointer"
              isAnimationActive={false}
              onClick={(entry) => entry && onPick(entry.id)}
              radius={gi === PRIORITY_GROUPS.length - 1 ? [6, 6, 0, 0] : 0}
            >
              {data.map((d) => (
                <Cell key={d.id} fillOpacity={!anyActive || activeBand === d.id ? 1 : 0.25} />
              ))}
              {gi === PRIORITY_GROUPS.length - 1 && (
                <LabelList dataKey="total" position="top" style={{ fontSize: 12, fontWeight: 700, fill: C.ink }} formatter={(v) => (v ? v : "")} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend items={PRIORITY_GROUPS} />
      <DataList
        name="franja"
        items={data.map((d) => ({ value: d.id, label: d.label, count: d.total }))}
        activeValue={activeBand}
        onPick={onPick}
        color={(item) => BAND_COLORS[item.value]}
      />
    </>
  );
}

const SHAPE_FOR = { estimate: "circle", approved: "diamond", overdue: "triangle" };

function MatrixTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <ChartTip
      title={row.name}
      lines={[
        { label: `${row.band_label} · ${monthsText(row)}` },
        { label: ttmNote(row) },
        { label: `${row.cluster} · ${row.points_rated ? `${row.points} puntos` : "Sin calificar"}` },
        { label: row.status_label || row.status },
      ]}
    />
  );
}

function DecisionMatrix({ rows, thresholds, summary, onPickBand, onFocusTech }) {
  const inm = Number(thresholds?.inminente ?? 12);
  const eme = Number(thresholds?.emergente ?? 36);
  const points = useMemo(() => {
    const seen = {};
    return rows
      .filter((r) => r.months != null)
      .map((r) => {
        const kind = r.approved ? "approved" : r.overdue ? "overdue" : "estimate";
        const y = r.points_rated ? Number(r.points) : -1;
        const key = `${Math.round(Number(r.months))}|${y}`;
        const n = (seen[key] = (seen[key] || 0) + 1) - 1;
        // Separa visualmente los puntos coincidentes sin cambiar su valor real.
        const offset = n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.17;
        return { ...r, x: Number(r.months), y: y + offset, kind };
      });
  }, [rows]);
  const maxMonths = Math.max(0, ...points.map((p) => p.x));
  const xMax = Math.max(eme + 12, Math.ceil(maxMonths / 12) * 12);
  const ticks = [];
  for (let t = 0; t <= xMax; t += 12) ticks.push(t);
  const actNow = points.filter((p) => p.x <= inm && p.points_rated && Number(p.points) >= 4).length;
  const without = summary?.without_estimate || 0;
  const quad = (value) => ({ value, position: "insideTopLeft", fontSize: 11, fontWeight: 700, fill: "#475569" });
  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 14, bottom: 22, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
          <ReferenceArea x1={0} x2={inm} y1={3.5} y2={6.6} fill="#059669" fillOpacity={0.1} label={quad(`Actuar ya (${actNow})`)} ifOverflow="hidden" />
          <ReferenceArea x1={inm} x2={xMax} y1={3.5} y2={6.6} fill="#4F46E5" fillOpacity={0.05} label={{ ...quad("Preparar"), position: "insideTopRight" }} ifOverflow="hidden" />
          <ReferenceArea x1={0} x2={inm} y1={-1.6} y2={3.5} fill="#F59E0B" fillOpacity={0.08} label={{ ...quad("Revisar"), position: "insideBottomLeft" }} ifOverflow="hidden" />
          <ReferenceArea x1={inm} x2={xMax} y1={-1.6} y2={3.5} fill="#94A3B8" fillOpacity={0.05} label={{ ...quad("Vigilar"), position: "insideBottomRight" }} ifOverflow="hidden" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, xMax]}
            ticks={ticks}
            tick={{ fontSize: 11, fill: C.muted }}
            label={{ value: "Meses estimados al mercado", position: "insideBottom", offset: -12, fontSize: 11, fill: C.muted }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-1.6, 6.6]}
            ticks={[-1, 0, 1, 2, 3, 4, 5, 6]}
            tickFormatter={(v) => (v === -1 ? "Sin calif." : v)}
            tick={{ fontSize: 11, fill: C.muted }}
            width={62}
            label={{ value: "Puntos P1-P6", angle: -90, position: "insideLeft", offset: 12, fontSize: 11, fill: C.muted }}
          />
          <ZAxis range={[70, 70]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<MatrixTip />} wrapperStyle={TIP_WRAPPER} />
          {["estimate", "approved", "overdue"].map((kind) => {
            const data = points.filter((p) => p.kind === kind);
            if (!data.length) return null;
            return (
              <Scatter key={kind} data={data} shape={SHAPE_FOR[kind]} cursor="pointer" isAnimationActive={false} onClick={(p) => p && onFocusTech(p.technology_id)}>
                {data.map((p) => (
                  <Cell key={p.technology_id} fill={BAND_COLORS[p.band] || C.faint} stroke="#fff" />
                ))}
              </Scatter>
            );
          })}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="dc-legend" aria-hidden="true">
        <span>● Estimación</span>
        <span>◆ Ya aprobada o con registro</span>
        <span>▲ Fecha esperada vencida</span>
      </div>
      <p className="dc-chart-note" data-testid="ttm-without">
        {without > 0 ? (
          <>
            {plural(without, "tecnología", "tecnologías")} sin fecha de fase III ni de aprobación no se grafican.{" "}
            <button type="button" className="dc-linkbtn" onClick={() => onPickBand("desconocido")}>
              Ver cuáles
            </button>
          </>
        ) : (
          "Todas las tecnologías del recorte tienen dato de time-to-market."
        )}{" "}
        Inminente hasta {fmt1.format(inm)} meses; revisión regulatoria de {fmt0.format(thresholds?.review_days ?? 180)} días.
      </p>
    </>
  );
}

function ClusterStages({ data, activeCluster, onPick }) {
  const anyActive = activeCluster !== "";
  const height = Math.max(140, data.length * 40 + 28);
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <ChartTip
        title={d.label}
        lines={[
          ...STAGE_SEGMENTS.map((s) => ({ label: s.label, value: fmt0.format(d[s.key]), color: s.color })),
          { label: "Total", value: fmt0.format(d.count) },
        ]}
      />
    );
  };
  const Tick = ({ x, y, payload }) => {
    const full = String(payload?.value ?? "");
    const short = full.length > 26 ? `${full.slice(0, 25)}…` : full;
    return (
      <g transform={`translate(${x},${y})`}>
        <title>{full}</title>
        <text x={-6} y={4} textAnchor="end" fontSize={12} fill="#334155">
          {short}
        </text>
      </g>
    );
  };
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 34, bottom: 0, left: 4 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={172} tick={<Tick />} interval={0} axisLine={false} tickLine={false} />
          <Tooltip content={<Tip />} cursor={{ fill: "#F1F5F9" }} wrapperStyle={TIP_WRAPPER} />
          {STAGE_SEGMENTS.map((s, si) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="c"
              fill={s.color}
              cursor="pointer"
              isAnimationActive={false}
              onClick={(entry) => entry && onPick(entry.id)}
              radius={si === STAGE_SEGMENTS.length - 1 ? [0, 6, 6, 0] : 0}
            >
              {data.map((d) => (
                <Cell key={d.id} fillOpacity={!anyActive || String(activeCluster) === d.id ? 1 : 0.25} />
              ))}
              {si === STAGE_SEGMENTS.length - 1 && <LabelList dataKey="count" position="right" style={{ fontSize: 12, fontWeight: 700, fill: C.ink }} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <Legend items={STAGE_SEGMENTS} />
      <DataList
        name="cluster"
        items={data.map((d) => ({ value: d.id, label: d.label, count: d.count }))}
        activeValue={activeCluster}
        onPick={onPick}
        color={C.violet}
      />
    </>
  );
}

function EvaluationProgress({ rows, onPickStage }) {
  const docs = rows.filter((r) => r.doc_status);
  const waiting = rows.filter((r) => r.stage === "prioritized").length;
  const count = (level, status) => docs.filter((r) => (r.product_level || "ficha") === level && r.doc_status === status).length;
  const totals = DOC_STATUSES.map(([status]) => docs.filter((r) => r.doc_status === status).length);
  const max = Math.max(1, ...DOC_LEVELS.flatMap(([level]) => DOC_STATUSES.map(([status]) => count(level, status))));
  if (!docs.length && !waiting) {
    return <EmptyState icon="📝" message="Ninguna tecnología del recorte tiene expediente de evaluación todavía." />;
  }
  return (
    <div data-testid="eval-progress">
      <div className="dc-table-wrap">
        <table className="dc-matrix">
          <caption className="dc-sr-only">Expedientes por nivel de producto y estado editorial</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              {DOC_STATUSES.map(([status, label]) => (
                <th key={status} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DOC_LEVELS.map(([level, label]) => (
              <tr key={level}>
                <th scope="row">{label}</th>
                {DOC_STATUSES.map(([status, slabel]) => {
                  const n = count(level, status);
                  const done = status === "publicado";
                  const alpha = n ? 0.15 + (0.75 * n) / max : 0;
                  return (
                    <td key={status} title={`${label} · ${slabel}: ${n}`}>
                      <span
                        className="dc-matrix-cell"
                        style={{
                          background: n ? (done ? `rgba(5,150,105,${alpha})` : `rgba(79,70,229,${alpha})`) : "#F8FAFC",
                          color: n ? (alpha > 0.55 ? "#fff" : C.ink) : C.faint,
                        }}
                      >
                        {n || "·"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="dc-matrix-total">
              <th scope="row">Total</th>
              {totals.map((n, i) => (
                <td key={DOC_STATUSES[i][0]}>{n}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="dc-eval-foot">
        <span>
          <b>{fmt0.format(docs.length)}</b> expedientes en el recorte
        </span>
        {waiting > 0 && (
          <button type="button" className="dc-linkbtn" onClick={onPickStage}>
            {plural(waiting, "priorizada espera", "priorizadas esperan")} expediente →
          </button>
        )}
      </div>
    </div>
  );
}

function heatColor(value, max) {
  if (!max || !value) return { background: "#F8FAFC", color: C.faint };
  const t = Math.min(1, value / max);
  const alpha = 0.1 + t * 0.8;
  return { background: `rgba(99, 102, 241, ${alpha.toFixed(3)})`, color: alpha > 0.55 ? "#fff" : "#1E1B4B" };
}

function BudgetHeatmap({ rows, unparsed, activeCluster, onPickCluster }) {
  const cols = [
    ["year1", "Año 1"],
    ["year2", "Año 2"],
    ["year3", "Año 3"],
  ];
  const max = Math.max(0, ...rows.flatMap((r) => [r.year1, r.year2, r.year3]));
  const totals = cols.map(([key]) => rows.reduce((acc, r) => acc + Number(r[key] || 0), 0));
  return (
    <div data-testid="budget-heatmap">
      <div className="dc-table-wrap">
        <table className="dc-heat">
          <caption className="dc-sr-only">Impacto presupuestal potencial por clúster y año (COP)</caption>
          <thead>
            <tr>
              <th scope="col">Clúster</th>
              {cols.map(([key, label]) => (
                <th key={key} scope="col" style={{ textAlign: "center" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const clusterValue = row.cluster_id == null ? "0" : String(row.cluster_id);
              const active = activeCluster !== "" && String(activeCluster) === clusterValue;
              return (
                <tr key={clusterValue}>
                  <th scope="row" className="dc-heat-label">
                    <ClampText text={row.cluster} lines={2} as="span" />
                    <small>
                      {row.n_with_budget} de {row.n} con monto
                    </small>
                  </th>
                  {cols.map(([key, label]) => (
                    <td key={key}>
                      <button
                        type="button"
                        className="dc-heat-cell"
                        style={{ ...heatColor(row[key], max), outline: active ? "2px solid #0F172A" : undefined }}
                        title={`${row.cluster} · ${label}: ${moneyFull(row[key])}. Clic para filtrar por el clúster.`}
                        aria-label={`${row.cluster}, ${label}: ${moneyFull(row[key])}`}
                        onClick={() => onPickCluster(clusterValue)}
                      >
                        {moneyShort(row[key])}
                      </button>
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="dc-heat-label">
                Total del recorte
              </th>
              {totals.map((total, i) => (
                <td key={cols[i][0]} style={{ textAlign: "center", fontWeight: 700, fontSize: 12 }} title={moneyFull(total)}>
                  {moneyShort(total)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="dc-heat-scale" aria-hidden="true">
        <span>$0</span>
        <i />
        <span>{moneyShort(max)}</span>
      </div>
      {unparsed > 0 && (
        <p className="dc-chart-note">
          {unparsed} expediente(s) tienen texto en impacto presupuestal sin un monto reconocible (por ejemplo "por
          estimar"). Escriba el valor en COP, como "3.200 millones" o "$ 3.200.000.000".
        </p>
      )}
    </div>
  );
}

function TopBudget({ items, rowsById }) {
  const top = items
    .map((i) => ({ ...i, total: Number(i.year1 || 0) + Number(i.year2 || 0) + Number(i.year3 || 0) }))
    .filter((i) => i.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  if (!top.length) {
    return <EmptyState icon="💰" message="Ningún expediente del recorte tiene montos de impacto presupuestal." />;
  }
  const max = top[0].total;
  return (
    <ol className="dc-topbudget">
      {top.map((i) => {
        const row = rowsById[i.technology_id];
        return (
          <li key={i.technology_id}>
            <div className="dc-topbudget-head">
              {row ? (
                <Link to={actionFor(row)} title={i.name}>
                  {i.name}
                </Link>
              ) : (
                <span>{i.name}</span>
              )}
              <b title={moneyFull(i.total)}>{moneyShort(i.total)}</b>
            </div>
            <span className="dc-topbudget-bar" aria-hidden="true">
              <i style={{ width: `${(100 * i.total) / max}%` }} />
            </span>
            <small>
              {i.cluster} · {i.points} pts · año 1 {moneyShort(i.year1)}
            </small>
          </li>
        );
      })}
    </ol>
  );
}

// --------------------------------------------------------------------------- //
//  Tabla del recorte
// --------------------------------------------------------------------------- //
const SORTERS = {
  name: (r) => (r.name || "").toLowerCase(),
  cluster: (r) => (r.cluster || "").toLowerCase(),
  tech_type: (r) => (r.tech_type || "").toLowerCase(),
  status: (r) => (r.status_label || r.status || "").toLowerCase(),
  points: (r) => (r.points_rated ? Number(r.points) : -1),
  months: (r) => (r.months == null ? Number.POSITIVE_INFINITY : Number(r.months)),
  phase: (r) => PHASES.findIndex(([code]) => code === r.phase_bucket),
};

const COLUMN_WIDTHS = { name: "28%", cluster: "12%", tech_type: "12%", status: "14%", points: "8%", months: "15%", phase: "11%" };

function RecorteTable({ rows, focusTech, onClearFocus }) {
  const [sort, setSort] = useState({ key: "points", dir: "desc" });
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter((r) => `${r.name} ${r.cluster} ${r.tech_type} ${r.phase}`.toLowerCase().includes(q))
      : rows.slice();
    const get = SORTERS[sort.key] || SORTERS.name;
    list.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return (a.name || "").localeCompare(b.name || "", "es");
    });
    return list;
  }, [rows, query, sort]);

  useEffect(() => setPage(0), [query, sort, rows]);

  useEffect(() => {
    if (!focusTech) return;
    const idx = filtered.findIndex((r) => r.technology_id === focusTech);
    if (idx < 0) return;
    if (!showAll) setPage(Math.floor(idx / PAGE_SIZE));
    window.setTimeout(() => {
      const el = document.querySelector(`[data-tech-row="${focusTech}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTech]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const start = showAll ? 0 : page * PAGE_SIZE;
  const end = showAll ? filtered.length : start + PAGE_SIZE;

  const header = (key, label, tip) => {
    const active = sort.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} style={{ width: COLUMN_WIDTHS[key] }}>
        <span className="term-label">
          <button type="button" onClick={() => setSort({ key, dir: active && sort.dir === "desc" ? "asc" : "desc" })} aria-label={`Ordenar por ${label}`}>
            {label} {active ? (sort.dir === "asc" ? "▲" : "▼") : ""}
          </button>
          {tip && <InfoTip text={tip} label={`Qué es ${label}`} />}
        </span>
      </th>
    );
  };

  return (
    <>
      <div className="dc-table-tools">
        <span className="dc-muted" aria-live="polite">
          {fmt0.format(filtered.length)} de {fmt0.format(rows.length)} tecnología(s)
          {focusTech ? (
            <>
              {" · "}
              <button type="button" className="dc-linkbtn" onClick={onClearFocus}>
                Quitar resaltado
              </button>
            </>
          ) : null}
        </span>
        <div style={{ width: 280, maxWidth: "100%" }} className="no-print">
          <Input id="dc-table-search" label="Buscar en el recorte" placeholder="Nombre, clúster o fase" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 0 }} />
        </div>
      </div>
      <div className="dc-table-wrap">
        <table className="dc-table" data-testid="recorte-table">
          <thead>
            <tr>
              {header("name", "Tecnología")}
              {header("cluster", "Clúster", HELP.cluster)}
              {header("tech_type", "Tipología", HELP.tipologia)}
              {header("status", "Estado", HELP.estado)}
              {header("points", "Puntos", HELP.puntos)}
              {header("months", "Time-to-market", HELP.ttm)}
              {header("phase", "Fase", HELP.fase)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const extra = i < start || i >= end;
              return (
                <tr
                  key={row.technology_id}
                  data-tech-row={row.technology_id}
                  data-focus={focusTech === row.technology_id ? "true" : undefined}
                  className={extra ? "dc-row-extra" : undefined}
                >
                  <td>
                    <Link to={actionFor(row)} className="dc-tech" aria-label={row.name}>
                      <ClampText text={row.name} lines={2} as="span" testId="recorte-name" />
                    </Link>
                  </td>
                  <td title={row.cluster}>
                    <span className="dc-clamp-2">{row.cluster}</span>
                  </td>
                  <td title={row.tech_type}>
                    <span className="dc-clamp-2">{row.tech_type}</span>
                  </td>
                  <td>
                    <Badge tone={row.status} style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
                      {row.status_label || TECH_STATUS_LABELS[row.status] || row.status}
                    </Badge>
                  </td>
                  <td className="dc-num">
                    {row.points_rated ? (
                      <span className="dc-points" data-group={priorityGroup(row)}>
                        {row.points}
                      </span>
                    ) : (
                      <span className="dc-muted">Sin calificar</span>
                    )}
                  </td>
                  <td>
                    <span className="dc-band-dot" style={{ background: BAND_COLORS[row.band] || C.slate }} aria-hidden="true" />
                    <span style={{ color: row.band === "desconocido" ? C.muted : C.ink, fontWeight: 600 }}>{row.band_label}</span>{" "}
                    <span className="dc-num">{row.months != null ? `· ${monthsText(row)}` : ""}</span>
                    <span className="dc-ttm-note">{ttmNote(row)}</span>
                  </td>
                  <td title={row.phase || "Sin fase declarada"}>
                    <span className="dc-clamp-2">{row.phase_label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > PAGE_SIZE && (
        <div className="dc-pager">
          <span>{showAll ? `Mostrando las ${filtered.length}` : `Mostrando ${start + 1}–${Math.min(end, filtered.length)} de ${filtered.length}`}</span>
          <div className="eval-actions">
            {!showAll && (
              <>
                <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                  Siguiente
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Paginar" : "Mostrar todas"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------------------- //
//  Pantalla
// --------------------------------------------------------------------------- //
export default function Dashboards() {
  const { cycleId, cycle, cycles, setCycleId } = useCycle();
  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const restricted = can(PERM.RESTRICTED_ANALYTICS);
  const canRefresh = can(PERM.CYCLE_WRITE);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState("");
  const [clusters, setClusters] = useState([]);
  const [types, setTypes] = useState([]);
  const [focusTech, setFocusTech] = useState(null);
  const [showGraph, setShowGraph] = useLocalFlag(GRAPH_KEY, false);
  const [moreFilters, setMoreFilters] = useLocalFlag(MORE_KEY, false);
  const requestId = useRef(0);
  const urlCycleApplied = useRef(false);

  const filters = useMemo(() => sanitize(searchParams), [searchParams]);
  const filtersKey = FILTER_KEYS.map((k) => filters[k]).join("|");
  const activeCount = FILTER_KEYS.filter((k) => filters[k] !== "").length;
  const secondaryActive = SECONDARY_FILTERS.some((k) => filters[k] !== "");
  const showMore = moreFilters || secondaryActive;
  const dateError =
    filters.date_from && filters.date_to && filters.date_from > filters.date_to
      ? "La fecha 'Captura desde' es posterior a 'Captura hasta'."
      : "";

  // Impresion sin menu lateral ni cabecera.
  useEffect(() => {
    document.body.classList.add("dc-printing");
    return () => document.body.classList.remove("dc-printing");
  }, []);

  useEffect(() => {
    api.get("/clusters").then((r) => setClusters(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/tech-types").then((r) => setTypes(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  // El ciclo del enlace compartido manda una vez; despues el enlace sigue al selector.
  useEffect(() => {
    if (urlCycleApplied.current || !cycles.length) return;
    urlCycleApplied.current = true;
    const wanted = Number(searchParams.get("ciclo"));
    if (wanted && wanted !== cycleId && cycles.some((c) => c.id === wanted)) setCycleId(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycles]);

  useEffect(() => {
    if (!urlCycleApplied.current || !cycleId) return;
    if (searchParams.get("ciclo") === String(cycleId)) return;
    const next = new URLSearchParams(searchParams);
    next.set("ciclo", String(cycleId));
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, cycles]);

  const params = useMemo(() => {
    const p = { cycle_id: cycleId };
    FILTER_KEYS.forEach((k) => {
      if (filters[k] !== "") p[k] = filters[k];
    });
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, filtersKey]);

  const graphFilters = useMemo(() => {
    const f = {};
    FILTER_KEYS.forEach((k) => {
      if (filters[k] !== "") f[k] = filters[k];
    });
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const load = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      setData(null);
      return;
    }
    if (dateError) return;
    const mine = ++requestId.current;
    setUpdating(true);
    try {
      const { data: payload } = await api.get("/strategy/dashboard", { params });
      if (mine === requestId.current) setData(payload);
    } catch (e) {
      if (mine === requestId.current) toast.error(apiError(e, "No se pudo cargar el tablero estratégico"));
    } finally {
      if (mine === requestId.current) {
        setLoading(false);
        setUpdating(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, dateError]);

  useEffect(() => {
    load();
  }, [load, version]);

  const setFilters = useCallback(
    (changes) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === "" || value == null) next.delete(key);
        else next.set(key, String(value));
      });
      if (cycleId) next.set("ciclo", String(cycleId));
      setSearchParams(next, { replace: true });
      setFocusTech(null);
    },
    [searchParams, setSearchParams, cycleId]
  );
  const setFilter = useCallback((key, value) => setFilters({ [key]: value }), [setFilters]);

  const toggleFilter = useCallback(
    (key, value) => {
      const v = value == null ? "" : String(value);
      setFilter(key, filters[key] === v ? "" : v);
    },
    [filters, setFilter]
  );

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (cycleId) next.set("ciclo", String(cycleId));
    setSearchParams(next, { replace: true });
    setFocusTech(null);
  };

  const refresh = async () => {
    if (!cycleId) return;
    setRefreshing(true);
    try {
      await api.post(`/strategy/refresh/${cycleId}`);
      toast.success("Datamart y time-to-market recalculados");
      await load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo refrescar el datamart"));
    } finally {
      setRefreshing(false);
    }
  };

  const doExport = async (fmt) => {
    setExporting(fmt);
    try {
      const res = await api.get("/strategy/dashboard/export", { params: { ...params, format: fmt }, responseType: "blob" });
      const disposition = res.headers?.["content-disposition"] || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const name = match ? match[1] : `tablero.${fmt}`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`Recorte exportado (${name})`);
    } catch (e) {
      toast.error(apiError(e, "No se pudo exportar el recorte"));
    } finally {
      setExporting("");
    }
  };

  const clusterName = (id) => {
    if (String(id) === "0") return "Sin clúster";
    return clusters.find((c) => String(c.id) === String(id))?.name || `Clúster ${id}`;
  };
  const typeName = (id) => {
    if (String(id) === "0") return "Sin tipología";
    return types.find((t) => String(t.id) === String(id))?.name || `Tipología ${id}`;
  };

  const chips = FILTER_KEYS.filter((k) => filters[k] !== "").map((k) => {
    const v = filters[k];
    const text = {
      cluster_id: () => `Clúster: ${clusterName(v)}`,
      tech_type_id: () => `Tipología: ${typeName(v)}`,
      phase: () => `Fase: ${PHASE_LABEL[v]}`,
      status: () => `Estado: ${TECH_STATUS_LABELS[v]}`,
      band: () => `Time-to-market: ${BAND_LABEL[v]}`,
      stage: () => `Etapa alcanzada: ${STAGE_LABEL[v]}`,
      priority_min: () => `Puntos: ${v} o más`,
      date_from: () => `Captura desde ${fmtDate(v)}`,
      date_to: () => `Captura hasta ${fmtDate(v)}`,
    }[k]();
    return { key: k, text };
  });

  const rows = useMemo(() => data?.ttm_scatter || [], [data]);
  const rowsById = useMemo(() => Object.fromEntries(rows.map((r) => [r.technology_id, r])), [rows]);
  const funnel = useMemo(
    () =>
      STAGES.map(([code, label], i) => ({
        id: code,
        label,
        count: Number(data?.funnel?.[code] || 0),
        color: FUNNEL_COLORS[i],
        hint: HELP[["capturadas", "filtradas", "priorizadas", "evaluadas", "publicadas"][i]],
      })),
    [data]
  );
  const captured = funnel[0]?.count || 0;

  const clusterStages = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const id = r.cluster_id == null ? "0" : String(r.cluster_id);
      const b = (map[id] = map[id] || { id, label: r.cluster || "Sin clúster", count: 0, reached: 0, pending: 0, prioritized: 0, evaluated: 0, published: 0 });
      b.count += 1;
      if (stageIndex(r) >= 2) b.reached += 1;
      const seg = STAGE_SEGMENTS.find((s) => s.stages.includes(r.stage || "captured")) || STAGE_SEGMENTS[0];
      b[seg.key] += 1;
    });
    return Object.values(map).sort((a, b) => b.count - a.count || b.reached - a.reached || a.label.localeCompare(b.label, "es"));
  }, [rows]);
  const typeBars = useMemo(
    () => (data?.by_type || []).map((d) => ({ value: d.tech_type_id == null ? "0" : String(d.tech_type_id), label: d.label, count: d.value })),
    [data]
  );
  const phaseBars = useMemo(() => (data?.by_phase || []).filter((d) => d.value > 0).map((d) => ({ value: d.code, label: d.label, count: d.value })), [data]);
  const insights = useMemo(() => buildInsights({ funnel, rows, clusterStages }), [funnel, rows, clusterStages]);

  const thresholds = data?.ttm_thresholds;
  const inm = Number(thresholds?.inminente ?? 12);
  const prioritized = funnel[2]?.count || 0;
  const imminent = rows.filter((r) => r.band === "inminente");
  const actNow = imminent.filter((r) => priorityGroup(r) === "prio");
  const docs = rows.filter((r) => r.doc_status);
  const published = docs.filter((r) => r.doc_status === "publicado").length;
  const toRate = rows.filter((r) => r.status === "filtrada_apta_priorizacion");
  const heat = data?.budget_heatmap || [];
  const hasBudget = heat.some((r) => r.year1 || r.year2 || r.year3);
  const budget3 = heat.reduce((acc, r) => acc + Number(r.year1 || 0) + Number(r.year2 || 0) + Number(r.year3 || 0), 0);
  const withBudget = heat.reduce((acc, r) => acc + Number(r.n_with_budget || 0), 0);

  const attention = {
    soon: imminent.filter((r) => stageIndex(r) < 2).sort((a, b) => Number(a.months) - Number(b.months)),
    noDoc: rows.filter((r) => r.stage === "prioritized").sort((a, b) => Number(b.points) - Number(a.points)),
    approved: rows.filter((r) => r.approved && r.stage !== "published"),
    observed: rows.filter((r) => r.doc_status === "con_observaciones"),
  };

  if (!cycleId) {
    return (
      <EmptyState
        icon="📊"
        title="Seleccione un ciclo"
        message="El tablero estratégico se calcula por ciclo. Elija uno en el selector de ciclo de la parte superior; si no existe ninguno, cree el primero en Ciclos de escaneo."
        action={<Button onClick={() => navigate("/ciclos")}>Ir a ciclos</Button>}
      />
    );
  }
  if (loading && !data) return <LoadingBlock label="Construyendo el tablero estratégico..." />;
  if (!data) {
    return (
      <EmptyState
        icon="⚠️"
        title="No se pudo cargar el tablero"
        message="Revise su conexión e intente de nuevo."
        action={<Button onClick={load}>Reintentar</Button>}
      />
    );
  }

  const cycleEmpty = (data.total_in_cycle || 0) === 0;
  const noMatch = !cycleEmpty && rows.length === 0;
  const emptyChart = (text) => (
    <EmptyState icon="📊" message={text} action={activeCount ? <Button size="sm" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button> : null} />
  );

  return (
    <div aria-busy={updating} className="dc-board">
      <ModuleHeader
        step="diseminacion"
        title={<TermLabel tip={HELP.tablero}>Tablero estratégico</TermLabel>}
        purpose={
          <span className="term-label">
            {data.cycle_code || cycle?.code || "Ciclo"}: qué se priorizó, qué llega pronto al mercado, cómo avanza la evaluación y cuánto podría costar.
            <InfoTip text={HELP.restringido} label="Quién ve los costos" />
          </span>
        }
        actions={
          <div className="eval-actions no-print">
            {canRefresh && (
              <span className="term-label">
                <Button variant="secondary" onClick={refresh} loading={refreshing}>
                  Recalcular datamart
                </Button>
                <InfoTip text={HELP.recalcular} label="Qué es recalcular datamart" />
              </span>
            )}
            <Button variant="outline" onClick={() => navigate("/boletines")}>
              Ver boletín
            </Button>
            <Button variant="secondary" onClick={() => window.print()} aria-label="Imprimir o guardar en PDF">
              Imprimir
            </Button>
          </div>
        }
      />

      <div className="dc-print-head">
        <h1>Tablero estratégico — {data.cycle_code}</h1>
        <div>
          Filtros: {chips.length ? chips.map((c) => c.text).join(" · ") : "sin filtros"} · {rows.length} tecnología(s) ·{" "}
          {data.from_cache ? "Datamart al cierre" : "Cálculo en vivo"} · {restricted ? "Capa restringida" : "Vista agregada"} · Impreso{" "}
          {new Date().toLocaleString("es-CO")}
        </div>
      </div>

      {/* ------------------------------------------------------------ Filtros */}
      <Card padding={18}>
        <div className="dc-toolbar">
          <div className="dc-toolbar-left">
            <SectionTitle hint={HELP.gobernanza}>Recorte</SectionTitle>
            <span
              className="dc-filter-count"
              data-zero={activeCount === 0 ? "true" : "false"}
              data-testid="filter-count"
              aria-label={`${activeCount} filtro(s) activo(s)`}
              title={`${activeCount} filtro(s) activo(s)`}
            >
              {activeCount}
            </span>
            <span className="dc-muted">{activeCount === 1 ? "filtro activo" : "filtros activos"}</span>
            <HintButton
              size="sm"
              variant="ghost"
              onClick={clearFilters}
              disabled={activeCount === 0}
              disabledHint="No hay filtros activos: el tablero ya muestra todo el ciclo."
              className="no-print"
              data-testid="clear-filters"
            >
              Limpiar filtros
            </HintButton>
            {updating && (
              <span className="dc-updating" role="status">
                Actualizando…
              </span>
            )}
          </div>
          <div className="dc-toolbar-right no-print">
            {data.from_cache ? (
              <TermLabel tip={HELP.datamart} label="Qué es datamart">
                <Badge tone="ok">Datamart al cierre</Badge>
              </TermLabel>
            ) : (
              <TermLabel tip={HELP.en_vivo} label="Qué es cálculo en vivo">
                <Badge tone="info">Cálculo en vivo</Badge>
              </TermLabel>
            )}
            {data.from_cache && data.refreshed_at && <span className="strategy-cache-meta">Actualizado {new Date(data.refreshed_at).toLocaleString("es-CO")}</span>}
            <TermLabel tip={HELP.restringido} label="Qué capa de acceso veo">
              <Badge tone={restricted ? "warning" : "default"}>{restricted ? "Capa restringida" : "Vista agregada"}</Badge>
            </TermLabel>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="dc-chips" aria-label="Filtros activos">
            {chips.map((chip) => (
              <button key={chip.key} type="button" className="dc-chip" onClick={() => setFilter(chip.key, "")} aria-label={`Quitar filtro ${chip.text}`} title={`Quitar filtro ${chip.text}`}>
                <span>{chip.text}</span>
                <b aria-hidden="true">×</b>
              </button>
            ))}
          </div>
        )}

        <div className="dc-filters no-print">
          <Select id="f-cluster" label="Clúster" hint={HELP.cluster} value={filters.cluster_id} onChange={(e) => setFilter("cluster_id", e.target.value)}>
            <option value="">Todos</option>
            {clusters.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
            <option value="0">Sin clúster</option>
          </Select>
          <Select id="f-type" label="Tipología" hint={HELP.tipologia} value={filters.tech_type_id} onChange={(e) => setFilter("tech_type_id", e.target.value)}>
            <option value="">Todas</option>
            {types.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
            <option value="0">Sin tipología</option>
          </Select>
          <Select id="f-stage" label="Etapa alcanzada" hint={HELP.etapa} value={filters.stage} onChange={(e) => setFilter("stage", e.target.value)}>
            <option value="">Todas</option>
            {STAGES.slice(1).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
          <Select id="f-band" label="Llegada al mercado" hint={HELP.ttm} value={filters.band} onChange={(e) => setFilter("band", e.target.value)}>
            <option value="">Todas las franjas</option>
            {BANDS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
          {showMore && (
            <>
              <Select id="f-phase" label="Fase clínica" hint={HELP.fase} value={filters.phase} onChange={(e) => setFilter("phase", e.target.value)}>
                <option value="">Todas</option>
                {PHASES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select id="f-status" label="Estado en el ciclo" hint={HELP.estado} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(TECH_STATUS_LABELS)
                  .filter(([key]) => key !== "capturada_no_asignada")
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </Select>
              <Select id="f-points" label="Puntos mínimos P1-P6" hint={HELP.puntos} value={filters.priority_min} onChange={(e) => setFilter("priority_min", e.target.value)}>
                <option value="">Cualquiera</option>
                <option value="3">3 o más (vigilancia)</option>
                <option value="4">4 o más (priorizada)</option>
                <option value="5">5 o más (informe)</option>
                <option value="6">6 (Mini-HTA)</option>
              </Select>
              <Input id="f-from" type="date" label="Captura desde" hint={HELP.captura_desde} value={filters.date_from} max={filters.date_to || undefined} onChange={(e) => setFilter("date_from", e.target.value)} />
              <Input id="f-to" type="date" label="Captura hasta" hint={HELP.captura_hasta} value={filters.date_to} min={filters.date_from || undefined} onChange={(e) => setFilter("date_to", e.target.value)} />
            </>
          )}
        </div>
        {dateError && (
          <p className="dc-error" role="alert">
            {dateError} Corrija el rango para actualizar el tablero.
          </p>
        )}
        <div className="dc-toolbar dc-toolbar-foot no-print">
          <button type="button" className="dc-linkbtn" aria-expanded={showMore} onClick={() => setMoreFilters(!moreFilters)} disabled={secondaryActive}>
            {showMore ? (secondaryActive ? "Más filtros (en uso)" : "Menos filtros ▲") : "Más filtros: fase, estado, puntos y fechas ▼"}
          </button>
          <span className="term-label">
            <HintButton size="sm" variant="secondary" onClick={() => doExport("csv")} loading={exporting === "csv"} disabled={!rows.length || Boolean(exporting)} disabledHint={rows.length ? "Espere a que termine la exportación en curso." : "No hay tecnologías en el recorte para exportar."}>
              Exportar CSV
            </HintButton>
            <HintButton size="sm" variant="secondary" onClick={() => doExport("xlsx")} loading={exporting === "xlsx"} disabled={!rows.length || Boolean(exporting)} disabledHint={rows.length ? "Espere a que termine la exportación en curso." : "No hay tecnologías en el recorte para exportar."}>
              Exportar Excel
            </HintButton>
            <InfoTip text={HELP.exportar} label="Qué incluye la exportación" />
          </span>
        </div>
      </Card>

      {cycleEmpty ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState
            icon="🗂️"
            title="Este ciclo aún no tiene tecnologías"
            message="El tablero se llena cuando se asignan tecnologías al ciclo desde la bandeja de entrada. Luego avanzan por filtrado, priorización y evaluación."
            action={can(PERM.STAGING_ASSIGN) ? <Button onClick={() => navigate("/bandeja-entrada")}>Ir a la bandeja de entrada</Button> : null}
          />
        </Card>
      ) : noMatch ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState
            icon="🔎"
            title="Ninguna tecnología coincide con estos filtros"
            message={`El ciclo tiene ${data.total_in_cycle} tecnología(s), pero ninguna cumple todos los filtros a la vez. Quite alguno de los filtros activos o límpielos todos.`}
            action={<Button onClick={clearFilters}>Limpiar filtros</Button>}
          />
        </Card>
      ) : (
        <>
          {/* ------------------------------------------------ Resumen ejecutivo */}
          <section className="dc-section" aria-labelledby="dc-resumen">
            <h2 id="dc-resumen" className="dc-section-title">
              Resumen para decidir
            </h2>
            <div className="dc-tiles">
              <DecisionTile
                testId="tile-priorizadas"
                label="Priorizadas"
                value={fmt0.format(prioritized)}
                sub={`${captured ? Math.round((100 * prioritized) / captured) : 0}% de las ${fmt0.format(captured)} capturadas`}
                tone="indigo"
                hint={HELP.priorizadas}
                onClick={() => toggleFilter("stage", "prioritized")}
              />
              <DecisionTile
                testId="tile-actuar"
                label="Actuar ya"
                value={fmt0.format(actNow.length)}
                sub={`priorizadas que llegan en ≤ ${fmt0.format(inm)} meses`}
                tone="green"
                hint="Tecnologías con 4 o más puntos P1-P6 cuya llegada estimada al mercado está dentro del tope de 'inminente'. Es la lista de mayor urgencia para quien decide."
                onClick={() => setFilters({ band: "inminente", priority_min: "4" })}
              />
              <DecisionTile
                testId="tile-inminentes"
                label="Llegan en menos de un año"
                value={fmt0.format(imminent.length)}
                sub={`${fmt0.format(imminent.filter((r) => r.approved).length)} ya aprobadas por FDA/EMA`}
                tone="blue"
                hint="Tecnologías en la franja inminente de time-to-market, priorizadas o no."
                onClick={() => toggleFilter("band", "inminente")}
              />
              <DecisionTile
                testId="tile-expedientes"
                label="Expedientes"
                value={fmt0.format(docs.length)}
                sub={`${fmt0.format(published)} publicados · ${fmt0.format(docs.length - published)} en curso`}
                tone="cyan"
                hint="Fichas, informes y Mini-HTA del recorte, en cualquier estado editorial."
                onClick={() => toggleFilter("stage", "evaluated")}
              />
              {restricted ? (
                <DecisionTile
                  testId="tile-presupuesto"
                  label="Impacto a 3 años"
                  value={hasBudget ? moneyShort(budget3) : "—"}
                  sub={hasBudget ? `en ${plural(withBudget, "expediente con monto", "expedientes con monto")}` : "sin montos registrados"}
                  tone="amber"
                  hint="Suma del impacto presupuestal estimado en los años 1, 2 y 3 de los expedientes del recorte (COP)."
                />
              ) : (
                <DecisionTile
                  testId="tile-por-calificar"
                  label="Por calificar"
                  value={fmt0.format(toRate.length)}
                  sub="aptas que esperan los puntos P1-P6"
                  tone="amber"
                  hint="Tecnologías que pasaron el filtrado y todavía no tienen la calificación completa de priorización."
                  onClick={() => toggleFilter("status", "filtrada_apta_priorizacion")}
                />
              )}
            </div>

            <Card padding={18} style={{ marginTop: 14 }}>
              <SectionTitle hint={HELP.embudo}>Embudo del ciclo</SectionTitle>
              <FunnelFlow funnel={funnel} total={data.total_in_cycle || 0} activeStage={filters.stage} onPick={(v) => toggleFilter("stage", v)} />
            </Card>

            <div className="dc-grid dc-grid-13">
              <Card padding={18}>
                <SectionTitle hint={HELP.lectura}>Lectura rápida</SectionTitle>
                {insights.length ? (
                  <ul className="dc-insights" data-testid="insights">
                    {insights.map((it, i) => (
                      <li key={i} data-tone={it.tone}>
                        {it.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dc-muted">Sin hallazgos destacados en este recorte.</p>
                )}
              </Card>
              <Card padding={18}>
                <SectionTitle hint={HELP.atencion}>Requieren atención</SectionTitle>
                <div className="dc-attn-grid" data-testid="attention">
                  <AttentionList
                    tone="alert"
                    title="Llegan pronto y no están priorizadas"
                    rows={attention.soon}
                    empty="Todo lo inminente ya pasó por priorización."
                    action={
                      <button type="button" className="dc-linkbtn" onClick={() => setFilter("band", "inminente")}>
                        Ver las {attention.soon.length} →
                      </button>
                    }
                  />
                  <AttentionList
                    tone="warn"
                    title="Priorizadas sin expediente"
                    rows={attention.noDoc}
                    empty="Toda priorizada tiene expediente abierto."
                    action={
                      <button type="button" className="dc-linkbtn" onClick={() => setFilter("status", "priorizada")}>
                        Ver las {attention.noDoc.length} →
                      </button>
                    }
                  />
                  <AttentionList tone="info" title="Aprobadas por FDA/EMA sin informe publicado" rows={attention.approved} empty="No hay aprobadas pendientes de informe." />
                  <AttentionList tone="warn" title="Expedientes con observaciones" rows={attention.observed} empty="Ningún expediente fue devuelto con observaciones." />
                </div>
              </Card>
            </div>
          </section>

          {/* ----------------------------------------------- Mercado y prioridad */}
          <section className="dc-section" aria-labelledby="dc-mercado">
            <h2 id="dc-mercado" className="dc-section-title">
              Llegada al mercado y prioridad
            </h2>
            <div className="dc-grid">
              <ChartCard title="¿Cuándo llegan al mercado?" hint={HELP.llegada} testId="chart-band" hasData={rows.length > 0} empty={emptyChart("Sin tecnologías en el recorte.")}>
                <ArrivalChart rows={rows} thresholds={thresholds} activeBand={filters.band} onPick={(v) => toggleFilter("band", v)} />
              </ChartCard>
              <ChartCard
                title="Matriz de decisión"
                hint={HELP.matriz}
                testId="chart-ttm"
                hasData={rows.some((r) => r.months != null)}
                empty={
                  <EmptyState
                    icon="⏱️"
                    message="Ninguna tecnología del recorte tiene fecha de fin de fase III ni de aprobación FDA/EMA, así que no hay time-to-market que graficar. Complete esas fechas en la ficha de la tecnología."
                  />
                }
              >
                <DecisionMatrix rows={rows} thresholds={thresholds} summary={data.ttm_summary} onPickBand={(b) => setFilter("band", b)} onFocusTech={setFocusTech} />
              </ChartCard>
            </div>
          </section>

          {/* ------------------------------------------------ Trabajo del ciclo */}
          <section className="dc-section" aria-labelledby="dc-trabajo">
            <h2 id="dc-trabajo" className="dc-section-title">
              Dónde está el trabajo
            </h2>
            <div className="dc-grid">
              <ChartCard title="Clústeres por etapa" hint={HELP.clusteres} testId="chart-cluster" hasData={clusterStages.length > 0} empty={emptyChart("Sin tecnologías en el recorte.")}>
                <ClusterStages data={clusterStages} activeCluster={filters.cluster_id} onPick={(v) => toggleFilter("cluster_id", v)} />
              </ChartCard>
              <ChartCard title="Avance de los expedientes" hint={HELP.expedientes} testId="chart-eval">
                <EvaluationProgress rows={rows} onPickStage={() => setFilter("status", "priorizada")} />
              </ChartCard>
              <ChartCard title="Tipología" hint={HELP.tipo_chart} hasData={typeBars.length > 0} empty={emptyChart("Sin tecnologías en el recorte.")} testId="chart-type">
                <BarList items={typeBars} color={C.blue} activeValue={filters.tech_type_id} onPick={(v) => toggleFilter("tech_type_id", v)} name="tipologia" />
              </ChartCard>
              <ChartCard title="Fase clínica" hint={HELP.fase_chart} hasData={phaseBars.length > 0} empty={emptyChart("Sin tecnologías en el recorte.")} testId="chart-phase">
                <BarList items={phaseBars} color={C.cyan} activeValue={filters.phase} onPick={(v) => toggleFilter("phase", v)} name="fase" />
              </ChartCard>
            </div>
          </section>

          {/* ------------------------------------------------------- Presupuesto */}
          <section className="dc-section" aria-labelledby="dc-presupuesto">
            <h2 id="dc-presupuesto" className="dc-section-title">
              Impacto presupuestal
            </h2>
            <div className="dc-grid">
              <ChartCard
                title="Impacto por clúster y año"
                hint={HELP.calor}
                testId="chart-budget"
                hasData={restricted && hasBudget}
                empty={
                  restricted ? (
                    <EmptyState
                      icon="💰"
                      message="Ningún expediente del recorte tiene montos de impacto presupuestal. Se registran en los campos 'Impacto presupuestal año 1, 2 y 3' de fichas, informes y Mini-HTA (módulo Evaluación)."
                    />
                  ) : (
                    <div data-testid="budget-locked">
                      <EmptyState
                        icon="🔒"
                        title="Modelación presupuestal restringida"
                        message="Los montos de impacto presupuestal solo se muestran a perfiles con acceso restringido (MinSalud, INVIMA, administración). Si los necesita, solicite ese acceso al administrador."
                      />
                    </div>
                  )
                }
              >
                <BudgetHeatmap rows={heat} unparsed={data.budget_unparsed || 0} activeCluster={filters.cluster_id} onPickCluster={(v) => toggleFilter("cluster_id", v)} />
              </ChartCard>
              {restricted && hasBudget && (
                <ChartCard title="Mayor impacto a 3 años" hint={HELP.top_presupuesto} testId="chart-top-budget">
                  <TopBudget items={data.budget_items || []} rowsById={rowsById} />
                </ChartCard>
              )}
            </div>
          </section>
        </>
      )}

      {!cycleEmpty && !noMatch && (
        <Card style={{ marginTop: 16 }}>
          <SectionTitle hint={HELP.recorte}>Tecnologías del recorte</SectionTitle>
          <RecorteTable rows={rows} focusTech={focusTech} onClearFocus={() => setFocusTech(null)} />
        </Card>
      )}

      {restricted && (data.comparators || []).length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <SectionTitle hint={HELP.comparadores}>Comparadores del SGSSS</SectionTitle>
          <ul className="strategy-comparators">
            {data.comparators.map((item) => (
              <li key={item.technology_id}>
                <strong>{item.name}</strong>
                <p>{item.comparators}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card style={{ marginTop: 16 }} padding={showGraph ? 24 : 18}>
        <div className="no-print">
          <button type="button" className="dc-graph-toggle" aria-expanded={showGraph} onClick={() => setShowGraph(!showGraph)}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Grafo de gobernanza</span>
            <span className="dc-muted">{showGraph ? "Ocultar ▲" : "Mostrar ▼"}</span>
          </button>
          {!showGraph && <p className="dc-chart-note">Mapa de relaciones del ciclo con el mismo recorte: amplíelo, consulte cada nodo con el asistente y guarde la vista.</p>}
          {showGraph && (
            <div style={{ marginTop: 12 }}>
              <StrategyGraph cycleId={cycleId} filters={graphFilters} restricted={restricted} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
