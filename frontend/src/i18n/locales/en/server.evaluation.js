// Textos que escribe el servidor al resolver o reabrir observaciones de revisión
// (backend/app/evaluation_service.py y routers/evaluation.py).

export default {
  "La observación ya estaba resuelta.": "The comment was already resolved.",
  "La observación ya está abierta.": "The comment is already open.",
  "El documento ya fue publicado; sus observaciones quedaron cerradas.":
    "The document has already been published; its comments are closed.",
  "Observación no encontrada": "Comment not found",
  "Sin declaración de conflicto de interés no se habilitan las observaciones.":
    "Comments are not available without a conflict of interest declaration.",
  "Se requiere permiso de informe o de revisión para reabrir una observación.":
    "Report or review permission is required to reopen a comment.",
};

export const patterns = [
  {
    re: /^El comentario supera el máximo de (\d+) caracteres\.$/,
    en: "The comment exceeds the maximum of $1 characters.",
  },
];
