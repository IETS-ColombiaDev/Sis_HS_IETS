/** Formatos de tiempo de la vigilancia (duraciones y hora de fin). */

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** Hora local (HH:MM) y, si no es hoy, el día. */
export function formatClock(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

/** Rango "35–52 min" a partir de los extremos de la estimación. */
export function formatRange(low, high) {
  if (low == null || high == null) return "";
  const a = formatDuration(low);
  const b = formatDuration(high);
  return a === b ? a : `${a} – ${b}`;
}

export function elapsedSince(iso) {
  if (!iso) return null;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
}
