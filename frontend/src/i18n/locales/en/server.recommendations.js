// Textos que escribe el servidor sobre la validación de los informes de diseminación
// (backend/app/recommendation_service.py y routers/recommendations.py).

const FIELD = { "título": "title", contenido: "content", impacto: "impact" };

export default {
  "Informe creado": "Report created",
  "Devuelto a borrador": "Returned to draft",
  "Editado": "Edited",
  "Editado después de validar": "Edited after validation",
  "El informe ya estaba validado.": "The report was already validated.",
  "El informe ya está en borrador.": "The report is already in draft.",
  "Defina el impacto (alto, medio o bajo) antes de validar el informe.":
    "Set the impact (high, medium or low) before validating the report.",
  "El estado debe ser borrador o validado.": "The status must be draft or validated.",
};

export const patterns = [
  { re: /^Origen: (.+)$/, en: (m, ts) => `Origin: ${ts(m[1])}` },
  {
    re: /^Cambió: (.+)$/,
    en: (m) => `Changed: ${m[1].split(", ").map((f) => FIELD[f] || f).join(", ")}`,
  },
  {
    re: /^El contenido es demasiado corto para validarlo \(mínimo (\d+) caracteres\)\.$/,
    en: "The content is too short to validate (minimum $1 characters).",
  },
  {
    re: /^El contenido supera el máximo de (\d+) caracteres\.$/,
    en: "The content exceeds the maximum of $1 characters.",
  },
];
