// src/components/PriorityMatrix.jsx — matriz oficial de priorización P1 a P6.
export default {
  // Indicador %P
  "Qué es el porcentaje P": "What the P percentage is",
  "{puntos} de {total} criterios": "{puntos} of {total} criteria",
  "{n} de {total} calificados": "{n} of {total} rated",
  "Faltan {lista}. El índice %P no se calcula con criterios pendientes.":
    "Missing: {lista}. The %P index is not calculated while criteria are pending.",

  // Fila de criterio
  "evaluador técnico": "technical assessor",
  "evaluador clínico": "clinical assessor",
  "Lo califica el {rol}.": "It is rated by the {rol}.",
  "Qué es {codigo}": "What {codigo} is",
  "Sí": "Yes",
  "No": "No",
  "Califica {rol}": "Rated by the {rol}",
  "Sugerencia automática: Sí": "Automatic suggestion: Yes",
  "Sugerencia automática: No": "Automatic suggestion: No",
  "Requiere confirmación del evaluador.": "Requires confirmation by the assessor.",
  "Calificado por {quien}": "Rated by {quien}",
  "Justificación de {codigo}": "Justification for {codigo}",
  "Justificación (opcional pero recomendada para auditoría)": "Justification (optional but recommended for audit)",
  "Responder Sí a {codigo}: suma 1 punto.": "Answer Yes to {codigo}: adds 1 point.",
  "Responder No a {codigo}: no suma puntos.": "Answer No to {codigo}: adds no points.",
  "Agregar justificación a {codigo}": "Add a justification to {codigo}",
  "Pendiente": "Pending",
  "Registrado": "Recorded",

  // Matriz
  "No se pudo cargar la matriz de priorización": "Could not load the prioritization matrix",
  "{criterio} registrado. %P = {pct}% → {estado}.": "{criterio} recorded. %P = {pct}% → {estado}.",
  "{criterio} registrado. Faltan {lista}.": "{criterio} recorded. Missing: {lista}.",
  "No se pudo registrar la calificación": "Could not record the rating",
  "Cargando matriz P1 a P6...": "Loading P1 to P6 matrix...",
  "Matriz oficial de priorización": "Official prioritization matrix",
  "Qué es la matriz P1 a P6": "What the P1 to P6 matrix is",
  "%P = (suma de P1 a P6 / {total}) × 100 · Priorizada con {umbral} puntos o más · Bajo vigilancia con {vigilancia}":
    "%P = (sum of P1 to P6 / {total}) × 100 · Prioritized with {umbral} points or more · Under surveillance with {vigilancia}",
  "Cómo se clasifican las franjas": "How the bands are classified",
  "Ciclo cerrado: los puntajes están congelados. Una reevaluación debe hacerse en un ciclo posterior y generará un registro nuevo.":
    "Cycle closed: the scores are frozen. A reassessment must be carried out in a later cycle and will create a new record.",
};
