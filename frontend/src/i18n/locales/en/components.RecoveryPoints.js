// src/components/RecoveryPoints.jsx — puntos de recuperación de la base en Firestore.
// La palabra de confirmación (RESTAURAR) se envía al servidor: llega como {word} y no se traduce.
export default {
  "La copia vigente: es la que se restaura sola al arrancar.": "The current backup: the one restored automatically at startup.",
  "La copia inmediatamente anterior a la vigente.": "The backup immediately before the current one.",
  "Última copia hecha con la versión anterior del sistema, justo antes de un despliegue.":
    "Last backup made with the previous version of the system, just before a deployment.",
  "Última copia de ese día.": "Last backup of that day.",
  "La escribió otra instancia del servicio mientras esta corría (por ejemplo durante un redespliegue).":
    "Written by another instance of the service while this one was running (for example during a redeployment).",
  "Estado que había justo antes de una restauración manual: permite deshacerla.":
    "State just before a manual restore: it lets you undo it.",
  "Fijada a mano desde este panel.": "Pinned manually from this panel.",
  "Sin fecha": "No date",
  "{n} señales": "{n} signals",
  "{n} tecnologías": "{n} technologies",
  "{n} fuentes": "{n} sources",
  "{n} usuarios": "{n} users",
  "No se pudieron leer los puntos de recuperación": "Could not read the recovery points",
  "Firestore no aceptó la copia": "Firestore did not accept the backup",
  "Estado actual publicado; la copia anterior quedó fijada.": "Current state published; the previous backup was pinned.",
  "No se pudo fijar el punto de recuperación": "Could not pin the recovery point",
  "Se reemplazará toda la base por la copia del {date}.": "The entire database will be replaced with the backup from {date}.",
  "El estado actual quedará guardado como punto de recuperación, así que se puede deshacer.":
    "The current state will be saved as a recovery point, so this can be undone.",
  "Para continuar escriba {word}:": "To continue, type {word}:",
  "No se restauró: debía escribir {word}.": "Not restored: you had to type {word}.",
  "No se pudo restaurar el punto de recuperación": "Could not restore the recovery point",
  "Cargando puntos de recuperación...": "Loading recovery points...",
  "Puntos de recuperación": "Recovery points",
  "Fijar el estado actual": "Pin the current state",
  "Copias que las publicaciones siguientes no borran. Se conservan las últimas {deploys} previas a un despliegue, el cierre de los últimos {days} días y el estado previo a cada restauración. Antes de restaurar, el estado actual queda guardado.":
    "Backups that later publications do not delete. The last {deploys} made before a deployment are kept, along with the end-of-day backup for the last {days} days and the state before each restore. Before restoring, the current state is saved.",
  "Aún no hay copias en Firestore.": "There are no backups in Firestore yet.",
  "versión {code}": "version {code}",
  "Restaurar la copia del {date}": "Restore the backup from {date}",
  "Restaurar": "Restore",
};
