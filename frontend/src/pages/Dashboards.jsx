import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card, SectionTitle } from "../components/Card";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { chartColors, horizonColors } from "../styles/theme";

function ChartCard({ title, hasData, children }) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      {hasData ? children : <EmptyState icon="📊" message="Sin datos para graficar todavia." />}
    </Card>
  );
}

const tooltipStyle = { borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13 };

export default function Dashboards() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { version } = useRealtime();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/stats");
      setStats(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar los dashboards"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  if (loading) return <LoadingBlock label="Construyendo dashboards..." />;
  if (!stats) return null;

  const norm = (arr) => arr.map((d) => ({ name: d.label || "Sin clasificar", value: d.value }));
  const anyData = (arr) => arr.some((d) => d.value > 0);

  return (
    <div>
      <PageHeader
        title="Dashboards"
        subtitle="Visualizacion analitica del inventario de fuentes y de los hallazgos del escaneo de horizonte."
        actions={<Button variant="secondary" onClick={() => window.print()}>🖨️ Imprimir</Button>}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 16,
        }}
      >
        <ChartCard title="Fuentes por categoria" hasData={anyData(stats.by_category)}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              layout="vertical"
              data={norm(stats.by_category)}
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#64748B" }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={{ fontSize: 11, fill: "#64748B" }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {norm(stats.by_category).map((_, i) => (
                  <Cell key={i} fill={chartColors[i % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Hallazgos por horizonte" hasData={anyData(stats.by_horizon)}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={norm(stats.by_horizon)}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={95}
                label={(e) => `${e.name}: ${e.value}`}
                labelLine={false}
              >
                {norm(stats.by_horizon).map((d, i) => (
                  <Cell key={i} fill={horizonColors[d.name.toLowerCase()] || chartColors[i % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Hallazgos por tipo de tecnologia" hasData={anyData(stats.by_technology_type)}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={norm(stats.by_technology_type)} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis tick={{ fontSize: 12, fill: "#64748B" }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {norm(stats.by_technology_type).map((_, i) => (
                  <Cell key={i} fill={chartColors[i % chartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Estado de los hallazgos" hasData={anyData(stats.by_status)}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={norm(stats.by_status)}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={2}
              >
                {norm(stats.by_status).map((_, i) => (
                  <Cell key={i} fill={chartColors[i % chartColors.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fuentes por idioma" hasData={anyData(stats.by_language)}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={norm(stats.by_language)}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={95}
                label={(e) => `${e.name}: ${e.value}`}
                labelLine={false}
              >
                {norm(stats.by_language).map((_, i) => (
                  <Cell key={i} fill={chartColors[i % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Fuentes mas productivas (hallazgos)" hasData={anyData(stats.top_sources)}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              layout="vertical"
              data={norm(stats.top_sources)}
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#64748B" }} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={160}
                tick={{ fontSize: 10, fill: "#64748B" }}
                tickFormatter={(v) => (v.length > 26 ? v.slice(0, 24) + "…" : v)}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#6366F1" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
