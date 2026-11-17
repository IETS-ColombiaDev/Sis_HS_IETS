import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { downloadFromApi } from "../utils/download";
import { Card } from "./Card";
import Button from "./Button";
import HintButton from "./HintButton";
import Icon from "./Icon";
import "./signal-origin.css";

/**
 * Reporte por fuente del tipo de enlace de las señales (RF-001): cuántas tienen
 * enlace exacto, cuántas solo la página de consulta (con evidencia de captura)
 * y cuántos enlaces no responden.
 */
export default function LinkReport({ canWrite, toast }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/findings/links/report");
      setData(d);
      return d;
    } catch (e) {
      toast?.error(apiError(e, "No se pudo leer el reporte de enlaces"));
      return null;
    }
  }, [toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Mientras se verifican los enlaces, el avance se refresca solo.
  useEffect(() => {
    if (!open || !data?.check?.running) return undefined;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [open, data, load]);

  const classify = async () => {
    setBusy("classify");
    try {
      const { data: d } = await api.post("/findings/links/classify");
      toast?.success(`Señales clasificadas: ${d.por_tipo.exacto} con enlace exacto, ${d.por_tipo.consulta} con página de consulta y evidencia, ${d.por_tipo.sin_enlace} sin enlace.`);
      load();
    } catch (e) {
      toast?.error(apiError(e, "No se pudieron clasificar las señales"));
    } finally {
      setBusy("");
    }
  };

  const check = async () => {
    setBusy("check");
    try {
      await api.post("/findings/links/check");
      toast?.info?.("Verificación de enlaces en curso. Puede seguir trabajando.");
      load();
    } catch (e) {
      toast?.error(apiError(e, "No se pudo iniciar la verificación"));
    } finally {
      setBusy("");
    }
  };

  const download = async () => {
    try {
      await downloadFromApi(api, "/findings/links/report.csv", "enlaces_por_fuente.csv");
    } catch (e) {
      toast?.error(apiError(e, "No se pudo descargar el reporte"));
    }
  };

  const t = data?.totals || {};
  const chk = data?.check || {};
  return (
    <Card padding={16} style={{ marginBottom: 16 }} data-testid="link-report">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div>
          <strong>Enlaces a la fuente original</strong>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Qué señales abren el punto exacto y cuáles solo la página consultada (con evidencia de captura).
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
            <HintButton size="sm" variant="outline" disabled={!canWrite} disabledHint="Requiere permiso de edición de señales" hint="Clasifica de nuevo todas las señales y guarda la evidencia de captura. No cambia ninguna URL." loading={busy === "classify"} onClick={classify}>
              Clasificar señales
            </HintButton>
            <HintButton size="sm" variant="outline" disabled={!canWrite || chk.running} disabledHint={chk.running ? "Ya hay una verificación en curso" : "Requiere permiso de edición de señales"} hint="Abre cada enlace y marca los que no responden o redirigen a la portada. Tarda unos minutos." loading={busy === "check"} onClick={check}>
              Verificar enlaces
            </HintButton>
            <Button size="sm" variant="secondary" onClick={download}>
              <Icon name="doc" size={14} /> Descargar CSV
            </Button>
            {chk.running && <span style={{ fontSize: 13 }}>Verificando: {chk.done} de {chk.total}</span>}
            {!chk.running && chk.finished_at && <span style={{ fontSize: 13, color: "#64748b" }}>Última verificación: {new Date(chk.finished_at).toLocaleString("es-CO")}</span>}
          </div>
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
        </div>
      )}
    </Card>
  );
}
