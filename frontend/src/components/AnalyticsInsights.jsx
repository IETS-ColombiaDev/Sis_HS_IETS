import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { AI_TIMEOUT, apiError } from "../api/client";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";

const TONE = { ok: "#166534", warn: "#B45309", info: "#334155" };
const DOT = { ok: "#22C55E", warn: "#F59E0B", info: "#94A3B8" };

/**
 * Marco analítico del sistema: cuatro lentes (descriptivo, diagnóstico,
 * predictivo y prescriptivo) calculados con reglas sobre los datos, más la
 * lectura ejecutiva que redacta la IA usando solo esas cifras.
 */
export default function AnalyticsInsights({ toast }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/intelligence/insights");
      setData(d);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setBusy(true);
    try {
      const { data: d } = await api.post("/intelligence/insights/narrative", null, { timeout: AI_TIMEOUT });
      setData(d);
      if (d.narrative.status === "error") toast?.error(d.narrative.note);
    } catch (e) {
      toast?.error(apiError(e, "No se pudo generar la lectura con IA"));
    } finally {
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <Card padding={18} style={{ marginTop: 14 }}>
        <SectionTitle>Marco analítico del sistema</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          No se pudo cargar el marco analítico. <button type="button" className="so-linkbtn" onClick={load}>Reintentar</button>
        </p>
      </Card>
    );
  }
  if (!data) return null;
  const n = data.narrative || {};
  const canGenerate = n.status !== "apagada" && n.status !== "sin_ia";

  return (
    <Card padding={18} style={{ marginTop: 14 }} data-testid="analytics-insights">
      <SectionTitle
        hint="Cuatro preguntas sobre los datos de todo el sistema (no solo del ciclo): qué pasa, por qué, qué puede pasar y qué conviene hacer. Los umbrales se ajustan en Configuración › Inteligencia."
        right={
          canGenerate ? (
            <Button size="sm" variant="secondary" onClick={generate} loading={busy} data-testid="insights-generate">
              <Icon name="spark" size={14} /> {n.text ? "Actualizar lectura con IA" : "Generar lectura con IA"}
            </Button>
          ) : null
        }
      >
        Marco analítico del sistema
      </SectionTitle>

      {n.text ? (
        <div style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }} data-testid="insights-narrative">
          <div style={{ fontSize: 12, fontWeight: 700, color: "#312E81", marginBottom: 4 }}>
            <Icon name="spark" size={13} /> Lectura de la IA{n.model ? ` (${n.model})` : ""}
            {n.at ? ` · ${new Date(n.at).toLocaleString("es-CO")}` : ""}
            {n.status === "vencida" ? " · pendiente de actualizar" : ""}
          </div>
          <div style={{ fontSize: 13, color: "#1E1B4B", whiteSpace: "pre-wrap" }}>{n.text}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Redactada solo con las cifras de abajo. Orienta; no reemplaza el criterio del equipo.</div>
        </div>
      ) : (
        n.note && <p style={{ fontSize: 12, color: "#64748b", marginTop: 0 }} data-testid="insights-note">{n.note}</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
        {data.framework.map((lens) => (
          <section key={lens.lens} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 12 }} data-testid={`lens-${lens.lens}`}>
            <div style={{ fontWeight: 700, color: "#0F172A" }}>{lens.title}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{lens.question}</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {lens.items.map((item, i) => (
                <li key={i} style={{ padding: "6px 0", borderTop: i ? "1px dashed #E2E8F0" : "none" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 8, background: DOT[item.severity] || DOT.info, display: "inline-block" }} />
                    <span style={{ fontSize: 13, color: TONE[item.severity] || TONE.info }}>{item.title}</span>
                    <Badge tone={item.severity === "warn" ? "warning" : item.severity === "ok" ? "ok" : "viewer"}>{item.value}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                    {item.detail} {item.link ? <Link to={item.link}>Ir</Link> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
