import { useEffect, useState } from "react";
import api from "../api/client";
import { SCREENING_QUEUE_THRESHOLD } from "../constants/methodology";

/**
 * Umbral vigente de «cribado alto» (parámetro screening.queue_threshold, editable
 * en Configuración). Se lee una vez por sesión; mientras llega, vale el de fábrica.
 */
let cached = null;
let pending = null;

export function useScreeningThreshold() {
  const [value, setValue] = useState(cached ?? SCREENING_QUEUE_THRESHOLD);
  useEffect(() => {
    if (cached != null) return undefined;
    let alive = true;
    pending =
      pending ||
      api
        .get("/methodology/params")
        .then(({ data }) => {
          const row = (data || []).find((p) => p.key === "screening.queue_threshold");
          const n = row ? Number(row.value) : NaN;
          cached = Number.isFinite(n) ? n : SCREENING_QUEUE_THRESHOLD;
          return cached;
        })
        .catch(() => SCREENING_QUEUE_THRESHOLD);
    pending.then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}

/** Tras guardar el parámetro en Configuración, las pantallas leen el nuevo valor. */
export function forgetScreeningThreshold() {
  cached = null;
  pending = null;
}
