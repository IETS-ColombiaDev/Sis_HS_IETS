import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useToast } from "../components/Toast";
import { Card } from "../components/Card";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";
import ModuleHeader from "../components/ModuleHeader";

export default function Alerts() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [subs, setSubs] = useState([]);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([api.get("/alerts"), api.get("/alerts/subscriptions")]);
      setItems(a.data);
      setSubs(s.data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las alertas"));
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const subscribeAll = async () => {
    try {
      await api.post("/alerts/subscriptions", { cluster_id: null, enabled: true });
      toast.success("Suscrito a todas las alertas del ciclo");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo suscribir"));
    }
  };

  const mark = async (id) => {
    await api.post(`/alerts/${id}/read`);
    load();
  };

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title="Alertas tempranas"
        purpose="Avisos operativos: nuevos ensayos fase III en el pais y cambios de fase en tecnologias de alto impacto presupuestal. El envio por correo queda pendiente."
        actions={<Button onClick={subscribeAll}>Suscribirme</Button>}
      />
      {subs.length > 0 && <p className="eval-complete">{subs.length} suscripcion(es) activas.</p>}
      {items.length === 0 ? (
        <EmptyState
          title="Sin alertas"
          description="Cuando se dispare una regla, aparecera aqui. El aviso llega en esta bandeja."
        />
      ) : (
        items.map((a) => (
          <Card key={a.id}>
            <strong>{a.title}</strong>
            <p>{a.body}</p>
            {!a.read_at && (
              <Button size="sm" variant="secondary" onClick={() => mark(a.id)}>
                Marcar leida
              </Button>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
