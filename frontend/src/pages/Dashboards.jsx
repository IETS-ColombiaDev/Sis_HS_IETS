import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { Select } from "../components/Field";
import ModuleHeader from "../components/ModuleHeader";
import { chartColors } from "../styles/theme";
import { PERM } from "../constants/methodology";

const tooltipStyle = { borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, background: "#fff" };

function ChartCard({ title, hasData, empty, children }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {hasData ? children : <EmptyState icon="📊" message={empty || "Sin datos para graficar todavia."} />}
    </Card>
  );
}

export default function Dashboards() {
  const { cycleId, cycle } = useCycle();
  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const restricted = can(PERM.RESTRICTED_ANALYTICS);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ cluster_id: "", tech_type_id: "", band: "", status: "" });
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
      if (filters.cluster_id) params.cluster_id = filters.cluster_id;
      if (filters.tech_type_id) params.tech_type_id = filters.tech_type_id;
      if (filters.band) params.band = filters.band;
      if (filters.status) params.status = filters.status;
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

  if (!cycleId) {
    return <EmptyState title="Seleccione un ciclo" description="El tablero estrategico se calcula por ciclo." />;
  }
  if (loading) return <LoadingBlock label="Construyendo el tablero estrategico..." />;
  if (!data) return null;

  const funnel = [
    { name: "Capturadas", value: data.funnel?.captured || 0 },
    { name: "Filtradas", value: data.funnel?.filtered || 0 },
    { name: "Priorizadas", value: data.funnel?.prioritized || 0 },
    { name: "Evaluadas", value: data.funnel?.evaluated || 0 },
  ];
  const scatter = (data.ttm_scatter || [])
    .filter((r) => r.months != null)
    .map((r) => ({ ...r, months: Number(r.months) }));
  const heat = (data.budget_heatmap || []).map((r) => ({
    name: r.cluster,
    y1: r.year1,
    y2: r.year2,
    y3: r.year3,
  }));

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title="Tablero estrategico"
        purpose={`${cycle?.code || "Ciclo"} · Embudo, time-to-market y clusters del ciclo. Las modelaciones presupuestales solo las ven MSPS e INVIMA.`}
        actions={
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir
          </Button>
        }
      />

      <Card>
        <div className="strategy-filters">
          <Select
            label="Cluster"
            value={filters.cluster_id}
            onChange={(e) => setFilters({ ...filters, cluster_id: e.target.value })}
          >
            <option value="">Todos</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Tipologia"
            value={filters.tech_type_id}
            onChange={(e) => setFilters({ ...filters, tech_type_id: e.target.value })}
          >
            <option value="">Todas</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select
            label="Time-to-market"
            value={filters.band}
            onChange={(e) => setFilters({ ...filters, band: e.target.value })}
          >
            <option value="">Todas las franjas</option>
            <option value="inminente">Inminente</option>
            <option value="transicion">Transicion</option>
            <option value="emergente">Emergente</option>
            <option value="desconocido">Sin dato</option>
          </Select>
        </div>
        {!restricted && (
          <p className="eval-complete">
            Vista agregada. Las modelaciones presupuestales y comparadores quedan restringidos a MSPS e INVIMA.
          </p>
        )}
      </Card>

      <div className="strategy-grid" key={`charts-${version}`}>
        <ChartCard title="Distribucion por cluster" hasData={(data.by_cluster || []).some((d) => d.value > 0)}>
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
          hasData={scatter.length > 0}
          empty="No hay fechas de fase III para estimar el time-to-market de este ciclo."
        >
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="months" name="Meses" unit=" m" />
              <YAxis dataKey="points" name="Puntos" allowDecimals={false} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
              <Scatter data={scatter} fill="#3B82F6" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Embudo del ciclo" hasData={funnel.some((d) => d.value > 0)}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#06B6D4" radius={[0, 6, 6, 0]}>
                {funnel.map((_, i) => (
                  <Cell key={i} fill={chartColors[i % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Mapa de calor de impacto presupuestal"
          hasData={restricted && heat.length > 0}
        >
          {restricted ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={heat}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="y1" name="Anio 1" stackId="b" fill="#6366F1" />
                <Bar dataKey="y2" name="Anio 2" stackId="b" fill="#3B82F6" />
                <Bar dataKey="y3" name="Anio 3" stackId="b" fill="#06B6D4" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="🔒" message="Modelacion presupuestal restringida." />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
