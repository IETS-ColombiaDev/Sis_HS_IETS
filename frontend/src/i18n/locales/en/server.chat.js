// Textos que escribe el servidor sobre las conversaciones del asistente
// (backend/app/routers/chat.py).

export default {
  "El asistente no pudo responder. Su pregunta quedó guardada: pulse Reintentar.": "The assistant could not answer. Your question was saved: press Retry.",
  "La conversación no tiene preguntas para responder.": "The conversation has no questions to answer.",
};

export const patterns = [
  { re: /^El mensaje admite hasta (\d+) caracteres\.$/, en: "The message allows up to $1 characters." },
  { re: /^El título admite hasta (\d+) caracteres\.$/, en: "The title allows up to $1 characters." },
];
