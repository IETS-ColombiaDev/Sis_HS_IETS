// src/pages/Prioritization.jsx — Fase 2: cola de priorización y matriz P1 a P6.
export default {
  // Filtros de estado
  "Todos los estados": "All statuses",
  "Por calificar (aptas)": "To be rated (eligible)",
  "Priorizadas": "Prioritized",
  "Bajo vigilancia": "Under surveillance",
  "No priorizadas": "Not prioritized",

  // Mensajes
  "La tecnología #{id} no aparece en la cola de priorización de {ciclo}.":
    "Technology #{id} does not appear in the prioritization queue of {ciclo}.",
  "este ciclo": "this cycle",
  "No se pudo cargar la cola de priorización": "Could not load the prioritization queue",
  "El enlace de tecnología no es válido.": "The technology link is not valid.",
  "No se pudo abrir la tecnología del enlace": "Could not open the technology in the link",
  "Tecnología excluida con causa registrada.": "Technology excluded and the reason recorded.",
  "No se pudo excluir": "Could not exclude",
  "Pasa a evaluación temprana. El expediente ya está abierto en Evaluación.":
    "Moved to early assessment. The dossier is now open in Assessment.",
  "No se pudo enviar a evaluación": "Could not send to assessment",
  "Cargando priorización...": "Loading prioritization...",

  // Sin ciclo
  "Priorización": "Prioritization",
  "La priorización ocurre siempre dentro de un ciclo operativo.":
    "Prioritization always takes place within an operational cycle.",
  "Seleccione un ciclo": "Select a cycle",
  "La matriz P1 a P6 califica tecnologías asignadas a un ciclo. Cree o seleccione uno para comenzar.":
    "The P1 to P6 matrix rates technologies assigned to a cycle. Create or select one to begin.",
  "Ir a ciclos": "Go to cycles",

  // Cabecera y guía
  "Matriz oficial de seis criterios binarios en {ciclo}. El índice %P solo se calcula cuando los seis criterios están validados por los perfiles habilitados.":
    "Official matrix of six binary criteria in {ciclo}. The %P index is calculated only when all six criteria have been validated by the authorized profiles.",
  "Viendo lo mío": "Showing mine",
  "Solo lo que me toca": "Only mine to rate",
  "Fase 2 · Priorización": "Phase 2 · Prioritization",
  "Su perfil califica: {criterios}.": "Your profile rates: {criterios}.",
  "ningún criterio (solo consulta)": "no criteria (read-only)",
  "Excluya con causa tipificada lo que no debe seguir en el ciclo.":
    "Exclude, with a predefined reason, anything that should not continue in the cycle.",
  "El estado se asigna solo (priorizada, bajo vigilancia o no priorizada) al completar los seis criterios.":
    "The status is assigned automatically (prioritized, under surveillance or not prioritized) once all six criteria are complete.",
  "Pase las priorizadas a evaluación temprana.": "Move the prioritized technologies to early assessment.",
  "Evaluación temprana": "Early assessment",
  "En cola##tecnologias": "In queue",
  "Pendientes": "Pending",
  "<b>Ciclo cerrado.</b> Los puntajes están congelados y la matriz es de solo lectura. Una reevaluación se hace en un ciclo posterior.":
    "<b>Cycle closed.</b> The scores are frozen and the matrix is read-only. A reassessment is carried out in a later cycle.",

  // Cola
  "Cola del ciclo · {total} tecnología(s)": "Cycle queue · {total} technology(ies)",
  "Buscar en la cola de priorización": "Search the prioritization queue",
  "Buscar por nombre, DCI o indicación...": "Search by name, INN or indication...",
  "Filtrar por estado": "Filter by status",
  "Filtrar por clúster": "Filter by cluster",
  "Todos los clústeres": "All clusters",
  "Nada pendiente para su perfil": "Nothing pending for your profile",
  "Sin resultados": "No results",
  "No hay tecnologías en la cola": "There are no technologies in the queue",
  "Ninguna tecnología coincide con los filtros actuales.": "No technology matches the current filters.",
  "Asigne señales al ciclo desde la bandeja de entrada y márquelas como aptas en Filtrado y depuración.":
    "Assign signals to the cycle from the inbox and mark them as eligible in Screening and clean-up.",
  "Limpiar filtros": "Clear filters",
  "Ir a filtrado": "Go to screening",
  "Sin clúster": "No cluster",
  "Sin tipología": "No technology type",
  "{puntos} de {total} puntos": "{puntos} of {total} points",
  "Criterios calificados de seis": "Criteria rated out of six",
  "Le toca": "Your turn",
  "Arrastrada": "Carried over",
  "antes {pct}%": "previously {pct}%",
  "{from}-{to} de {total}": "{from}-{to} of {total}",
  "Anterior": "Previous",
  "Página {n} de {total}": "Page {n} of {total}",
  "Siguiente": "Next",

  // Detalle
  "Cribado {puntaje}": "Screening score {puntaje}",
  "Excluir": "Exclude",
  "Complete los seis criterios: solo las priorizadas (4 o más puntos) pasan a evaluación.":
    "Complete all six criteria: only prioritized technologies (4 or more points) move to assessment.",
  "Solo las priorizadas (4 o más puntos) pasan a evaluación temprana.":
    "Only prioritized technologies (4 or more points) move to early assessment.",
  "Pasar a evaluación": "Move to assessment",
  "La calificación quedó registrada. Esta tecnología ya no coincide con los filtros de la cola; se mantiene en pantalla hasta que elija otra.":
    "The rating was recorded. This technology no longer matches the queue filters; it stays on screen until you choose another one.",
  "Seleccione una tecnología": "Select a technology",
  "Elija un elemento de la cola para calificar sus criterios.": "Choose an item from the queue to rate its criteria.",

  // Diálogos
  "Pasar a evaluación temprana": "Move to early assessment",
  "{nombre} sale de la matriz con {puntos} puntos y se abre su expediente. Su calificación queda fija para este ciclo.":
    "{nombre} leaves the matrix with {puntos} points and its dossier is opened. Its rating is fixed for this cycle.",
  "Excluir del ciclo": "Exclude from the cycle",
  "Cancelar": "Cancel",
  "Seleccione el motivo tipificado: es obligatorio.": "Select the predefined reason: it is required.",
  "La causa de exclusión es obligatoria y no editable una vez registrada. Queda con marca de tiempo y evaluador en la bitácora inmutable.":
    "The exclusion reason is required and cannot be edited once recorded. It is stored with a timestamp and the assessor in the immutable audit log.",
  "Motivo tipificado": "Predefined reason",
  "Seleccione un motivo...": "Select a reason...",
  "Observación": "Note",
};
