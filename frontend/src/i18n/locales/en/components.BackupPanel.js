// src/components/BackupPanel.jsx — Persistencia (Firebase) y copia en el navegador.
// PUBLICAR es la palabra que la pantalla compara con lo que se escribe: no se traduce.
export default {
  "Sin fecha": "No date",
  "Al día": "Up to date",
  "Guardando…": "Saving…",
  "Restaurando…": "Restoring…",
  "Con error": "With errors",
  "Copia bloqueada: la base del servidor es mucho menor que la guardada en Firebase. No se sobrescribió.":
    "Backup blocked: the server database is much smaller than the one saved in Firebase. It was not overwritten.",
  "Copia bloqueada: la base del servidor tiene menos datos que la guardada en Firebase. No se sobrescribió.":
    "Backup blocked: the server database has less data than the one saved in Firebase. It was not overwritten.",
  "Aún no se pudo leer Firebase; la copia queda en pausa y se reintenta sola.":
    "Firebase could not be read yet; the backup is paused and will retry on its own.",
  "Hay otra copia en curso. Intente de nuevo en un momento.": "Another backup is in progress. Try again in a moment.",
  "No se pudo completar la acción": "Could not complete the action",
  "Firestore no aceptó la copia": "Firestore did not accept the backup",
  "Base publicada en Firebase.": "Database published to Firebase.",
  "La base del servidor tiene menos datos que la copia guardada en Firebase.":
    "The server database has less data than the backup saved in Firebase.",
  "Si publica de todos modos, la copia guardada queda como punto de recuperación y se puede restaurar.":
    "If you publish anyway, the saved backup is kept as a recovery point and can be restored.",
  "Para continuar escriba PUBLICAR:": "To continue, type PUBLICAR:",
  "No se publicó: debía escribir PUBLICAR.": "Not published: you had to type PUBLICAR.",
  "Base publicada. La copia anterior quedó como punto de recuperación.":
    "Database published. The previous backup was kept as a recovery point.",
  "Se reemplazará toda la base del servidor por la copia publicada en Firebase. Lo registrado aquí después de esa publicación se perderá. ¿Continuar?":
    "The entire server database will be replaced with the backup published in Firebase. Anything recorded here after that publication will be lost. Continue?",
  "No se pudo leer Firestore": "Could not read Firestore",
  "El servidor ya tenía el trabajo más reciente.": "The server already had the most recent work.",
  "Firebase no tiene copia todavía.": "Firebase has no backup yet.",
  "Base en Firebase": "Database in Firebase",
  "Este proyecto tiene su propio espacio en Firestore: colección <b>hs_iets_db</b>, aparte del directorio RRHH. SQLite solo es el motor local; al arrancar se restaura y cada cambio se publica. El disco de Render puede borrarse sin perder el trabajo. Una base con menos datos que la guardada nunca la sobrescribe.":
    "This project has its own space in Firestore: the <b>hs_iets_db</b> collection, separate from the HR directory. SQLite is only the local engine; it is restored at startup and every change is published. The Render disk can be wiped without losing the work. A database with less data than the saved one never overwrites it.",
  "Sincronizada": "Synced",
  "Pendiente": "Pending",
  "Sin credencial": "No credential",
  "Última publicación: <b>{date}</b>": "Last published: <b>{date}</b>",
  "Publicar ahora en Firebase": "Publish to Firebase now",
  "Restaurar desde Firebase": "Restore from Firebase",
  "Publicar de todos modos": "Publish anyway",
  "Defina <c>FIREBASE_SERVICE_ACCOUNT_KEY</c> en el servidor. La copia vive en la colección exclusiva <c>hs_iets_db</c>, aparte de la colección de usuarios del directorio RRHH.":
    "Set <c>FIREBASE_SERVICE_ACCOUNT_KEY</c> on the server. The backup lives in the dedicated <c>hs_iets_db</c> collection, separate from the users collection of the HR directory.",
  "Copia en este navegador": "Backup in this browser",
  "El servidor usa una base PostgreSQL persistente: no hace falta guardar copia en el navegador.":
    "The server uses a persistent PostgreSQL database: there is no need to keep a backup in the browser.",
  "Se reemplazará toda la base del servidor por la copia del {date}. Lo registrado en el servidor después de esa fecha se perderá. ¿Continuar?":
    "The entire server database will be replaced with the backup from {date}. Anything recorded on the server after that date will be lost. Continue?",
  "Copia de respaldo en este navegador": "Backup copy in this browser",
  "Copia extra en este navegador. La fuente de verdad es Firebase; esto sirve si hay que recuperar un momento anterior sin tocar Firestore.":
    "Extra backup in this browser. Firebase is the source of truth; this helps if an earlier point in time has to be recovered without touching Firestore.",
  "Última copia: <b>{date}</b>": "Last backup: <b>{date}</b>",
  "{size} comprimida · {raw} de base": "{size} compressed · {raw} database",
  "Sin copia todavía": "No backup yet",
  "Copia actualizada en este navegador.": "Backup updated in this browser.",
  "Guardar copia ahora": "Save backup now",
  "Descargar copia (.db.gz)": "Download backup (.db.gz)",
  "Restaurar esta copia en el servidor": "Restore this backup to the server",
  "Copias de bases anteriores": "Backups of earlier databases",
  "Restaurar": "Restore",
};
