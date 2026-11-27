// Textos que escribe el servidor en backend/app/priority_overview.py y priority_engine.py
// (recorrido de la matriz y regla de cambio de respuesta).

const YES_NO = { "Sí": "Yes", No: "No" };

export default {
  "Excluida del ciclo": "Excluded from the cycle",
  "Pasó a evaluación temprana": "Moved to early assessment",
};

export const patterns = [
  { re: /^(P\d) calificado: (Sí|No)$/, en: (m) => `${m[1]} rated: ${YES_NO[m[2]]}` },
  {
    re: /^(P\d) cambió de (Sí|No) a (Sí|No)$/,
    en: (m) => `${m[1]} changed from ${YES_NO[m[2]]} to ${YES_NO[m[3]]}`,
  },
  { re: /^Matriz completa: (.+)$/, en: (m, ts) => `Matrix complete: ${ts(m[1])}` },
  { re: /^(\d+) puntos · %P ([\d.]+)$/, en: "$1 points · %P $2" },
  {
    re: /^Cambiar la respuesta de (P\d) exige una justificación de al menos (\d+) caracteres: el cambio queda en la bitácora\.$/,
    en: "Changing the answer to $1 requires a justification of at least $2 characters: the change is kept in the audit log.",
  },
  {
    re: /^La justificación supera el máximo de (\d+) caracteres\.$/,
    en: "The justification exceeds the maximum of $1 characters.",
  },
  { re: /^Orden no válido\. Opciones: (.+)$/, en: "Invalid order. Options: $1" },
  { re: /^Filtro de avance no válido\. Opciones: (.+)$/, en: "Invalid progress filter. Options: $1" },
];
