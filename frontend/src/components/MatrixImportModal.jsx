import { useMemo, useRef, useState } from "react";
import api, { SCAN_TIMEOUT, apiError } from "../api/client";
import Modal from "./Modal";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";
import { Input } from "./Field";
import { Spinner } from "./Spinner";

/**
 * Importar la matriz EH desde el Excel «FUENTES DE INFORMACION PROACTIVA EH» o
 * desde una hoja de Google Sheets, compararla con el inventario y elegir qué
 * crear y qué actualizar. Para cada fuente nueva, el sistema sugiere cómo
 * detectar señales (adaptador, nivel de acceso, palabras guía); la IA revisa la
 * sugerencia de las reglas si está activa. Nada se escribe hasta «Aplicar».
 */

const ACCESS = ["A", "B", "C", "D", "E"];
const DETECTION_FALLBACK = {
  api: "API del adaptador",
  rss: "Canal RSS",
  html_recorrido: "Rastreo HTML con recorrido de fichas",
  pdf: "Extracción de PDF",
  manual: "Curaduría humana (sin ingesta automática)",
};
const MATCH_LABEL = { codigo: "código de catálogo", url: "URL", nombre: "nombre", dominio: "dominio" };

function show(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function NewRow({ row, choice, onChange, connectors, labels }) {
  const sug = choice;
  const reach = row.suggestion.reach;
  return (
    <div className={`matrix-row${choice.selected ? "" : " matrix-row--off"}`} data-testid={`matrix-new-${row.key}`}>
      <div className="matrix-row-head">
        <input
          type="checkbox"
          checked={choice.selected}
          onChange={(e) => onChange({ selected: e.target.checked })}
          aria-label={`Crear ${row.name}`}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="matrix-row-title">{row.name}</div>
          <div className="matrix-row-url">{row.url || "Sin URL en la matriz"}</div>
          <div className="matrix-row-meta">
            {row.entity_label && <Badge>{row.entity_label}</Badge>}
            {row.country && <span>{row.country}</span>}
            {row.tech_types?.length > 0 && <span>{row.tech_types.join(" · ")}</span>}
            {row.priority_level && <Badge tone={row.priority_level === "alta" ? "success" : "viewer"}>Prioridad {row.priority_level}</Badge>}
            {row.excel_row ? <span>Fila {row.excel_row}</span> : null}
            {reach && (
              <Badge tone={reach.ok && reach.status < 400 ? "success" : reach.ok ? "warning" : "danger"}>
                Sitio: {reach.detail}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="matrix-suggest">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>Detección sugerida:</strong> {labels[sug.detection] || sug.detection}
          <Badge tone={row.suggestion.origin === "ia" ? "info" : "viewer"}>
            {row.suggestion.origin === "ia" ? "Revisada por IA" : "Por reglas"}
          </Badge>
        </div>
        {row.suggestion.rationale && <p style={{ margin: "4px 0 0", color: "#475569" }}>{row.suggestion.rationale}</p>}
        <div className="matrix-suggest-grid">
          <label>
            Adaptador
            <select value={sug.connector} onChange={(e) => onChange({ connector: e.target.value })} disabled={!choice.selected}>
              {connectors.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
              {!connectors.some((c) => c.code === sug.connector) && <option value={sug.connector}>{sug.connector}</option>}
            </select>
          </label>
          <label>
            Nivel de acceso
            <select value={sug.access_level} onChange={(e) => onChange({ access_level: e.target.value })} disabled={!choice.selected}>
              {ACCESS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Palabras guía
            <input
              type="text"
              value={sug.follow_keywords_text}
              onChange={(e) => onChange({ follow_keywords_text: e.target.value })}
              disabled={!choice.selected}
              placeholder="pipeline, news, approvals"
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#334155" }}>
            <input
              type="checkbox"
              checked={sug.enable_ingest && sug.connector !== "manual"}
              disabled={!choice.selected || sug.connector === "manual"}
              onChange={(e) => onChange({ enable_ingest: e.target.checked })}
            />
            Activar ingesta
          </label>
        </div>
        {sug.entry_urls?.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#64748B" }}>URLs de entrada: {sug.entry_urls.join(" · ")}</div>
        )}
      </div>
    </div>
  );
}

function ChangedRow({ row, selected, onToggle }) {
  return (
    <div className={`matrix-row${selected ? "" : " matrix-row--off"}`} data-testid={`matrix-changed-${row.key}`}>
      <div className="matrix-row-head">
        <input type="checkbox" checked={selected} onChange={(e) => onToggle(e.target.checked)} aria-label={`Actualizar ${row.source_title}`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="matrix-row-title">
            {row.source_title}
            {row.name !== row.source_title && <span style={{ fontWeight: 400, color: "#64748B" }}> ← «{row.name}» en la matriz</span>}
          </div>
          <div className="matrix-row-meta">
            <span>Coincide por {MATCH_LABEL[row.match_reason] || row.match_reason}</span>
            {row.probable && <Badge tone="warning">Coincidencia probable: verifique</Badge>}
            <span>{row.changes.length} campo(s)</span>
          </div>
          <table className="matrix-diff">
            <tbody>
              {row.changes.map((c, i) => (
                <tr key={`${c.field}-${i}`}>
                  <th>{c.label}</th>
                  <td className="old">{show(c.current)}</td>
                  <td className="new">{show(c.incoming)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function MatrixImportModal({ open, onClose, onApplied, connectors = [], toast }) {
  const [mode, setMode] = useState("file");
  const [sheetUrl, setSheetUrl] = useState("");
  const [useAi, setUseAi] = useState(true);
  const [checkReach, setCheckReach] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState({});
  const [updates, setUpdates] = useState({});
  const [overwrite, setOverwrite] = useState(false);
  const [persist, setPersist] = useState(true);
  const [showSame, setShowSame] = useState(false);
  const fileRef = useRef(null);

  const connectorOptions = useMemo(() => connectors.filter((c) => c.code !== "fixture"), [connectors]);
  const labels = result?.detection_labels || DETECTION_FALLBACK;

  const reset = () => {
    setResult(null);
    setError("");
    setChoices({});
    setUpdates({});
  };

  const close = () => {
    if (comparing || applying) return;
    reset();
    onClose();
  };

  const compare = async () => {
    setError("");
    const form = new FormData();
    if (mode === "file") {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("Elija el Excel de la matriz EH (.xlsx).");
        return;
      }
      form.append("file", file);
    } else {
      if (!/^https:\/\/docs\.google\.com\/spreadsheets\//i.test(sheetUrl.trim())) {
        setError("Pegue el enlace de la hoja: https://docs.google.com/spreadsheets/d/…");
        return;
      }
      form.append("sheet_url", sheetUrl.trim());
    }
    form.append("use_ai", useAi ? "true" : "false");
    form.append("check_reach", checkReach ? "true" : "false");
    setComparing(true);
    reset();
    try {
      const { data } = await api.post("/sources/matrix/compare", form, { timeout: SCAN_TIMEOUT });
      setResult(data);
      const next = {};
      data.new.forEach((row) => {
        const s = row.suggestion;
        next[row.key] = {
          selected: Boolean(row.url),
          connector: s.connector,
          detection: s.detection,
          access_level: s.access_level,
          enable_ingest: s.enable_ingest,
          follow_keywords_text: (s.follow_keywords || []).join(", "),
          search_terms: s.search_terms || [],
          entry_urls: s.entry_urls || [],
          frequency: s.frequency,
          rationale: s.rationale,
          origin: s.origin,
        };
      });
      setChoices(next);
      const ups = {};
      data.changed.forEach((row) => {
        ups[row.key] = !row.probable;
      });
      setUpdates(ups);
    } catch (e) {
      setError(apiError(e, "No se pudo leer ni comparar la matriz"));
    } finally {
      setComparing(false);
    }
  };

  const createList = result ? result.new.filter((r) => choices[r.key]?.selected) : [];
  const updateList = result ? result.changed.filter((r) => updates[r.key]) : [];

  const applyNow = async () => {
    setApplying(true);
    try {
      const create = createList.map((row) => {
        const c = choices[row.key];
        return {
          key: row.key,
          connector: c.connector,
          detection: c.detection,
          access_level: c.access_level,
          enable_ingest: c.enable_ingest && c.connector !== "manual",
          follow_keywords: c.follow_keywords_text.split(",").map((t) => t.trim()).filter(Boolean),
          search_terms: c.search_terms,
          entry_urls: c.entry_urls,
          frequency: c.frequency,
          rationale: c.rationale,
          origin: c.origin,
        };
      });
      const { data } = await api.post(
        "/sources/matrix/apply",
        { token: result.token, create, update: updateList.map((r) => r.key), overwrite, persist },
        { timeout: 60000 }
      );
      toast?.success(`Matriz aplicada: ${data.created} fuente(s) nuevas, ${data.updated} actualizadas.`);
      if (data.skipped?.length) toast?.warning(`Omitidas: ${data.skipped.join("; ")}`);
      reset();
      onApplied?.(data);
      onClose();
    } catch (e) {
      toast?.error(apiError(e, "No se pudo aplicar la matriz"));
    } finally {
      setApplying(false);
    }
  };

  const footer = result ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
        <label className="catalog-check">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          <span>Sobrescribir lo editado en el panel</span>
        </label>
        <label className="catalog-check">
          <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
          <span>Guardar como matriz vigente</span>
        </label>
      </div>
      <div className="fb-toolbar">
        <Button variant="ghost" onClick={reset} disabled={applying}>Cargar otra</Button>
        <Button onClick={applyNow} loading={applying} disabled={!createList.length && !updateList.length}>
          Aplicar ({createList.length} nuevas, {updateList.length} actualizaciones)
        </Button>
      </div>
    </div>
  ) : (
    <div className="fb-toolbar">
      <Button variant="ghost" onClick={close} disabled={comparing}>Cancelar</Button>
      <Button onClick={compare} loading={comparing}>
        <Icon name="search" size={15} /> Comparar con el inventario
      </Button>
    </div>
  );

  return (
    <Modal open={open} onClose={close} title="Importar matriz de fuentes (Excel o Google Sheets)" width={920} footer={footer}>
      {!result && (
        <div className="matrix-import-source">
          <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>
            Use como base el Excel «FUENTES DE INFORMACION PROACTIVA EH» (hoja «MATRIZ FI EH») o la misma hoja en Google
            Sheets. El sistema la compara con las fuentes actuales, muestra qué es nuevo y qué cambió, y sugiere cómo
            detectar señales en cada fuente nueva. No se guarda nada hasta que usted aplique.
          </p>
          <div className="matrix-import-tabs" role="tablist">
            <Button size="sm" variant={mode === "file" ? "primary" : "secondary"} onClick={() => setMode("file")} aria-pressed={mode === "file"}>
              <Icon name="doc" size={14} /> Subir Excel
            </Button>
            <Button size="sm" variant={mode === "sheet" ? "primary" : "secondary"} onClick={() => setMode("sheet")} aria-pressed={mode === "sheet"}>
              <Icon name="link" size={14} /> URL de Google Sheets
            </Button>
          </div>
          {mode === "file" ? (
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" aria-label="Excel de la matriz EH" data-testid="matrix-compare-file" />
          ) : (
            <div>
              <Input
                id="matrix-sheet-url"
                label="Enlace de la hoja"
                placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
              />
              <p style={{ fontSize: 12, color: "#64748B", marginTop: -8 }}>
                La hoja debe estar compartida como «Cualquier persona con el enlace · Lector» o publicada en la web.
              </p>
            </div>
          )}
          <label className="catalog-check">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            <span>Revisar con IA la detección sugerida de las fuentes nuevas</span>
          </label>
          <label className="catalog-check">
            <input type="checkbox" checked={checkReach} onChange={(e) => setCheckReach(e.target.checked)} />
            <span>Verificar que cada sitio nuevo responda (detecta bloqueos a robots)</span>
          </label>
          {comparing && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#475569" }}>
              <Spinner /> Leyendo la matriz, comparando{checkReach ? ", verificando sitios" : ""}
              {useAi ? " y consultando a la IA" : ""}… puede tardar un minuto.
            </div>
          )}
          {error && <p className="public-submit-error" role="alert">{error}</p>}
        </div>
      )}

      {result && (
        <div data-testid="matrix-compare-result">
          <div style={{ fontSize: 13, color: "#475569" }}>
            {result.origin} · hoja «{result.sheet}» · {result.rows} filas · {result.search_terms} criterios de búsqueda
          </div>
          <div className="matrix-summary">
            <Badge tone="info">{result.summary.nuevas} nuevas</Badge>
            <Badge tone="warning">{result.summary.cambios} con cambios</Badge>
            <Badge tone="success">{result.summary.sin_cambios} sin cambios</Badge>
            <Badge tone="viewer">{result.summary.ausentes} ausentes en la matriz</Badge>
          </div>
          {result.ai_note && (
            <p style={{ fontSize: 12.5, color: "#475569", margin: 0 }}>
              <Icon name="spark" size={13} /> {result.ai_note}
            </p>
          )}

          <section className="matrix-section">
            <h4>
              Fuentes nuevas <Badge tone="info">{String(result.new.length)}</Badge>
            </h4>
            {result.new.length === 0 ? (
              <p style={{ fontSize: 13, color: "#94A3B8" }}>Todas las filas de la matriz ya están en el inventario.</p>
            ) : (
              result.new.map((row) => (
                <NewRow
                  key={row.key}
                  row={row}
                  choice={choices[row.key]}
                  connectors={connectorOptions}
                  labels={labels}
                  onChange={(patch) => setChoices((prev) => ({ ...prev, [row.key]: { ...prev[row.key], ...patch } }))}
                />
              ))
            )}
          </section>

          <section className="matrix-section">
            <h4>
              Fuentes con cambios <Badge tone="warning">{String(result.changed.length)}</Badge>
              {result.changed.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const all = result.changed.every((r) => updates[r.key]);
                    setUpdates(Object.fromEntries(result.changed.map((r) => [r.key, !all])));
                  }}
                >
                  {result.changed.every((r) => updates[r.key]) ? "Desmarcar todas" : "Marcar todas"}
                </Button>
              )}
            </h4>
            {result.changed.map((row) => (
              <ChangedRow
                key={row.key}
                row={row}
                selected={Boolean(updates[row.key])}
                onToggle={(on) => setUpdates((prev) => ({ ...prev, [row.key]: on }))}
              />
            ))}
          </section>

          {result.unchanged.length > 0 && (
            <section className="matrix-section">
              <h4>
                Sin cambios <Badge tone="success">{result.unchanged.length}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setShowSame((v) => !v)}>{showSame ? "Ocultar" : "Ver"}</Button>
              </h4>
              {showSame && <p style={{ fontSize: 12.5, color: "#475569" }}>{result.unchanged.map((r) => r.source_title).join(" · ")}</p>}
            </section>
          )}

          {result.missing.length > 0 && (
            <section className="matrix-section">
              <h4>
                En el inventario pero no en esta matriz <Badge tone="viewer">{result.missing.length}</Badge>
              </h4>
              <p style={{ fontSize: 12.5, color: "#64748B", margin: "0 0 6px" }}>
                Vinieron de una matriz anterior. No se retiran automáticamente: revíselas en el catálogo.
              </p>
              <ul style={{ fontSize: 12.5, margin: 0, paddingLeft: 18 }}>
                {result.missing.map((m) => (
                  <li key={m.source_id}>{m.title} <span style={{ color: "#94A3B8" }}>({m.matrix_ref})</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
