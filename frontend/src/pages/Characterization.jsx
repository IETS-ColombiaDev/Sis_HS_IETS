import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import PhaseGuide, { ModuleStatsRow } from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import FindingDetailModal from "../components/FindingDetailModal";
import { ScreeningScore } from "../components/TriageBoard";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";

function completeness(f) {
  const checks = [
    { key: "technology", label: "Tecnologia", ok: !!(f.technology || "").trim() },
    { key: "horizon", label: "Horizonte", ok: !!(f.horizon || "").trim() },
    { key: "summary", label: "Evidencia", ok: !!(f.summary || "").trim() },
    { key: "therapeutic_area", label: "Area terapeutica", ok: !!(f.therapeutic_area || "").trim() },
    { key: "phase", label: "Fase", ok: !!(f.phase || "").trim() },
  ];
  const done = checks.filter((c) => c.ok).length;
  return { pct: Math.round((done / checks.length) * 100), checks };
}

export default function Characterization() {
  const { isEditor, status } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [enhancingId, setEnhancingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/findings", { params: { limit: 500 } });
      setFindings(data.filter((f) => ["revisado", "priorizado"].includes(f.status)));
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las fichas"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const quickStatus = async (f, newStatus) => {
    try {
      await api.put(`/findings/${f.id}`, { status: newStatus });
      toast.success(`Estado: ${newStatus}`);
      if (detail?.id === f.id) setDetail({ ...detail, status: newStatus });
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar"));
    }
  };

  const enhanceFinding = async (f) => {
    if (!status?.gemini_enabled) {
      toast.warning("Configure Gemini en Configuracion");
      return;
    }
    setEnhancingId(f.id);
    try {
      const { data } = await api.post(`/findings/${f.id}/enhance-ai`);
      toast.success("Ficha completada con IA");
      setDetail(data);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo enriquecer"));
    } finally {
      setEnhancingId(null);
    }
  };

  if (loading) return <LoadingBlock label="Cargando caracterizacion..." />;

  const incomplete = findings.filter((f) => completeness(f).pct < 100);
  const complete = findings.filter((f) => completeness(f).pct >= 100);

  return (
    <div>
      <ModuleHeader
        step="caracterizacion"
        title="Caracterizacion de tecnologias"
        purpose="Fase 3 IETS: completar ficha tecnica (horizonte, fase, area terapeutica, evidencia) antes de diseminar."
        actions={
          <Button variant="secondary" onClick={() => navigate("/priorizacion")}>
            Volver a priorizacion
          </Button>
        }
      />

      <PhaseGuide
        phase="Fase 3 · Caracterizacion"
        tasks={[
          "Describir la tecnologia emergente y su evidencia disponible.",
          "Clasificar horizonte temporal (emergente / transicional / inminente).",
          "Completar ficha al 100% antes de generar informe de diseminacion.",
        ]}
        nextLabel="Diseminacion e informes"
        onNext={() => navigate("/diseminacion")}
      />

      <ModuleStatsRow
        items={[
          { label: "En caracterizacion", value: findings.length },
          { label: "Fichas incompletas", value: incomplete.length, color: "#F59E0B" },
          { label: "Listas para informe", value: complete.length, color: "#10B981" },
        ]}
      />

      {findings.length === 0 ? (
        <Card>
          <EmptyState
            icon="📋"
            title="Sin tecnologias para caracterizar"
            message="Priorice senales en la Fase 2 para que aparezcan aqui con ficha tecnica pendiente."
            action={
              <Button onClick={() => navigate("/priorizacion")}>
                <Icon name="layers" size={16} /> Ir a priorizacion
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="char-grid">
          {findings.map((f) => {
            const { pct, checks } = completeness(f);
            return (
              <Card key={f.id} padding={18} className="char-ficha-card">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <ScreeningScore score={f.screening_score} compact />
                  <Badge tone={f.status}>{f.status}</Badge>
                  {f.horizon && <Badge>{f.horizon}</Badge>}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: "#64748B" }}>
                  {f.technology || "Tecnologia sin nombre"} · {f.source_title}
                </p>
                <ul className="char-checklist">
                  {checks.map((c) => (
                    <li key={c.key} className={c.ok ? "char-check--ok" : "char-check--pending"}>
                      {c.ok ? "✓" : "○"} {c.label}
                    </li>
                  ))}
                </ul>
                <div className="char-progress">
                  <div className="char-progress-bar" style={{ width: `${pct}%` }} />
                  <span>Ficha {pct}% · {pct >= 100 ? "Lista para diseminar" : "Completar campos"}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <Button size="sm" onClick={() => setDetail(f)}>Editar ficha</Button>
                  {isEditor && pct >= 80 && (
                    <Button size="sm" variant="outline" onClick={() => navigate("/diseminacion")}>
                      Ir a informes
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <FindingDetailModal
        finding={detail}
        onClose={() => setDetail(null)}
        isEditor={isEditor}
        status={status}
        enhancingId={enhancingId}
        onEnhance={enhanceFinding}
        onQuickStatus={quickStatus}
      />
    </div>
  );
}
