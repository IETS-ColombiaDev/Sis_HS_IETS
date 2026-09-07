import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
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
import Badge from "../components/Badge";
import KPICard from "../components/KPICard";
import { Input, Select } from "../components/Field";
import ModuleHeader from "../components/ModuleHeader";
import InfoTip, { TermLabel } from "../components/InfoTip";
import StrategyGraph from "../components/StrategyGraph";
import { chartColors } from "../styles/theme";
import { PERM, TECH_STATUS_LABELS } from "../constants/methodology";

const tooltipStyle = { borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, background: "#fff" };

const BAND_COLORS = {
  inminente: "#1D4ED8",
  transicion: "#0F766E",
  emergente: "#7C3AED",
  lejano: "#64748B",
  desconocido: "#94A3B8",
};

const EMPTY_FILTERS = {
  cluster_id: "",
  tech_type_id: "",
  band: "",
  status: "",
  phase: "",
  priority_min: "",
  date_from: "",
  date_to: "",
};

function ChartCard({ title, hasData, empty, hint, children }) {
  return (
    <Card>
      <SectionTitle hint={hint}>{title}</SectionTitle>
      {hasData ? children : <EmptyState icon="📊" message={empty || "Sin datos para graficar todavia."} />}
    </Card>
  );
}

const HELP = {
  tablero:
    "Este tablero resume el ciclo para quien decide: cuantas tecnologias avanzaron, que tan cerca estan del mercado y cuanto podrian costarle al sistema de salud.",
  datamart:
    "Datamart: copia de los numeros del ciclo guardada al cerrarlo. El tablero la usa para cargar rapido, sin recorrer otra vez toda la base de datos.",
  recalcular:
    "Vuelve a calcular las cifras y el tiempo al mercado a partir de los expedientes actuales. Use esto si acaban de cambiar informes o fechas.",
  en_vivo:
    "Calculo en vivo: los graficos se arman ahora mismo con los filtros que usted eligio, no con la foto guardada al cierre.",
  capturadas: "Tecnologias que ya se asignaron a este ciclo de trabajo.",
  filtradas: "Pasaron el filtro de novedad y no son duplicadas. Ya pueden priorizarse.",
  priorizadas: "Superaron el umbral de puntos P1-P6 y merecen ficha o informe.",
  evaluadas: "Ya tienen ficha, informe o Mini-HTA en curso o listo.",
  publicadas: "El informe ya fue aprobado y puede compartirse (boletin, ficha publica).",
  gobernanza:
    "Recorte el tablero por grupo de enfermedad, tipo de tecnologia, fase, estado, cercania al mercado o puntaje. Todo el embudo se recalcula con el recorte.",
  cluster:
    "Cluster: grupo de enfermedades o problemas de salud (cancer, huerfanas, alto costo, etc.) para organizar las tecnologias.",
  tipologia:
    "Tipologia: tipo de tecnologia (medicamento, terapia avanzada, dispositivo, diagnostico, procedimiento o salud digital).",
  fase:
    "Fase clinica: etapa de investigacion en humanos (I, II, III, IV) o si ya esta autorizada para venderse.",
  estado: "En que paso del ciclo esta la tecnologia: capturada, filtrada, priorizada, evaluada o publicada.",
  ttm:
    "Time-to-market: estimacion de cuantos meses faltan para que la tecnologia pueda llegar al mercado, segun el fin de fase III y las aprobaciones de FDA o EMA.",
  puntos:
    "P1 a P6 son seis preguntas oficiales de priorizacion. Cada si vale 1 punto. 4 o mas suele priorizarse; 6 amerita Mini-HTA.",
  captura_desde: "Solo tecnologias cuya senal se capturo desde esta fecha.",
  captura_hasta: "Solo tecnologias cuya senal se capturo hasta esta fecha.",
  dist_cluster: "Cuantas tecnologias del recorte caen en cada grupo de enfermedad.",
  dispersion:
    "Cada punto es una tecnologia. El eje X es meses al mercado; el eje Y es el puntaje P1-P6. El color indica la franja (inminente, transicion, emergente).",
  embudo:
    "Embudo: cuantas tecnologias avanzaron de capturadas a filtradas, priorizadas, evaluadas y publicadas. Si una barra baja, ahi se quedo el ciclo.",
  calor:
    "Mapa de calor: estimacion de cuanto podria costarle al sistema de salud en los anos 1, 2 y 3, por grupo de enfermedad. Solo la ven perfiles autorizados.",
  tipo_chart: "Como se reparte el recorte segun el tipo de tecnologia.",
  franja:
    "Franjas de cercania al mercado: inminente (menos de 1 ano), transicion (1 a 2), emergente (2 a 3) o lejano.",
  recorte: "Listado de las tecnologias que coinciden con los filtros. Puede abrir el expediente desde el nombre.",
  comparadores:
    "Comparadores del SGSSS: tratamientos que ya se usan en Colombia para la misma enfermedad, contra los que se compara la nueva tecnologia. El SGSSS es el Sistema General de Seguridad Social en Salud.",
  restringido:
    "Los montos y comparadores solo los ven perfiles de MinSalud, INVIMA o administracion. El resto ve el tablero agregado, sin esas modelaciones.",
};

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div style={{ ...tooltipStyle, padding: "10px 12px" }}>
      <strong>{row.name}</strong>
      <div>{row.band_label || row.band} · {row.months ?? "—"} meses</div>
      <div>{row.cluster} · {row.points} puntos · {TECH_STATUS_LABELS[row.status] || row.status}</div>
    </div>
  );
}

