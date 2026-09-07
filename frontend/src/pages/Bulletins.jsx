import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useToast } from "../components/Toast";
import { Card } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import EmptyState from "../components/EmptyState";
import ModuleHeader from "../components/ModuleHeader";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";

const BULLETIN_STATUS = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pendiente de aprobacion",
  publicado: "Publicado",
};

function BulletinKpis({ body }) {
  const funnel = body?.funnel || {};
  const items = [
    { label: "Asignadas", value: funnel.captured ?? funnel.assigned ?? 0 },
    { label: "Filtradas", value: funnel.filtered ?? 0 },
    { label: "Priorizadas", value: funnel.prioritized ?? body?.prioritized ?? 0 },
    { label: "Publicadas", value: funnel.published ?? body?.published ?? funnel.evaluated ?? 0 },
  ];
  return (
    <div className="bulletin-kpis">
      {items.map((item) => (
        <div key={item.label} className="bulletin-kpi">
          <b>{item.value}</b>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function Bulletins() {
  const { cycleId, cycle } = useCycle();
  const { can } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const canWrite = can(PERM.CYCLE_WRITE);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/bulletins", { params: cycleId ? { cycle_id: cycleId } : {} });
      setItems(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar los boletines"));
    }
  }, [cycleId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const compile = async () => {
    try {
      await api.post(`/bulletins/compile/${cycleId}`);
      toast.success("Boletin compilado. Pendiente de aprobacion.");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo compilar"));
    }
  };

  const approve = async (id, publish) => {
    try {
      await api.post(`/bulletins/${id}/approve`, { publish });
      toast.success(publish ? "Boletin publicado" : "Boletin aprobado");
      load();
    } catch (e) {
      toast.error(apiError(e, "La decision fue rechazada"));
    }
  };

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title="Boletines del ciclo"
        titleHint={GLOSSARY.boletin}
        purpose={
          cycle
            ? `Fase 4 · ${cycle.code}. Resumen ejecutivo epidemiologico y financiero para publicar despues de la aprobacion.`
            : "Fase 4 · Resumen ejecutivo para publicar despues de la aprobacion."
        }
        actions={
          canWrite && cycleId ? (
            <Button onClick={compile}>Compilar desde el ciclo</Button>
          ) : null
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="Sin boletines"
          description="Se compilara automaticamente al cerrar el ciclo, o pulse Compilar."
        />
      ) : (
        items.map((b) => (
          <Card key={b.id} className="bulletin-card">
            <div className="bulletin-card-head">
              <div>
                <p className="iets-dossier-kicker">Boletin epidemiologico y financiero</p>
                <h3>{b.title}</h3>
                <p className="bulletin-card-meta">
                  Compilado {b.body?.compiled_on || "—"}
                  {b.approved_by ? ` · Aprobado por ${b.approved_by}` : ""}
                </p>
              </div>
              <Badge tone={b.status === "publicado" ? "ok" : "info"}>
                {BULLETIN_STATUS[b.status] || b.status}
              </Badge>
            </div>
            <BulletinKpis body={b.body} />
            {(b.body?.by_cluster || []).length > 0 && (
              <ul className="bulletin-clusters">
                {b.body.by_cluster.map((row) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="eval-actions">
              {canWrite && b.status !== "publicado" && (
                <>
                  <Button variant="secondary" onClick={() => approve(b.id, false)}>
                    Aprobar
                  </Button>
                  <Button onClick={() => approve(b.id, true)} disabled={!b.approved_by}>
                    Publicar
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                onClick={async () => {
                  const { data } = await api.get(`/bulletins/${b.id}/export`, { responseType: "blob" });
                  window.open(URL.createObjectURL(data), "_blank", "noopener");
                }}
              >
                Ver HTML ejecutivo
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
