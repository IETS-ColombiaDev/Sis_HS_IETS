import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import Icon from "./Icon";
import { Spinner } from "./Spinner";
import "./tech-search.css";

function fmt(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

const MATCH_LABEL = {
  nombre: "nombre",
  dci: "DCI",
  marca: "marca",
  fabricante: "fabricante",
  senal: "título de la señal",
  tecnologia_senal: "tecnología de la señal",
  fuente: "fuente",
};

function History({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    api
      .get(`/technologies/${id}/history`)
      .then(({ data: d }) => alive && setData(d))
      .catch((e) => alive && setError(apiError(e, "No se pudo leer el recorrido")));
    return () => {
      alive = false;
    };
  }, [id]);
  if (error) return <p className="ts-muted">{error}</p>;
  if (!data) return <p className="ts-muted"><Spinner /> Leyendo la bitácora…</p>;
  const steps = data.steps.filter((s) => s.stage_change);
  if (!steps.length) return <p className="ts-muted">La bitácora no registra cambios de etapa para esta tecnología.</p>;
  return (
    <ol className="ts-history" data-testid="tech-search-history">
      {steps.map((s, i) => (
        <li key={i}>
          <span className="ts-dot" aria-hidden="true" />
          <div>
            <strong>{s.label}</strong>
            {s.cycle_code ? <span className="ts-muted"> · {s.cycle_code}</span> : null}
            <div className="ts-muted">{fmt(s.at)} · {s.user || "sistema"}</div>
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
        setData({ results: [], message: apiError(e, "No se pudo buscar") });
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <section className="ts-panel" data-testid="tech-search">
      <label className="ts-label" htmlFor="tech-search-input">
        <Icon name="search" size={16} /> Buscar una tecnología o señal
      </label>
      <div className="ts-inputwrap">
        <input
          id="tech-search-input"
          className="ts-input"
          type="search"
          placeholder="Nombre, DCI, marca, fabricante o fuente (en español o inglés)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {loading && <Spinner />}
      </div>
      {data && (
        <div className="ts-results" aria-live="polite">
          {data.results.length === 0 ? (
            <p className="ts-empty" data-testid="tech-search-empty">{data.message || "Sin resultados."}</p>
          ) : (
            <>
              <div className="ts-muted" style={{ marginBottom: 6 }}>
                {data.total} resultado(s){data.total > data.results.length ? `, se muestran ${data.results.length}` : ""}
              </div>
              <ul className="ts-list">
                {data.results.map((r) => (
                  <li key={r.id} className="ts-item" data-testid="tech-search-result">
                    <div className="ts-item-head">
                      <Link to={r.link} className="ts-name">{r.name}</Link>
                      <span className={`ts-status ts-status--${r.status}`}>{r.status_label}</span>
                    </div>
                    <div className="ts-meta">
                      <span><strong>Módulo:</strong> {r.module}</span>
                      <span><strong>Etapa:</strong> {r.stage}{r.cycle_code ? ` (${r.cycle_code})` : ""}</span>
                      {r.tech_type && <span><strong>Tipo:</strong> {r.tech_type}</span>}
                      <span><strong>Responsable:</strong> {r.responsible}</span>
                      <span><strong>Último cambio:</strong> {fmt(r.last_change_at)}</span>
                    </div>
                    <div className="ts-meta ts-muted">
                      {r.source_title && <span>Fuente: {r.source_title}</span>}
                      {r.flags?.map((f) => <span key={f} className="ts-flag">{f}</span>)}
                      <span>Coincide en: {r.matched_on.map((m) => MATCH_LABEL[m] || m).join(", ")}</span>
                    </div>
                    <div className="ts-actions">
                      <Link to={r.link} className="ts-btn">
                        <Icon name="external" size={13} /> Abrir el registro
                      </Link>
                      <button type="button" className="ts-btn ts-btn--ghost" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                        {open === r.id ? "Ocultar recorrido" : "Ver recorrido por etapas"}
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
