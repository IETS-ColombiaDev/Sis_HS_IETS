import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import ClampText from "../components/ClampText";
import { ScreeningScore } from "../components/TriageBoard";
import { IETS_PHASES, SCREENING_QUEUE_THRESHOLD } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import InfoTip from "../components/InfoTip";
import "./dashboards.css";

// Que mide cada indicador y como se calcula (criterio operativo: sin
// documentacion externa).
const KPI_HELP = {
  bandeja:
    "Qué mide: señales capturadas que aún no se asignan a ningún ciclo. Cómo se calcula: tecnologías en estado 'capturada / no asignada'.",
  cribado: `Qué mide: señales de la cola de cribado con puntaje alto. Cómo se calcula: señales con puntaje de cribado de ${SCREENING_QUEUE_THRESHOLD} o más (0 a 100). Es una ayuda para ordenar, no el %P oficial.`,
  calificar:
    "Qué mide: su trabajo pendiente en la matriz oficial. Cómo se calcula: tecnologías del ciclo activo aptas para priorización y no congeladas a las que les falta al menos uno de los criterios que su perfil califica.",
  priorizadas:
    "Qué mide: tecnologías del ciclo activo que superaron el umbral de puntos y esperan pasar a evaluación. Cómo se calcula: estado 'priorizada'. El tablero estratégico suma además las que ya están en evaluación o publicadas.",
  vigilancia:
    "Qué mide: tecnologías del ciclo activo que quedaron en observación (3 puntos). Cómo se calcula: estado 'bajo vigilancia'; se proponen para el ciclo siguiente al cerrar.",
  sin_pct:
    "Tecnologías del ciclo activo, aptas para calificar y no congeladas, cuyo %P aún no se calcula porque falta al menos un criterio de P1 a P6.",
  pendientes:
    "Lo que su perfil tiene por hacer hoy. Cada tarjeta dice qué cuenta, cómo se calcula (icono de ayuda) y lleva directo a la pantalla donde se resuelve.",
  cola:
    "Señales sin procesar ordenadas por puntaje de cribado. Se omiten las que ya tienen desenlace (publicadas, excluidas, no priorizadas) o se fusionaron. Cada una lleva a la acción que le corresponde según su estado.",
};

const SEVERITY_LABEL = { accion: "Por hacer", aviso: "Atención", info: "Para leer", ok: "Al día" };

function isIdle(item) {
  return item.severity === "ok" || (item.severity === "accion" && item.count === 0);
}

