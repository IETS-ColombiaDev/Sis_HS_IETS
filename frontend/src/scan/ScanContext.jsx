import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { formatDuration } from "./format";
import { t } from "../i18n";

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
const TITLE_WORD = t("Vigilancia");
const TITLE_PREFIX = new RegExp(`^\\(\\d+/\\d+[^)]*\\) ${TITLE_WORD} · `);
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
  // Máximo alcanzado en la corrida: la barra nunca retrocede (un reintento
  // devuelve una fuente al inicio, pero el avance mostrado no baja).
  const peak = useRef({ run: null, pct: 0 });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/ingest/progress");
      if (data) {
        const run = data.run_started_at || "";
        const raw = runPercent(data);
        if (peak.current.run !== run) peak.current = { run, pct: 0 };
        const pct = data.active ? Math.min(99, Math.max(peak.current.pct, raw)) : raw;
        peak.current.pct = pct;
        data.percent_display = pct;
      }
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
      const pct = Math.floor(progress.percent_display ?? 0);
      document.title = `(${finished}/${progress.total} · ${pct}%${eta}) ${TITLE_WORD} · ${stripPrefix(document.title)}`;
      return;
    }
    document.title = stripPrefix(document.title);
    if (wasActive.current) {
      wasActive.current = false;
      const ok = (c.ok || 0) + (c.parcial || 0);
      const msg = `${t("Vigilancia terminada: {n} fuente(s) procesadas", { n: ok })}${c.error ? `, ${t("{n} con error", { n: c.error })}` : ""}${c.cancelado ? `, ${t("{n} cancelada(s)", { n: c.cancelado })}` : ""}.`;
      if (c.error) toast.warning(msg);
      else toast.success(msg);
    }
  }, [progress, toast]);

  useEffect(() => () => {
    document.title = stripPrefix(document.title);
  }, []);

  return <ScanContext.Provider value={{ progress, refresh, lastFetch }}>{children}</ScanContext.Provider>;
}

/** Avance de la corrida en %, ponderado por la etapa de cada fuente (lo calcula el servidor). */
export function runPercent(progress) {
  if (!progress || !progress.total) return 0;
  if (typeof progress.percent === "number") return progress.percent;
  const c = progress.counts || {};
  const finished = (c.ok || 0) + (c.parcial || 0) + (c.error || 0) + (c.cancelado || 0);
  return progress.active ? Math.min(99, (finished / progress.total) * 100) : 100;
}

export function useScan() {
  return useContext(ScanContext);
}
