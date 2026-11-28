// Textos que escribe el servidor sobre las notas: recorrido y actividad
// (backend/app/routers/notes.py y activity_service.py).

const FIELD = { "título": "title", contenido: "content" };

export default {
  "Editada": "Edited",
  "Soltada": "Unpinned",
  "Escribió una nota": "Wrote a note",
  "Descargó las notas": "Downloaded the notes",
};

export const patterns = [
  {
    re: /^Cambió: (título|contenido)(?:, (título|contenido))?( · con ayuda de la IA)?$/,
    en: (m) => `Changed: ${[m[1], m[2]].filter(Boolean).map((f) => FIELD[f]).join(", ")}${m[3] ? " · with AI help" : ""}`,
  },
  { re: /^El contenido admite hasta (\d+) caracteres\.$/, en: "The content allows up to $1 characters." },
];
