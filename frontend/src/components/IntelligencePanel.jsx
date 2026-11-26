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
import { t, tr, ts, intlLocale } from "../i18n";

const pct = (v) => (v === null || v === undefined ? "-" : `${Math.round(v * 100)} %`);
const fmt = (iso) => (iso ? new Date(iso).toLocaleString(intlLocale()) : t("nunca"));

const AI_MODE = {
  nunca: t("Nunca: solo reglas y aprendizaje"),
  desacuerdo: t("Solo si hay duda (reglas y aprendizaje no coinciden o la confianza es baja)"),
  siempre: t("Siempre"),
};
const DECISION = { clasificada: t("clasificada"), descartada: t("descartada"), pendiente: t("pendiente") };
const SWITCHES = [
  { key: "enabled", title: t("Aprender de las clasificaciones"), text: t("La sugerencia usa las señales parecidas que el equipo ya clasificó o descartó.") },
  { key: "auto_calibrate", title: t("Calibración automática"), text: t("Recalibra sola cuando hay suficientes clasificaciones nuevas.") },
  { key: "analytics_ai", title: t("Lectura analítica con IA"), text: t("La IA redacta la lectura ejecutiva de Analítica con las cifras del sistema.") },
];
const NUMBERS = [
  { key: "neighbors", label: t("Señales parecidas que votan"), help: t("Cuántas clasificaciones anteriores se consultan por señal.") },
  { key: "min_similarity", label: t("Parecido mínimo para votar (0 a 1)"), step: "0.01", help: t("Por debajo de este parecido una señal no cuenta.") },
  { key: "min_confidence", label: t("Confianza mínima del aprendizaje (0 a 1)"), step: "0.05", help: t("Desde esta confianza el aprendizaje pesa más que las reglas. La ajusta la calibración.") },
  { key: "target_precision", label: t("Precisión objetivo de la calibración (0 a 1)"), step: "0.01", help: t("La calibración busca la menor confianza que la cumpla.") },
  { key: "discard_similarity", label: t("Parecido para avisar de un descarte (0 a 1)"), step: "0.05", help: t("Parecido con una señal descartada que dispara el aviso.") },
  { key: "examples_in_prompt", label: t("Ejemplos que ve la IA"), help: t("Clasificaciones del equipo incluidas en la consulta a la IA.") },
  { key: "auto_calibrate_every", label: t("Recalibrar cada (clasificaciones nuevas)"), help: t("Solo con la calibración automática encendida.") },
];
const ANALYTICS = [
  { key: "analytics_cache_hours", label: t("Horas que se conserva la lectura con IA"), help: t("0 la renueva cada vez que cambian las cifras.") },
  { key: "noise_alert", label: t("Alerta de ruido por fuente (0 a 1)"), step: "0.05", help: t("Fracción de señales descartadas de una fuente.") },
  { key: "backlog_days_alert", label: t("Alerta de antigüedad (días)"), help: t("Días de una señal sin clasificar.") },
  { key: "concentration_alert", label: t("Alerta de concentración (0 a 1)"), step: "0.05", help: t("Fracción de la clasificación en un solo clúster.") },
];
const PROMPTS = [
  { key: "classify_system", label: t("Clasificación: instrucciones del sistema"), rows: 5 },
  { key: "classify_user", label: t("Clasificación: consulta"), rows: 12, help: t("Variables: {signal}, {clusters}, {tech_types}, {examples}, {rules}, {learned}.") },
  { key: "analytics_system", label: t("Analítica: instrucciones del sistema"), rows: 5 },
  { key: "analytics_user", label: t("Analítica: consulta"), rows: 5, help: t("Variables: {date}, {facts}.") },
];

/**
 * Configuración › Inteligencia: base de conocimiento de señales, clasificador
 * que aprende de las clasificaciones, calibración, IA en la analítica, prompts
 * y vigencia de las señales por año.
 */
