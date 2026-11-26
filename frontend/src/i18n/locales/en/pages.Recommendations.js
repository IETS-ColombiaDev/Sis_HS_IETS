// src/pages/Recommendations.jsx — Fase 4: informes de diseminación y paquete del ciclo.
export default {
  // Niveles de impacto (etiquetas; el valor que viaja al servidor no cambia)
  "alto": "high",
  "medio": "medium",
  "bajo": "low",
  "Impacto alto": "High impact",
  "Impacto medio": "Medium impact",
  "Impacto bajo": "Low impact",
  "Impacto {nivel}": "Impact: {nivel}",
  "Sin impacto": "No impact set",
  "Impacto": "Impact",
  "Todos": "All",
  "Sin definir": "Not set",

  // Mensajes
  "Su perfil ({perfil}) puede leer los informes pero no redactarlos (permiso report:write).":
    "Your profile ({perfil}) can read the reports but not write them (report:write permission).",
  "No se pudieron cargar los informes": "Could not load the reports",
  "No se pudieron cargar las señales": "Could not load the signals",
  "Informe eliminado": "Report deleted",
  "No se pudo eliminar": "Could not delete",
  "El título y el contenido no pueden quedar vacíos": "The title and the content cannot be left empty",
  "Informe actualizado": "Report updated",
  "No se pudo guardar": "Could not save",
  "Elija la señal sobre la que se genera el informe.": "Choose the signal the report is generated from.",
  "El título y el contenido son obligatorios.": "The title and the content are required.",
  "IA no configurada: se creó un informe preliminar para completar a mano.":
    "AI not configured: a preliminary report was created to be completed manually.",
  "Informe generado con {modelo}": "Report generated with {modelo}",
  "Informe creado": "Report created",
  "No se pudo crear el informe": "Could not create the report",
  "Elija un ciclo": "Choose a cycle",
  "Paquete descargado: {docs} informe(s) de evaluación y {recs} recomendación(es)":
    "Package downloaded: {docs} assessment report(s) and {recs} recommendation(s)",
  "Paquete descargado": "Package downloaded",
  "No se pudo generar el paquete": "Could not generate the package",
  "Cargando informes...": "Loading reports...",

  // Cabecera y guía
  "Diseminación e informes": "Dissemination and reports",
  "Recomendaciones de adopción para Colombia a partir de las señales, y paquete de diseminación por ciclo.":
    "Adoption recommendations for Colombia based on the signals, and a dissemination package per cycle.",
  "Redactar un informe a mano, con o sin señal de origen": "Write a report manually, with or without a source signal",
  "Nuevo informe": "New report",
  "Generar desde una señal": "Generate from a signal",
  "Fase 4 · Diseminación": "Phase 4 · Dissemination",
  "Generar informes de adopción para el sistema de salud colombiano (IA como borrador + revisión humana).":
    "Generate adoption reports for the Colombian health system (AI as a draft + human review).",
  "Clasificar el impacto esperado: alto, medio o bajo.": "Classify the expected impact: high, medium or low.",
  "Descargar el paquete del ciclo para compartirlo con quien decide.":
    "Download the cycle package to share it with decision-makers.",
  "Notas del equipo": "Team notes",
  "Informes emitidos": "Reports issued",
  "Recomendaciones de adopción registradas, de todos los ciclos.": "Adoption recommendations recorded, across all cycles.",
  "<b>IA no configurada.</b> Los informes generados desde una señal saldrán como versión preliminar para completar a mano. Un superadministrador puede activar la IA en Configuración.":
    "<b>AI not configured.</b> Reports generated from a signal will be produced as a preliminary version to be completed manually. A super administrator can enable AI in Settings.",

  // Paquete de diseminación
  "Paquete de diseminación del ciclo": "Cycle dissemination package",
  "Qué es el paquete": "What the package is",
  "ZIP con Listado Único, informes de evaluación, recomendaciones, notas y boletín publicado.":
    "ZIP with the Unified List, assessment reports, recommendations, notes and the published bulletin.",
  "Ciclo del paquete": "Package cycle",
  "No hay ciclos": "No cycles",
  "Incluye también los informes que aún están en redacción o revisión. Los confidenciales nunca se incluyen.":
    "Also includes reports that are still being drafted or reviewed. Confidential ones are never included.",
  "Incluir borradores": "Include drafts",
  "Su perfil no puede descargar el paquete: trae notas internas del equipo (requiere report:write o analytics:restricted).":
    "Your profile cannot download the package: it contains internal team notes (requires report:write or analytics:restricted).",
  "No hay ciclos para empaquetar.": "There are no cycles to package.",
  "Descargar ZIP": "Download ZIP",

  // Listado
  "Sin informes de diseminación": "No dissemination reports",
  "Genere el primero desde una señal, o redáctelo a mano.": "Generate the first one from a signal, or write it manually.",
  "Ver señales": "View signals",
  "Buscar en informes...": "Search reports...",
  "Buscar informe": "Search reports",
  "{n} informes": "{n} reports",
  "Ningún informe coincide": "No reports match",
  "Ajuste la búsqueda o el filtro de impacto.": "Adjust the search or the impact filter.",
  "Informe #{id}": "Report #{id}",
  "manual": "manual",
  "Leer informe completo": "Read full report",
  "Corregir título, contenido e impacto": "Correct the title, content and impact",
  "Editar": "Edit",
  "Eliminar el informe": "Delete the report",
  "Eliminar informe {id}": "Delete report {id}",

  // Detalle
  "Informe": "Report",
  "Eliminar": "Delete",
  "Editar informe": "Edit report",

  // Alta
  "Generar informe desde una señal": "Generate report from a signal",
  "Cancelar": "Cancel",
  "Generar con IA": "Generate with AI",
  "Crear versión preliminar": "Create preliminary version",
  "Guardar informe": "Save report",
  "La IA redacta un borrador de recomendación para Colombia; revise y edite antes de difundirlo.":
    "The AI drafts a recommendation for Colombia; review and edit it before disseminating it.",
  "Se creará una versión preliminar.": "A preliminary version will be created.",
  "Buscar señal": "Search signals",
  "Nombre de la tecnología...": "Technology name...",
  "Señal de origen": "Source signal",
  "Señal de origen (opcional)": "Source signal (optional)",
  "Seleccione una señal...": "Select a signal...",
  "Sin señal (informe general)": "No signal (general report)",
  "Título": "Title",
  "Contenido (Markdown) *": "Content (Markdown) *",
  "Síntesis": "Summary",

  // Edición
  "Guardar cambios": "Save changes",
  "Markdown soportado. Ajuste título, contenido e impacto según relevancia para Colombia.":
    "Markdown is supported. Adjust the title, content and impact according to relevance for Colombia.",
  "Contenido (Markdown)": "Content (Markdown)",
  "Ocultar vista previa": "Hide preview",
  "Ver vista previa": "Show preview",
  "Vista previa...": "Preview...",

  // Eliminación
  "Eliminar informe": "Delete report",
  'Se eliminará "{titulo}". Esta acción no se puede deshacer.':
    '"{titulo}" will be deleted. This action cannot be undone.',
};
