import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiError } from "../api/client";
import { GLOSSARY } from "../constants/glossary";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";
import { Input, Textarea } from "./Field";
import { LoadingBlock } from "./Spinner";
import { TermLabel } from "./InfoTip";

const LISTS = [
  { key: "priority_level", title: "Nivel de priorización", tip: GLOSSARY.fb_prioridad_fuente, rank: true, hint: "Orden = rango: 1 se escanea primero." },
  { key: "source_level", title: "Nivel de fuente (primaria, secundaria...)", tip: GLOSSARY.fb_nivel_fuente },
  { key: "tech_type", title: "Tipos de tecnología", tip: GLOSSARY.fb_tipos_tecnologia, hint: "Código en mayúscula (MED, DM, IA...)." },
  { key: "matrix_origin", title: "Origen en la matriz", tip: GLOSSARY.fb_origen_matriz },
];

const NUMBERS = [
  { key: "max_queries", label: "Consultas por fuente" },
  { key: "max_results", label: "Resultados a conservar" },
  { key: "fetch_results", label: "Resultados a abrir y leer" },
  { key: "timeout", label: "Tiempo por consulta (s)" },
  { key: "pause_ms", label: "Pausa entre consultas (ms)" },
  { key: "cooldown_minutes", label: "Pausa de un motor bloqueado (min)" },
];

const SWITCHES = [
  { key: "enabled", title: "Búsqueda web activa", text: "Interruptor global. Cada fuente además tiene su casilla en el flujo." },
  { key: "ai_queries", title: "Consultas redactadas por la IA", text: "La IA escribe las consultas con el contexto de la matriz. Si la IA no responde se usan reglas." },
  { key: "same_domain_only", title: "Solo resultados del dominio de la fuente", text: "Descarta resultados de otros sitios (recomendado)." },
  { key: "prefer_documents", title: "Priorizar documentos", text: "PDF, informes y publicaciones se leen primero." },
];

const splitList = (t) => String(t || "").split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);

