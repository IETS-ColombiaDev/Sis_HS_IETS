import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { downloadFromApi } from "../utils/download";
import { Card } from "./Card";
import Button from "./Button";
import HintButton from "./HintButton";
import Icon from "./Icon";
import "./signal-origin.css";
import { intlLocale, t, ts } from "../i18n";

/**
 * Enlaces a la fuente original (RF-001).
 *
 * - Diagnóstico para la matriz: por fuente, si sus señales ya llevan al punto
 *   exacto o si el equipo técnico debe mejorar la URL en la matriz, y cómo.
 * - Conteo por fuente: enlace exacto, página de consulta, sin enlace, caídos.
 * - «Ubicar señales exactas» busca cada señal de página de consulta en su página:
 *   enlace propio si existe, o enlace que abre la página y resalta la señal.
 */
export default function LinkReport({ canWrite, toast }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("diagnosis");
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [data, setData] = useState(null);
  const [diag, setDiag] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const [{ data: d }, { data: g }] = await Promise.all([
        api.get("/findings/links/report"),
        api.get("/findings/links/diagnosis"),
      ]);
      setData(d);
      setDiag(g);
      return d;
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo leer el reporte de enlaces")));
      return null;
    }
  }, [toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Mientras se verifican o ubican los enlaces, el avance se refresca solo.
  const running = Boolean(data?.check?.running || diag?.resolve?.running);
  useEffect(() => {
    if (!open || !running) return undefined;
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [open, running, data, diag, load]);

  const run = async (key, call, ok) => {
    setBusy(key);
    try {
      const result = await call();
      if (ok) ok(result);
      load();
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo completar la acción")));
    } finally {
      setBusy("");
    }
  };

  const classify = () =>
    run("classify", () => api.post("/findings/links/classify"), ({ data: d }) =>
      toast?.success(
        t("Señales clasificadas: {exact} con enlace exacto, {query} con página de consulta y evidencia, {none} sin enlace.", {
          exact: d.por_tipo.exacto,
          query: d.por_tipo.consulta,
          none: d.por_tipo.sin_enlace,
        })
      )
    );
  const check = () =>
    run("check", () => api.post("/findings/links/check"), () => toast?.info?.(t("Verificación de enlaces en curso. Puede seguir trabajando.")));
  const resolve = () =>
    run("resolve", () => api.post("/findings/links/resolve"), () =>
      toast?.info?.(t("Buscando cada señal en su página. Puede seguir trabajando; el avance se ve aquí."))
    );

  const download = async (path, name) => {
    try {
      await downloadFromApi(api, path, name);
    } catch (e) {
      toast?.error(apiError(e, t("No se pudo descargar el archivo")));
    }
  };

  const totals = data?.totals || {};
  const chk = data?.check || {};
  const res = diag?.resolve || {};
  const rows = (diag?.sources || []).filter((r) => !onlyChanges || r.matrix_change);
  return (
    <Card padding={16} style={{ marginBottom: 16 }} data-testid="link-report">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <strong>{t("Enlaces a la fuente original")}</strong>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {t("Qué señales abren el punto exacto, cuáles abren la página resaltando la señal y qué fuentes conviene corregir en la matriz.")}
          </div>
        </div>
        <div className="fb-toolbar">
          {/* Siempre a la vista: antes quedaba dentro del reporte plegado y no se encontraba. */}
          <HintButton
            size="sm"
            disabled={!canWrite || res.running}
            disabledHint={res.running ? t("Ya se están ubicando las señales") : t("Requiere permiso de edición de señales")}
            hint={t("Busca cada señal de página de consulta en su página: si la página la enlaza, guarda el enlace exacto; si la fuente no tiene enlace por ítem, arma un enlace que abre la página y resalta la señal. La URL anterior queda en la evidencia. Al terminar, el botón «Abrir la página y resaltar la señal» aparece en el detalle de cada señal ubicada.")}
            loading={busy === "resolve"}
            onClick={() => {
              setOpen(true);
              resolve();
            }}
            data-testid="link-resolve"
          >
            <Icon name="search" size={14} /> {t("Ubicar señales exactas")}
          </HintButton>
          <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} data-testid="link-report-toggle">
            <Icon name="link" size={14} /> {open ? t("Ocultar reporte") : t("Reporte de enlaces")}
          </Button>
        </div>
      </div>
      {open && data && (
        <div style={{ marginTop: 12 }}>
          <div className="fb-toolbar" style={{ marginBottom: 10 }}>
            <span className="sl-badge sl-badge--ok">{t("Enlace exacto: {n}", { n: totals.exacto || 0 })}</span>
            <span className="sl-badge sl-badge--warn">{t("Página de consulta: {n}", { n: totals.consulta || 0 })}</span>
            <span className="sl-badge sl-badge--bad">{t("Sin enlace: {n}", { n: totals.sin_enlace || 0 })}</span>
            <span className="sl-badge sl-badge--bad">{t("No responden: {n}", { n: totals.caido || 0 })}</span>
            <span className="sl-badge">{t("Con evidencia: {n} de {total}", { n: totals.con_evidencia || 0, total: totals.total || 0 })}</span>
            {totals.sin_clasificar ? <span className="sl-badge sl-badge--warn">{t("Sin clasificar: {n}", { n: totals.sin_clasificar })}</span> : null}
          </div>
          <div className="fb-toolbar" style={{ marginBottom: 10 }}>
            <HintButton size="sm" variant="outline" disabled={!canWrite} disabledHint={t("Requiere permiso de edición de señales")} hint={t("Clasifica de nuevo todas las señales y guarda la evidencia de captura. No cambia ninguna URL.")} loading={busy === "classify"} onClick={classify}>
              {t("Clasificar señales")}
            </HintButton>
            <HintButton size="sm" variant="outline" disabled={!canWrite || chk.running} disabledHint={chk.running ? t("Ya hay una verificación en curso") : t("Requiere permiso de edición de señales")} hint={t("Abre cada enlace y marca los que no responden o redirigen a la portada. Tarda unos minutos.")} loading={busy === "check"} onClick={check}>
              {t("Verificar enlaces")}
            </HintButton>
            <Button size="sm" variant="secondary" onClick={() => download("/findings/links/diagnosis.xlsx", "diagnostico_enlaces_matriz.xlsx")} data-testid="link-diagnosis-xlsx">
              <Icon name="doc" size={14} /> {t("Diagnóstico en Excel")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => download("/findings/links/report.csv", "enlaces_por_fuente.csv")}>
              CSV
            </Button>
          </div>
          {(res.running || res.finished_at) && (
            <div style={{ fontSize: 13, marginBottom: 8 }} data-testid="link-resolve-state">
              {res.running ? (
                <>{t("Ubicando señales: {done} de {total} ({pages} página(s))…", { done: res.done, total: res.total, pages: res.pages })}</>
              ) : (
                <span style={{ color: "#64748b" }}>
                  {t("Última ubicación ({date}): {exact} con enlace exacto nuevo, {highlighted} abren la página resaltando la señal, {unlocated} sin ubicar.", {
                    date: new Date(res.finished_at).toLocaleString(intlLocale()),
                    exact: res.counts?.enlace_en_pagina || 0,
                    highlighted: res.counts?.resaltado || 0,
                    unlocated: res.counts?.sin_ubicar || 0,
                  })}
                </span>
              )}
            </div>
          )}
          {chk.running && <div style={{ fontSize: 13, marginBottom: 8 }}>{t("Verificando enlaces: {done} de {total}", { done: chk.done, total: chk.total })}</div>}

          <div className="fb-toolbar" role="tablist" style={{ marginBottom: 8 }}>
            <Button size="sm" variant={tab === "diagnosis" ? "primary" : "ghost"} onClick={() => setTab("diagnosis")} role="tab" aria-selected={tab === "diagnosis"}>
              {diag ? t("Diagnóstico para la matriz ({n} por mejorar)", { n: diag.matrix_changes }) : t("Diagnóstico para la matriz")}
            </Button>
            <Button size="sm" variant={tab === "counts" ? "primary" : "ghost"} onClick={() => setTab("counts")} role="tab" aria-selected={tab === "counts"}>
              {t("Conteo por fuente")}
            </Button>
          </div>

          {tab === "diagnosis" && diag && (
            <>
              <label style={{ fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
                {t("Solo las fuentes en las que hay que mejorar la matriz")}
              </label>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="link-diagnosis-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>{t("Fuente")}</th>
                      <th style={{ textAlign: "left" }}>{t("Diagnóstico##enlaces")}</th>
                      <th style={{ textAlign: "left" }}>{t("Qué hacer")}</th>
                      <th>{t("Señales")}</th>
                      <th>{t("Exacto")}</th>
                      <th>{t("Resalta")}</th>
                      <th>{t("Sin ubicar")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.source_id}>
                        <td>
                          <div>{r.source_title}</div>
                          {r.url && (
                            <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                              {r.url}
                            </a>
                          )}
                        </td>
                        <td>
                          <span className={`sl-badge sl-badge--${r.matrix_change ? "bad" : r.code === "ok" || r.code === "sin_enlace_por_item" ? "ok" : "warn"}`}>
                            {r.matrix_change ? t("Mejorar la matriz: {label}", { label: ts(r.label) }) : ts(r.label)}
                          </span>
                        </td>
                        <td style={{ maxWidth: 420 }}>{ts(r.advice)}</td>
                        <td style={{ textAlign: "right" }}>{r.total}</td>
                        <td style={{ textAlign: "right" }}>{r.exacto}</td>
                        <td style={{ textAlign: "right" }}>{r.resaltado}</td>
                        <td style={{ textAlign: "right" }}>{r.sin_ubicar}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ color: "#64748b" }}>
                          {onlyChanges ? t("Ninguna fuente requiere cambios en la matriz.") : t("Sin fuentes.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "counts" && (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>{t("Fuente")}</th>
                    <th>{t("Señales")}</th>
                    <th>{t("Exacto")}</th>
                    <th>{t("Consulta")}</th>
                    <th>{t("Sin enlace")}</th>
                    <th>{t("No responden")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.sources || []).map((r) => (
                    <tr key={r.source_id}>
                      <td>{r.source_title}</td>
                      <td style={{ textAlign: "right" }}>{r.total}</td>
                      <td style={{ textAlign: "right" }}>{r.exacto}</td>
                      <td style={{ textAlign: "right" }}>{r.consulta}</td>
                      <td style={{ textAlign: "right" }}>{r.sin_enlace}</td>
                      <td style={{ textAlign: "right" }}>{r.caido + r.redirigido}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
