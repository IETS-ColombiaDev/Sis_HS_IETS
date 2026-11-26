import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { downloadFromApi } from "../utils/download";
import { useAuth } from "../auth/AuthContext";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";
import { Input, Select, Textarea } from "./Field";
import SignalWindowPanel from "./SignalWindowPanel";
import ModelCard from "./ModelCard";
import { METHOD } from "./ClassificationSuggestion";

const pct = (v) => (v === null || v === undefined ? "-" : `${Math.round(v * 100)} %`);
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("es-CO") : "nunca");

const AI_MODE = {
  nunca: "Nunca: solo reglas y aprendizaje",
  desacuerdo: "Solo si hay duda (reglas y aprendizaje no coinciden o la confianza es baja)",
  siempre: "Siempre",
};
const SWITCHES = [
  { key: "enabled", title: "Aprender de las clasificaciones", text: "La sugerencia usa las señales parecidas que el equipo ya clasificó o descartó." },
  { key: "auto_calibrate", title: "Calibración automática", text: "Recalibra sola cuando hay suficientes clasificaciones nuevas." },
  { key: "analytics_ai", title: "Lectura analítica con IA", text: "La IA redacta la lectura ejecutiva de Analítica con las cifras del sistema." },
];
const NUMBERS = [
  { key: "neighbors", label: "Señales parecidas que votan", help: "Cuántas clasificaciones anteriores se consultan por señal." },
  { key: "min_similarity", label: "Parecido mínimo para votar (0 a 1)", step: "0.01", help: "Por debajo de este parecido una señal no cuenta." },
  { key: "min_confidence", label: "Confianza mínima del aprendizaje (0 a 1)", step: "0.05", help: "Desde esta confianza el aprendizaje pesa más que las reglas. La ajusta la calibración." },
  { key: "target_precision", label: "Precisión objetivo de la calibración (0 a 1)", step: "0.01", help: "La calibración busca la menor confianza que la cumpla." },
  { key: "discard_similarity", label: "Parecido para avisar de un descarte (0 a 1)", step: "0.05", help: "Parecido con una señal descartada que dispara el aviso." },
  { key: "examples_in_prompt", label: "Ejemplos que ve la IA", help: "Clasificaciones del equipo incluidas en la consulta a la IA." },
  { key: "auto_calibrate_every", label: "Recalibrar cada (clasificaciones nuevas)", help: "Solo con la calibración automática encendida." },
];
const ANALYTICS = [
  { key: "analytics_cache_hours", label: "Horas que se conserva la lectura con IA", help: "0 la renueva cada vez que cambian las cifras." },
  { key: "noise_alert", label: "Alerta de ruido por fuente (0 a 1)", step: "0.05", help: "Fracción de señales descartadas de una fuente." },
  { key: "backlog_days_alert", label: "Alerta de antigüedad (días)", help: "Días de una señal sin clasificar." },
  { key: "concentration_alert", label: "Alerta de concentración (0 a 1)", step: "0.05", help: "Fracción de la clasificación en un solo clúster." },
];
const PROMPTS = [
  { key: "classify_system", label: "Clasificación: instrucciones del sistema", rows: 5 },
  { key: "classify_user", label: "Clasificación: consulta", rows: 12, help: "Variables: {signal}, {clusters}, {tech_types}, {examples}, {rules}, {learned}." },
  { key: "analytics_system", label: "Analítica: instrucciones del sistema", rows: 5 },
  { key: "analytics_user", label: "Analítica: consulta", rows: 5, help: "Variables: {date}, {facts}." },
];

/**
 * Configuración › Inteligencia: base de conocimiento de señales, clasificador
 * que aprende de las clasificaciones, calibración, IA en la analítica, prompts
 * y vigencia de las señales por año.
 */
