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
import KPICard from "../components/KPICard";
import { Input, Select } from "../components/Field";
import ModuleHeader from "../components/ModuleHeader";
import InfoTip, { TermLabel } from "../components/InfoTip";
import ClampText from "../components/ClampText";
import StrategyGraph from "../components/StrategyGraph";
import { chartColors, theme } from "../styles/theme";
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
const PHASE_LABEL = Object.fromEntries(PHASES);
const BAND_LABEL = Object.fromEntries(BANDS);
const STAGE_LABEL = Object.fromEntries(STAGES);

const BAND_COLORS = {
  inminente: theme.colors.primary.purple,
  transicion: theme.colors.primary.blue,
  emergente: theme.colors.primary.aquamarine,
  lejano: theme.colors.text.tertiary,
  desconocido: theme.colors.borders.medium,
};
const FUNNEL_COLORS = [chartColors[0], chartColors[1], chartColors[2], chartColors[3], "#0F766E"];

const FILTER_KEYS = ["cluster_id", "tech_type_id", "phase", "status", "band", "stage", "priority_min", "date_from", "date_to"];
const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((k) => [k, ""]));
const PAGE_SIZE = 25;
const GRAPH_KEY = "iets_dc_graph_open";

const tooltipStyle = { borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, background: "#fff" };
const fmt1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const fmt0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

