import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import Icon from "./Icon";
import { Spinner } from "./Spinner";
import { t, ts, intlLocale } from "../i18n";
import "./tech-search.css";

function fmt(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(intlLocale(), { dateStyle: "medium", timeStyle: "short" });
}

const MATCH_LABEL = {
  nombre: t("nombre"),
  dci: t("DCI"),
  marca: t("marca"),
  fabricante: t("fabricante"),
  senal: t("título de la señal"),
  tecnologia_senal: t("tecnología de la señal"),
  fuente: t("fuente"),
};

function History({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api
      .get(`/technologies/${id}/history`)
      .then(({ data: d }) => alive && setData(d))
      .catch((e) => alive && setError(apiError(e, t("No se pudo leer el recorrido"))));
    return () => {
      alive = false;
    };
  }, [id]);
  if (error) return <p className="ts-muted">{error}</p>;
  if (!data) return <p className="ts-muted"><Spinner /> {t("Leyendo la bitácora…")}</p>;
  const steps = data.steps.filter((s) => s.stage_change);
  if (!steps.length) return <p className="ts-muted">{t("La bitácora no registra cambios de etapa para esta tecnología.")}</p>;
  return (
    <ol className="ts-history" data-testid="tech-search-history">
      {steps.map((s, i) => (
        <li key={i}>
          <span className="ts-dot" aria-hidden="true" />
          <div>
            <strong>{ts(s.label)}</strong>
            {s.cycle_code ? <span className="ts-muted"> · {s.cycle_code}</span> : null}
            <div className="ts-muted">{fmt(s.at)} · {s.user || t("sistema")}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Buscador de tecnologías de la pantalla principal (RF-005): dónde quedó una
 * tecnología o señal, en qué etapa y estado está y quién la movió por última vez.
 */
export default function TechSearch() {
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setData(null);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data: d } = await api.get("/technologies/search", { params: { q: term } });
        setData(d);
        setOpen(null);
      } catch (e) {
        setData({ results: [], message: apiError(e, t("No se pudo buscar")) });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <section className="ts-panel" data-testid="tech-search">
      <label className="ts-label" htmlFor="tech-search-input">
        <Icon name="search" size={16} /> {t("Buscar una tecnología o señal")}
      </label>
      <div className="ts-inputwrap">
        <input
          id="tech-search-input"
          className="ts-input"
          type="search"
          placeholder={t("Nombre, DCI, marca, fabricante o fuente (en español o inglés)")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {loading && <Spinner />}
      </div>
      {data && (
        <div className="ts-results" aria-live="polite">
          {data.results.length === 0 ? (
            <p className="ts-empty" data-testid="tech-search-empty">{ts(data.message) || t("Sin resultados.")}</p>
          ) : (
            <>
              <div className="ts-muted" style={{ marginBottom: 6 }}>
                {data.total > data.results.length
                  ? t("{n} resultado(s), se muestran {shown}", { n: data.total, shown: data.results.length })
                  : t("{n} resultado(s)", { n: data.total })}
              </div>
              <ul className="ts-list">
                {data.results.map((r) => (
                  <li key={r.id} className="ts-item" data-testid="tech-search-result">
                    <div className="ts-item-head">
                      <Link to={r.link} className="ts-name">{r.name}</Link>
                      <span className={`ts-status ts-status--${r.status}`}>{ts(r.status_label)}</span>
                    </div>
                    <div className="ts-meta">
                      <span><strong>{t("Módulo:")}</strong> {ts(r.module)}</span>
                      <span><strong>{t("Etapa:")}</strong> {ts(r.stage)}{r.cycle_code ? ` (${r.cycle_code})` : ""}</span>
                      {r.tech_type && <span><strong>{t("Tipo:")}</strong> {ts(r.tech_type)}</span>}
                      <span><strong>{t("Responsable:")}</strong> {ts(r.responsible)}</span>
                      <span><strong>{t("Último cambio:")}</strong> {fmt(r.last_change_at)}</span>
                    </div>
                    <div className="ts-meta ts-muted">
                      {r.source_title && <span>{t("Fuente: {title}", { title: r.source_title })}</span>}
                      {r.flags?.map((f) => <span key={f} className="ts-flag">{ts(f)}</span>)}
                      <span>{t("Coincide en: {list}", { list: r.matched_on.map((m) => MATCH_LABEL[m] || m).join(", ") })}</span>
                    </div>
                    <div className="ts-actions">
                      <Link to={r.link} className="ts-btn">
                        <Icon name="external" size={13} /> {t("Abrir el registro")}
                      </Link>
                      <button type="button" className="ts-btn ts-btn--ghost" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                        {open === r.id ? t("Ocultar recorrido") : t("Ver recorrido por etapas")}
                      </button>
                    </div>
                    {open === r.id && <History id={r.id} />}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
