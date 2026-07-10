import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card, SectionTitle } from "../components/Card";
import KPICard from "../components/KPICard";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Icon from "../components/Icon";
import Accordion from "../components/Accordion";
import Tooltip from "../components/Tooltip";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { ietsTag } from "../utils/iets";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  CartesianGrid,
} from "recharts";
import { chartColors, horizonColors } from "../styles/theme";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const { version } = useRealtime();
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [s, src] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/sources"),
      ]);
      setStats(s.data);
      setSources(src.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las metricas"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  if (loading) return <LoadingBlock label="Cargando resumen..." />;
  if (!stats) return null;

  const horizonData = stats.by_horizon.map((d) => ({
    name: d.label === "" ? "Sin clasificar" : d.label,
    value: d.value,
  }));

  const sortedSources = [...sources].sort((a, b) => {
    const ia = ietsTag(a.category) ? 1 : 0;
    const ib = ietsTag(b.category) ? 1 : 0;
    if (ia !== ib) return ib - ia;
    return (b.findings_count || 0) - (a.findings_count || 0);
  });

  return (
    <div>
      <PageHeader
        title="Resumen general"
        subtitle="Panorama del escaneo de horizonte del IETS: fuentes vigiladas, tecnologias emergentes detectadas y recomendaciones de adopcion para Colombia."
        actions={
          <Button onClick={() => navigate("/escaneo")}>
            <Icon name="radar" size={17} /> Ejecutar escaneo
          </Button>
        }
      />

      {/* Hero */}
      <div
        style={{
          background: "linear-gradient(135deg,#4F46E5 0%,#3B82F6 100%)",
          borderRadius: 16,
          padding: "26px 28px",
          color: "#fff",
          marginBottom: 24,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 2, maxWidth: 680 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85, fontWeight: 600 }}>
            Alerta temprana de tecnologias sanitarias
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: "#fff" }}>
            {stats.total_findings > 0
              ? `${stats.total_findings} señales en vigilancia · ${stats.findings_last_7d} nuevas esta semana`
              : "Aún no hay hallazgos: ejecute un escaneo para poblar el sistema"}
          </div>
          <div style={{ fontSize: 14, opacity: 0.92, marginTop: 6 }}>
            {stats.total_sources} fuentes internacionales monitoreadas · {stats.total_recommendations} recomendaciones de adopción para Colombia
          </div>
        </div>
        <div style={{ position: "absolute", right: -30, top: -30, opacity: 0.15 }}>
          <Icon name="radar" size={190} strokeWidth={1} color="#fff" />
        </div>
      </div>

      {/* Contexto: que es el escaneo de horizonte (acordeon) */}
      <Card style={{ marginBottom: 24 }}>
        <SectionTitle
          right={
            <a href="https://io.nihr.ac.uk/" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#6366F1", fontWeight: 600 }}>
              Referente: NIHR IO <Icon name="external" size={12} />
            </a>
          }
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="book" size={18} /> Que es el escaneo de horizonte?
          </span>
        </SectionTitle>
        <Accordion defaultOpen={["def"]} items={CONTEXT_ITEMS} />
      </Card>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <KPICard label="Fuentes vigiladas" value={stats.total_sources} icon={<Icon name="globe" />} accent="#6366F1" />
        <KPICard
          label="Hallazgos"
          value={stats.total_findings}
          icon={<Icon name="telescope" />}
          accent="#3B82F6"
          sub={`${stats.findings_last_7d} en los ultimos 7 dias`}
        />
        <KPICard
          label="Recomendaciones"
          value={stats.total_recommendations}
          icon={<Icon name="bulb" />}
          accent="#06B6D4"
        />
        <KPICard label="Escaneos realizados" value={stats.total_scrapes} icon={<Icon name="radar" />} accent="#10B981" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
        className="dash-grid"
      >
        <Card>
          <SectionTitle>Hallazgos por horizonte temporal</SectionTitle>
          {horizonData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={horizonData} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748B" }} allowDecimals={false} />
                <ChartTooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {horizonData.map((d, i) => (
                    <Cell key={i} fill={horizonColors[d.name.toLowerCase()] || chartColors[i % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="📉" message="Aun no hay hallazgos. Ejecute un escaneo para poblar los datos." />
          )}
        </Card>

        <Card>
          <SectionTitle>Tipo de tecnologia</SectionTitle>
          {stats.by_technology_type.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={stats.by_technology_type.map((d) => ({
                    name: d.label || "Otro",
                    value: d.value,
                  }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={50}
                  paddingAngle={2}
                  label={(e) => e.name}
                  labelLine={false}
                >
                  {stats.by_technology_type.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Pie>
                <ChartTooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="🥧" message="Sin datos de tipo de tecnologia." />
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }} className="dash-grid">
        <Card>
          <SectionTitle right={<Button size="sm" variant="ghost" onClick={() => navigate("/hallazgos")}>Ver todos</Button>}>
            Hallazgos recientes
          </SectionTitle>
          {stats.recent_findings.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {stats.recent_findings.map((f) => {
                const tag = ietsTag(f.source_category);
                return (
                  <div
                    key={f.id}
                    style={{
                      padding: "12px 14px",
                      border: "1px solid #E2E8F0",
                      borderRadius: 10,
                      transition: "background 150ms",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{f.title}</div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {f.horizon && <Badge>{f.horizon}</Badge>}
                        <Badge>{f.technology_type}</Badge>
                      </div>
                    </div>
                    {/* Fuente de origen del hallazgo */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748B" }}>
                        <Icon name="globe" size={13} color="#94A3B8" />
                        {f.source_url ? (
                          <a
                            href={f.source_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#4F46E5", fontWeight: 500 }}
                            title={`Abrir fuente: ${f.source_title}`}
                          >
                            {f.source_title}
                          </a>
                        ) : (
                          <span>{f.source_title}</span>
                        )}
                      </span>
                      {tag && (
                        <Tooltip text="Este hallazgo proviene de una fuente producida por el IETS.">
                          <Badge tone={tag.tone}>{tag.label}</Badge>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="🔭" message="Aun no hay hallazgos registrados." />
          )}
        </Card>

        <Card>
          <SectionTitle>Ultimo escaneo</SectionTitle>
          {stats.last_scan ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Badge tone={stats.last_scan.status}>{stats.last_scan.status}</Badge>
                <span style={{ fontSize: 13, color: "#64748B" }}>
                  {new Date(stats.last_scan.started_at).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{stats.last_scan.source_title || "Escaneo general"}</div>
              <p style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>{stats.last_scan.message}</p>
              <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#3B82F6" }}>
                    {stats.last_scan.items_found}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase" }}>Detectados</div>
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "#10B981" }}>
                    {stats.last_scan.items_new}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", textTransform: "uppercase" }}>Nuevos</div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState icon="🛰️" message="No se ha ejecutado ningun escaneo todavia." />
          )}
        </Card>
      </div>

      {/* Listado de fuentes vigiladas */}
      <Card style={{ marginTop: 24 }}>
        <SectionTitle
          right={
            <Button size="sm" variant="ghost" onClick={() => navigate("/fuentes")}>
              Gestionar fuentes
            </Button>
          }
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="globe" size={18} /> Fuentes vigiladas ({sources.length})
          </span>
        </SectionTitle>
        {sources.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 10,
            }}
          >
            {sortedSources.map((s) => {
              const tag = ietsTag(s.category);
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    border: "1px solid #E2E8F0",
                    borderRadius: 9,
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      background: "#EEF2FF",
                      color: "#4F46E5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="doc" size={15} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#0F172A",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={s.title}
                    >
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#0F172A" }}
                        >
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 2 }}>
                      {s.findings_count} hallazgos · {s.category || "Sin categoria"}
                    </div>
                  </div>
                  {tag && (
                    <Tooltip text="Fuente producida por el IETS.">
                      <Badge tone={tag.tone}>{tag.label}</Badge>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="🌐" message="No hay fuentes registradas." />
        )}
      </Card>
    </div>
  );
}

const CONTEXT_ITEMS = [
  {
    id: "def",
    icon: "compass",
    title: "Definicion",
    content: (
      <p style={{ margin: 0 }}>
        El <b>escaneo de horizonte</b> (horizon scanning) es un metodo sistematico de{" "}
        <b>alerta temprana</b> que busca, identifica y analiza senales de tecnologias sanitarias
        emergentes y nuevas (medicamentos, dispositivos, diagnosticos y salud digital)
        <b> antes</b> de su entrada al mercado o su adopcion masiva. Permite a los decisores
        anticiparse a los cambios, planificar recursos y preparar la evaluacion de tecnologias
        (ETS) con la debida antelacion.
      </p>
    ),
  },
  {
    id: "fases",
    icon: "layers",
    title: "Fases del proceso (metodologia IETS)",
    content: (
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        <li><b>Identificacion:</b> rastreo de fuentes y captura de senales tecnologicas.</li>
        <li><b>Priorizacion:</b> filtrado y puntuacion segun impacto potencial (umbral &gt; 70%).</li>
        <li><b>Descripcion / caracterizacion:</b> analisis de la tecnologia y su evidencia.</li>
        <li><b>Diseminacion:</b> reportes y alertas a los grupos de interes por cluster tematico.</li>
      </ol>
    ),
  },
  {
    id: "horizontes",
    icon: "clock",
    title: "Horizontes temporales",
    content: (
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li><b>Emergente:</b> tecnologia en fases muy tempranas (preclinica / fase I).</li>
        <li><b>Transicional:</b> en desarrollo clinico o evaluacion (fase II/III, ensayos).</li>
        <li><b>Inminente:</b> proxima a autorizacion o lanzamiento (aprobacion regulatoria, NICE/EMA/FDA).</li>
      </ul>
    ),
  },
  {
    id: "porque",
    icon: "bulb",
    title: "Por que es importante para Colombia",
    content: (
      <p style={{ margin: 0 }}>
        Anticipar las tecnologias emergentes le permite al <b>IETS</b> y al sistema de salud
        colombiano planificar la <b>evaluacion de tecnologias</b>, dialogar tempranamente con
        desarrolladores, estimar el <b>impacto presupuestal</b> y de equidad, y orientar las
        decisiones de cobertura (rol de INVIMA y de la ruta de ETS). Este sistema integra
        referentes internacionales (NIHR IO, IHSI, EuroScan, RedETS, entre otros) con el contexto local.
      </p>
    ),
  },
];
