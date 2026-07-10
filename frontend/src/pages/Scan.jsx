import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card, SectionTitle } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import HelpNote from "../components/HelpNote";
import { LoadingBlock, Spinner } from "../components/Spinner";
import EmptyState from "../components/EmptyState";

export default function Scan() {
  const { isEditor } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();

  const [sources, setSources] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api.get("/sources"), api.get("/scan/logs")]);
      setSources(s.data);
      setLogs(l.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la informacion"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const enabled = sources.filter((s) => s.scrape_enabled);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runScan = async (ids) => {
    setRunning(true);
    try {
      const { data } = await api.post("/scan/run", { source_ids: ids && ids.length ? ids : null });
      const errors = (data.logs || []).filter((l) => l.status === "error").length;
      toast.success(
        `Escaneo completado: ${data.total_new} hallazgos nuevos de ${data.total_found} detectados.`
      );
      if (errors > 0) {
        toast.info(`${errors} fuente(s) no respondieron (ver historial). El resto se proceso correctamente.`);
      }
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar el escaneo"));
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingBlock label="Cargando escaneo..." />;

  return (
    <div>
      <PageHeader
        title="Escaneo web"
        subtitle="Vigilancia automatizada de fuentes. Ejecute el escaneo de todas las fuentes vigiladas con un clic o seleccione fuentes especificas."
        actions={
          isEditor && (
            <Tooltip text={`Descarga y analiza las ${enabled.length} fuentes vigiladas, clasifica las tecnologias y guarda los hallazgos nuevos. Puede tardar 1-2 minutos.`}>
              <Button onClick={() => runScan(null)} loading={running} size="lg">
                <Icon name="radar" size={17} /> Escanear todas ({enabled.length})
              </Button>
            </Tooltip>
          )
        }
      />

      <HelpNote id="scan-intro">
        El escaneo <strong>descarga cada fuente vigilada</strong>, extrae el contenido con tecnologia Python
        (trafilatura para paginas y pypdf para documentos) y guarda solo los <strong>hallazgos nuevos</strong>.
        En el <strong>historial</strong> de la derecha cada tarjeta muestra un estado:
        {" "}<Badge tone="ok">ok</Badge> completado, {" "}<Badge tone="parcial">parcial</Badge> sin resultados,
        {" "}<Badge tone="error">error</Badge> la fuente no respondio.
      </HelpNote>

      {running && (
        <Card style={{ marginBottom: 16, borderLeft: "4px solid #6366F1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Spinner />
            <div>
              <div style={{ fontWeight: 600 }}>Escaneo en progreso...</div>
              <div style={{ fontSize: 13, color: "#64748B" }}>
                Descargando y analizando fuentes. Esto puede tardar segun el numero de fuentes.
              </div>
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }} className="dash-grid">
        <Card>
          <SectionTitle
            right={
              isEditor && selected.size > 0 ? (
                <Button size="sm" onClick={() => runScan([...selected])} loading={running}>
                  Escanear seleccionadas ({selected.size})
                </Button>
              ) : null
            }
          >
            Fuentes vigiladas
          </SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto" }}>
            {enabled.map((s) => (
              <label
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid #E2E8F0",
                  borderRadius: 8,
                  cursor: isEditor ? "pointer" : "default",
                }}
              >
                {isEditor && (
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    style={{ width: 18, height: 18 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8" }}>
                    {s.findings_count} hallazgos
                    {s.last_scraped_at && ` · ${new Date(s.last_scraped_at).toLocaleString()}`}
                  </div>
                </div>
              </label>
            ))}
            {enabled.length === 0 && (
              <EmptyState icon="🌐" message="No hay fuentes con vigilancia habilitada." />
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle>Historial de escaneos</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflowY: "auto" }}>
            {logs.length === 0 && <EmptyState icon="🕐" message="Aun no se han ejecutado escaneos." />}
            {logs.map((log) => (
              <div key={log.id} style={{ padding: "10px 12px", border: "1px solid #E2E8F0", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Badge tone={log.status}>{log.status}</Badge>
                  <span style={{ fontSize: 11, color: "#94A3B8" }}>
                    {new Date(log.started_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>
                  {log.source_title || "Escaneo general"}
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{log.message}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                  {log.items_new} nuevos / {log.items_found} detectados · por {log.triggered_by}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
