export default {
  // Embudo del ciclo
  "Asignadas": "Assigned",
  "Filtradas": "Screened",
  "Priorizadas": "Prioritized",
  "Bajo vigilancia": "Under surveillance",
  "En evaluación": "In assessment",
  "Publicadas": "Published",
  "Qué cuenta {label}": "What {label} counts",

  // Tarjeta del ciclo
  "Histórico": "Historical",
  "Ciclo en pantalla": "Cycle on screen",
  "Apertura {apertura} · Corte {corte} · Boletín {boletin}": "Opening {apertura} · Cutoff {corte} · Bulletin {boletin}",
  "Apertura {apertura} · Corte {corte}": "Opening {apertura} · Cutoff {corte}",
  "Ventana {n} semanas": "Window {n} weeks",
  "Qué es la ventana operativa": "What the operating window is",
  "Todas las pantallas del flujo (bandeja, filtrado, priorización, evaluación) pasan a trabajar sobre este ciclo.":
    "All the workflow screens (inbox, screening, prioritization, assessment) switch to working on this cycle.",
  "Trabajar aquí": "Work here",
  "Solo el superadministrador cierra y consolida un ciclo.": "Only the superadministrator closes and consolidates a cycle.",
  "Cerrar y consolidar": "Close and consolidate",
  "Retrocede a '{estado}'.": "Moves back to '{estado}'.",
  "Avanza a '{estado}'.": "Moves forward to '{estado}'.",
  "Devolver a: {estado}": "Return to: {estado}",
  "Pasar a: {estado}": "Move to: {estado}",
  "Corrija código, fechas o notas del ciclo.": "Correct the cycle's code, dates or notes.",
  "Editar": "Edit",
  "Tiene tecnologías asignadas: ya no se elimina. Edite sus datos o aváncelo.":
    "It has assigned technologies: it can no longer be deleted. Edit its data or move it forward.",
  "Eliminar": "Delete",
  "Arrastrar {n} bajo vigilancia": "Carry over {n} under surveillance",

  // Validación del formulario
  "El código es obligatorio.": "The code is required.",
  "Ya existe un ciclo con este código.": "A cycle with this code already exists.",
  "Indique la fecha de apertura.": "Enter the opening date.",
  "Indique el corte de datos.": "Enter the data cutoff.",
  "El corte debe ser posterior a la apertura.": "The cutoff must be after the opening.",
  "El boletín no puede ser anterior al corte de datos.": "The bulletin cannot be earlier than the data cutoff.",
  "La ventana es de {n} semanas y debe estar entre {min} y {max}.":
    "The window is {n} weeks and must be between {min} and {max}.",
  "El año {year} ya tiene {n} ciclos formales (máximo {max}). Use otro año o cierre uno existente.":
    "The year {year} already has {n} formal cycles (maximum {max}). Use another year or close an existing one.",

  // Avisos
  "Ciclo {code} actualizado.": "Cycle {code} updated.",
  "Ciclo {code} creado.": "Cycle {code} created.",
  "No se pudo actualizar el ciclo": "Could not update the cycle",
  "No se pudo crear el ciclo": "Could not create the cycle",
  "Ciclo {code} eliminado.": "Cycle {code} deleted.",
  "No se pudo eliminar el ciclo": "Could not delete the cycle",
  "No se pudo verificar el cierre": "Could not verify the closure",
  "No se pudo cambiar el estado": "Could not change the status",
  "{code} cerrado. Puntajes congelados y boletín compilado.": "{code} closed. Scores frozen and bulletin compiled.",
  '{n} tecnología(s) quedaron bajo vigilancia. Use "Arrastrar" en la tarjeta del ciclo para proponerlas en un ciclo abierto.':
    '{n} technology(ies) were left under surveillance. Use "Carry over" on the cycle card to propose them in an open cycle.',
  "No se pudo cerrar el ciclo": "Could not close the cycle",
  "No había tecnologías nuevas por arrastrar: ya estaban en el ciclo destino.":
    "There were no new technologies to carry over: they were already in the target cycle.",
  "No se pudo arrastrar el monitoreo activo": "Could not carry over the active monitoring",
  "Cargando ciclos...": "Loading cycles...",

  // Página
  "Ciclos de escaneo": "Scanning cycles",
  "Eje de la metodología. Máximo {max} ciclos formales por año, con ventana de {wmin} a {wmax} semanas. Al cerrar, los puntajes quedan congelados y las tecnologías bajo vigilancia se pueden arrastrar al ciclo siguiente.":
    "Backbone of the methodology. Maximum of {max} formal cycles per year, with a window of {wmin} to {wmax} weeks. On closing, the scores are frozen and the technologies under surveillance can be carried over to the next cycle.",
  "Nuevo ciclo": "New cycle",
  "Todavía no hay ciclos": "There are no cycles yet",
  "El ciclo operativo ordena el filtrado, la priorización, la evaluación y la diseminación. Cree el primero para habilitar el flujo metodológico completo.":
    "The operating cycle organizes screening, prioritization, assessment and dissemination. Create the first one to enable the full methodological workflow.",
  "Crear el primer ciclo": "Create the first cycle",

  // Formulario
  "Editar {name}": "Edit {name}",
  "Nuevo ciclo de escaneo": "New scanning cycle",
  "Cancelar": "Cancel",
  "Guardar cambios": "Save changes",
  "Crear ciclo": "Create cycle",
  "Código del ciclo": "Cycle code",
  "Fecha de apertura": "Opening date",
  "Corte de datos": "Data cutoff",
  "Fecha proyectada de boletín": "Projected bulletin date",
  "Ventana operativa: {n} semanas": "Operating window: {n} weeks",
  "(dentro del rango metodológico)": "(within the methodological range)",
  "el sistema exige entre {min} y {max} semanas": "the system requires between {min} and {max} weeks",
  "Ciclos formales en {year}: {n} de {max}": "Formal cycles in {year}: {n} of {max}",
  "Qué es la cuota anual": "What the annual quota is",
  "Notas": "Notes",

  // Eliminar, cerrar y arrastrar
  "Eliminar {name}": "Delete {name}",
  "El ciclo está en configuración y no tiene trabajo asociado. Se eliminará de forma definitiva; la baja queda registrada en la bitácora.":
    "The cycle is in setup and has no associated work. It will be permanently deleted; the deletion is recorded in the audit log.",
  "Eliminar ciclo": "Delete cycle",
  "Cerrar {name}": "Close {name}",
  "Registre la justificación de cierre: hay tecnologías en evaluación sin informe publicado.":
    "Record the closure justification: there are technologies in assessment without a published report.",
  "Al cerrar, todos los puntajes del ciclo quedan congelados, se compila el boletín y se refresca el tablero. Una reevaluación posterior crea registros nuevos y nunca modifica los actuales. <b>Esta acción no se deshace.</b>":
    "On closing, all the cycle's scores are frozen, the bulletin is compiled and the dashboard is refreshed. A later reassessment creates new records and never modifies the current ones. <b>This action cannot be undone.</b>",
  "Publique el informe correspondiente o registre la justificación de cierre. La justificación queda en la bitácora inmutable.":
    "Publish the corresponding report or record the closure justification. The justification is stored in the immutable audit log.",
  "Justificación de cierre": "Closure justification",
  "Motivo por el cual el ciclo se cierra con tecnologías en evaluación":
    "Reason why the cycle is being closed with technologies in assessment",
  "Arrastrar monitoreo activo": "Carry over active monitoring",
  "Cree o reabra un ciclo destino antes de arrastrar.": "Create or reopen a target cycle before carrying over.",
  "Arrastrar": "Carry over",
  "Ciclo destino": "Target cycle",
  "No hay ciclos abiertos. Cree un ciclo destino antes de arrastrar el monitoreo activo.":
    "There are no open cycles. Create a target cycle before carrying over the active monitoring.",
};

// "cutoff" (EE. UU.) se escribe "cut-off" en inglés británico.
export const gb = {
  "Apertura {apertura} · Corte {corte} · Boletín {boletin}": "Opening {apertura} · Cut-off {corte} · Bulletin {boletin}",
  "Apertura {apertura} · Corte {corte}": "Opening {apertura} · Cut-off {corte}",
  "Indique el corte de datos.": "Enter the data cut-off.",
  "El corte debe ser posterior a la apertura.": "The cut-off must be after the opening.",
  "El boletín no puede ser anterior al corte de datos.": "The bulletin cannot be earlier than the data cut-off.",
  "Corte de datos": "Data cut-off",
};
