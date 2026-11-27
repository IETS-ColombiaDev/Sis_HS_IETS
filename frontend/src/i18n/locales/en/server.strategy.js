// Textos que escribe el servidor para el tablero estratégico: calidad de datos y actividad
// (backend/app/strategy_service.py).

export default {
  "Sin fase clínica declarada": "No clinical phase declared",
  "Sin fecha para estimar la llegada al mercado": "No date to estimate market arrival",
  "Aptas sin calificación P1-P6 completa": "Eligible without a complete P1-P6 rating",
  "Expedientes sin impacto presupuestal": "Dossiers without budget impact",
  "Montos que no se pudieron interpretar": "Amounts that could not be interpreted",
  "Descarga del recorte": "Selection download",
  "Datamart recalculado": "Datamart recalculated",
};

export const patterns = [
  {
    re: /^(CSV|XLSX) · (\d+) tecnología\(s\) · (con|sin) montos( · con filtros)?$/,
    en: (m) => `${m[1]} · ${m[2]} technolog${m[2] === "1" ? "y" : "ies"} · ${m[3] === "con" ? "with" : "without"} amounts${m[4] ? " · filtered" : ""}`,
  },
];