function heatTone(value, max) {
  if (!max || !value) return "#F8FAFC";
  const t = Math.min(1, value / max);
  const alpha = 0.12 + t * 0.72;
  return `rgba(29, 78, 216, ${alpha})`;
}

function money(value) {
  const n = Number(value || 0);
  if (!n) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} mil M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  return n.toLocaleString("es-CO");
}

export default function Dashboards() {
  const { cycleId, cycle } = useCycle();
  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const restricted = can(PERM.RESTRICTED_ANALYTICS);
  const canRefresh = can(PERM.CYCLE_WRITE);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [clusters, setClusters] = useState([]);
  const [types, setTypes] = useState([]);

  useEffect(() => {
    api.get("/clusters").then((r) => setClusters(r.data)).catch(() => {});
    api.get("/tech-types").then((r) => setTypes(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!cycleId) {
      setLoading(false);
      setData(null);
      return;
    }
    try {
      const params = { cycle_id: cycleId };
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== "" && value != null) params[key] = value;
      });
      const { data: payload } = await api.get("/strategy/dashboard", { params });
      setData(payload);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar el tablero estrategico"));
    } finally {
      setLoading(false);
    }
  }, [cycleId, filters, toast]);

  useEffect(() => {
    load();
  }, [load, version]);

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

  const funnel = useMemo(
    () => [
      { name: "Capturadas", value: data?.funnel?.captured || 0 },
      { name: "Filtradas", value: data?.funnel?.filtered || 0 },
      { name: "Priorizadas", value: data?.funnel?.prioritized || 0 },
      { name: "Evaluadas", value: data?.funnel?.evaluated || 0 },
      { name: "Publicadas", value: data?.funnel?.published || 0 },
    ],
    [data]
  );

  const scatter = useMemo(
    () =>
      (data?.ttm_scatter || [])
        .filter((r) => r.months != null)
        .map((r) => ({ ...r, months: Number(r.months), points: Number(r.points || 0) })),
    [data]
  );

  const heat = data?.budget_heatmap || [];
  const heatMax = Math.max(0, ...heat.flatMap((r) => [r.year1, r.year2, r.year3]));
  const conversion = data?.conversion || {};
  const hasFilters = Object.values(filters).some((v) => v !== "");

  if (!cycleId) {
    return <EmptyState title="Seleccione un ciclo" description="El tablero estrategico se calcula por ciclo." />;
  }
  if (loading) return <LoadingBlock label="Construyendo el tablero estrategico..." />;
  if (!data) return null;

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title={<TermLabel tip={HELP.tablero}>Tablero estrategico</TermLabel>}
        purpose={
          <span className="term-label">
            Resumen del {cycle?.code || "ciclo"}: cuantas tecnologias avanzaron, que tan cerca estan del mercado
            y cuanto podrian costar.
            <InfoTip text={HELP.restringido} label="Quien ve los costos" />
          </span>
        }
        actions={
          <div className="eval-actions">
            {canRefresh && (
              <span className="term-label">
                <Button variant="secondary" onClick={refresh} loading={refreshing}>
                  Recalcular datamart
                </Button>
                <InfoTip text={HELP.recalcular} label="Que es recalcular datamart" />
              </span>
            )}
            <Button variant="outline" onClick={() => navigate("/boletines")}>
              Ver boletin
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
        }
      />

      <div className="strategy-kpis">
        <KPICard label="Capturadas" hint={HELP.capturadas} value={data.funnel?.captured || 0} accent="#6366F1" sub="Asignadas al ciclo" />
        <KPICard label="Filtradas" hint={HELP.filtradas} value={data.funnel?.filtered || 0} accent="#3B82F6" sub={`${conversion.filter_rate || 0}% del ciclo`} />
        <KPICard label="Priorizadas" hint={HELP.priorizadas} value={data.funnel?.prioritized || 0} accent="#7C3AED" sub={`${conversion.priority_rate || 0}% del ciclo`} />
        <KPICard label="Evaluadas" hint={HELP.evaluadas} value={data.funnel?.evaluated || 0} accent="#0F766E" sub={`${conversion.eval_rate || 0}% del ciclo`} />
        <KPICard label="Publicadas" hint={HELP.publicadas} value={data.funnel?.published || 0} accent="#059669" sub={`${conversion.publish_rate || 0}% del ciclo`} />
      </div>

      <Card>
        <div className="strategy-filter-head">
          <SectionTitle hint={HELP.gobernanza}>Filtros de gobernanza</SectionTitle>
          <div className="eval-actions">
            {data.from_cache ? (
              <TermLabel tip={HELP.datamart} label="Que es datamart">
                <Badge tone="ok">Datamart al cierre</Badge>
              </TermLabel>
            ) : (
              <TermLabel tip={HELP.en_vivo} label="Que es calculo en vivo">
                <Badge tone="info">Calculo en vivo</Badge>
              </TermLabel>
            )}
            {data.refreshed_at && (
              <span className="strategy-cache-meta">
                Actualizado {new Date(data.refreshed_at).toLocaleString()}
              </span>
            )}
            {hasFilters && (
              <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
        <div className="strategy-filters">
          <Select
            label="Cluster"
            hint={HELP.cluster}
            value={filters.cluster_id}
            onChange={(e) => setFilters({ ...filters, cluster_id: e.target.value })}
          >
            <option value="">Todos</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select
            label="Tipologia"
            hint={HELP.tipologia}
            value={filters.tech_type_id}
            onChange={(e) => setFilters({ ...filters, tech_type_id: e.target.value })}
          >
            <option value="">Todas</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <Select
            label="Fase clinica"
            hint={HELP.fase}
            value={filters.phase}
            onChange={(e) => setFilters({ ...filters, phase: e.target.value })}
          >
            <option value="">Todas</option>
            <option value="fase_i">Fase I</option>
            <option value="fase_ii">Fase II</option>
            <option value="fase_iii">Fase III</option>
            <option value="fase_iv">Fase IV</option>
            <option value="autorizada">Autorizada / en mercado</option>
            <option value="sin_fase">Sin fase declarada</option>
          </Select>
          <Select
            label="Estado en el ciclo"
            hint={HELP.estado}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Todos</option>
            {Object.entries(TECH_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Select
            label="Time-to-market"
            hint={HELP.ttm}
            value={filters.band}
            onChange={(e) => setFilters({ ...filters, band: e.target.value })}
          >
            <option value="">Todas las franjas</option>
            <option value="inminente">Inminente</option>
            <option value="transicion">Transicion</option>
            <option value="emergente">Emergente</option>
            <option value="lejano">Lejano</option>
            <option value="desconocido">Sin dato</option>
          </Select>
          <Select
            label="Puntos minimos P1-P6"
            hint={HELP.puntos}
            value={filters.priority_min}
            onChange={(e) => setFilters({ ...filters, priority_min: e.target.value })}
          >
            <option value="">Cualquiera</option>
            <option value="3">3 o mas (vigilancia)</option>
            <option value="4">4 o mas (priorizada)</option>
            <option value="5">5 o mas (informe)</option>
            <option value="6">6 (Mini-HTA)</option>
          </Select>
          <Input
            type="date"
            label="Captura desde"
            hint={HELP.captura_desde}
            value={filters.date_from}
            onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
          />
          <Input
            type="date"
            label="Captura hasta"
            hint={HELP.captura_hasta}
            value={filters.date_to}
            onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
          />
        </div>
        {!restricted && (
          <p className="eval-complete">
            Vista agregada. Las modelaciones presupuestales y comparadores del SGSSS quedan
            restringidos a MSPS e INVIMA.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle hint="Mapa de relaciones del ciclo. Amplielo, consulte cada nodo con MiniMax y guarde la vista.">
          Grafo de gobernanza
        </SectionTitle>
        <StrategyGraph cycleId={cycleId} filters={filters} restricted={restricted} />
      </Card>

      <div className="strategy-grid" key={`charts-${version}`}>
        <ChartCard title="Distribucion por cluster" hint={HELP.dist_cluster} hasData={(data.by_cluster || []).some((d) => d.value > 0)}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.by_cluster}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#6366F1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Dispersion de time-to-market"
          hint={HELP.dispersion}
          hasData={scatter.length > 0}
          empty="No hay fechas de fase III ni de aprobacion de agencia para estimar el time-to-market."
        >
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 16, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis
                dataKey="months"
                name="Meses"
                unit=" m"
                label={{ value: "Meses al mercado", position: "insideBottom", offset: -4, fontSize: 11 }}
              />
              <YAxis
                dataKey="points"
                name="Puntos"
                allowDecimals={false}
                label={{ value: "Puntos P1-P6", angle: -90, position: "insideLeft", fontSize: 11 }}
              />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<ScatterTooltip />} />
              <Scatter data={scatter}>
                {scatter.map((row) => (
                  <Cell key={row.technology_id} fill={BAND_COLORS[row.band] || "#94A3B8"} />
                ))}
                <LabelList dataKey="name" position="top" style={{ fontSize: 10, fill: "#334155" }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Embudo del ciclo" hint={HELP.embudo} hasData={funnel.some((d) => d.value > 0)}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={96} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {funnel.map((_, i) => (
                  <Cell key={i} fill={chartColors[i % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Mapa de calor de impacto presupuestal"
          hint={HELP.calor}
          hasData={restricted && heat.some((r) => r.year1 || r.year2 || r.year3)}
          empty={restricted ? "Sin montos presupuestales parseables en los Mini-HTA del ciclo." : "Modelacion presupuestal restringida."}
        >
          {restricted ? (
            <>
              <div className="strategy-heat">
                <div className="strategy-heat-row strategy-heat-head">
                  <span>Cluster</span>
                  <span>Anio 1</span>
                  <span>Anio 2</span>
                  <span>Anio 3</span>
                </div>
                {heat.map((row) => (
                  <div key={row.cluster} className="strategy-heat-row">
                    <span>{row.cluster}</span>
                    {["year1", "year2", "year3"].map((key) => (
                      <span key={key} style={{ background: heatTone(row[key], heatMax) }}>
                        {money(row[key])}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={heat.map((r) => ({ name: r.cluster, y1: r.year1, y2: r.year2, y3: r.year3 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => (Number(v) ? money(v) : "0")} width={72} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                  <Legend />
                  <Bar dataKey="y1" name="Anio 1" stackId="b" fill="#6366F1" />
                  <Bar dataKey="y2" name="Anio 2" stackId="b" fill="#3B82F6" />
                  <Bar dataKey="y3" name="Anio 3" stackId="b" fill="#06B6D4" />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <EmptyState icon="🔒" message="Modelacion presupuestal restringida." />
          )}
        </ChartCard>

        <ChartCard title="Tipologia" hint={HELP.tipo_chart} hasData={(data.by_type || []).some((d) => d.value > 0)}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.by_type}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#0F766E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Franja de time-to-market" hint={HELP.franja} hasData={(data.by_band || []).some((d) => d.value > 0)}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.by_band}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {(data.by_band || []).map((row) => (
                  <Cell key={row.code || row.label} fill={BAND_COLORS[row.code] || "#6366F1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card>
        <SectionTitle hint={HELP.recorte}>Tecnologias del recorte</SectionTitle>
        {(data.ttm_scatter || []).length === 0 ? (
          <EmptyState message="Ninguna tecnologia coincide con los filtros." />
        ) : (
          <div className="strategy-table-wrap">
            <table className="strategy-table">
              <thead>
                <tr>
                  <th>Tecnologia</th>
                  <th><TermLabel tip={HELP.cluster}>Cluster</TermLabel></th>
                  <th><TermLabel tip={HELP.estado}>Estado</TermLabel></th>
                  <th><TermLabel tip={HELP.puntos}>Puntos</TermLabel></th>
                  <th><TermLabel tip={HELP.ttm}>TTM</TermLabel></th>
                  <th><TermLabel tip={HELP.fase}>Fase</TermLabel></th>
                </tr>
              </thead>
              <tbody>
                {(data.ttm_scatter || []).map((row) => (
                  <tr key={row.technology_id}>
                    <td>
                      <button type="button" className="linkish" onClick={() => navigate("/evaluacion")}>
                        {row.name}
                      </button>
                    </td>
                    <td>{row.cluster}</td>
                    <td><Badge tone={row.status}>{TECH_STATUS_LABELS[row.status] || row.status}</Badge></td>
                    <td>{row.points ?? "—"}</td>
                    <td>{row.band_label || row.band}{row.months != null ? ` · ${row.months} m` : ""}</td>
                    <td>{row.phase || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {restricted && (data.comparators || []).length > 0 && (
        <Card>
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
    </div>
  );
}
