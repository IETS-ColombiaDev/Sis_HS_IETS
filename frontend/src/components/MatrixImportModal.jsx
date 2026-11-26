import { useMemo, useRef, useState } from "react";
import api, { SCAN_TIMEOUT, apiError } from "../api/client";
import Modal from "./Modal";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";
import { Input } from "./Field";
import { Spinner } from "./Spinner";
import { t, tr, ts } from "../i18n";

/**
 * Importar la matriz EH desde el Excel «FUENTES DE INFORMACION PROACTIVA EH» o
 * desde una hoja de Google Sheets, compararla con el inventario y elegir qué
 * crear y qué actualizar. Para cada fuente nueva, el sistema sugiere cómo
 * detectar señales (adaptador, nivel de acceso, palabras guía); la IA revisa la
 * sugerencia de las reglas si está activa. Nada se escribe hasta «Aplicar».
 */

const ACCESS = ["A", "B", "C", "D", "E"];
const DETECTION_FALLBACK = {
  api: t("API del adaptador"),
  rss: t("Canal RSS"),
  html_recorrido: t("Rastreo HTML con recorrido de fichas"),
  pdf: t("Extracción de PDF"),
  manual: t("Curaduría humana (sin ingesta automática)"),
};
const MATCH_LABEL = { codigo: t("código de catálogo"), url: "URL", nombre: t("nombre"), dominio: t("dominio") };