const HELP = {
  tablero:
    "Tablero de gobernanza anticipatoria (RF17): resume el ciclo para quien decide. Cuántas tecnologías avanzaron, qué tan cerca están del mercado y cuánto podrían costarle al sistema de salud.",
  datamart:
    "Datamart: copia de las cifras del ciclo guardada al cerrarlo (con el time-to-market de ese momento). El tablero y sus filtros la usan sin volver a recorrer la base transaccional.",
  recalcular:
    "Vuelve a calcular las cifras y el time-to-market con los datos actuales y reemplaza la copia guardada. Use esto si cambiaron fechas o informes después del cierre.",
  en_vivo:
    "Cálculo en vivo: el ciclo está abierto, así que las cifras se arman ahora mismo con los datos actuales y los filtros elegidos.",
  capturadas: "Qué mide: tecnologías asignadas a este ciclo. Cómo se calcula: todas las del recorte, sin importar su estado.",
  filtradas:
    "Qué mide: tecnologías que pasaron el filtro de novedad. Cómo se calcula: estado en el ciclo apta, priorizada, bajo vigilancia, no priorizada, en evaluación o publicada. El porcentaje es sobre las capturadas.",
  priorizadas:
    "Qué mide: tecnologías que superaron el umbral de puntos P1-P6. Cómo se calcula: estado en el ciclo priorizada, en evaluación o publicada. El porcentaje es sobre las capturadas.",
  evaluadas:
    "Qué mide: priorizadas con ficha, informe o Mini-HTA abierto en este ciclo. Cómo se calcula: estado en evaluación o publicada, o expediente del ciclo abierto.",
  publicadas:
    "Qué mide: evaluadas cuyo informe se publicó en este ciclo. Cómo se calcula: estado publicada o expediente del ciclo publicado.",
  gobernanza:
    "Recorte el tablero por clúster, tipología, fase, estado, franja de time-to-market, etapa del embudo, puntaje o fecha de captura. Todos los gráficos y la tabla se recalculan. También puede hacer clic en una barra para filtrar por ella. El enlace de la página guarda el recorte.",
  cluster: "Clúster: grupo de enfermedades o problemas de salud (cáncer, huérfanas, alto costo, etc.) que organiza las tecnologías.",
  tipologia: "Tipología: tipo de tecnología (medicamento, terapia avanzada, dispositivo, diagnóstico, procedimiento o salud digital).",
  fase: "Fase clínica agrupada a partir de la fase declarada (I, II, III, IV o autorizada). Si menciona varias, cuenta la más avanzada.",
  estado: "Estado de la tecnología dentro de este ciclo: asignada, apta, priorizada, bajo vigilancia, en evaluación, publicada, etc.",
  etapa: "Etapa alcanzada del embudo: al elegir 'Priorizadas' quedan también las evaluadas y publicadas, porque pasaron por esa etapa.",
  ttm: "Time-to-market: meses estimados hasta la llegada al mercado, desde la aprobación FDA/EMA o desde el fin de fase III más el plazo de revisión regulatoria.",
  puntos: "Puntos P1 a P6: seis preguntas oficiales de priorización; cada sí vale 1 punto. Las tecnologías sin calificación completa quedan fuera de este filtro.",
  captura_desde: "Solo tecnologías cuya señal se capturó desde esta fecha (hora de Colombia).",
  captura_hasta: "Solo tecnologías cuya señal se capturó hasta esta fecha, inclusive.",
  dist_cluster:
    "Cómo leerlo: cada barra es un clúster y su largo es el número de tecnologías del recorte. Haga clic en una barra (o en su botón debajo) para filtrar por ese clúster.",
  dispersion:
    "Cómo leerlo: cada punto es una tecnología. Eje X: meses estimados al mercado (0 = ya aprobada o fecha esperada vencida). Eje Y: puntos P1-P6. El color es la franja y la forma indica si es estimación, ya aprobada o fecha vencida. Las franjas sombreadas usan los umbrales vigentes (D-10).",
  embudo:
    "Cómo leerlo: cuántas tecnologías del recorte llegaron a cada etapa. Cada barra contiene a la siguiente; donde cae la barra se quedó el ciclo. Clic en una etapa para ver solo las que la alcanzaron.",
  calor:
    "Cómo leerlo: suma del impacto presupuestal estimado (años 1, 2 y 3) de los expedientes del recorte, por clúster. Más oscuro = mayor monto. Los montos salen de los campos de impacto presupuestal de fichas, informes y Mini-HTA.",
  tipo_chart: "Cómo leerlo: cuántas tecnologías del recorte hay por tipología. Clic en una barra para filtrar.",
  franja:
    "Cómo leerlo: cuántas tecnologías caen en cada franja de cercanía al mercado. Inminente, transición y emergente usan los topes en meses vigentes; 'Sin dato' son las que no tienen fecha de fase III ni de aprobación.",
  fase_chart: "Cómo leerlo: cuántas tecnologías del recorte hay por fase clínica. Clic en una barra para filtrar.",
  recorte:
    "Listado de las tecnologías que coinciden con los filtros. El nombre abre el módulo donde se trabaja la tecnología según su estado.",
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

function wrapLabel(text, maxChars = 24, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  let truncated = false;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    if (lines.length === maxLines) {
      truncated = true;
      break;
    }
  }
  if (!truncated && current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }
  if (truncated) {
    const last = lines[maxLines - 1] || "";
    lines[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }
  return lines.length ? lines : [""];
}

function CategoryTick({ x, y, payload }) {
  const full = String(payload?.value ?? "");
  const lines = wrapLabel(full, 24, 2);
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text x={-6} y={0} textAnchor="end" fontSize={11} fill="#334155">
        {lines.map((line, i) => (
          <tspan key={i} x={-6} dy={i === 0 ? (lines.length > 1 ? -4 : 4) : 13}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
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
//  Piezas de la pantalla
// --------------------------------------------------------------------------- //
function ChartCard({ title, hint, hasData, empty, children, testId, right }) {
  return (
    <Card style={{ minWidth: 0 }}>
      <div className="dc-chart-card" data-testid={testId}>
        <SectionTitle hint={hint} right={right}>
          {title}
        </SectionTitle>
        {hasData ? children : empty}
      </div>
    </Card>
  );
}

// `name` tambien arma los data-testid (pick-cluster-...): la etiqueta visible va aparte.
const DATALIST_LABELS = { cluster: "clúster", tipologia: "tipología", stage: "etapa" };

/** Botonera accesible bajo cada grafico: mismos datos, operable con teclado. */
function DataList({ items, activeValue, onPick, color, labelFor, name }) {
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
              <span>{labelFor ? labelFor(item) : item.label}</span>
              <strong>{fmt0.format(item.count)}</strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function BarsHorizontal({ data, color, activeValue, onPick, name, valueKey = "id" }) {
  const height = Math.max(150, data.length * 38 + 30);
  const anyActive = activeValue !== "";
  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="label" width={170} tick={<CategoryTick />} interval={0} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "#F1F5F9" }}
            formatter={(v) => [fmt0.format(v), "Tecnologías"]}
          />
          <Bar
            dataKey="count"
            radius={[0, 6, 6, 0]}
            cursor="pointer"
            onClick={(entry) => entry && onPick(entry[valueKey])}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell
                key={String(d[valueKey])}
                fill={typeof color === "function" ? color(d) : color}
                fillOpacity={!anyActive || String(activeValue) === String(d[valueKey]) ? 1 : 0.3}
              />
            ))}
            <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "#334155" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <DataList
        name={name}
        items={data.map((d) => ({ value: d[valueKey], label: d.label, count: d.count }))}
        activeValue={activeValue}
        onPick={onPick}
        color={color}
      />
    </>
  );
}