function WorkCard({ item }) {
  // "Al dia": nada por hacer. Un aviso (p. ej. indice INVIMA vacio) nunca lo es.
  const empty = isIdle(item);
  return (
    <article
      className="dc-work-card"
      data-severity={item.severity}
      data-empty={empty ? "true" : "false"}
      data-testid={`work-${item.key}`}
      aria-label={`${item.label}: ${item.count}`}
    >
      <div className="dc-work-head">
        <span className="dc-work-count" data-testid={`work-${item.key}-count`}>
          {item.count}
        </span>
        <Badge tone={empty ? "ok" : item.severity === "aviso" ? "warning" : item.severity === "info" ? "info" : "default"}>
          {empty ? "Al día" : SEVERITY_LABEL[item.severity] || item.severity}
        </Badge>
      </div>
      <div className="dc-work-label">
        <ClampText text={item.label} lines={2} as="span" />
        <InfoTip text={item.help} label={`Cómo se calcula: ${item.label}`} />
      </div>
      {item.samples?.length > 0 && (
        <ul className="dc-work-samples">
          {item.samples.slice(0, 3).map((s) => (
            <li key={`${item.key}-${s.id}`}>
              <Link to={s.to} title={s.name}>
                <ClampText text={s.name} lines={1} as="span" />
              </Link>
              {s.detail && <small>{s.detail}</small>}
            </li>
          ))}
          {item.count > 3 && <li className="dc-muted" style={{ fontSize: 12 }}>y {item.count - 3} más</li>}
        </ul>
      )}
      <div className="dc-work-action">
        <Link to={item.to} data-testid={`work-${item.key}-go`}>
          {item.action_label} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default function Dashboard() {
  const [wb, setWb] = useState(null);
  const [work, setWork] = useState(null);
  const [loading, setLoading] = useState(true);
  const { version } = useRealtime();
  const { isEditor, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.allSettled([
        api.get("/dashboard/workbench"),
        api.get("/dashboard/my-work"),
      ]);
      if (a.status === "fulfilled") setWb(a.value.data);
      if (b.status === "fulfilled") {
        setWork(b.value.data);
      } else {
        setWork({
          role: "",
          role_label: "",
          items: [],
          total_pending: 0,
          my_criteria: [],
          queue: [],
          queue_total: 0,
          active_cycle_id: null,
          active_cycle_code: "",
          active_cycle_status: "",
          active_cycle_status_label: "",
        });
      }
      if (a.status === "rejected" && b.status === "rejected") {
        toast.error(apiError(a.reason, "No se pudo cargar la bandeja de trabajo"));
      } else if (a.status === "rejected") {
        toast.error(apiError(a.reason, "No se pudieron cargar los indicadores"));
      } else if (b.status === "rejected") {
        toast.error(apiError(b.reason, "No se pudieron cargar los pendientes del perfil"));
      }
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
  if (!wb) {
    return (
      <EmptyState
        icon="⚠️"
        title="No se pudo cargar la bandeja"
        message="Revise su conexión e intente de nuevo."
        action={<Button onClick={load}>Reintentar</Button>}
      />
    );
  }

  // Primero lo que tiene trabajo; lo que esta al dia queda al final.
  const items = [...(work.items || [])]
    .map((item, i) => ({ item, i }))
    .sort((a, b) => Number(isIdle(a.item)) - Number(isIdle(b.item)) || a.i - b.i)
    .map(({ item }) => item);
  const pendingCount = work.total_pending || 0;
  const warnings = items.filter((i) => i.severity === "aviso").length;
  const hasCriteria = (work.my_criteria || []).length > 0;
  const firstName = (user?.first_name || user?.name || "").split(" ")[0];

  return (
    <div>
      <div className="bandeja-header">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }} className="term-label">
            Bandeja de trabajo
            <InfoTip text={GLOSSARY.bandeja_trabajo} label="Qué es la bandeja de trabajo" />
          </h1>
          <p className="dc-hello">
            {firstName ? `Hola, ${firstName}. ` : ""}Perfil <strong>{work.role_label}</strong>
            {work.active_cycle_code ? (
              <>
                {" "}· Ciclo en curso <strong>{work.active_cycle_code}</strong> ({work.active_cycle_status_label})
              </>
            ) : null}
          </p>
        </div>
        {isEditor && (
          <Button onClick={() => navigate("/vigilancia")}>
            <Icon name="radar" size={17} /> Ejecutar vigilancia
          </Button>
        )}
      </div>

      {!work.active_cycle_id && (
        <Card style={{ marginBottom: 20, background: "#FEF3C7", borderColor: "#FDE68A" }} padding={16}>
          <div className="cycle-banner">
            <div style={{ fontSize: 14, color: "#92400E" }}>
              <strong>No hay ciclo operativo abierto.</strong> La priorización oficial P1 a P6 y el filtrado de novedad
              requieren un ciclo activo.
            </div>
            <Button size="sm" onClick={() => navigate("/ciclos")}>
              {isEditor ? "Crear ciclo" : "Ver ciclos"}
            </Button>
          </div>
        </Card>
      )}

      <section aria-labelledby="dc-my-work">
        <div className="dc-work-summary">
          <h2 id="dc-my-work">
            Mis pendientes
            <InfoTip text={KPI_HELP.pendientes} label="Qué son mis pendientes" />
          </h2>
          <span className="dc-muted" data-testid="work-summary">
            {pendingCount > 0
              ? `${pendingCount} tarea(s) por hacer para su perfil`
              : "Está al día: no tiene tareas pendientes para su perfil"}
            {warnings > 0 ? ` · ${warnings} aviso(s) que requieren atención` : ""}
          </span>
        </div>
        {items.length ? (
          <div className="dc-work-grid" data-testid="work-grid" data-role={work.role}>
            {items.map((item) => (
              <WorkCard key={item.key} item={item} />
            ))}
          </div>
        ) : (
          <Card style={{ marginBottom: 24 }}>
            <EmptyState icon="✅" title="Sin pendientes" message="Su perfil no tiene tareas asignadas en el sistema. Puede consultar el tablero estratégico o los boletines." />
          </Card>
        )}
      </section>

      <div className="dc-kpis" data-testid="bandeja-kpis">
        {isEditor && (
          <KPICard label="En bandeja de entrada" hint={KPI_HELP.bandeja} value={wb.staging_unassigned} icon={<Icon name="inbox" />} accent="#6366F1" sub="Sin asignar a ciclo" />
        )}
        {isEditor && (
          <KPICard label="Cribado alto" hint={KPI_HELP.cribado} value={wb.high_priority} icon={<Icon name="pulse" />} accent="#EF4444" sub={`Puntaje de ${SCREENING_QUEUE_THRESHOLD} o más`} />
        )}
        {hasCriteria && (
          <KPICard label="Me toca calificar" hint={KPI_HELP.calificar} value={wb.cycle_pending_for_me} icon={<Icon name="layers" />} accent="#3B82F6" sub={`Criterios ${work.my_criteria.join(", ")}`} />
        )}
        <KPICard label="Priorizadas por evaluar" hint={KPI_HELP.priorizadas} value={wb.cycle_prioritized} icon={<Icon name="check" />} accent="#10B981" sub={work.active_cycle_code || "Sin ciclo activo"} />
        <KPICard label="Bajo vigilancia" hint={KPI_HELP.vigilancia} value={wb.cycle_watchlist} icon={<Icon name="clock" />} accent="#F59E0B" sub={work.active_cycle_code || "Sin ciclo activo"} />
      </div>

      {work.active_cycle_id && (
        <Card style={{ marginBottom: 24 }} padding={16}>
          <div className="cycle-banner">
            <div>
              <span className="cycle-banner-label">Ciclo en curso</span>
              <strong>{work.active_cycle_code}</strong>
              <Badge tone={work.active_cycle_status}>{work.active_cycle_status_label}</Badge>
            </div>
            <div className="cycle-banner-meta term-label">
              {wb.cycle_pending_rating} tecnología(s) sin %P completo
              <InfoTip text={KPI_HELP.sin_pct} label="Qué es sin %P completo" />
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/ciclos")}>
              Gestionar ciclos
            </Button>
          </div>
        </Card>
      )}

      <div className="methodology-cards" style={{ marginBottom: 24 }}>
        {IETS_PHASES.map((phase) => (
          // InfoTip es un <button>: no puede ir dentro de la tarjeta clicable
          // (validateDOMNesting). Queda como hermano posicionado sobre ella.
          <div key={phase.key} style={{ position: "relative" }}>
            <button
              type="button"
              className="methodology-card"
              style={{ width: "100%", height: "100%", paddingRight: 36 }}
              onClick={() => navigate(phase.to)}
            >
              <span className="methodology-card-phase">{phase.phase}</span>
              <strong>{phase.label}</strong>
              <span>{phase.short}</span>
            </button>
            <span style={{ position: "absolute", top: 12, right: 12 }}>
              <InfoTip text={phase.help || phase.hint} label={`Qué es ${phase.label}`} />
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isEditor ? "1.5fr 1fr" : "1fr", gap: 16 }} className="dash-grid">
        {isEditor && (
          <Card>
            <SectionTitle
              hint={KPI_HELP.cola}
              right={
                <Button size="sm" variant="ghost" onClick={() => navigate("/senales")}>
                  Ver todas ({work.queue_total})
                </Button>
              }
            >
              Cola de trabajo
            </SectionTitle>
            {work.queue.length ? (
              <ol className="dc-queue" data-testid="work-queue">
                {work.queue.map((f) => (
                  <li key={f.finding_id}>
                    <div style={{ minWidth: 0 }}>
                      <div className="dc-queue-meta">
                        <ScreeningScore score={f.screening_score} compact />
                        <Badge tone={f.status}>{f.status === "nuevo" ? "Nueva" : f.status === "revisado" ? "Revisada" : f.status}</Badge>
                        {f.horizon && <Badge>{f.horizon}</Badge>}
                        {f.source_title && <span className="dc-clamp-1" style={{ maxWidth: 220 }} title={f.source_title}>{f.source_title}</span>}
                      </div>
                      <ClampText text={f.title} lines={2} className="dc-queue-title" testId="queue-title" />
                    </div>
                    <Link className="dc-queue-go" to={f.to} title={`${f.action_label}: ${f.title}`} aria-label={`${f.action_label}: ${f.title}`}>
                      {f.action_label} <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon="✅"
                title="Cola vacía"
                message="No hay señales pendientes. Ejecute la vigilancia de fuentes para detectar tecnologías emergentes."
                action={
                  <Button onClick={() => navigate("/vigilancia")}>
                    <Icon name="radar" size={16} /> Fase 1 · Vigilancia
                  </Button>
                }
              />
            )}
          </Card>
        )}

        <Card>
          <SectionTitle>Estado de vigilancia</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="stat-row">
              <span>Fuentes vigiladas</span>
              <strong>{wb.sources_enabled}</strong>
            </div>
            <div className="stat-row">
              <span>Señales últimos 7 días</span>
              <strong>{wb.findings_last_7d}</strong>
            </div>
            {wb.last_scan ? (
              <div style={{ marginTop: 8, padding: 12, background: "#F8FAFC", borderRadius: 10, fontSize: 13 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <Badge tone={wb.last_scan.status}>{wb.last_scan.status}</Badge>
                  <span style={{ color: "#94A3B8" }}>{new Date(wb.last_scan.started_at).toLocaleString("es-CO")}</span>
                </div>
                <ClampText text={wb.last_scan.message} lines={3} />
                <div style={{ marginTop: 8, color: "#64748B" }}>
                  {wb.last_scan.items_new} nuevas · {wb.last_scan.items_found} detectadas
                </div>
              </div>
            ) : (
              <EmptyState icon="🛰️" message="Aún no hay escaneos registrados." />
            )}
            {isEditor && (
              <Button variant="secondary" onClick={() => navigate("/vigilancia")} style={{ marginTop: 4 }}>
                Ir a vigilancia de fuentes
              </Button>
            )}
            {!isEditor && (
              <p className="dc-muted" style={{ margin: 0 }}>
                La vigilancia la ejecuta el equipo técnico; aquí ve su estado.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
