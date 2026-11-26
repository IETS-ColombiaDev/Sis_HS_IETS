// src/components/MatrixImportModal.jsx — carga y comparación de la matriz de fuentes (Excel o Google Sheets).
export default {
  // Formas de detección (respaldo si el servidor no las envía)
  "API del adaptador": "Adapter API",
  "Canal RSS": "RSS feed",
  "Rastreo HTML con recorrido de fichas": "HTML crawl that follows detail pages",
  "Extracción de PDF": "PDF extraction",
  "Curaduría humana (sin ingesta automática)": "Human curation (no automatic ingestion)",

  // Motivo de coincidencia
  "código de catálogo": "catalog code",
  "nombre": "name",
  "dominio": "domain",
  "Sí": "Yes",
  "No": "No",

  // Fuente nueva
  "Crear {nombre}": "Create {nombre}",
  "Sin URL en la matriz": "No URL in the matrix",
  "Fila {n}": "Row {n}",
  "Sitio: {detalle}": "Site: {detalle}",
  "Detección sugerida:": "Suggested detection:",
  "Revisada por IA": "Reviewed by AI",
  "Por reglas": "By rules",
  "Adaptador": "Adapter",
  "Nivel de acceso": "Access level",
  "Palabras guía": "Guide words",
  "Activar ingesta": "Enable ingestion",
  "URLs de entrada: {lista}": "Entry URLs: {lista}",

  // Fuente con cambios
  "Actualizar {nombre}": "Update {nombre}",
  "«{nombre}» en la matriz": "“{nombre}” in the matrix",
  "Coincide por {criterio}": "Matched by {criterio}",
  "Coincidencia probable: verifique": "Probable match: please verify",
  "{n} campo(s)": "{n} field(s)",
  "{n} conflicto(s) con ediciones manuales": "{n} conflict(s) with manual edits",
  "Editado por el equipo": "Edited by the team",

  // Reporte descargable (CSV)
  "Una fila puede dar varias fuentes del catálogo y dos filas pueden ser la misma fuente":
    "One row can yield several catalog sources, and two rows can be the same source",
  "Campo editado por el equipo: no se pisa salvo que se marque sobrescribir":
    "Field edited by the team: it is not overwritten unless overwrite is checked",

  // Mensajes
  "Elija el Excel de la matriz EH (.xlsx).": "Choose the HS matrix Excel file (.xlsx).",
  "Pegue el enlace de la hoja: https://docs.google.com/spreadsheets/d/…":
    "Paste the link to the sheet: https://docs.google.com/spreadsheets/d/…",
  "No se pudo leer ni comparar la matriz": "Could not read or compare the matrix",
  "Matriz aplicada: {created} fuente(s) nuevas, {updated} actualizadas. Se descargó el reporte.":
    "Matrix applied: {created} new source(s), {updated} updated. The report was downloaded.",
  "Omitidas: {lista}": "Skipped: {lista}",
  "No se pudo aplicar la matriz": "Could not apply the matrix",

  // Pie del diálogo
  "Sobrescribir lo editado en el panel": "Overwrite what was edited in the panel",
  "Guardar como matriz vigente": "Save as the current matrix",
  "Cargar otra": "Load another",
  "Descargar reporte": "Download report",
  "Aplicar ({nuevas} nuevas, {actualizaciones} actualizaciones)": "Apply ({nuevas} new, {actualizaciones} updates)",
  "Cancelar": "Cancel",
  "Comparar con el inventario": "Compare with the inventory",

  // Origen de la matriz
  "Cargar matriz de fuentes (MATRIZ_FUENTES_ESCANEO_EH, Excel o Google Sheets)":
    "Load source matrix (MATRIZ_FUENTES_ESCANEO_EH, Excel or Google Sheets)",
  "Use como base el Excel «FUENTES DE INFORMACION PROACTIVA EH» (hoja «MATRIZ FI EH») o la misma hoja en Google Sheets. El sistema la compara con las fuentes actuales, muestra qué es nuevo y qué cambió, y sugiere cómo detectar señales en cada fuente nueva. No se guarda nada hasta que usted aplique.":
    "Start from the “FUENTES DE INFORMACION PROACTIVA EH” Excel file (“MATRIZ FI EH” sheet) or the same sheet in Google Sheets. The system compares it with the current sources, shows what is new and what changed, and suggests how to detect signals in each new source. Nothing is saved until you apply.",
  "Subir Excel": "Upload Excel",
  "URL de Google Sheets": "Google Sheets URL",
  "Excel de la matriz EH": "HS matrix Excel file",
  "Enlace de la hoja": "Sheet link",
  "La hoja debe estar compartida como «Cualquier persona con el enlace · Lector» o publicada en la web.":
    "The sheet must be shared as “Anyone with the link · Viewer” or published to the web.",
  "Revisar con IA la detección sugerida de las fuentes nuevas": "Review the suggested detection for new sources with AI",
  "Verificar que cada sitio nuevo responda (detecta bloqueos a robots)":
    "Check that each new site responds (detects blocks on bots)",
  "Leyendo la matriz, comparando, verificando sitios y consultando a la IA… puede tardar un minuto.":
    "Reading the matrix, comparing, checking sites and consulting the AI… this may take a minute.",
  "Leyendo la matriz, comparando, verificando sitios… puede tardar un minuto.":
    "Reading the matrix, comparing and checking sites… this may take a minute.",
  "Leyendo la matriz, comparando y consultando a la IA… puede tardar un minuto.":
    "Reading the matrix, comparing and consulting the AI… this may take a minute.",
  "Leyendo la matriz, comparando… puede tardar un minuto.": "Reading the matrix and comparing… this may take a minute.",

  // Resultado de la comparación
  "{origen} · hoja «{hoja}» · {rows} filas · {n} criterios de búsqueda":
    "{origen} · sheet “{hoja}” · {rows} rows · {n} search criteria",
  "{n} nuevas": "{n} new",
  "{n} con cambios": "{n} with changes",
  "{n} sin cambios": "{n} unchanged",
  "{n} ausentes en la matriz": "{n} missing from the matrix",
  "{n} conflicto(s) con ediciones del equipo": "{n} conflict(s) with the team's edits",
  "Validación de la matriz": "Matrix validation",
  "Formato por enlace: <b>{rows}</b> filas de <b>{organizaciones}</b> organizaciones · <b>{fuentes}</b> fuentes (una por URL distinta) · <b>{activas}</b> de consulta activa y <b>{generales}</b> de información general o metodológica, que quedan como referencia sin ingesta.":
    "Per-link format: <b>{rows}</b> rows from <b>{organizaciones}</b> organizations · <b>{fuentes}</b> sources (one per distinct URL) · <b>{activas}</b> for active querying and <b>{generales}</b> with general or methodological information, which are kept as reference without ingestion.",
  "<b>{rows}</b> filas · <b>{fuentes}</b> fuentes · <b>{urls}</b> URL de consulta.":
    "<b>{rows}</b> rows · <b>{fuentes}</b> sources · <b>{urls}</b> query URLs.",
  "Hay más fuentes que filas porque {n} fila(s) corresponden a varios servicios con código propio en el catálogo (por ejemplo FDA, EMA o Health Canada), y algunas fuentes aparecen en dos filas.":
    "There are more sources than rows because {n} row(s) correspond to several services that have their own code in the catalog (for example FDA, EMA or Health Canada), and some sources appear in two rows.",
  "Sin inconsistencias de cantidad ni URL repetidas.": "No count inconsistencies or repeated URLs.",
  "Fila {n} ({nombre}):": "Row {n} ({nombre}):",
  "Las inconsistencias se informan y no se corrigen solas: ajústelas en la matriz y vuelva a cargarla.":
    "Inconsistencies are reported and are not fixed automatically: correct them in the matrix and load it again.",
  "Fuentes nuevas": "New sources",
  "Todas las filas de la matriz ya están en el inventario.": "All rows of the matrix are already in the inventory.",
  "Fuentes con cambios": "Sources with changes",
  "Desmarcar todas": "Deselect all",
  "Marcar todas": "Select all",
  "Sin cambios": "Unchanged",
  "Ocultar": "Hide",
  "Ver": "View",
  "Inventario anterior que pasa a legacy": "Previous inventory that becomes legacy",
  "Con el formato por enlace, la matriz es el inventario completo: al aplicar, estas fuentes se retiran (no se borran) y sus señales pendientes pasan a la pestaña (Legacy) de la Bandeja de entrada, desde donde se pueden recuperar.":
    "With the per-link format, the matrix is the complete inventory: on applying, these sources are retired (not deleted) and their pending signals move to the (Legacy) tab of the Inbox, from where they can be recovered.",
  "En el inventario pero no en esta matriz": "In the inventory but not in this matrix",
  "Vinieron de una matriz anterior. No se retiran automáticamente: revíselas en el catálogo.":
    "They came from a previous matrix. They are not retired automatically: review them in the catalog.",
};
