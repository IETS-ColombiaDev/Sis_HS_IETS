// Textos que escribe el servidor sobre las conversaciones del asistente
// (backend/app/routers/chat.py).

export default {
  "El asistente no pudo responder. Su pregunta quedó guardada: pulse Reintentar.": "The assistant could not answer. Your question was saved: press Retry.",
  "La conversación no tiene preguntas para responder.": "The conversation has no questions to answer.",
  "Informe de diseminación": "Dissemination report",
  "Expediente de evaluación": "Assessment dossier",
  "Nota del equipo": "Team note",
  "Boletín": "Bulletin",
  "Memoria del equipo": "Team memory",
  "Respuesta no encontrada": "Answer not found",
  "Entrada no encontrada": "Entry not found",
  "La valoración debe ser útil o no útil.": "The rating must be useful or not useful.",
  "Solo quien guardó la entrada o un superadministrador puede cambiarla.": "Only whoever saved the entry or a superadministrator can change it.",
  "Escriba un título para reconocer esta entrada.": "Enter a title to recognise this entry.",
  "El contenido es demasiado corto para servirle al asistente (mínimo 20 caracteres).": "The content is too short to be useful to the assistant (minimum 20 characters).",
  "Esta respuesta ya está en la memoria del asistente.": "This answer is already in the assistant's memory.",
  "El estado debe ser activa o archivada.": "The status must be active or archived.",
  "Guardó una respuesta en la memoria del asistente": "Saved an answer to the assistant's memory",
  "Le enseñó un dato al asistente": "Taught the assistant a fact",
  "Editó la memoria del asistente": "Edited the assistant's memory",
  "Quitó una entrada de la memoria del asistente": "Removed an entry from the assistant's memory",
  "Memoria del asistente": "Assistant's memory",
};

export const patterns = [
  { re: /^Se pueden adjuntar hasta (\d+) elementos por conversación\.$/, en: "Up to $1 items can be attached per conversation." },
  { re: /^El contenido admite hasta (\d+) caracteres\.$/, en: "The content allows up to $1 characters." },
  { re: /^El mensaje admite hasta (\d+) caracteres\.$/, en: "The message allows up to $1 characters." },
  { re: /^El título admite hasta (\d+) caracteres\.$/, en: "The title allows up to $1 characters." },
];
