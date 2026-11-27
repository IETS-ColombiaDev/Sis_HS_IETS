// Textos que escribe el servidor sobre los ciclos: recorrido y validaciones
// (backend/app/cycle_service.py y routers/cycles.py).

const FIELD = { "código": "code", apertura: "opening", "corte de datos": "data cutoff", "boletín": "bulletin", notas: "notes" };

export default {
  "Ciclo creado": "Cycle created",
  "Datos editados": "Details edited",
  "Avanzó de etapa": "Moved to the next stage",
  "Devuelto a una etapa anterior": "Returned to an earlier stage",
  "Cerrado y consolidado": "Closed and consolidated",
  "Recibió tecnologías bajo vigilancia": "Received technologies under surveillance",
  "Arrastró tecnologías bajo vigilancia": "Carried over technologies under surveillance",
  "Registre el motivo para devolver el ciclo a una etapa anterior.": "Enter the reason for returning the cycle to an earlier stage.",
};

export const patterns = [
  {
    re: /^Apertura (\S+) · corte (\S+)(?: · boletín (\S+))?$/,
    en: (m) => `Opening ${m[1]} · cutoff ${m[2]}${m[3] ? ` · bulletin ${m[3]}` : ""}`,
  },
  {
    re: /^Cambió: (.+)$/,
    en: (m) =>
      `Changed: ${m[1]
        .split(", ")
        .map((part) => {
          const hit = /^(.+?)( \(.*\))?$/.exec(part);
          return `${FIELD[hit[1]] || hit[1]}${hit[2] || ""}`;
        })
        .join(", ")}`,
  },
  {
    re: /^(En configuración|En filtrado|En priorización|En evaluación|Cerrado \/ consolidado) → (En configuración|En filtrado|En priorización|En evaluación|Cerrado \/ consolidado)(?: · Motivo: ([\s\S]+))?$/,
    en: (m, ts) => `${ts(m[1])} → ${ts(m[2])}${m[3] ? ` · Reason: ${m[3]}` : ""}`,
  },
  {
    re: /^(\d+) puntaje\(s\) congelados(?: · Justificación: ([\s\S]+))?$/,
    en: (m) => `${m[1]} score(s) frozen${m[2] ? ` · Justification: ${m[2]}` : ""}`,
  },
  { re: /^(\d+) tecnología\(s\) desde (.+)$/, en: "$1 technology(ies) from $2" },
  { re: /^(\d+) tecnología\(s\) hacia (.+)$/, en: "$1 technology(ies) to $2" },
  { re: /^El código del ciclo admite hasta (\d+) caracteres\.$/, en: "The cycle code allows up to $1 characters." },
  { re: /^Las notas del ciclo admiten hasta (\d+) caracteres\.$/, en: "The cycle notes allow up to $1 characters." },
];
