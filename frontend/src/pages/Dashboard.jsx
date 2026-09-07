import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card, SectionTitle } from "../components/Card";
import KPICard from "../components/KPICard";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Icon from "../components/Icon";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { ScreeningScore } from "../components/TriageBoard";
import { IETS_PHASES, SCREENING_QUEUE_THRESHOLD } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import InfoTip from "../components/InfoTip";

export default function Dashboard() {
  const [wb, setWb] = useState(null);
  const [loading, setLoading] = useState(true);
  const { version } = useRealtime();
  const { isEditor } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/dashboard/workbench");
      setWb(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la bandeja de trabajo"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  if (loading) return <LoadingBlock label="Cargando bandeja de trabajo..." />;
  if (!wb) return null;

  return (
    <div>
      <div className="bandeja-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }} className="term-label">
            Bandeja de trabajo
            <InfoTip text={GLOSSARY.bandeja_trabajo} label="Que es la bandeja de trabajo" />
          </h1>
          <p style={{ color: "#64748B", fontSize: 14, margin: 0 }}>
            Operacion diaria del escaneo de horizonte IETS — alerta temprana de tecnologias sanitarias para Colombia.
          </p>
        </div>
        {isEditor && (
          <Button onClick={() => navigate("/vigilancia")}>
            <Icon name="radar" size={17} /> Ejecutar vigilancia
          </Button>
        )}
      </div>

      <div className="methodology-cards" style={{ marginBottom: 24 }}>
        {IETS_PHASES.map((phase) => (
          <button
            key={phase.key}
            type="button"
            className="methodology-card"
            onClick={() => navigate(phase.to)}
          >
            <span className="methodology-card-phase">{phase.phase}</span>
            <strong className="term-label">
              {phase.label}
              <InfoTip text={phase.help || phase.hint} label={`Que es ${phase.label}`} />
            </strong>
            <span>{phase.short}</span>
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KPICard label="En bandeja de entrada" hint={GLOSSARY.bandeja_entrada} value={wb.staging_unassigned} icon={<Icon name="inbox" />} accent="#6366F1" sub="Sin asignar a ciclo" />
        <KPICard label="Cribado alto" hint={GLOSSARY.cribado} value={wb.high_priority} icon={<Icon name="pulse" />} accent="#EF4444" sub={`Puntaje >${SCREENING_QUEUE_THRESHOLD}`} />
        <KPICard label="Me toca calificar" hint={GLOSSARY.p16} value={wb.cycle_pending_for_me} icon={<Icon name="layers" />} accent="#3B82F6" sub={wb.my_criteria?.length ? wb.my_criteria.join(", ") : "Sin criterios asignados"} />
        <KPICard label="Priorizadas" hint={GLOSSARY.priorizadas} value={wb.cycle_prioritized} icon={<Icon name="check" />} accent="#10B981" sub="Ciclo activo" />
        <KPICard label="Bajo vigilancia" hint={GLOSSARY.bajo_vigilancia} value={wb.cycle_watchlist} icon={<Icon name="clock" />} accent="#F59E0B" sub="Monitoreo activo" />
      </div>

      {wb.active_cycle_id ? (
        <Card style={{ marginBottom: 24 }} padding={16}>
          <div className="cycle-banner">
            <div>
              <span className="cycle-banner-label">Ciclo en curso</span>
              <strong>{wb.active_cycle_code}</strong>
              <Badge tone={wb.active_cycle_status}>{wb.active_cycle_status_label}</Badge>
            </div>
            <div className="cycle-banner-meta">
              {wb.cycle_pending_rating} tecnologia(s) sin %P completo
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/ciclos")}>
              Gestionar ciclos
            </Button>
          </div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 24, background: "#FEF3C7", borderColor: "#FDE68A" }} padding={16}>
          <div className="cycle-banner">
            <div style={{ fontSize: 14, color: "#92400E" }}>
              <strong>No hay ciclo operativo abierto.</strong> La priorizacion oficial P1 a P6
              requiere un ciclo activo.
            </div>
            <Button size="sm" onClick={() => navigate("/ciclos")}>
              Crear ciclo
            </Button>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }} className="dash-grid">
        <Card>
          <SectionTitle
            right={
              <Button size="sm" variant="ghost" onClick={() => navigate("/priorizacion")}>
                Abrir priorizacion
              </Button>
            }
          >
            Cola de trabajo
          </SectionTitle>
          {wb.queue.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {wb.queue.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="queue-item"
                  onClick={() => navigate("/bandeja-entrada")}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <ScreeningScore score={f.screening_score} compact />
                    <Badge tone={f.status}>{f.status}</Badge>
                    {f.horizon && <Badge>{f.horizon}</Badge>}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, textAlign: "left", color: "#0F172A" }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4, textAlign: "left" }}>{f.source_title}</div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="✅"
              title="Cola vacia"
              message="No hay senales pendientes. Ejecute la vigilancia de fuentes para detectar tecnologias emergentes."
              action={
                isEditor ? (
                  <Button onClick={() => navigate("/vigilancia")}>
                    <Icon name="radar" size={16} /> Fase 1 · Vigilancia
                  </Button>
                ) : null
              }
            />
          )}
        </Card>

        <Card>
          <SectionTitle>Estado de vigilancia</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="stat-row">
              <span>Fuentes vigiladas</span>
              <strong>{wb.sources_enabled}</strong>
            </div>
            <div className="stat-row">
              <span>Senales ultimos 7 dias</span>
              <strong>{wb.findings_last_7d}</strong>
            </div>
            <div className="stat-row">
              <span>Priorizadas</span>
              <strong>{wb.prioritized}</strong>
            </div>
            {wb.last_scan ? (
              <div style={{ marginTop: 8, padding: 12, background: "#F8FAFC", borderRadius: 10, fontSize: 13 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <Badge tone={wb.last_scan.status}>{wb.last_scan.status}</Badge>
                  <span style={{ color: "#94A3B8" }}>{new Date(wb.last_scan.started_at).toLocaleString()}</span>
                </div>
                <div>{wb.last_scan.message}</div>
                <div style={{ marginTop: 8, color: "#64748B" }}>
                  {wb.last_scan.items_new} nuevas · {wb.last_scan.items_found} detectadas
                </div>
              </div>
            ) : (
              <EmptyState icon="🛰️" message="Aun no hay escaneos registrados." />
            )}
            <Button variant="secondary" onClick={() => navigate("/vigilancia")} style={{ marginTop: 4 }}>
              Ir a vigilancia de fuentes
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
