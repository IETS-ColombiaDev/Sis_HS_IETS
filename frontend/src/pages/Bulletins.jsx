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

const BULLETIN_STATUS = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pendiente de aprobacion",
  publicado: "Publicado",
};

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
        purpose={
          cycle
            ? `Fase 4 · Ciclo ${cycle.code}. Resumen ejecutivo para publicar despues de la aprobacion.`
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
          <Card key={b.id}>
            <h3 style={{ marginTop: 0 }}>{b.title}</h3>
            <Badge>{BULLETIN_STATUS[b.status] || b.status}</Badge>
            <p>
              Priorizadas: {b.body?.prioritized ?? "—"} · Publicadas: {b.body?.published ?? "—"}
            </p>
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
