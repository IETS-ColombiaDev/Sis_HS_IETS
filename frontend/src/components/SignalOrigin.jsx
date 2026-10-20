import { useEffect, useState } from "react";
import api, { AI_TIMEOUT, apiError } from "../api/client";
import { useToast } from "./Toast";
import Button from "./Button";
import Icon from "./Icon";
import "./signal-origin.css";

const VERDICT = {
  confiable: { label: "Confiable", tone: "ok", icon: "shield" },
  verificar: { label: "Verificar antes de usar", tone: "warn", icon: "alert" },
  baja: { label: "Baja confiabilidad", tone: "bad", icon: "x" },
};

const MAX_JSON_CHARS = 200000;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function CheckMark({ ok }) {
  if (ok === true) return <span className="so-mark so-mark--ok" aria-label="A favor">✓</span>;
  if (ok === false) return <span className="so-mark so-mark--bad" aria-label="En contra">✕</span>;
  return <span className="so-mark so-mark--neutral" aria-label="Por verificar">•</span>;
}

function ReasonList({ title, items, tone, testId }) {
  if (!items?.length) return null;
  return (
    <div className={`so-reasons so-reasons--${tone}`} data-testid={testId}>
      <div className="so-reasons-title">{title}</div>
      <ul>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Origen de una senal de la bandeja: enlace a la fuente, registro original
 * (JSON tal como llego) y dictamen de confiabilidad (chequeos + IA).
 */
export default function SignalOrigin({ tech, canAnalyze, onAssessed }) {
  const toast = useToast();
  const [url, setUrl] = useState(tech.signal_url || tech.url || "");
  const [assessment, setAssessment] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [raw, setRaw] = useState(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAssessment(null);
    setRaw(null);
    setRawOpen(false);
    api
      .get(`/technologies/${tech.id}/reliability`)
      .then(({ data }) => {
        if (cancelled) return;
        if (data.url) setUrl(data.url);
        setAssessment(data.assessment || null);
      })
      .catch(() => {
        /* sin dictamen previo: el panel ofrece analizar */
      });
    return () => {
      cancelled = true;
    };
  }, [tech.id]);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const { data } = await api.post(`/technologies/${tech.id}/reliability`, null, { timeout: AI_TIMEOUT });
      setAssessment(data.assessment);
      if (data.url) setUrl(data.url);
      setChecksOpen(false);
      onAssessed?.(data.assessment, data.url);
    } catch (e) {
      toast.error(apiError(e, "No se pudo analizar la confiabilidad"));
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleRaw = async () => {
    if (rawOpen) {
      setRawOpen(false);
      return;
    }
    setRawOpen(true);
    if (raw) return;
    setRawLoading(true);
    try {
      const { data } = await api.get(`/ingest/raw/${tech.id}`);
      setRaw(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo abrir el registro original"));
      setRawOpen(false);
    } finally {
      setRawLoading(false);
    }
  };

  const json = raw ? JSON.stringify(raw.payload ?? {}, null, 2) : "";
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(json);
      toast.success("JSON copiado al portapapeles.");
    } catch {
      toast.error("El navegador no permitió copiar. Seleccione el texto y cópielo.");
    }
  };

  const v = assessment ? VERDICT[assessment.verdict] || VERDICT.verificar : null;
  const host = hostOf(url);

  return (
    <section className="so-panel" data-testid="signal-origin">
      <div className="so-head">
        <div className="so-title">Origen de la señal</div>
        {tech.source_title && <div className="so-source">{tech.source_title}</div>}
      </div>

      <div className="so-actions">
        {url ? (
          <a
            className="so-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="signal-url"
            title={url}
          >
            <Icon name="external" size={15} />
            <span>Abrir fuente original</span>
            {host && <span className="so-host">{host}</span>}
          </a>
        ) : (
          <span className="so-nolink" data-testid="signal-url-missing">
            <Icon name="link" size={15} /> La señal no trae URL
          </span>
        )}
        {tech.has_raw && (
          <Button variant="outline" size="sm" onClick={toggleRaw} loading={rawLoading} data-testid="signal-json-toggle">
            <Icon name="doc" size={15} /> {rawOpen ? "Ocultar JSON" : "Ver JSON original"}
          </Button>
        )}
        {canAnalyze && (
          <Button size="sm" onClick={analyze} loading={analyzing} data-testid="signal-reliability-run">
            <Icon name="spark" size={15} /> {assessment ? "Volver a analizar" : "¿Es confiable? Analizar con IA"}
          </Button>
        )}
      </div>

      {rawOpen && raw && (
        <div className="so-json" data-testid="signal-json">
          <div className="so-json-bar">
            <span>
              {raw.connector || raw.origin || "registro"}
              {raw.external_id ? ` · id ${raw.external_id}` : ""}
              {raw.fetched_at ? ` · ${new Date(raw.fetched_at).toLocaleString("es-CO")}` : ""}
            </span>
            <button type="button" className="so-copy" onClick={copyJson}>
              Copiar
            </button>
          </div>
          <pre>
            {json.length > MAX_JSON_CHARS ? `${json.slice(0, MAX_JSON_CHARS)}\n… (recortado)` : json}
          </pre>
        </div>
      )}

      {analyzing && !assessment && (
        <p className="so-wait">Revisando la fuente, la página y el registro original…</p>
      )}

      {assessment && v && (
        <div className={`so-verdict so-verdict--${v.tone}`} data-testid="signal-reliability">
          <div className="so-verdict-top">
            <span className="so-verdict-badge" data-testid="signal-verdict">
              <Icon name={v.icon} size={15} /> {v.label}
            </span>
            <span className="so-score" aria-label={`Puntaje ${assessment.score} de 100`}>
              <span className="so-score-bar">
                <span style={{ width: `${assessment.score}%` }} />
              </span>
              {assessment.score}/100
            </span>
          </div>
          {assessment.summary && <p className="so-summary">{assessment.summary}</p>}
          <div className="so-reason-grid">
            <ReasonList title="A favor" items={assessment.pros} tone="ok" testId="signal-pros" />
            <ReasonList title="Alertas" items={assessment.alerts} tone="bad" testId="signal-alerts" />
            <ReasonList title="Qué verificar" items={assessment.to_verify} tone="warn" testId="signal-verify" />
          </div>

          <button type="button" className="so-linkbtn" onClick={() => setChecksOpen((o) => !o)}>
            {checksOpen ? "Ocultar" : "Ver"} los {assessment.checks?.length || 0} chequeos automáticos
          </button>
          {checksOpen && (
            <ul className="so-checks" data-testid="signal-checks">
              {(assessment.checks || []).map((c) => (
                <li key={c.key}>
                  <CheckMark ok={c.ok} />
                  <div>
                    <strong>{c.label}</strong>
                    <span>{c.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="so-foot">
            {assessment.ai_used ? `Dictamen de ${assessment.model || "la IA"}` : "Solo chequeos automáticos"}
            {assessment.ai_used && assessment.base_score !== assessment.score
              ? ` · chequeos automáticos: ${assessment.base_score}/100`
              : ""}
            {assessment.assessed_at ? ` · ${new Date(assessment.assessed_at).toLocaleString("es-CO")}` : ""}
            {assessment.note ? <div className="so-note">{assessment.note}</div> : null}
            <div className="so-note">La IA orienta; la decisión de clasificar o descartar es del evaluador.</div>
          </div>
        </div>
      )}

      {!assessment && !analyzing && (
        <p className="so-wait">
          {canAnalyze
            ? "Aún no se ha revisado la confiabilidad de esta señal."
            : "Aún no hay un dictamen de confiabilidad. Lo genera un evaluador."}
        </p>
      )}
    </section>
  );
}