const BOLD = { b: (c) => <strong>{c}</strong> };

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
      toast?.error(apiError(e, t("No se pudo leer la configuración de inteligencia")));
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
      toast?.error(apiError(e, t("No se pudo completar la acción")));
    } finally {
      setBusy("");
    }
  };

  const save = () =>
    run("save", () => api.put("/intelligence/config", form), (d) => {
      take(d);
      toast?.success(t("Parámetros de inteligencia guardados."));
    });
  const reset = () =>
    run("save", () => api.post("/intelligence/config/reset"), (d) => {
      take(d);
      toast?.success(t("Parámetros de inteligencia restaurados a los de fábrica."));
    });
  const reindex = () =>
    run("reindex", () => api.post("/intelligence/reindex"), (d) => {
      take(d);
      toast?.success(t("Base de conocimiento reconstruida: {n} señal(es) indexadas.", { n: d.result.indexed }));
    });
  const baseline = () =>
    run("baseline", () => api.post("/intelligence/baseline", {}), (d) => {
      take(d);
      toast?.success(t("Línea base fijada: lo capturado hasta hoy es la primera búsqueda histórica."));
    });
  const calibrate = () =>
    run("calibrate", () => api.post("/intelligence/calibrate"), (d) => {
      take(d);
      (d.result.status === "ok" ? toast?.success : toast?.info)?.(ts(d.result.message));
    });
  const exportKb = async () => {
    setBusy("export");
    try {
      await downloadFromApi(api, "/intelligence/knowledge/export", "base_conocimiento_senales.json");
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo descargar la base de conocimiento")));
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
          hint={t("Memoria del sistema: cada señal capturada con su origen y con lo que el equipo decidió sobre ella. De aquí aprende la sugerencia de clasificación.")}
          right={
            <div className="fb-toolbar">
              <Button size="sm" variant="secondary" onClick={exportKb} loading={busy === "export"} disabled={!canManage} data-testid="intel-export">
                <Icon name="doc" size={14} /> {t("Descargar base")}
              </Button>
              <Button size="sm" variant="secondary" onClick={baseline} loading={busy === "baseline"} disabled={!canManage} data-testid="intel-baseline">
                {t("Fijar línea base hoy")}
              </Button>
              <Button size="sm" onClick={reindex} loading={busy === "reindex"} disabled={!canManage} data-testid="intel-reindex">
                {t("Reconstruir")}
              </Button>
            </div>
          }
        >
          {t("Base de conocimiento de señales")}
        </SectionTitle>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          {tr(
            "Guarda un documento por señal: su texto, si viene de la <b>primera búsqueda histórica</b> o de una <b>vigilancia posterior</b>, su año y la decisión del equipo. Se actualiza sola, sirve a todos los ciclos y se respalda con la base del sistema (la que se copia a Firestore). Funciona aunque la IA esté apagada.",
            null,
            BOLD
          )}
        </p>
        <div className="fb-toolbar" data-testid="intel-kb-stats">
          <Badge tone="ok">{t("{n} señal(es) en la base", { n: kb.documents })}</Badge>
          <Badge tone="viewer">{t("{n} de la primera búsqueda histórica", { n: kb.historical })}</Badge>
          <Badge tone="viewer">{t("{n} de vigilancias posteriores", { n: kb.later })}</Badge>
          {kb.submissions > 0 && <Badge tone="viewer">{t("{n} postulaciones", { n: kb.submissions })}</Badge>}
          <Badge tone="ok">{t("{n} clasificadas", { n: kb.classified })}</Badge>
          <Badge tone="warning">{t("{n} descartadas", { n: kb.discarded })}</Badge>
          <Badge tone="viewer">{t("{n} por clasificar", { n: kb.pending })}</Badge>
        </div>
        <p style={{ fontSize: 12, color: "#64748b" }}>
          {t("Línea base (hasta cuándo una señal cuenta como histórica): {fecha}.", { fecha: fmt(kb.baseline_until) })}{" "}
          {kb.learning
            ? t("El sistema ya aprende de las clasificaciones.")
            : t("El sistema empieza a aprender con {n} señales clasificadas; mientras tanto sugiere con las reglas del catálogo.", { n: kb.min_to_learn })}
        </p>
        <form onSubmit={search} className="fb-toolbar" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Input id="intel-q" label={t("Buscar señales parecidas a un texto")} placeholder={t("Por ejemplo: terapia génica para hemofilia")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button size="sm" type="submit" loading={busy === "search"} data-testid="intel-search">
            <Icon name="search" size={14} /> {t("Buscar")}
          </Button>
        </form>
        {found && found.length === 0 && <p style={{ fontSize: 13, color: "#64748b" }} data-testid="intel-search-empty">{t("Ninguna señal de la base se parece a ese texto.")}</p>}
        {found && found.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="intel-search-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>{t("Señal")}</th>
                  <th>{t("Parecido")}</th>
                  <th>{t("Decisión")}</th>
                  <th style={{ textAlign: "left" }}>{t("Clúster y tipología")}</th>
                  <th>{t("Origen")}</th>
                </tr>
              </thead>
              <tbody>
                {found.map((row) => (
                  <tr key={row.technology_id}>
                    <td>
                      {row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer">{row.name || t("Tecnología {id}", { id: row.technology_id })}</a> : row.name}
                      <div style={{ color: "#64748b", fontSize: 12 }}>{row.source_title}{row.year ? ` · ${row.year}` : ""}</div>
                    </td>
                    <td style={{ textAlign: "center" }}>{Math.round(row.similarity * 100)} %</td>
                    <td style={{ textAlign: "center" }}>
                      <Badge tone={row.decision === "clasificada" ? "ok" : row.decision === "descartada" ? "warning" : "viewer"}>{DECISION[row.decision] || row.decision}</Badge>
                    </td>
                    <td>{row.decision === "descartada" ? ts(row.reason) : [ts(row.cluster_name), ts(row.tech_type_name)].filter(Boolean).join(" · ") || "-"}</td>
                    <td style={{ textAlign: "center" }}>{row.origin === "historica" ? t("Histórica") : row.origin === "postulacion" ? t("Postulación") : t("Posterior")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          hint={t("Cómo se arma la sugerencia de clúster y tipología en la Bandeja de entrada.")}
          right={
            <div className="fb-toolbar">
              <Button size="sm" variant="secondary" onClick={reset} loading={busy === "save"} disabled={!canManage} data-testid="intel-reset">{t("Restaurar")}</Button>
              <Button size="sm" onClick={save} loading={busy === "save"} disabled={!canManage} data-testid="intel-save">{t("Guardar parámetros")}</Button>
            </div>
          }
        >
          {t("Clasificador que aprende")}
        </SectionTitle>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          {tr(
            "La sugerencia combina las <b>reglas del catálogo</b> (palabras clave, CIE-10, MeSH) con el voto de las <b>señales parecidas que el equipo ya clasificó</b>. Si la IA está encendida, puede arbitrar viendo esos mismos ejemplos. Siempre muestra la confianza y la evidencia; el evaluador confirma.",
            null,
            BOLD
          )}
        </p>
        <div className="fb-toolbar" style={{ marginBottom: 8 }}>
          <Badge tone={data.ai_enabled ? "ok" : "warning"}>{data.ai_enabled ? t("IA disponible ({modelo})", { modelo: data.ai_model }) : t("IA apagada: reglas y aprendizaje")}</Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0 16px" }}>
          {SWITCHES.map((s) => (
            <label key={s.key} className="catalog-check" style={{ alignItems: "flex-start", margin: "6px 0" }}>
              <input type="checkbox" checked={Boolean(form[s.key])} disabled={!canManage} onChange={(e) => set(s.key, e.target.checked)} data-testid={`intel-${s.key}`} />
              <span><strong style={{ display: "block", color: "#0F172A" }}>{s.title}</strong>{s.text}</span>
            </label>
          ))}
        </div>
        <Select id="intel-ai_mode" label={t("Cuándo consultar a la IA para clasificar")} value={form.ai_mode} disabled={!canManage} onChange={(e) => set("ai_mode", e.target.value)}>
          {data.ai_modes.map((m) => (
            <option key={m} value={m}>{AI_MODE[m] || m}</option>
          ))}
        </Select>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 16px" }}>{NUMBERS.map(number)}</div>

        <h4 className="source-section-title">{t("Analítica")}</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 16px" }}>{ANALYTICS.map(number)}</div>
      </Card>

      <Card data-testid="intel-calibration">
        <SectionTitle
          hint={t("Mide con las clasificaciones reales cuánto acierta cada método y ajusta los parámetros.")}
          right={<Button size="sm" onClick={calibrate} loading={busy === "calibrate"} disabled={!canManage} data-testid="intel-calibrate">{t("Calibrar ahora")}</Button>}
        >
          {t("Calibración")}
        </SectionTitle>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          {t("Predice cada señal ya clasificada sin mirarla (validación dejando una fuera) y compara con lo que decidió el equipo. Elige el número de señales parecidas con mejor acierto y la menor confianza que cumple la precisión objetivo.")}
        </p>
        {!cal.status && <p style={{ fontSize: 13, color: "#64748b" }}>{t("Todavía no se ha calibrado. Hacen falta {n} señales clasificadas.", { n: kb.min_to_calibrate })}</p>}
        {cal.status && (
          <>
            <p style={{ fontSize: 13 }} data-testid="intel-calibration-message">
              <Badge tone={cal.status === "ok" ? (cal.target_met ? "ok" : "warning") : "viewer"}>
                {cal.status === "ok" ? (cal.target_met ? t("Objetivo cumplido") : t("Objetivo no alcanzado")) : t("Datos insuficientes")}
              </Badge>{" "}
              {ts(cal.message)} <span style={{ color: "#64748b" }}>{t("Última: {fecha}.", { fecha: fmt(cal.at) })}</span>
            </p>
            {cal.status === "ok" && (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>{t("Método")}</th>
                      <th>{t("Acierto en clúster")}</th>
                      <th>{t("Acierto en tipología")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>{t("Reglas del catálogo")}</td><td style={{ textAlign: "center" }}>{pct(cal.rules_cluster_accuracy)}</td><td style={{ textAlign: "center" }}>{pct(cal.rules_type_accuracy)}</td></tr>
                    <tr><td>{t("Aprendizaje ({n} señales parecidas)", { n: cal.neighbors })}</td><td style={{ textAlign: "center" }}>{pct(cal.learned_cluster_accuracy)}</td><td style={{ textAlign: "center" }}>{pct(cal.learned_type_accuracy)}</td></tr>
                    <tr><td><strong>{t("Combinado (lo que ve el evaluador)")}</strong></td><td style={{ textAlign: "center" }}><strong>{pct(cal.combined_cluster_accuracy)}</strong></td><td style={{ textAlign: "center" }}>-</td></tr>
                    <tr><td style={{ color: "#64748b" }}>{t("Referencia: decir siempre el clúster más frecuente")}</td><td style={{ textAlign: "center", color: "#64748b" }}>{pct(cal.majority_baseline)}</td><td /></tr>
                  </tbody>
                </table>
                <p style={{ fontSize: 12, color: "#64748b" }}>
                  {t("Evaluado con {n} de {total} señales clasificadas, en {clusters} clúster(es) con ejemplos suficientes.", { n: cal.evaluated, total: cal.labeled, clusters: cal.clusters_with_examples })}{" "}
                  {cal.coverage !== null && cal.coverage !== undefined
                    ? t("Confianza mínima: {conf}, que cubre {cob} de las señales.", { conf: pct(cal.min_confidence), cob: pct(cal.coverage) })
                    : t("Confianza mínima: {conf}.", { conf: pct(cal.min_confidence) })}
                  {cal.applied ? ` ${t("Los parámetros se aplicaron.")}` : ""}
                </p>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="intel-calibration-bins">
                  <thead>
                    <tr><th style={{ textAlign: "left" }}>{t("Confianza que da el sistema")}</th><th>{t("Señales")}</th><th>{t("Acierto real")}</th></tr>
                  </thead>
                  <tbody>
                    {(cal.bins || []).map((b) => (
                      <tr key={b.from}>
                        <td>{t("{a} a {b} %", { a: Math.round(b.from * 100), b: Math.round(b.to * 100) })}</td>
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
        <h4 className="source-section-title">{t("Sugerencias confirmadas por el equipo")}</h4>
        {acc.decided > 0 ? (
          <p style={{ fontSize: 13 }} data-testid="intel-acceptance">
            {t("De {n} señal(es) con sugerencia que el equipo ya clasificó, confirmó el clúster sugerido en {cluster} ({clusterPct}) y la tipología en {tipo} ({tipoPct}).", {
              n: acc.decided,
              cluster: acc.cluster_accepted,
              clusterPct: pct(acc.cluster_accepted / acc.decided),
              tipo: acc.type_accepted,
              tipoPct: pct(acc.type_accepted / acc.decided),
            })}{" "}
            {acc.by_method.map((m) => `${METHOD[m.method] || m.method}: ${t("{n} de {total}", { n: m.accepted, total: m.decided })}`).join(" · ")}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "#64748b" }}>{t("Aún no hay señales clasificadas después de una sugerencia ({n} sugerencia(s) registradas).", { n: acc.suggested || 0 })}</p>
        )}
      </Card>

      <Card>
        <SectionTitle
          hint={t("Instrucciones que recibe la IA. Deje un campo vacío para usar el texto de fábrica.")}
          right={<Button size="sm" onClick={save} loading={busy === "save"} disabled={!canManage}>{t("Guardar prompts")}</Button>}
        >
          {t("Prompts de la IA")}
        </SectionTitle>
        <p style={{ fontSize: 13, color: "#475569", marginTop: 0 }}>
          {t("El prompt de la captura de señales está en la pestaña Prompts de vigilancia. Estos son los de la clasificación y la analítica.")}
        </p>
        {PROMPTS.map((p) => (
          <div key={p.key}>
            <Textarea
              id={`intel-${p.key}`}
              label={p.label}
              help={`${p.help ? `${p.help} ` : ""}${form[p.key] ? t("Texto propio.") : t("Vacío: se usa el de fábrica (se muestra como guía).")}`}
              rows={p.rows}
              disabled={!canManage}
              placeholder={data.default_prompts[p.key]}
              value={form[p.key] || ""}
              onChange={(e) => set(p.key, e.target.value)}
            />
            {!form[p.key] && canManage && (
              <button type="button" className="so-linkbtn" onClick={() => set(p.key, data.default_prompts[p.key])}>
                {t("Copiar el de fábrica para editarlo")}
              </button>
            )}
          </div>
        ))}
      </Card>

      <SignalWindowPanel toast={toast} canManage={canManage} />
    </div>
  );
}
