import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { downloadFromApi } from "../utils/download";
import { Card } from "./Card";
import Button from "./Button";
import HintButton from "./HintButton";
import Icon from "./Icon";
import "./signal-origin.css";

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
      toast?.error(apiError(e, "No se pudo leer el reporte de enlaces"));
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
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [open, running, data, diag, load]);

  const run = async (key, call, ok) => {
    setBusy(key);
    try {
      const result = await call();
      if (ok) ok(result);
      load();
    } catch (e) {
      toast?.error(apiError(e, "No se pudo completar la acción"));
    } finally {
      setBusy("");
    }
  };

  const classify = () =>
    run("classify", () => api.post("/findings/links/classify"), ({ data: d }) =>
      toast?.success(
        `Señales clasificadas: ${d.por_tipo.exacto} con enlace exacto, ${d.por_tipo.consulta} con página de consulta y evidencia, ${d.por_tipo.sin_enlace} sin enlace.`
      )
    );
  const check = () =>
    run("check", () => api.post("/findings/links/check"), () => toast?.info?.("Verificación de enlaces en curso. Puede seguir trabajando."));
  const resolve = () =>
    run("resolve", () => api.post("/findings/links/resolve"), () =>
      toast?.info?.("Buscando cada señal en su página. Puede seguir trabajando; el avance se ve aquí.")
    );

  const download = async (path, name) => {
    try {
      await downloadFromApi(api, path, name);
    } catch (e) {
      toast?.error(apiError(e, "No se pudo descargar el archivo"));
    }
  };

  const t = data?.totals || {};
  const chk = data?.check || {};
  const res = diag?.resolve || {};
  const rows = (diag?.sources || []).filter((r) => !onlyChanges || r.matrix_change);
  return (
    <Card padding={16} style={{ marginBottom: 16 }} data-testid="link-report">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <strong>Enlaces a la fuente original</strong>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Qué señales abren el punto exacto, cuáles abren la página resaltando la señal y qué fuentes conviene corregir en la
            matriz.
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} data-testid="link-report-toggle">
          <Icon name="link" size={14} /> {open ? "Ocultar reporte" : "Reporte de enlaces"}
        </Button>
      </div>
      {open && data && (
        <div style={{ marginTop: 12 }}>
          <div className="fb-toolbar" style={{ marginBottom: 10 }}>
            <span className="sl-badge sl-badge--ok">Enlace exacto: {t.exacto || 0}</span>
            <span className="sl-badge sl-badge--warn">Página de consulta: {t.consulta || 0}</span>
            <span className="sl-badge sl-badge--bad">Sin enlace: {t.sin_enlace || 0}</span>
            <span className="sl-badge sl-badge--bad">No responden: {t.caido || 0}</span>
            <span className="sl-badge">Con evidencia: {t.con_evidencia || 0} de {t.total || 0}</span>
            {t.sin_clasificar ? <span className="sl-badge sl-badge--warn">Sin clasificar: {t.sin_clasificar}</span> : null}
          </div>
          <div className="fb-toolbar" style={{ marginBottom: 10 }}>
            <HintButton
              size="sm"
              disabled={!canWrite || res.running}
              disabledHint={res.running ? "Ya se están ubicando las señales" : "Requiere permiso de edición de señales"}
              hint="Busca cada señal de página de consulta en su página: si la página la enlaza, guarda el enlace exacto; si la fuente no tiene enlace por ítem, arma un enlace que abre la página y resalta la señal. La URL anterior queda en la evidencia."
              loading={busy === "resolve"}
              onClick={resolve}
              data-testid="link-resolve"
            >
              <Icon name="search" size={14} /> Ubicar señales exactas
            </HintButton>
            <HintButton size="sm" variant="outline" disabled={!canWrite} disabledHint="Requiere permiso de edición de señales" hint="Clasifica de nuevo todas las señales y guarda la evidencia de captura. No cambia ninguna URL." loading={busy === "classify"} onClick={classify}>
              Clasificar señales
            </HintButton>
            <HintButton size="sm" variant="outline" disabled={!canWrite || chk.running} disabledHint={chk.running ? "Ya hay una verificación en curso" : "Requiere permiso de edición de señales"} hint="Abre cada enlace y marca los que no responden o redirigen a la portada. Tarda unos minutos." loading={busy === "check"} onClick={check}>
              Verificar enlaces
            </HintButton>
            <Button size="sm" variant="secondary" onClick={() => download("/findings/links/diagnosis.xlsx", "diagnostico_enlaces_matriz.xlsx")} data-testid="link-diagnosis-xlsx">
              <Icon name="doc" size={14} /> Diagnóstico en Excel
            </Button>
            <Button size="sm" variant="ghost" onClick={() => download("/findings/links/report.csv", "enlaces_por_fuente.csv")}>
              CSV
            </Button>
          </div>
          {(res.running || res.finished_at) && (
            <div style={{ fontSize: 13, marginBottom: 8 }} data-testid="link-resolve-state">
              {res.running ? (
                <>Ubicando señales: {res.done} de {res.total} ({res.pages} página(s))…</>
              ) : (
                <span style={{ color: "#64748b" }}>
                  Última ubicación ({new Date(res.finished_at).toLocaleString("es-CO")}): {res.counts?.enlace_en_pagina || 0} con
                  enlace exacto nuevo, {res.counts?.resaltado || 0} abren la página resaltando la señal, {res.counts?.sin_ubicar || 0} sin
                  ubicar.
                </span>
              )}
            </div>
          )}
          {chk.running && <div style={{ fontSize: 13, marginBottom: 8 }}>Verificando enlaces: {chk.done} de {chk.total}</div>}

          <div className="fb-toolbar" role="tablist" style={{ marginBottom: 8 }}>
            <Button size="sm" variant={tab === "diagnosis" ? "primary" : "ghost"} onClick={() => setTab("diagnosis")} role="tab" aria-selected={tab === "diagnosis"}>
              Diagnóstico para la matriz{diag ? ` (${diag.matrix_changes} por mejorar)` : ""}
            </Button>
            <Button size="sm" variant={tab === "counts" ? "primary" : "ghost"} onClick={() => setTab("counts")} role="tab" aria-selected={tab === "counts"}>
              Conteo por fuente
            </Button>
          </div>

          {tab === "diagnosis" && diag && (
            <>
              <label style={{ fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
                Solo las fuentes en las que hay que mejorar la matriz
              </label>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", fontSize: 13 }} data-testid="link-diagnosis-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Fuente</th>
                      <th style={{ textAlign: "left" }}>Diagnóstico</th>
                      <th style={{ textAlign: "left" }}>Qué hacer</th>
                      <th>Señales</th>
                      <th>Exacto</th>
                      <th>Resalta</th>
                      <th>Sin ubicar</th>
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
                            {r.matrix_change ? "Mejorar la matriz: " : ""}
                            {r.label}
                          </span>
                        </td>
                        <td style={{ maxWidth: 420 }}>{r.advice}</td>
                        <td style={{ textAlign: "right" }}>{r.total}</td>
                        <td style={{ textAlign: "right" }}>{r.exacto}</td>
                        <td style={{ textAlign: "right" }}>{r.resaltado}</td>
                        <td style={{ textAlign: "right" }}>{r.sin_ubicar}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ color: "#64748b" }}>
                          {onlyChanges ? "Ninguna fuente requiere cambios en la matriz." : "Sin fuentes."}
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
                    <th style={{ textAlign: "left" }}>Fuente</th>
                    <th>Señales</th>
                    <th>Exacto</th>
                    <th>Consulta</th>
                    <th>Sin enlace</th>
                    <th>No responden</th>
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