const SHAPE_FOR = { estimate: "circle", approved: "diamond", overdue: "triangle" };
const SHAPE_LABEL = {
  estimate: "Estimación (fase III + revisión o aprobación futura)",
  approved: "Ya aprobada o con registro (0 meses)",
  overdue: "Fecha esperada vencida sin aprobación (0 meses)",
};

function ScatterTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div style={{ ...tooltipStyle, padding: "10px 12px", maxWidth: 320 }}>
      <strong style={{ display: "block", marginBottom: 4 }}>{row.name}</strong>
      <div>
        {row.band_label} · {monthsText(row)}
      </div>
      <div style={{ color: "#64748B" }}>{ttmNote(row)}</div>
      <div style={{ color: "#64748B" }}>Base: {row.basis_label || row.basis}</div>
      <div>
        {row.cluster} · {row.points_rated ? `${row.points} puntos` : "Sin calificar"} · {row.status_label || row.status}
      </div>
    </div>
  );
}

function ShapeIcon({ kind, color = "#475569" }) {
  if (kind === "approved") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 0 L12 6 L6 12 L0 6 Z" fill={color} />
      </svg>
    );
  }
  if (kind === "overdue") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M6 0 L12 12 L0 12 Z" fill={color} />
      </svg>
    );
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill={color} />
    </svg>
  );
}

function TtmScatter({ rows, thresholds, summary, onPickBand, onFocusTech }) {
  const points = useMemo(() => {
    const seen = {};
    return rows
      .filter((r) => r.months != null)
      .map((r) => {
        const kind = r.approved ? "approved" : r.overdue ? "overdue" : "estimate";
        const y = r.points_rated ? Number(r.points) : -1;
        const key = `${Number(r.months).toFixed(1)}|${y}`;
        const n = (seen[key] = (seen[key] || 0) + 1) - 1;
        // Separa visualmente los puntos coincidentes sin cambiar su valor real.
        const offset = n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.16;
        return { ...r, x: Number(r.months), y: y + offset, kind };
      });
  }, [rows]);
  const inm = Number(thresholds?.inminente ?? 12);
  const tra = Number(thresholds?.transicion ?? 24);
  const eme = Number(thresholds?.emergente ?? 36);
  const maxMonths = Math.max(0, ...points.map((p) => p.x));
  const xMax = Math.max(eme + 12, Math.ceil(maxMonths / 12) * 12);
  const ticks = [];
  for (let t = 0; t <= xMax; t += 12) ticks.push(t);
  const kinds = ["estimate", "approved", "overdue"];
  const without = summary?.without_estimate || 0;
  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 22, right: 16, bottom: 18, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <ReferenceArea x1={0} x2={inm} fill={BAND_COLORS.inminente} fillOpacity={0.06} label={{ value: "Inminente", position: "insideTop", fontSize: 10, fill: "#475569" }} />
          <ReferenceArea x1={inm} x2={tra} fill={BAND_COLORS.transicion} fillOpacity={0.06} label={{ value: "Transición", position: "insideTop", fontSize: 10, fill: "#475569" }} />
          <ReferenceArea x1={tra} x2={eme} fill={BAND_COLORS.emergente} fillOpacity={0.06} label={{ value: "Emergente", position: "insideTop", fontSize: 10, fill: "#475569" }} />
          <ReferenceArea x1={eme} x2={xMax} fill={BAND_COLORS.lejano} fillOpacity={0.06} label={{ value: "Lejano", position: "insideTop", fontSize: 10, fill: "#475569" }} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, xMax]}
            ticks={ticks}
            padding={{ left: 12, right: 4 }}
            tick={{ fontSize: 11 }}
            label={{ value: "Meses estimados al mercado", position: "insideBottom", offset: -10, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-1.5, 6.5]}
            ticks={[-1, 0, 1, 2, 3, 4, 5, 6]}
            tickFormatter={(v) => (v === -1 ? "Sin calif." : v)}
            tick={{ fontSize: 11 }}
            width={64}
            label={{ value: "Puntos P1-P6", angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
          />
          <ZAxis range={[80, 80]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTip />} />
          {kinds.map((kind) => {
            const data = points.filter((p) => p.kind === kind);
            if (!data.length) return null;
            return (
              <Scatter
                key={kind}
                name={SHAPE_LABEL[kind]}
                data={data}
                shape={SHAPE_FOR[kind]}
                cursor="pointer"
                isAnimationActive={false}
                onClick={(p) => p && onFocusTech(p.technology_id)}
              >
                {data.map((p) => (
                  <Cell key={p.technology_id} fill={BAND_COLORS[p.band] || "#94A3B8"} stroke="#fff" />
                ))}
              </Scatter>
            );
          })}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="dc-legend" aria-label="Leyenda de la dispersión">
        {BANDS.filter(([code]) => code !== "desconocido").map(([code, label]) => (
          <span key={code}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: BAND_COLORS[code], display: "inline-block" }} />
            {label}
          </span>
        ))}
        {kinds.map((kind) => (
          <span key={kind}>
            <ShapeIcon kind={kind} />
            {SHAPE_LABEL[kind]}
          </span>
        ))}
      </div>
      <p className="dc-chart-note" data-testid="ttm-without">
        {without > 0 ? (
          <>
            {fmt0.format(without)} tecnología(s) del recorte no tienen dato para estimar el time-to-market (falta la
            fecha de fin de fase III o de aprobación) y no se grafican.{" "}
            <button type="button" className="dc-link" style={{ border: 0, background: "none", padding: 0, cursor: "pointer" }} onClick={() => onPickBand("desconocido")}>
              Ver cuáles
            </button>
          </>
        ) : (
          "Todas las tecnologías del recorte tienen dato de time-to-market."
        )}{" "}
        Umbrales vigentes: inminente hasta {fmt1.format(inm)} meses, transición hasta {fmt1.format(tra)}, emergente
        hasta {fmt1.format(eme)}; revisión regulatoria de {fmt0.format(thresholds?.review_days ?? 180)} días.
      </p>
    </>
  );
}

