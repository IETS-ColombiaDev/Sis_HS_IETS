import { GLOSSARY } from "../constants/glossary";
import Badge from "./Badge";
import { Input, Textarea, Select } from "./Field";
import { TermLabel } from "./InfoTip";

// Respaldo si /sources/options no responde: mismas listas que el servidor por defecto.
export const FALLBACK_OPTIONS = {
  source_level: [
    { value: "primaria", label: "Primaria" },
    { value: "secundaria", label: "Secundaria" },
    { value: "terciaria", label: "Terciaria" },
    { value: "por_definir", label: "Por definir" },
  ],
  priority_level: [
    { value: "alta", label: "Alta", rank: 1 },
    { value: "media", label: "Media", rank: 2 },
    { value: "revisar", label: "Revisar pertinencia", rank: 3 },
    { value: "baja", label: "Baja", rank: 4 },
  ],
  tech_type: [
    { value: "MED", label: "Medicamentos" },
    { value: "DM", label: "Dispositivos médicos" },
    { value: "BIOM", label: "Biomarcadores" },
    { value: "IA", label: "Inteligencia artificial" },
    { value: "SD", label: "Software como dispositivo (SaMD)" },
    { value: "MT", label: "Múltiples tecnologías" },
  ],
  matrix_origin: [],
};

export const DEFAULT_FLOW = {
  crawl: true,
  follow_links: true,
  ocr: true,
  ai: true,
  web_search: true,
  max_pages: 0,
  follow_keywords: [],
  search_terms: [],
  search_domain: "",
};

const FLOW_SWITCHES = [
  { key: "crawl", label: "Recorrido del sitio", tip: "fb_flujo_recorrido" },
  { key: "follow_links", label: "Seguir enlaces internos", tip: "fb_flujo_enlaces" },
  { key: "ocr", label: "OCR de documentos e imágenes", tip: "fb_flujo_ocr" },
  { key: "ai", label: "Lectura con IA", tip: "fb_flujo_ia" },
  { key: "web_search", label: "Búsqueda web impulsada por IA", tip: "fb_flujo_busqueda" },
];

export const PRIORITY_TONES = { alta: "alto", media: "medio", baja: "bajo", revisar: "info" };
export const LEVEL_TONES = { primaria: "ok", secundaria: "D", terciaria: "digital", por_definir: "default" };

export function optionLabel(options, list, value) {
  const hit = (options?.[list] || []).find((o) => o.value === value);
  return hit ? hit.label : value;
}

