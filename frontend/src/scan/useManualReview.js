import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { PERM } from "../constants/methodology";

/**
 * Fuentes de consulta manual (nivel E) por validar (Módulo 0).
 *
 * Lo usan el menú (contador junto a «Bandeja de entrada»), el aviso que aparece
 * al entrar y el panel de la Bandeja. Se refresca cuando cambia el estado del
 * sistema (otra persona validó una fuente). Solo consulta si el perfil puede
 * validar (permiso de la bandeja).
 */
export default function useManualReview() {
  const { user, can } = useAuth();
  const { version } = useRealtime();
  const allowed = Boolean(user) && can(PERM.STAGING_ASSIGN);
  const [data, setData] = useState(null);

  const reload = useCallback(async () => {
    if (!allowed) return null;
    try {
      const { data: d } = await api.get("/sources/manual-review");
      setData(d);
      return d;
    } catch {
      return null;
    }
  }, [allowed]);

  useEffect(() => {
    reload();
  }, [reload, version]);

  return { allowed, data, due: data?.due || 0, total: data?.total || 0, reload };
}