function OptionListEditor({ spec, items, onChange }) {
  const update = (idx, patch) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const move = (idx, dir) => {
    const next = [...items];
    const [row] = next.splice(idx, 1);
    next.splice(idx + dir, 0, row);
    onChange(spec.rank ? next.map((it, i) => ({ ...it, rank: i + 1 })) : next);
  };
  return (
    <div style={{ marginBottom: 18 }} data-testid={`options-${spec.key}`}>
      <h4 className="source-section-title" style={{ borderTop: "none", paddingTop: 0 }}>
        <TermLabel tip={spec.tip}>{spec.title}</TermLabel>
      </h4>
      {spec.hint && <p className="source-section-note">{spec.hint}</p>}
      <div className="option-list-row muted" aria-hidden>
        <span>Valor</span><span>Etiqueta visible</span><span>Descripción</span><span>{spec.rank ? "Rango" : ""}</span><span />
      </div>
      {items.map((it, idx) => (
        <div key={idx} className="option-list-row">
          <input aria-label={`Valor ${idx + 1}`} value={it.value} onChange={(e) => update(idx, { value: e.target.value })} />
          <input aria-label={`Etiqueta ${idx + 1}`} value={it.label} onChange={(e) => update(idx, { label: e.target.value })} />
          <input aria-label={`Descripción ${idx + 1}`} value={it.description || ""} onChange={(e) => update(idx, { description: e.target.value })} />
          {spec.rank ? (
            <input aria-label={`Rango ${idx + 1}`} type="number" min={1} max={99} value={it.rank ?? idx + 1} onChange={(e) => update(idx, { rank: Number(e.target.value) })} />
          ) : (
            <span />
          )}
          <span style={{ display: "flex", gap: 2 }}>
            <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => move(idx, -1)} aria-label="Subir">↑</Button>
            <Button size="sm" variant="ghost" disabled={idx === items.length - 1} onClick={() => move(idx, 1)} aria-label="Bajar">↓</Button>
            <Button size="sm" variant="ghost" style={{ color: "#DC2626" }} onClick={() => onChange(items.filter((_, i) => i !== idx))} aria-label="Quitar">✕</Button>
          </span>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={() => onChange([...items, { value: "", label: "", description: "", ...(spec.rank ? { rank: items.length + 1 } : {}) }])}>
        <Icon name="plus" size={14} /> Agregar opción
      </Button>
    </div>
  );
}

export default function SourceParamsPanel({ toast }) {
  const [options, setOptions] = useState(null);
  const [search, setSearch] = useState(null);
  const [braveKey, setBraveKey] = useState("");
  const [genericText, setGenericText] = useState("");
  const [busy, setBusy] = useState("");
  const [testQuery, setTestQuery] = useState("site:fda.gov breakthrough device");
  const [testResult, setTestResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const fileRef = useRef(null);

  const applySearch = (data) => {
    setSearch(data);
    setGenericText((data.generic_terms || []).join(", "));
  };

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api.get("/config/source-options"), api.get("/config/web-search")]);
      setOptions(o.data);
      applySearch(s.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar los parámetros de fuentes"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (name, fn) => {
    setBusy(name);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  };

  const saveOptions = () =>
    run("options", async () => {
      try {
        const { data } = await api.put("/config/source-options", options);
        setOptions(data);
        toast.success("Listas de la matriz guardadas");
      } catch (e) {
        toast.error(apiError(e, "No se pudieron guardar las listas"));
      }
    });

  const resetOptions = () =>
    run("options", async () => {
      try {
        const { data } = await api.post("/config/source-options/reset");
        setOptions(data);
        toast.success("Listas restauradas a los valores de la matriz EH");
      } catch (e) {
        toast.error(apiError(e, "No se pudieron restaurar las listas"));
      }
    });

  const saveSearch = () =>
    run("search", async () => {
      const payload = {
        ...Object.fromEntries(SWITCHES.map((s) => [s.key, Boolean(search[s.key])])),
        ...Object.fromEntries(NUMBERS.map((n) => [n.key, Number(search[n.key])])),
        engines: search.engines,
        generic_terms: splitList(genericText),
        terms_by_category: search.terms_by_category,
        searxng_url: search.searxng_url || "",
      };
      if (braveKey.trim()) payload.brave_api_key = braveKey.trim();
      try {
        const { data } = await api.put("/config/web-search", payload);
        applySearch(data);
        setBraveKey("");
        toast.success("Búsqueda web guardada");
      } catch (e) {
        toast.error(apiError(e, "No se pudo guardar la búsqueda web"));
      }
    });

  const removeBrave = () =>
    run("search", async () => {
      try {
        const { data } = await api.put("/config/web-search", { brave_api_key: "" });
        applySearch(data);
        toast.success("Llave de Brave eliminada");
      } catch (e) {
        toast.error(apiError(e, "No se pudo eliminar la llave"));
      }
    });

  const resetSearch = () =>
    run("search", async () => {
      try {
        const { data } = await api.post("/config/web-search/reset");
        applySearch(data);
        toast.success("Búsqueda web restaurada a los valores por defecto");
      } catch (e) {
        toast.error(apiError(e, "No se pudo restaurar"));
      }
    });

  const clearCooldowns = () =>
    run("search", async () => {
      try {
        const { data } = await api.post("/config/web-search/cooldowns/clear");
        applySearch(data);
        toast.success("Motores reactivados");
      } catch (e) {
        toast.error(apiError(e, "No se pudieron reactivar los motores"));
      }
    });

  const testSearch = () =>
    run("test", async () => {
      setTestResult(null);
      try {
        const { data } = await api.post("/config/web-search/test", { query: testQuery });
        setTestResult(data);
        const s = await api.get("/config/web-search");
        setSearch((prev) => ({ ...prev, cooldown: s.data.cooldown }));
      } catch (e) {
        toast.error(apiError(e, "No se pudo ejecutar la consulta"));
      }
    });

  const importMatrix = (withFile) =>
    run("import", async () => {
      const form = new FormData();
      form.append("overwrite", overwrite ? "true" : "false");
      const file = fileRef.current?.files?.[0];
      if (withFile) {
        if (!file) {
          toast.warning("Elija el Excel de la matriz EH (.xlsx)");
          return;
        }
        form.append("file", file);
      }
      try {
        const { data } = await api.post("/sources/matrix/import", form);
        setImportResult(data);
        toast.success(`Matriz aplicada: ${data.updated} actualizadas, ${data.created} nuevas`);
        if (withFile) load();
      } catch (e) {
        toast.error(apiError(e, "No se pudo importar la matriz"));
      }
    });

  if (!options || !search) return <LoadingBlock label="Cargando parámetros de fuentes..." />;

  const engines = Object.keys(search.engine_labels || {});
  const toggleEngine = (code) => {
    const on = search.engines.includes(code);
    const next = on ? search.engines.filter((e) => e !== code) : [...search.engines, code];
    setSearch({ ...search, engines: next });
  };
  const moveEngine = (code, dir) => {
    const list = [...search.engines];
    const idx = list.indexOf(code);
    if (idx < 0 || idx + dir < 0 || idx + dir >= list.length) return;
    list.splice(idx, 1);
    list.splice(idx + dir, 0, code);
    setSearch({ ...search, engines: list });
  };
  const cooling = search.cooldown || {};
  const updateCategory = (idx, patch) =>
    setSearch({ ...search, terms_by_category: search.terms_by_category.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });

  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="source-params-panel">
      <Card>
        <SectionTitle hint={GLOSSARY.fb_importar_matriz}>Matriz EH (Excel)</SectionTitle>
        <p style={{ fontSize: 13, color: "#64748B", marginTop: -6 }}>
          Cargue el Excel «Fuentes de información proactiva EH» para actualizar nivel de fuente, priorización, tipos de
          tecnología, URLs de entrada, ruta de acceso, qué consultar y los criterios de búsqueda.
        </p>
        <div className="fb-toolbar" style={{ alignItems: "center" }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xlsm" aria-label="Excel de la matriz EH" data-testid="matrix-file" />
          <label className="catalog-check">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <span>Sobrescribir lo editado en el panel</span>
          </label>
          <Button onClick={() => importMatrix(true)} loading={busy === "import"}>
            <Icon name="doc" size={15} /> Importar Excel
          </Button>
          <Button variant="secondary" onClick={() => importMatrix(false)} loading={busy === "import"}>
            Reaplicar matriz cargada
          </Button>
        </div>
        {importResult && (
          <p style={{ fontSize: 13, marginBottom: 0 }} data-testid="matrix-import-result">
            {importResult.rows} filas · {importResult.updated} fuentes actualizadas · {importResult.created} nuevas
            {importResult.search_terms ? ` · ${importResult.search_terms} criterios de búsqueda` : ""}
            {(importResult.unmatched || []).length > 0 && ` · sin URL: ${importResult.unmatched.join(", ")}`}
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle hint={GLOSSARY.fb_matriz_eh}
          right={
            <div className="fb-toolbar">
              <Button size="sm" variant="secondary" onClick={resetOptions} loading={busy === "options"}>Restaurar</Button>
              <Button size="sm" onClick={saveOptions} loading={busy === "options"}>Guardar listas</Button>
            </div>
          }
        >
          Listas desplegables de las fuentes
        </SectionTitle>
        {LISTS.map((spec) => (
          <OptionListEditor key={spec.key} spec={spec} items={options[spec.key] || []} onChange={(items) => setOptions({ ...options, [spec.key]: items })} />
        ))}
      </Card>

      <Card>
        <SectionTitle hint={GLOSSARY.fb_flujo_busqueda}
          right={
            <div className="fb-toolbar">
              <Button size="sm" variant="secondary" onClick={resetSearch} loading={busy === "search"}>Restaurar</Button>
              <Button size="sm" onClick={saveSearch} loading={busy === "search"}>Guardar búsqueda web</Button>
            </div>
          }
        >
          Búsqueda web impulsada por IA
        </SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0 16px" }}>
          {SWITCHES.map((s) => (
            <label key={s.key} className="catalog-check" style={{ alignItems: "flex-start", margin: "6px 0" }}>
              <input type="checkbox" checked={Boolean(search[s.key])} onChange={(e) => setSearch({ ...search, [s.key]: e.target.checked })} data-testid={`search-${s.key}`} />
              <span><strong style={{ display: "block", color: "#0F172A" }}>{s.title}</strong>{s.text}</span>
            </label>
          ))}
        </div>

        <h4 className="source-section-title"><TermLabel tip={GLOSSARY.fb_motores_busqueda}>Motores (en orden de uso)</TermLabel></h4>
        <div style={{ display: "grid", gap: 6 }}>
          {[...search.engines, ...engines.filter((e) => !search.engines.includes(e))].map((code) => {
            const on = search.engines.includes(code);
            return (
              <div key={code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={on} onChange={() => toggleEngine(code)} aria-label={search.engine_labels?.[code] || code} />
                <span style={{ flex: 1 }}>{search.engine_labels?.[code] || code}</span>
                {cooling[code] > 0 && <Badge tone="warning">En pausa {Math.ceil(cooling[code] / 60)} min</Badge>}
                {code === "brave_api" && <Badge tone={search.brave_api_key_set ? "ok" : "viewer"}>{search.brave_api_key_set ? "Llave configurada" : "Sin llave"}</Badge>}
                {code === "searxng" && <Badge tone={search.searxng_url ? "ok" : "viewer"}>{search.searxng_url ? "URL configurada" : "Sin URL"}</Badge>}
                {on && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => moveEngine(code, -1)} aria-label={`Subir ${code}`}>↑</Button>
                    <Button size="sm" variant="ghost" onClick={() => moveEngine(code, 1)} aria-label={`Bajar ${code}`}>↓</Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {Object.keys(cooling).length > 0 && (
          <Button size="sm" variant="secondary" style={{ marginTop: 8 }} onClick={clearCooldowns} loading={busy === "search"}>
            Reactivar motores en pausa
          </Button>
        )}
        <div className="fb-grid-2" style={{ marginTop: 12 }}>
          <Input
            id="brave-key"
            type="password"
            autoComplete="off"
            label="Llave de Brave Search API"
            hint="Opcional. Plan gratuito con cupo mensual; es el motor más estable."
            placeholder={search.brave_api_key_masked || "Pegue la llave para guardarla"}
            value={braveKey}
            onChange={(e) => setBraveKey(e.target.value)}
          />
          <Input
            id="searxng-url"
            label="URL de SearXNG propio"
            hint="Opcional. Instancia SearXNG del IETS con formato JSON habilitado."
            placeholder="https://buscador.iets.org.co"
            value={search.searxng_url || ""}
            onChange={(e) => setSearch({ ...search, searxng_url: e.target.value })}
          />
        </div>
        {search.brave_api_key_set && (
          <Button size="sm" variant="ghost" style={{ color: "#DC2626", marginTop: -8 }} onClick={removeBrave}>Eliminar llave de Brave</Button>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0 12px", marginTop: 8 }}>
          {NUMBERS.map((n) => {
            const [lo, hi] = search.limits?.[n.key] || [0, 999999];
            return (
              <Input key={n.key} id={`search-${n.key}`} type="number" min={lo} max={hi} label={`${n.label} (${lo}-${hi})`} value={search[n.key] ?? ""} onChange={(e) => setSearch({ ...search, [n.key]: e.target.value })} />
            );
          })}
        </div>
        <Textarea id="search-generic" label="Términos genéricos (coma)" hint="Se combinan con los de cada fuente y categoría." rows={2} value={genericText} onChange={(e) => setGenericText(e.target.value)} />

        <h4 className="source-section-title">Criterios de búsqueda por categoría (hoja «Criterios de búsqueda»)</h4>
        <div style={{ display: "grid", gap: 8 }}>
          {(search.terms_by_category || []).map((c, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "220px 90px 1fr auto", gap: 8, alignItems: "start" }}>
              <input className="filter-input" aria-label={`Categoría ${idx + 1}`} value={c.category} onChange={(e) => updateCategory(idx, { category: e.target.value })} />
              <select className="filter-select" aria-label={`Tecnología ${idx + 1}`} value={c.tech_type} onChange={(e) => updateCategory(idx, { tech_type: e.target.value })}>
                {(options.tech_type || []).map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
              </select>
              <textarea
                className="filter-input"
                rows={2}
                aria-label={`Términos ${idx + 1}`}
                value={(c.terms || []).join(", ")}
                onChange={(e) => updateCategory(idx, { terms: splitList(e.target.value) })}
              />
              <Button size="sm" variant="ghost" style={{ color: "#DC2626" }} aria-label="Quitar categoría" onClick={() => setSearch({ ...search, terms_by_category: search.terms_by_category.filter((_, i) => i !== idx) })}>✕</Button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="secondary" style={{ marginTop: 8 }} onClick={() => setSearch({ ...search, terms_by_category: [...(search.terms_by_category || []), { category: "", tech_type: "MT", terms: [] }] })}>
          <Icon name="plus" size={14} /> Agregar categoría
        </Button>

        <h4 className="source-section-title">Probar motores</h4>
        <div className="fb-toolbar">
          <input className="filter-input" style={{ flex: 1, minWidth: 240 }} aria-label="Consulta de prueba" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
          <Button variant="outline" onClick={testSearch} loading={busy === "test"}>
            <Icon name="radar" size={15} /> Probar consulta
          </Button>
        </div>
        {testResult && (
          <div className="web-search-result" data-testid="engine-test-result">
            <p className="source-section-note">
              Respondió: <strong>{testResult.engine || "ningún motor"}</strong> ·{" "}
              {(testResult.attempts || []).map((a) => `${a.engine}: ${a.status}`).join(" · ")}
            </p>
            <ol className="web-search-results">
              {(testResult.results || []).slice(0, 8).map((r) => (
                <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer">{r.title || r.url}</a>{r.snippet && <p>{r.snippet}</p>}</li>
              ))}
            </ol>
          </div>
        )}
      </Card>
    </div>
  );
}