const splitLines = (text) =>
  String(text || "")
    .split(/[\n,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Estado del formulario a partir de una fuente (o vacio). */
export function matrixFormFrom(source) {
  const s = source || {};
  const flow = { ...DEFAULT_FLOW, ...(s.scan_profile || {}) };
  return {
    source_level: s.source_level || "por_definir",
    priority_level: s.priority_level || "",
    tech_types: s.tech_types || [],
    matrix_origin: s.matrix_origin || "",
    matrix_ref: s.matrix_ref || "",
    entryUrlsText: (s.entry_urls || []).join("\n"),
    referenceUrlsText: (s.reference_urls || []).join("\n"),
    material_type: s.material_type || "",
    access_path: s.access_path || "",
    consult_info: s.consult_info || "",
    observations: s.observations || "",
    usage_restrictions: s.usage_restrictions || "",
    flow,
    followKeywordsText: (flow.follow_keywords || []).join(", "),
    searchTermsText: (flow.search_terms || []).join(", "),
  };
}

/** Valida URLs y arma el payload de la API. Devuelve { error } o { payload }. */
export function matrixPayload(form) {
  const entry = splitLines(form.entryUrlsText);
  const refs = splitLines(form.referenceUrlsText);
  const bad = [...entry, ...refs].find((u) => !/^https?:\/\//i.test(u));
  if (bad) return { error: `La URL "${bad.slice(0, 80)}" debe iniciar con http:// o https://` };
  const maxPages = Number(form.flow.max_pages || 0);
  if (!Number.isInteger(maxPages) || maxPages < 0 || maxPages > 20) return { error: "Las páginas por fuente deben ser un entero entre 0 y 20 (0 = valor global)." };
  return {
    payload: {
      source_level: form.source_level,
      priority_level: form.priority_level,
      tech_types: form.tech_types,
      matrix_origin: form.matrix_origin,
      entry_urls: entry,
      reference_urls: refs,
      material_type: form.material_type,
      access_path: form.access_path,
      consult_info: form.consult_info,
      observations: form.observations,
      usage_restrictions: form.usage_restrictions,
      scan_profile: {
        ...form.flow,
        max_pages: maxPages,
        follow_keywords: splitLines(form.followKeywordsText),
        search_terms: splitLines(form.searchTermsText),
        search_domain: (form.flow.search_domain || "").trim(),
      },
    },
  };
}

function SectionTitle({ children, tip }) {
  return (
    <h4 className="source-section-title">
      {tip ? <TermLabel tip={tip}>{children}</TermLabel> : children}
    </h4>
  );
}

/** Campos de la matriz EH (listas desplegables) y casillas del flujo de escaneo. */
export default function SourceMatrixEditor({ form, setForm, options, webSearchOn = true }) {
  const opts = options || FALLBACK_OPTIONS;
  const set = (patch) => setForm({ ...form, ...patch });
  const setFlow = (patch) => setForm({ ...form, flow: { ...form.flow, ...patch } });
  const toggleTech = (code) =>
    set({ tech_types: form.tech_types.includes(code) ? form.tech_types.filter((t) => t !== code) : [...form.tech_types, code] });
  const origins = [...(opts.matrix_origin || [])];
  if (form.matrix_origin && !origins.some((o) => o.value === form.matrix_origin)) origins.push({ value: form.matrix_origin, label: form.matrix_origin });

  return (
    <>
      <SectionTitle tip={GLOSSARY.fb_matriz_eh}>Matriz EH · priorización</SectionTitle>
      {form.matrix_ref && <p className="source-section-note">Origen en la matriz: {form.matrix_ref}</p>}
      <div className="fb-grid-2">
        <Select id="source-tier" label="Nivel de fuente" hint={GLOSSARY.fb_nivel_fuente} value={form.source_level} onChange={(e) => set({ source_level: e.target.value })}>
          {(opts.source_level || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select id="source-priority" label="Nivel de priorización" hint={GLOSSARY.fb_prioridad_fuente} value={form.priority_level} onChange={(e) => set({ priority_level: e.target.value })}>
          <option value="">Sin asignar</option>
          {(opts.priority_level || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select id="source-origin" label="Origen (matriz)" hint={GLOSSARY.fb_origen_matriz} value={form.matrix_origin} onChange={(e) => set({ matrix_origin: e.target.value })}>
          <option value="">Sin origen</option>
          {origins.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Input id="source-material" label="Tipo de material" value={form.material_type} onChange={(e) => set({ material_type: e.target.value })} placeholder="Informes, alertas, bases de datos..." />
      </div>
      <div className="source-tech-checks" role="group" aria-label="Tipos de tecnología">
        <span className="source-tech-label"><TermLabel tip={GLOSSARY.fb_tipos_tecnologia}>Tipos de tecnología</TermLabel></span>
        {(opts.tech_type || []).map((o) => (
          <label key={o.value} className="catalog-check" title={o.description || o.label}>
            <input type="checkbox" checked={form.tech_types.includes(o.value)} onChange={() => toggleTech(o.value)} />
            <span>{o.value} · {o.label}</span>
          </label>
        ))}
      </div>
      <Textarea id="source-entry-urls" label="URLs de entrada (una por línea)" hint={GLOSSARY.fb_urls_entrada} rows={3} value={form.entryUrlsText} onChange={(e) => set({ entryUrlsText: e.target.value })} spellCheck={false} />
      <Textarea id="source-reference-urls" label="URLs de referencia o metodología" rows={2} value={form.referenceUrlsText} onChange={(e) => set({ referenceUrlsText: e.target.value })} spellCheck={false} />
      <Textarea id="source-access-path" label="Ruta de acceso" hint={GLOSSARY.fb_ruta_acceso} rows={2} value={form.access_path} onChange={(e) => set({ access_path: e.target.value })} />
      <Textarea id="source-consult" label="Qué consultar" rows={2} value={form.consult_info} onChange={(e) => set({ consult_info: e.target.value })} />
      <div className="fb-grid-2">
        <Textarea id="source-observations" label="Observaciones" rows={2} value={form.observations} onChange={(e) => set({ observations: e.target.value })} />
        <Textarea id="source-restrictions" label="Restricciones de uso" rows={2} value={form.usage_restrictions} onChange={(e) => set({ usage_restrictions: e.target.value })} />
      </div>

      <SectionTitle tip={GLOSSARY.fb_flujo_fuente}>Flujo de escaneo de esta fuente</SectionTitle>
      <div className="source-flow-switches">
        {FLOW_SWITCHES.map((sw) => (
          <label key={sw.key} className="catalog-check">
            <input
              type="checkbox"
              data-testid={`flow-${sw.key}`}
              checked={Boolean(form.flow[sw.key])}
              onChange={(e) => setFlow({ [sw.key]: e.target.checked })}
              disabled={sw.key === "follow_links" && !form.flow.crawl}
            />
            <TermLabel tip={GLOSSARY[sw.tip]}>{sw.label}</TermLabel>
          </label>
        ))}
      </div>
      {!webSearchOn && form.flow.web_search && (
        <p className="source-section-note">La búsqueda web está apagada en Configuración › Parámetros de fuentes: esta casilla no tendrá efecto hasta encenderla.</p>
      )}
      <div className="fb-grid-2">
        <Input id="source-max-pages" type="number" min={0} max={20} label="Páginas a seguir (0 = valor global)" hint={GLOSSARY.fb_flujo_paginas} value={form.flow.max_pages} onChange={(e) => setFlow({ max_pages: e.target.value })} />
        <Input id="source-search-domain" label="Dominio de búsqueda" hint={GLOSSARY.fb_dominio_busqueda} placeholder="Vacío = dominio de la URL" value={form.flow.search_domain || ""} onChange={(e) => setFlow({ search_domain: e.target.value })} />
      </div>
      <Input id="source-follow-keywords" label="Palabras guía para seguir enlaces (coma)" hint={GLOSSARY.fb_palabras_guia} value={form.followKeywordsText} onChange={(e) => set({ followKeywordsText: e.target.value })} placeholder="pipeline, horizon scanning, breakthrough" />
      <Input id="source-search-terms" label="Términos propios de búsqueda web (coma)" hint={GLOSSARY.fb_terminos_fuente} value={form.searchTermsText} onChange={(e) => set({ searchTermsText: e.target.value })} placeholder="Vacío = términos por tipo de tecnología" />
    </>
  );
}

/** Insignias de la matriz para tarjetas y fichas. */
export function MatrixBadges({ source, options }) {
  const opts = options || FALLBACK_OPTIONS;
  return (
    <>
      {source.priority_level && (
        <span title={GLOSSARY.fb_prioridad_fuente}>
          <Badge tone={PRIORITY_TONES[source.priority_level] || "info"}>Prioridad {optionLabel(opts, "priority_level", source.priority_level)}</Badge>
        </span>
      )}
      {source.source_level && source.source_level !== "por_definir" && (
        <span title={GLOSSARY.fb_nivel_fuente}>
          <Badge tone={LEVEL_TONES[source.source_level] || "default"}>{optionLabel(opts, "source_level", source.source_level)}</Badge>
        </span>
      )}
    </>
  );
}

const STEP_TONES = { ok: "ok", omitido: "viewer", sin_resultados: "parcial", sin_motor: "error" };

/** Resultado de "Probar búsqueda web". */
export function WebSearchResult({ data }) {
  if (!data) return null;
  return (
    <div className="web-search-result" data-testid="web-search-result">
      <p className="source-section-note">
        Dominio: <strong>{data.domain || "—"}</strong> · Consultas redactadas por {data.query_origin === "ia" ? "la IA" : data.query_origin === "reglas" ? "reglas (sin IA)" : "—"}
      </p>
      {(data.queries || []).length > 0 && (
        <ul className="web-search-queries">
          {data.queries.map((q) => <li key={q}><code>{q}</code></li>)}
        </ul>
      )}
      <ul className="web-search-steps">
        {(data.steps || []).map((s, i) => (
          <li key={i}>
            <Badge tone={STEP_TONES[s.status] || "default"}>{s.status}</Badge> <span>{s.detail}</span>
          </li>
        ))}
      </ul>
      {(data.results || []).length === 0 ? (
        <p className="source-section-note">Sin resultados dentro del dominio en esta prueba. Los motores gratuitos limitan las consultas seguidas: vuelva a intentar en unos minutos o configure Brave/SearXNG.</p>
      ) : (
        <ol className="web-search-results">
          {data.results.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer">{r.title || r.url}</a>
              <small> · {r.engine}</small>
              {r.snippet && <p>{r.snippet}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