export default function IntelligencePanel({ toast }) {
  const { can } = useAuth();
  const canManage = can("config:manage");
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);

  const take = (d) => {
    setData(d);
    setForm({ ...d.config });
  };
  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/intelligence/status");
      take(d);
    } catch (e) {
      toast?.error(apiError(e, "No se pudo leer la configuración de inteligencia"));
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (key, call, ok) => {
    setBusy(key);
    try {
      const { data: d } = await call();
      ok?.(d);
    } catch (e) {
      toast?.error(apiError(e, "No se pudo completar la acción"));
    } finally {
      setBusy("");
    }
  };

  const save = () =>
    run("save", () => api.put("/intelligence/config", form), (d) => {
      take(d);
      toast?.success("Parámetros de inteligencia guardados.");
    });
  const reset = () =>
    run("save", () => api.post("/intelligence/config/reset"), (d) => {
      take(d);
      toast?.success("Parámetros de inteligencia restaurados a los de fábrica.");
    });
  const reindex = () =>
    run("reindex", () => api.post("/intelligence/reindex"), (d) => {
      take(d);
      toast?.success(`Base de conocimiento reconstruida: ${d.result.indexed} señal(es) indexadas.`);
    });
  const baseline = () =>
    run("baseline", () => api.post("/intelligence/baseline", {}), (d) => {
      take(d);
      toast?.success("Línea base fijada: lo capturado hasta hoy es la primera búsqueda histórica.");
    });
  const calibrate = () =>
    run("calibrate", () => api.post("/intelligence/calibrate"), (d) => {
      take(d);
      (d.result.status === "ok" ? toast?.success : toast?.info)?.(d.result.message);
    });
  const exportKb = async () => {
    setBusy("export");
    try {
      await downloadFromApi(api, "/intelligence/knowledge/export", "base_conocimiento_senales.json");
    } catch (e) {
      toast?.error(apiError(e, "No se pudo descargar la base de conocimiento"));
    } finally {
      setBusy("");
    }
  };
  const search = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    run("search", () => api.get("/intelligence/knowledge", { params: { q: q.trim(), limit: 10 } }), (d) => setFound(d.items));
  };

  if (!data || !form) return null;
  const kb = data.knowledge;
  const cal = data.calibration || {};
  const acc = data.acceptance || {};
  const set = (key, value) => setForm({ ...form, [key]: value });
  const number = (spec) => (
    <Input
      key={spec.key}
      id={`intel-${spec.key}`}
      type="number"
      step={spec.step || "1"}
      min={data.limits[spec.key]?.min}
      max={data.limits[spec.key]?.max}
      label={spec.label}
      help={spec.help}
      disabled={!canManage}
      value={form[spec.key] ?? ""}
      onChange={(e) => set(spec.key, e.target.value)}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-testid="intelligence-panel">
      <ModelCard card={data.model_card} trace={data.trace} />

      <Card>
        <SectionTitle
          hint="Memoria del sistema: cada señal capturada con su origen y con lo que el equipo decidió sobre ella. De aquí aprende la sugerencia de clasificación."
          right={
            <div className="fb-toolbar">
              <Button size="sm" variant="secondary" onClick={exportKb} loading={busy === "export"} disabled={!canManage} data-testid="intel-export">
                <Icon name="doc" size={14} /> Descargar base
              </Button>
              <Button size="sm" variant="secondary" onClick={baseline} loading={busy === "baseline"} disabled={!canManage} data-testid="intel-baseline">
                Fijar línea base hoy
              </Button>
              <Button size="sm" onClick={reindex} loading={busy === "reindex"} disabled={!canManage} data-testid="intel-reindex">
                Reconstruir
              </Button>
            </div>
          }
        >
          Base de conocimiento de señales
        </SectionTitle>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          Guarda un documento por señal: su texto, si viene de la <strong>primera búsqueda histórica</strong> o de una{" "}
          <strong>vigilancia posterior</strong>, su año y la decisión del equipo. Se actualiza sola, sirve a todos los ciclos y se
          respalda con la base del sistema (la que se copia a Firestore). Funciona aunque la IA esté apagada.
        </p>
        <div className="fb-toolbar" data-testid="intel-kb-stats">
          <Badge tone="ok">{kb.documents} señal(es) en la base</Badge>
          <Badge tone="viewer">{kb.historical} de la primera búsqueda histórica</Badge>
          <Badge tone="viewer">{kb.later} de vigilancias posteriores</Badge>
          {kb.submissions > 0 && <Badge tone="viewer">{kb.submissions} postulaciones</Badge>}
          <Badge tone="ok">{kb.classified} clasificadas</Badge>
          <Badge tone="warning">{kb.discarded} descartadas</Badge>
          <Badge tone="viewer">{kb.pending} por clasificar</Badge>
        </div>
        <p style={{ fontSize: 12, color: "#64748b" }}>
          Línea base (hasta cuándo una señal cuenta como histórica): {fmt(kb.baseline_until)}.{" "}
          {kb.learning
            ? "El sistema ya aprende de las clasificaciones."
            : `El sistema empieza a aprender con ${kb.min_to_learn} señales clasificadas; mientras tanto sugiere con las reglas del catálogo.`}
        </p>
        <form onSubmit={search} className="fb-toolbar" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Input id="intel-q" label="Buscar señales parecidas a un texto" placeholder="Por ejemplo: terapia génica para hemofilia" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button size="sm" type="submit" loading={busy === "search"} data-testid="intel-search">
            <Icon name="search" size={14} /> Buscar
          </Button>
        </form>
        {found && found.length === 0 && <p style={{ fontSize: 13, color: "#64748b" }} data-testid="intel-search-empty">Ninguna señal de la base se parece a ese texto.</p>}
        {found && found.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="intel-search-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Señal</th>
                  <th>Parecido</th>
                  <th>Decisión</th>
                  <th style={{ textAlign: "left" }}>Clúster y tipología</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {found.map((row) => (
                  <tr key={row.technology_id}>
                    <td>
                      {row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer">{row.name || `Tecnología ${row.technology_id}`}</a> : row.name}
                      <div style={{ color: "#64748b", fontSize: 12 }}>{row.source_title}{row.year ? ` · ${row.year}` : ""}</div>
                    </td>
                    <td style={{ textAlign: "center" }}>{Math.round(row.similarity * 100)} %</td>
                    <td style={{ textAlign: "center" }}>
                      <Badge tone={row.decision === "clasificada" ? "ok" : row.decision === "descartada" ? "warning" : "viewer"}>{row.decision}</Badge>
                    </td>
                    <td>{row.decision === "descartada" ? row.reason : [row.cluster_name, row.tech_type_name].filter(Boolean).join(" · ") || "-"}</td>
                    <td style={{ textAlign: "center" }}>{row.origin === "historica" ? "Histórica" : row.origin === "postulacion" ? "Postulación" : "Posterior"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          hint="Cómo se arma la sugerencia de clúster y tipología en la Bandeja de entrada."
          right={
            <div className="fb-toolbar">
              <Button size="sm" variant="secondary" onClick={reset} loading={busy === "save"} disabled={!canManage} data-testid="intel-reset">Restaurar</Button>
              <Button size="sm" onClick={save} loading={busy === "save"} disabled={!canManage} data-testid="intel-save">Guardar parámetros</Button>
            </div>
          }
        >
          Clasificador que aprende
        </SectionTitle>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          La sugerencia combina las <strong>reglas del catálogo</strong> (palabras clave, CIE-10, MeSH) con el voto de las{" "}
          <strong>señales parecidas que el equipo ya clasificó</strong>. Si la IA está encendida, puede arbitrar viendo esos mismos
          ejemplos. Siempre muestra la confianza y la evidencia; el evaluador confirma.
        </p>
        <div className="fb-toolbar" style={{ marginBottom: 8 }}>
          <Badge tone={data.ai_enabled ? "ok" : "warning"}>{data.ai_enabled ? `IA disponible (${data.ai_model})` : "IA apagada: reglas y aprendizaje"}</Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0 16px" }}>
          {SWITCHES.map((s) => (
            <label key={s.key} className="catalog-check" style={{ alignItems: "flex-start", margin: "6px 0" }}>
              <input type="checkbox" checked={Boolean(form[s.key])} disabled={!canManage} onChange={(e) => set(s.key, e.target.checked)} data-testid={`intel-${s.key}`} />
              <span><strong style={{ display: "block", color: "#0F172A" }}>{s.title}</strong>{s.text}</span>
            </label>
          ))}
        </div>
        <Select id="intel-ai_mode" label="Cuándo consultar a la IA para clasificar" value={form.ai_mode} disabled={!canManage} onChange={(e) => set("ai_mode", e.target.value)}>
          {data.ai_modes.map((m) => (
            <option key={m} value={m}>{AI_MODE[m] || m}</option>
          ))}
        </Select>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 16px" }}>{NUMBERS.map(number)}</div>

        <h4 className="source-section-title">Analítica</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 16px" }}>{ANALYTICS.map(number)}</div>
      </Card>

      <Card data-testid="intel-calibration">
        <SectionTitle
          hint="Mide con las clasificaciones reales cuánto acierta cada método y ajusta los parámetros."
          right={<Button size="sm" onClick={calibrate} loading={busy === "calibrate"} disabled={!canManage} data-testid="intel-calibrate">Calibrar ahora</Button>}
        >
          Calibración
        </SectionTitle>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          Predice cada señal ya clasificada sin mirarla (validación dejando una fuera) y compara con lo que decidió el equipo. Elige el
          número de señales parecidas con mejor acierto y la menor confianza que cumple la precisión objetivo.
        </p>
        {!cal.status && <p style={{ fontSize: 13, color: "#64748b" }}>Todavía no se ha calibrado. Hacen falta {kb.min_to_calibrate} señales clasificadas.</p>}
        {cal.status && (
          <>
            <p style={{ fontSize: 13 }} data-testid="intel-calibration-message">
              <Badge tone={cal.status === "ok" ? (cal.target_met ? "ok" : "warning") : "viewer"}>
                {cal.status === "ok" ? (cal.target_met ? "Objetivo cumplido" : "Objetivo no alcanzado") : "Datos insuficientes"}
              </Badge>{" "}
              {cal.message} <span style={{ color: "#64748b" }}>Última: {fmt(cal.at)}.</span>
            </p>
            {cal.status === "ok" && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Método</th>
                      <th>Acierto en clúster</th>
                      <th>Acierto en tipología</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Reglas del catálogo</td><td style={{ textAlign: "center" }}>{pct(cal.rules_cluster_accuracy)}</td><td style={{ textAlign: "center" }}>{pct(cal.rules_type_accuracy)}</td></tr>
                    <tr><td>Aprendizaje ({cal.neighbors} señales parecidas)</td><td style={{ textAlign: "center" }}>{pct(cal.learned_cluster_accuracy)}</td><td style={{ textAlign: "center" }}>{pct(cal.learned_type_accuracy)}</td></tr>
                    <tr><td><strong>Combinado (lo que ve el evaluador)</strong></td><td style={{ textAlign: "center" }}><strong>{pct(cal.combined_cluster_accuracy)}</strong></td><td style={{ textAlign: "center" }}>-</td></tr>
                    <tr><td style={{ color: "#64748b" }}>Referencia: decir siempre el clúster más frecuente</td><td style={{ textAlign: "center", color: "#64748b" }}>{pct(cal.majority_baseline)}</td><td /></tr>
                  </tbody>
                </table>
                <p style={{ fontSize: 12, color: "#64748b" }}>
                  Evaluado con {cal.evaluated} de {cal.labeled} señales clasificadas, en {cal.clusters_with_examples} clúster(es) con ejemplos suficientes.
                  Confianza mínima: {pct(cal.min_confidence)}{cal.coverage !== null && cal.coverage !== undefined ? `, que cubre ${pct(cal.coverage)} de las señales` : ""}.
                  {cal.applied ? " Los parámetros se aplicaron." : ""}
                </p>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="intel-calibration-bins">
                  <thead>
                    <tr><th style={{ textAlign: "left" }}>Confianza que da el sistema</th><th>Señales</th><th>Acierto real</th></tr>
                  </thead>
                  <tbody>
                    {(cal.bins || []).map((b) => (
                      <tr key={b.from}>
                        <td>{Math.round(b.from * 100)} a {Math.round(b.to * 100)} %</td>
                        <td style={{ textAlign: "center" }}>{b.n}</td>
                        <td style={{ textAlign: "center" }}>{pct(b.precision)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <h4 className="source-section-title">Sugerencias confirmadas por el equipo</h4>
        {acc.decided > 0 ? (
          <p style={{ fontSize: 13 }} data-testid="intel-acceptance">
            De {acc.decided} señal(es) con sugerencia que el equipo ya clasificó, confirmó el clúster sugerido en {acc.cluster_accepted} ({pct(acc.cluster_accepted / acc.decided)})
            {" "}y la tipología en {acc.type_accepted} ({pct(acc.type_accepted / acc.decided)}).{" "}
            {acc.by_method.map((m) => `${METHOD[m.method] || m.method}: ${m.accepted} de ${m.decided}`).join(" · ")}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "#64748b" }}>Aún no hay señales clasificadas después de una sugerencia ({acc.suggested || 0} sugerencia(s) registradas).</p>
        )}
      </Card>

      <Card>
        <SectionTitle
          hint="Instrucciones que recibe la IA. Deje un campo vacío para usar el texto de fábrica."
          right={<Button size="sm" onClick={save} loading={busy === "save"} disabled={!canManage}>Guardar prompts</Button>}
        >
          Prompts de la IA
        </SectionTitle>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          El prompt de la captura de señales está en la pestaña Prompts de vigilancia. Estos son los de la clasificación y la analítica.
        </p>
        {PROMPTS.map((p) => (
          <div key={p.key}>
            <Textarea
              id={`intel-${p.key}`}
              label={p.label}
              help={`${p.help ? `${p.help} ` : ""}${form[p.key] ? "Texto propio." : "Vacío: se usa el de fábrica (se muestra como guía)."}`}
              rows={p.rows}
              disabled={!canManage}
              placeholder={data.default_prompts[p.key]}
              value={form[p.key] || ""}
              onChange={(e) => set(p.key, e.target.value)}
            />
            {!form[p.key] && canManage && (
              <button type="button" className="so-linkbtn" onClick={() => set(p.key, data.default_prompts[p.key])}>
                Copiar el de fábrica para editarlo
              </button>
            )}
          </div>
        ))}
      </Card>

      <SignalWindowPanel toast={toast} canManage={canManage} />
    </div>
  );
}