function heatColor(value, max) {
  if (!max || !value) return { background: "#F8FAFC", color: "#94A3B8" };
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
      <th
        scope="col"
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        style={{ width: COLUMN_WIDTHS[key] }}
      >
        <span className="term-label">
          <button
            type="button"
            onClick={() => setSort({ key, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
            aria-label={`Ordenar por ${label}`}
          >
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
              <button type="button" className="dc-link" style={{ border: 0, background: "none", cursor: "pointer" }} onClick={onClearFocus}>
                Quitar resaltado
              </button>
            </>
          ) : null}
        </span>
        <div style={{ width: 280, maxWidth: "100%" }} className="no-print">
          <Input
            id="dc-table-search"
            label="Buscar en el recorte"
            placeholder="Nombre, clúster o fase"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 0 }}
          />
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
                    <Badge tone={row.status} style={{ whiteSpace: "normal", lineHeight: 1.35 }}>{row.status_label || TECH_STATUS_LABELS[row.status] || row.status}</Badge>
                  </td>
                  <td className="dc-num">{row.points_rated ? row.points : <span className="dc-muted">Sin calificar</span>}</td>
                  <td>
                    <span style={{ color: BAND_COLORS[row.band] === BAND_COLORS.desconocido ? "#64748B" : "#0F172A", fontWeight: 600 }}>
                      {row.band_label}
                    </span>{" "}
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
          <span>
            {showAll ? `Mostrando las ${filtered.length}` : `Mostrando ${start + 1}–${Math.min(end, filtered.length)} de ${filtered.length}`}
          </span>
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
  const requestId = useRef(0);
  const urlCycleApplied = useRef(false);

  const filters = useMemo(() => sanitize(searchParams), [searchParams]);
  const filtersKey = FILTER_KEYS.map((k) => filters[k]).join("|");
  const activeCount = FILTER_KEYS.filter((k) => filters[k] !== "").length;
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

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams);
      if (value === "" || value == null) next.delete(key);
      else next.set(key, String(value));
      if (cycleId) next.set("ciclo", String(cycleId));
      setSearchParams(next, { replace: true });
      setFocusTech(null);
    },
    [searchParams, setSearchParams, cycleId]
  );

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
      const res = await api.get("/strategy/dashboard/export", {
        params: { ...params, format: fmt },
        responseType: "blob",
      });
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

  const funnel = useMemo(
    () =>
      STAGES.map(([code, label], i) => ({
        id: code,
        label,
        count: Number(data?.funnel?.[code] || 0),
        color: FUNNEL_COLORS[i],
      })),
    [data]
  );
  const captured = funnel[0]?.count || 0;
  const pct = (n) => (captured ? Math.round((100 * n) / captured) : 0);

  const clusterBars = useMemo(
    () => (data?.by_cluster || []).map((d) => ({ id: d.cluster_id == null ? "0" : String(d.cluster_id), label: d.label, count: d.value })),
    [data]
  );
  const typeBars = useMemo(
    () => (data?.by_type || []).map((d) => ({ id: d.tech_type_id == null ? "0" : String(d.tech_type_id), label: d.label, count: d.value })),
    [data]
  );
  const bandBars = useMemo(() => (data?.by_band || []).map((d) => ({ id: d.code, label: d.label, count: d.value })), [data]);
  const phaseBars = useMemo(() => (data?.by_phase || []).map((d) => ({ id: d.code, label: d.label, count: d.value })), [data]);
  const rows = data?.ttm_scatter || [];
  const heat = data?.budget_heatmap || [];
  const hasBudget = heat.some((r) => r.year1 || r.year2 || r.year3);

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
    <EmptyState
      icon="📊"
      message={text}
      action={activeCount ? <Button size="sm" variant="secondary" onClick={clearFilters}>Limpiar filtros</Button> : null}
    />
  );

  return (
    <div aria-busy={updating}>
      <ModuleHeader
        step="diseminacion"
        title={<TermLabel tip={HELP.tablero}>Tablero estratégico</TermLabel>}
        purpose={
          <span className="term-label">
            Gobernanza del {data.cycle_code || cycle?.code || "ciclo"}: cuántas tecnologías avanzaron, qué tan cerca están
            del mercado y cuánto podrían costar.
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

      <div className="strategy-kpis" role="group" aria-label="Embudo del ciclo">
        {funnel.map((step, i) => (
          <KPICard
            key={step.id}
            label={step.label}
            hint={HELP[["capturadas", "filtradas", "priorizadas", "evaluadas", "publicadas"][i]]}
            value={fmt0.format(step.count)}
            accent={step.color}
            sub={i === 0 ? `de ${fmt0.format(data.total_in_cycle || 0)} en el ciclo` : `${data.conversion?.[["", "filter_rate", "priority_rate", "eval_rate", "publish_rate"][i]] ?? pct(step.count)}% de las capturadas`}
            onClick={() => toggleFilter("stage", i === 0 ? "" : step.id)}
            active={filters.stage === step.id && i > 0}
            actionLabel={`${step.label}: ${step.count}. ${i === 0 ? "Quitar filtro de etapa" : "Filtrar por las que alcanzaron esta etapa"}`}
          />
        ))}
      </div>

      <Card>
        <div className="dc-toolbar">
          <div className="dc-toolbar-left">
            <SectionTitle hint={HELP.gobernanza}>Filtros de gobernanza</SectionTitle>
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
            {updating && <span className="dc-updating" role="status">Actualizando…</span>}
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
            {data.from_cache && data.refreshed_at && (
              <span className="strategy-cache-meta">Actualizado {new Date(data.refreshed_at).toLocaleString("es-CO")}</span>
            )}
            <TermLabel tip={HELP.restringido} label="Qué capa de acceso veo">
              <Badge tone={restricted ? "warning" : "default"}>{restricted ? "Capa restringida" : "Vista agregada"}</Badge>
            </TermLabel>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="dc-chips" aria-label="Filtros activos">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="dc-chip"
                onClick={() => setFilter(chip.key, "")}
                aria-label={`Quitar filtro ${chip.text}`}
                title={`Quitar filtro ${chip.text}`}
              >
                <span>{chip.text}</span>
                <b aria-hidden="true">×</b>
              </button>
            ))}
          </div>
        )}

        <div className="dc-filters no-print" style={{ marginTop: 12 }}>
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
          <Select id="f-phase" label="Fase clínica" hint={HELP.fase} value={filters.phase} onChange={(e) => setFilter("phase", e.target.value)}>
            <option value="">Todas</option>
            {PHASES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
          <Select id="f-stage" label="Etapa alcanzada" hint={HELP.etapa} value={filters.stage} onChange={(e) => setFilter("stage", e.target.value)}>
            <option value="">Todas</option>
            {STAGES.slice(1).map(([code, label]) => (
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
          <Select id="f-band" label="Time-to-market" hint={HELP.ttm} value={filters.band} onChange={(e) => setFilter("band", e.target.value)}>
            <option value="">Todas las franjas</option>
            {BANDS.map(([code, label]) => (
              <option key={code} value={code}>
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
        </div>
        {dateError && (
          <p className="dc-error" role="alert">
            {dateError} Corrija el rango para actualizar el tablero.
          </p>
        )}
        <div className="dc-toolbar no-print" style={{ marginBottom: 0 }}>
          <span className="dc-muted">
            {restricted
              ? "Ve la capa restringida: montos presupuestales y comparadores del SGSSS incluidos."
              : "Vista agregada: las modelaciones presupuestales y los comparadores del SGSSS están restringidos a MSPS e INVIMA."}
          </span>
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
            action={
              can(PERM.STAGING_ASSIGN) ? (
                <Button onClick={() => navigate("/bandeja-entrada")}>Ir a la bandeja de entrada</Button>
              ) : null
            }
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
        <div className="dc-grid" key={`charts-${data.cycle_id}`}>
          <ChartCard title="Distribución por clúster" hint={HELP.dist_cluster} hasData={clusterBars.length > 0} empty={emptyChart("Sin tecnologías en el recorte.")} testId="chart-cluster">
            <BarsHorizontal data={clusterBars} color={theme.colors.primary.purple} activeValue={filters.cluster_id} onPick={(v) => toggleFilter("cluster_id", v)} name="cluster" />
          </ChartCard>

          <ChartCard
            title="Dispersión de time-to-market"
            hint={HELP.dispersion}
            hasData={rows.some((r) => r.months != null)}
            testId="chart-ttm"
            empty={
              <EmptyState
                icon="⏱️"
                message="Ninguna tecnología del recorte tiene fecha de fin de fase III ni de aprobación FDA/EMA, así que no hay time-to-market que graficar. Complete esas fechas en la ficha de la tecnología."
              />
            }
          >
            <TtmScatter rows={rows} thresholds={data.ttm_thresholds} summary={data.ttm_summary} onPickBand={(b) => setFilter("band", b)} onFocusTech={setFocusTech} />
          </ChartCard>

          <ChartCard title="Embudo de conversión del ciclo" hint={HELP.embudo} hasData={captured > 0} empty={emptyChart("Sin tecnologías en el recorte.")} testId="chart-funnel">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnel} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#F1F5F9" }} formatter={(v) => [`${fmt0.format(v)} (${pct(v)}% de las capturadas)`, "Tecnologías"]} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} cursor="pointer" isAnimationActive={false} onClick={(entry) => entry && toggleFilter("stage", entry.id === "captured" ? "" : entry.id)}>
                  {funnel.map((d) => (
                    <Cell key={d.id} fill={d.color} fillOpacity={!filters.stage || filters.stage === d.id ? 1 : 0.3} />
                  ))}
                  <LabelList dataKey="count" position="right" formatter={(v) => `${fmt0.format(v)} · ${pct(v)}%`} style={{ fontSize: 11, fill: "#334155" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <DataList
              name="stage"
              items={funnel.slice(1).map((d) => ({ value: d.id, label: d.label, count: d.count, color: d.color }))}
              activeValue={filters.stage}
              onPick={(v) => toggleFilter("stage", v)}
              color={(item) => item.color}
            />
          </ChartCard>

          <ChartCard
            title="Mapa de calor de impacto presupuestal"
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

          <ChartCard title="Tipología" hint={HELP.tipo_chart} hasData={typeBars.length > 0} empty={emptyChart("Sin tecnologías en el recorte.")} testId="chart-type">
            <BarsHorizontal data={typeBars} color={theme.colors.primary.blue} activeValue={filters.tech_type_id} onPick={(v) => toggleFilter("tech_type_id", v)} name="tipologia" />
          </ChartCard>

          <ChartCard title="Franja de time-to-market" hint={HELP.franja} hasData={bandBars.some((d) => d.count > 0)} empty={emptyChart("Sin tecnologías en el recorte.")} testId="chart-band">
            <BarsHorizontal data={bandBars} color={(d) => BAND_COLORS[d.value ?? d.id] || "#6366F1"} activeValue={filters.band} onPick={(v) => toggleFilter("band", v)} name="franja" />
          </ChartCard>

          <ChartCard title="Fase clínica" hint={HELP.fase_chart} hasData={phaseBars.some((d) => d.count > 0)} empty={emptyChart("Sin tecnologías en el recorte.")} testId="chart-phase">
            <BarsHorizontal data={phaseBars} color={theme.colors.primary.aquamarine} activeValue={filters.phase} onPick={(v) => toggleFilter("phase", v)} name="fase" />
          </ChartCard>
        </div>
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
          {!showGraph && (
            <p className="dc-chart-note">
              Mapa de relaciones del ciclo con el mismo recorte: amplíelo, consulte cada nodo con el asistente y guarde la vista.
            </p>
          )}
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
