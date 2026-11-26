// src/components/SchedulePanel.jsx — tareas programadas del worker (Configuración › Programación).
export default {
  "En curso": "In progress",
  "Ok": "OK",
  "Parcial": "Partial",
  "Error": "Error",
  "Sin trabajo": "Nothing to do",
  "Cada cuántas horas se compara el ciclo activo en busca de duplicados. Una vez al día suele bastar.":
    "How often, in hours, the active cycle is compared to look for duplicates. Once a day is usually enough.",
  "En la próxima vuelta del worker": "On the worker's next pass",
  "No se pudo cargar la programación": "The schedule could not be loaded",
  "Cada intervalo debe ser un número entero de horas entre 1 y 720.":
    "Each interval must be a whole number of hours between 1 and 720.",
  "Programación guardada. El worker la aplica en su próxima vuelta.":
    "Schedule saved. The worker applies it on its next pass.",
  "No se pudo guardar la programación": "The schedule could not be saved",
  "Tarea ejecutada": "Task run",
  "No se pudo ejecutar la tarea": "The task could not be run",
  "Cargando tareas programadas...": "Loading scheduled tasks...",
  'El worker está deshabilitado en este servidor (INGEST_WORKER_ENABLED=false): las tareas no correrán solas. Puede ejecutarlas a mano con "Ejecutar ahora".':
    'The worker is disabled on this server (INGEST_WORKER_ENABLED=false): the tasks will not run by themselves. You can run them manually with "Run now".',
  "Qué es {tarea}": "What {tarea} is",
  "Activar {tarea}": "Turn on {tarea}",
  "Activa": "Active",
  "Intervalo (horas)": "Interval (hours)",
  "Próxima": "Next",
  "Apagada": "Off",
  "Última": "Last",
  "Aún no ha corrido": "Has not run yet",
  "Ejecutarla ahora, fuera de su horario. Queda registrada como manual.":
    "Run it now, outside its schedule. It is recorded as manual.",
  "Su perfil no tiene el permiso {permiso} para ejecutar esta tarea.":
    "Your profile does not have the {permiso} permission to run this task.",
  "Ejecutar ahora": "Run now",
  "Guardar interruptores e intervalos": "Save switches and intervals",
  "Solo el superadministrador cambia la programación (permiso config:manage).":
    "Only the superadministrator can change the schedule (config:manage permission).",
  "No hay cambios por guardar.": "There are no changes to save.",
  "Guardar programación": "Save schedule",
  "<w>Worker</w>: {estado} · revisa cada {n} s": "<w>Worker</w>: {estado} · checks every {n} s",
  "en marcha": "running",
  "detenido": "stopped",
  "deshabilitado": "disabled",
  "Actualizar": "Refresh",
  "Registro de ejecución": "Run log",
  "Aún no hay ejecuciones registradas.": "No runs have been recorded yet.",
  "Tarea": "Task",
  "Resultado": "Result",
  "Origen": "Origin",
  "Manual": "Manual",
  "Programada": "Scheduled",
  "Inicio##hora": "Start",
  "Nuevas / detectadas": "New / detected",
  "Vigilancia: señales nuevas / registros leídos. Duplicados: propuestas nuevas / pares sobre el umbral.":
    "Surveillance: new signals / records read. Duplicates: new proposals / pairs above the threshold.",
  "({n} en cola)": "({n} queued)",
  "Detalle": "Details",
};