function show(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (value === null || value === undefined || value === "") return "-";
  if (value === true) return t("Sí");
  if (value === false) return t("No");
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
          aria-label={t("Crear {nombre}", { nombre: row.name })}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="matrix-row-title">{row.name}</div>
          <div className="matrix-row-url">{row.url || t("Sin URL en la matriz")}</div>
          <div className="matrix-row-meta">
            {row.entity_label && <Badge>{ts(row.entity_label)}</Badge>}
            {row.country && <span>{row.country}</span>}
            {row.tech_types?.length > 0 && <span>{row.tech_types.join(" · ")}</span>}
            {row.excel_row ? <span>{t("Fila {n}", { n: row.excel_row })}</span> : null}
            {reach && (
              <Badge tone={reach.ok && reach.status < 400 ? "success" : reach.ok ? "warning" : "danger"}>
                {t("Sitio: {detalle}", { detalle: ts(reach.detail) })}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div className="matrix-suggest">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong>{t("Detección sugerida:")}</strong> {ts(labels[sug.detection]) || sug.detection}
          <Badge tone={row.suggestion.origin === "ia" ? "info" : "viewer"}>
            {row.suggestion.origin === "ia" ? t("Revisada por IA") : t("Por reglas")}
          </Badge>
        </div>
        {row.suggestion.rationale && <p style={{ margin: "4px 0 0", color: "#475569" }}>{ts(row.suggestion.rationale)}</p>}
        <div className="matrix-suggest-grid">
          <label>
            {t("Adaptador")}
            <select value={sug.connector} onChange={(e) => onChange({ connector: e.target.value })} disabled={!choice.selected}>
              {connectors.map((c) => (
                <option key={c.code} value={c.code}>{ts(c.label)}</option>
              ))}
              {!connectors.some((c) => c.code === sug.connector) && <option value={sug.connector}>{sug.connector}</option>}
            </select>
          </label>
          <label>
            {t("Nivel de acceso")}
            <select value={sug.access_level} onChange={(e) => onChange({ access_level: e.target.value })} disabled={!choice.selected}>
              {ACCESS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            {t("Palabras guía")}
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
            {t("Activar ingesta")}
          </label>
        </div>
        {sug.entry_urls?.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#64748B" }}>{t("URLs de entrada: {lista}", { lista: sug.entry_urls.join(" · ") })}</div>
        )}
      </div>
    </div>
  );
}

function ChangedRow({ row, selected, onToggle }) {
  return (
    <div className={`matrix-row${selected ? "" : " matrix-row--off"}`} data-testid={`matrix-changed-${row.key}`}>
      <div className="matrix-row-head">
        <input type="checkbox" checked={selected} onChange={(e) => onToggle(e.target.checked)} aria-label={t("Actualizar {nombre}", { nombre: row.source_title })} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="matrix-row-title">
            {row.source_title}
            {row.name !== row.source_title && <span style={{ fontWeight: 400, color: "#64748B" }}> ← {t("«{nombre}» en la matriz", { nombre: row.name })}</span>}
          </div>
          <div className="matrix-row-meta">
            <span>{t("Coincide por {criterio}", { criterio: MATCH_LABEL[row.match_reason] || row.match_reason })}</span>
            {row.probable && <Badge tone="warning">{t("Coincidencia probable: verifique")}</Badge>}
            <span>{t("{n} campo(s)", { n: row.changes.length })}</span>
            {row.conflicts > 0 && <Badge tone="danger">{t("{n} conflicto(s) con ediciones manuales", { n: row.conflicts })}</Badge>}
          </div>
          <table className="matrix-diff">
            <tbody>
              {row.changes.map((c, i) => (
                <tr key={`${c.field}-${i}`} className={c.conflict ? "matrix-conflict" : ""}>
                  <th>
                    {ts(c.label)}
                    {c.conflict && <div><Badge tone="danger">{t("Editado por el equipo")}</Badge></div>}
                  </th>
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

/** Reporte descargable de la carga (CSV para Excel): validación, nuevas, cambios, conflictos y ausentes. */
export function matrixReportCsv(result, applied = null) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const val = (v) => (Array.isArray(v) ? v.join(" | ") : v ?? "");
  const lines = [["seccion", "fila_excel", "fuente", "campo", "valor_actual", "valor_matriz", "detalle"]];
  const v = result.validation || {};
  lines.push(["resumen", "", "", "filas", "", v.rows ?? result.rows, ""]);
  lines.push(["resumen", "", "", "fuentes", "", v.sources ?? "", t("Una fila puede dar varias fuentes del catálogo y dos filas pueden ser la misma fuente")]);
  lines.push(["resumen", "", "", "url", "", v.urls ?? "", ""]);
  (v.issues || []).forEach((i) => lines.push(["inconsistencia", i.excel_row, i.name, i.kind, "", "", ts(i.detail)]));
  (result.new || []).forEach((r) => lines.push(["nueva", r.excel_row, r.name, "url", "", r.url, ""]));
  (result.changed || []).forEach((r) =>
    r.changes.forEach((c) =>
      lines.push([
        c.conflict ? "conflicto" : "cambio",
        r.excel_row,
        r.source_title,
        ts(c.label),
        val(c.current),
        val(c.incoming),
        c.conflict ? t("Campo editado por el equipo: no se pisa salvo que se marque sobrescribir") : "",
      ])
    )
  );
  (result.missing || []).forEach((m) => lines.push(["ausente_en_matriz", "", m.title, "", "", "", m.matrix_ref]));
  if (applied) {
    lines.push(["aplicado", "", "", "creadas", "", applied.created, (applied.created_titles || []).join(" | ")]);
    lines.push(["aplicado", "", "", "actualizadas", "", applied.updated, (applied.updated_titles || []).join(" | ")]);
    (applied.skipped || []).forEach((sk) => lines.push(["omitida", "", "", "", "", "", ts(sk)]));
  }
  return "﻿" + lines.map((l) => l.map(esc).join(";")).join("\r\n");
}

function saveCsv(text, name) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        setError(t("Elija el Excel de la matriz EH (.xlsx)."));
        return;
      }
      form.append("file", file);
    } else {
      if (!/^https:\/\/docs\.google\.com\/spreadsheets\//i.test(sheetUrl.trim())) {
        setError(t("Pegue el enlace de la hoja: https://docs.google.com/spreadsheets/d/…"));
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
      setError(apiError(e, t("No se pudo leer ni comparar la matriz")));
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
          follow_keywords: c.follow_keywords_text.split(",").map((kw) => kw.trim()).filter(Boolean),
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
      toast?.success(t("Matriz aplicada: {created} fuente(s) nuevas, {updated} actualizadas. Se descargó el reporte.", { created: data.created, updated: data.updated }));
      saveCsv(matrixReportCsv(result, data), `reporte_carga_matriz_${new Date().toISOString().slice(0, 10)}.csv`);
      if (data.skipped?.length) toast?.warning(t("Omitidas: {lista}", { lista: data.skipped.map((sk) => ts(sk)).join("; ") }));
      reset();
      onApplied?.(data);
      onClose();
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo aplicar la matriz")));
    } finally {
      setApplying(false);
    }
  };

  const footer = result ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
        <label className="catalog-check">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          <span>{t("Sobrescribir lo editado en el panel")}</span>
        </label>
        <label className="catalog-check">
          <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
          <span>{t("Guardar como matriz vigente")}</span>
        </label>
      </div>
      <div className="fb-toolbar">
        <Button variant="ghost" onClick={reset} disabled={applying}>{t("Cargar otra")}</Button>
        <Button variant="secondary" onClick={() => saveCsv(matrixReportCsv(result), "vista_previa_matriz.csv")} disabled={applying} data-testid="matrix-report-download">
          <Icon name="doc" size={14} /> {t("Descargar reporte")}
        </Button>
        <Button onClick={applyNow} loading={applying} disabled={!createList.length && !updateList.length}>
          {t("Aplicar ({nuevas} nuevas, {actualizaciones} actualizaciones)", { nuevas: createList.length, actualizaciones: updateList.length })}
        </Button>
      </div>
    </div>
  ) : (
    <div className="fb-toolbar">
      <Button variant="ghost" onClick={close} disabled={comparing}>{t("Cancelar")}</Button>
      <Button onClick={compare} loading={comparing}>
        <Icon name="search" size={15} /> {t("Comparar con el inventario")}
      </Button>
    </div>
  );

  return (
    <Modal open={open} onClose={close} title={t("Cargar matriz de fuentes (MATRIZ_FUENTES_ESCANEO_EH, Excel o Google Sheets)")} width={920} footer={footer}>
      {!result && (
        <div className="matrix-import-source">
          <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>
            {t("Use como base el Excel «FUENTES DE INFORMACION PROACTIVA EH» (hoja «MATRIZ FI EH») o la misma hoja en Google Sheets. El sistema la compara con las fuentes actuales, muestra qué es nuevo y qué cambió, y sugiere cómo detectar señales en cada fuente nueva. No se guarda nada hasta que usted aplique.")}
          </p>
          <div className="matrix-import-tabs" role="tablist">
            <Button size="sm" variant={mode === "file" ? "primary" : "secondary"} onClick={() => setMode("file")} aria-pressed={mode === "file"}>
              <Icon name="doc" size={14} /> {t("Subir Excel")}
            </Button>
            <Button size="sm" variant={mode === "sheet" ? "primary" : "secondary"} onClick={() => setMode("sheet")} aria-pressed={mode === "sheet"}>
              <Icon name="link" size={14} /> {t("URL de Google Sheets")}
            </Button>
          </div>
          {mode === "file" ? (
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" aria-label={t("Excel de la matriz EH")} data-testid="matrix-compare-file" />
          ) : (
            <div>
              <Input
                id="matrix-sheet-url"
                label={t("Enlace de la hoja")}
                placeholder="https://docs.google.com/spreadsheets/d/…/edit"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
              />
              <p style={{ fontSize: 12, color: "#64748B", marginTop: -8 }}>
                {t("La hoja debe estar compartida como «Cualquier persona con el enlace · Lector» o publicada en la web.")}
              </p>
            </div>
          )}
          <label className="catalog-check">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            <span>{t("Revisar con IA la detección sugerida de las fuentes nuevas")}</span>
          </label>
          <label className="catalog-check">
            <input type="checkbox" checked={checkReach} onChange={(e) => setCheckReach(e.target.checked)} />
            <span>{t("Verificar que cada sitio nuevo responda (detecta bloqueos a robots)")}</span>
          </label>
          {comparing && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#475569" }}>
              <Spinner />{" "}
              {checkReach && useAi
                ? t("Leyendo la matriz, comparando, verificando sitios y consultando a la IA… puede tardar un minuto.")
                : checkReach
                  ? t("Leyendo la matriz, comparando, verificando sitios… puede tardar un minuto.")
                  : useAi
                    ? t("Leyendo la matriz, comparando y consultando a la IA… puede tardar un minuto.")
                    : t("Leyendo la matriz, comparando… puede tardar un minuto.")}
            </div>
          )}
          {error && <p className="public-submit-error" role="alert">{error}</p>}
        </div>
      )}

      {result && (
        <div data-testid="matrix-compare-result">
          <div style={{ fontSize: 13, color: "#475569" }}>
            {t("{origen} · hoja «{hoja}» · {rows} filas · {n} criterios de búsqueda", { origen: ts(result.origin), hoja: result.sheet, rows: result.rows, n: result.search_terms })}
          </div>
          <div className="matrix-summary">
            <Badge tone="info">{t("{n} nuevas", { n: result.summary.nuevas })}</Badge>
            <Badge tone="warning">{t("{n} con cambios", { n: result.summary.cambios })}</Badge>
            <Badge tone="success">{t("{n} sin cambios", { n: result.summary.sin_cambios })}</Badge>
            <Badge tone="viewer">{t("{n} ausentes en la matriz", { n: result.summary.ausentes })}</Badge>
            {result.summary.conflictos > 0 && <Badge tone="danger">{t("{n} conflicto(s) con ediciones del equipo", { n: result.summary.conflictos })}</Badge>}
          </div>
          {result.validation && (
            <section className="matrix-section" data-testid="matrix-validation">
              <h4>{t("Validación de la matriz")}</h4>
              {result.validation.format === "enlaces" ? (
                <p style={{ fontSize: 13, margin: "0 0 6px" }} data-testid="matrix-validation-links">
                  {tr(
                    "Formato por enlace: <b>{rows}</b> filas de <b>{organizaciones}</b> organizaciones · <b>{fuentes}</b> fuentes (una por URL distinta) · <b>{activas}</b> de consulta activa y <b>{generales}</b> de información general o metodológica, que quedan como referencia sin ingesta.",
                    {
                      rows: result.validation.rows,
                      organizaciones: result.validation.organizations,
                      fuentes: result.validation.sources,
                      activas: result.validation.active_links,
                      generales: result.validation.general_links,
                    },
                    { b: (c) => <strong>{c}</strong> }
                  )}
                </p>
              ) : (
              <p style={{ fontSize: 13, margin: "0 0 6px" }}>
                {tr(
                  "<b>{rows}</b> filas · <b>{fuentes}</b> fuentes · <b>{urls}</b> URL de consulta.",
                  { rows: result.validation.rows, fuentes: result.validation.sources, urls: result.validation.urls },
                  { b: (c) => <strong>{c}</strong> }
                )}
                {result.validation.sources !== result.validation.rows && (
                  <span style={{ color: "#64748B" }}>
                    {" "}
                    {t(
                      "Hay más fuentes que filas porque {n} fila(s) corresponden a varios servicios con código propio en el catálogo (por ejemplo FDA, EMA o Health Canada), y algunas fuentes aparecen en dos filas.",
                      { n: result.validation.rows_with_several_sources?.length || 0 }
                    )}
                  </span>
                )}
              </p>
              )}
              {(result.validation.issues || []).length === 0 ? (
                <p style={{ fontSize: 13, color: "#047857", margin: 0 }}>{t("Sin inconsistencias de cantidad ni URL repetidas.")}</p>
              ) : (
                <ul style={{ fontSize: 13, margin: 0, paddingLeft: 18 }} data-testid="matrix-issues">
                  {result.validation.issues.map((i, idx) => (
                    <li key={idx}>
                      <strong>{t("Fila {n} ({nombre}):", { n: i.excel_row, nombre: i.name })}</strong> {ts(i.detail)}
                    </li>
                  ))}
                </ul>
              )}
              <p style={{ fontSize: 12, color: "#64748B", margin: "6px 0 0" }}>
                {t("Las inconsistencias se informan y no se corrigen solas: ajústelas en la matriz y vuelva a cargarla.")}
              </p>
            </section>
          )}
          {result.ai_note && (
            <p style={{ fontSize: 12.5, color: "#475569", margin: 0 }}>
              <Icon name="spark" size={13} /> {ts(result.ai_note)}
            </p>
          )}

          <section className="matrix-section">
            <h4>
              {t("Fuentes nuevas")} <Badge tone="info">{String(result.new.length)}</Badge>
            </h4>
            {result.new.length === 0 ? (
              <p style={{ fontSize: 13, color: "#94A3B8" }}>{t("Todas las filas de la matriz ya están en el inventario.")}</p>
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
              {t("Fuentes con cambios")} <Badge tone="warning">{String(result.changed.length)}</Badge>
              {result.changed.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const all = result.changed.every((r) => updates[r.key]);
                    setUpdates(Object.fromEntries(result.changed.map((r) => [r.key, !all])));
                  }}
                >
                  {result.changed.every((r) => updates[r.key]) ? t("Desmarcar todas") : t("Marcar todas")}
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
                {t("Sin cambios")} <Badge tone="success">{result.unchanged.length}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setShowSame((v) => !v)}>{showSame ? t("Ocultar") : t("Ver")}</Button>
              </h4>
              {showSame && <p style={{ fontSize: 12.5, color: "#475569" }}>{result.unchanged.map((r) => r.source_title).join(" · ")}</p>}
            </section>
          )}

          {(result.legacy || []).length > 0 && (
            <section className="matrix-section" data-testid="matrix-legacy">
              <h4>
                {t("Inventario anterior que pasa a legacy")} <Badge tone="viewer">{result.legacy.length}</Badge>
              </h4>
              <p style={{ fontSize: 12.5, color: "#64748B", margin: "0 0 6px" }}>
                {t("Con el formato por enlace, la matriz es el inventario completo: al aplicar, estas fuentes se retiran (no se borran) y sus señales pendientes pasan a la pestaña (Legacy) de la Bandeja de entrada, desde donde se pueden recuperar.")}
              </p>
              <ul style={{ fontSize: 12.5, margin: 0, paddingLeft: 18, maxHeight: 160, overflow: "auto" }}>
                {result.legacy.map((m) => (
                  <li key={m.source_id}>{m.title} <span style={{ color: "#94A3B8" }}>({m.matrix_ref})</span></li>
                ))}
              </ul>
            </section>
          )}

          {result.missing.length > 0 && (
            <section className="matrix-section">
              <h4>
                {t("En el inventario pero no en esta matriz")} <Badge tone="viewer">{result.missing.length}</Badge>
              </h4>
              <p style={{ fontSize: 12.5, color: "#64748B", margin: "0 0 6px" }}>
                {t("Vinieron de una matriz anterior. No se retiran automáticamente: revíselas en el catálogo.")}
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
