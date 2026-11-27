// Textos que escribe el servidor sobre los boletines: recorrido y validaciones
// (backend/app/bulletin_service.py y routers/strategy.py).

const FIELD = { "título": "title", "nota editorial": "editorial note" };

export default {
  "Recompilado con las cifras del ciclo": "Recompiled with the cycle's figures",
  "Aprobación anulada": "Approval voided",
  "Enviado a la alta dirección": "Sent to senior management",
  "Descargado en PDF": "Downloaded as PDF",
  "Un boletín publicado no se edita.": "A published bulletin cannot be edited.",
  "El título del boletín es obligatorio.": "The bulletin title is required.",
  "Un boletín publicado no se devuelve: la publicación es definitiva.": "A published bulletin cannot be returned: publication is final.",
  "El boletín no está aprobado.": "The bulletin is not approved.",
  "Escriba el motivo para anular la aprobación.": "Enter the reason for voiding the approval.",
  "Un boletín publicado no se elimina.": "A published bulletin cannot be deleted.",
};

export const patterns = [
  {
    re: /^Cambió: (título|nota editorial)(?:, (título|nota editorial))?( · La aprobación anterior se anuló)?$/,
    en: (m) => `Changed: ${[m[1], m[2]].filter(Boolean).map((f) => FIELD[f]).join(", ")}${m[3] ? " · The previous approval was voided" : ""}`,
  },
  { re: /^Motivo: ([\s\S]*)$/, en: "Reason: $1" },
  {
    re: /^(\d+) destinatario\(s\)(?: · (\d+) sin entregar)?( · sin PDF adjunto)?$/,
    en: (m) => `${m[1]} recipient(s)${m[2] ? ` · ${m[2]} not delivered` : ""}${m[3] ? " · no PDF attached" : ""}`,
  },
  { re: /^El boletín ya fue aprobado por (.+)\.$/, en: "The bulletin was already approved by $1." },
  { re: /^El título admite hasta (\d+) caracteres\.$/, en: "The title allows up to $1 characters." },
  { re: /^La nota editorial admite hasta (\d+) caracteres\.$/, en: "The editorial note allows up to $1 characters." },
];
