import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { formatDuration } from "./format";

/**
 * Estado de la vigilancia para TODA la aplicación, no solo para su pantalla.
 *
 * La corrida vive en el servidor (cola + worker): cerrar la pestaña o cambiar de
 * módulo no la detiene. Este contexto la sigue desde cualquier pantalla para que
 * el usuario la vea avanzar (barra flotante y título de la pestaña del
 * navegador) y reciba el aviso al terminar, esté donde esté.
 */
const ScanContext = createContext({ progress: null, refresh: () => Promise.resolve(null), lastFetch: null });

// Prefijo de avance en el título de la pestaña; el resto del título lo pone cada pantalla.
const TITLE_PREFIX = /^\(\d+\/\d+[^)]*\) Vigilancia · /;
const stripPrefix = (title) => (title || "").replace(TITLE_PREFIX, "");

const ACTIVE_MS = 4000;
const HIDDEN_MS = 20000; // pestaña en segundo plano: el navegador igual lo espacia
const IDLE_MS = 45000;

export function ScanProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [progress, setProgress] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const wasActive = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/ingest/progress");
      setProgress(data);
      setLastFetch(Date.now());
      return data;
    } catch {
      return null;
    }
  }, []);

  // Sondeo adaptativo: rápido mientras corre, espaciado en reposo o en segundo plano.
  useEffect(() => {
    if (!user) return undefined;
    let timer;
    let alive = true;
    // Cada arranque del ciclo tiene un número: solo el más reciente se reprograma.
    // Así volver a la pestaña mientras una consulta está en vuelo no deja dos
    // ciclos de sondeo en paralelo.
    let generation = 0;
    const loop = async () => {
      const mine = ++generation;
      clearTimeout(timer);
      const data = await refresh();
      if (!alive || mine !== generation) return;
      const ms = data?.active ? (document.hidden ? HIDDEN_MS : ACTIVE_MS) : IDLE_MS;
      timer = setTimeout(loop, ms);
    };
    loop();
    // Al volver a la pestaña se actualiza al instante, sin esperar el siguiente ciclo.
    const onVisible = () => {
      if (!document.hidden) loop();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, refresh]);

  // Aviso al terminar, en cualquier pantalla; y avance en el título de la pestaña.
  useEffect(() => {
    if (!progress) return;
    const c = progress.counts || {};
    const finished = (c.ok || 0) + (c.parcial || 0) + (c.error || 0) + (c.cancelado || 0);
    if (progress.active) {
      wasActive.current = true;
      const eta = progress.eta?.eta_seconds != null ? ` · ~${formatDuration(progress.eta.eta_seconds)}` : "";
      document.title = `(${finished}/${progress.total}${eta}) Vigilancia · ${stripPrefix(document.title)}`;
      return;
    }
    document.title = stripPrefix(document.title);
    if (wasActive.current) {
      wasActive.current = false;
      const ok = (c.ok || 0) + (c.parcial || 0);
      const msg = `Vigilancia terminada: ${ok} fuente(s) procesadas${c.error ? `, ${c.error} con error` : ""}${c.cancelado ? `, ${c.cancelado} cancelada(s)` : ""}.`;
      if (c.error) toast.warning(msg);
      else toast.success(msg);
    }
  }, [progress, toast]);

  useEffect(() => () => {
    document.title = stripPrefix(document.title);
  }, []);

  return <ScanContext.Provider value={{ progress, refresh, lastFetch }}>{children}</ScanContext.Provider>;
}

export function useScan() {
  return useContext(ScanContext);
}
