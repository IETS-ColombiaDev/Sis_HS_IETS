import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";

const CycleContext = createContext(null);
const STORAGE_KEY = "iets_hs_cycle";

/**
 * Ciclo operativo seleccionado. Es el eje de la metodologia: priorizacion,
 * caracterizacion y diseminacion se leen siempre en el contexto de un ciclo.
 */
export function CycleProvider({ children }) {
  const { user } = useAuth();
  const { version } = useRealtime();
  const [cycles, setCycles] = useState([]);
  const [selectedId, setSelectedId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setCycles([]);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/cycles");
      setCycles(data);
      setSelectedId((current) => {
        if (current && data.some((c) => c.id === current)) return current;
        const open = data.find((c) => !c.is_historic && c.status !== "cerrado_consolidado");
        return open ? open.id : data.length ? data[0].id : null;
      });
    } catch {
      setCycles([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    if (selectedId) localStorage.setItem(STORAGE_KEY, String(selectedId));
    else localStorage.removeItem(STORAGE_KEY);
  }, [selectedId]);

  const cycle = useMemo(
    () => cycles.find((c) => c.id === selectedId) || null,
    [cycles, selectedId]
  );

  const value = {
    cycles,
    cycle,
    cycleId: selectedId,
    setCycleId: setSelectedId,
    loading,
    reload: load,
    isClosed: cycle ? cycle.status === "cerrado_consolidado" : false,
    isHistoric: cycle ? cycle.is_historic : false,
    hasCycle: Boolean(cycle),
    openCycles: cycles.filter((c) => !c.is_historic && c.status !== "cerrado_consolidado"),
  };

  return <CycleContext.Provider value={value}>{children}</CycleContext.Provider>;
}

export function useCycle() {
  const ctx = useContext(CycleContext);
  if (!ctx) throw new Error("useCycle debe usarse dentro de CycleProvider");
  return ctx;
}
