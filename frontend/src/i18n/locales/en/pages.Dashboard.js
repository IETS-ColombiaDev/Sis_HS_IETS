// src/pages/Dashboard.jsx — bandeja de trabajo (inicio).
export default {
  // Ayudas de los indicadores
  "Qué mide: señales capturadas que aún no se asignan a ningún ciclo. Cómo se calcula: tecnologías en estado 'capturada / no asignada'.":
    "What it measures: captured signals not yet assigned to any cycle. How it is calculated: technologies with the status 'captured / unassigned'.",
  "Qué mide: señales de la cola de cribado con puntaje alto. Cómo se calcula: señales con puntaje de cribado igual o mayor al umbral de Configuración › Cribado (0 a 100). Es una ayuda para ordenar, no el %P oficial.":
    "What it measures: signals in the screening queue with a high score. How it is calculated: signals with a screening score equal to or above the threshold in Settings › Screening (0 to 100). It is an aid for sorting, not the official %P.",
  "Qué mide: su trabajo pendiente en la matriz oficial. Cómo se calcula: tecnologías del ciclo activo aptas para priorización y no congeladas a las que les falta al menos uno de los criterios que su perfil califica.":
    "What it measures: your pending work in the official matrix. How it is calculated: technologies in the active cycle that are eligible for prioritization, not frozen, and missing at least one of the criteria your profile rates.",
  "Qué mide: tecnologías del ciclo activo que superaron el umbral de puntos y esperan pasar a evaluación. Cómo se calcula: estado 'priorizada'. El tablero estratégico suma además las que ya están en evaluación o publicadas.":
    "What it measures: technologies in the active cycle that passed the points threshold and are waiting to move on to assessment. How it is calculated: status 'prioritized'. The strategic dashboard also adds those already under assessment or published.",
  "Qué mide: tecnologías del ciclo activo que quedaron en observación (3 puntos). Cómo se calcula: estado 'bajo vigilancia'; se proponen para el ciclo siguiente al cerrar.":
    "What it measures: technologies in the active cycle that were left under observation (3 points). How it is calculated: status 'under surveillance'; they are proposed for the next cycle when this one closes.",
  "Tecnologías del ciclo activo, aptas para calificar y no congeladas, cuyo %P aún no se calcula porque falta al menos un criterio de P1 a P6.":
    "Technologies in the active cycle, eligible for rating and not frozen, whose %P has not been calculated yet because at least one criterion from P1 to P6 is missing.",
  "Lo que su perfil tiene por hacer hoy. Cada tarjeta dice qué cuenta, cómo se calcula (icono de ayuda) y lleva directo a la pantalla donde se resuelve.":
    "What your profile has to do today. Each card says what it counts and how it is calculated (help icon), and takes you straight to the screen where it is resolved.",
  "Señales sin procesar ordenadas por puntaje de cribado. Se omiten las que ya tienen desenlace (publicadas, excluidas, no priorizadas) o se fusionaron. Cada una lleva a la acción que le corresponde según su estado.":
    "Unprocessed signals sorted by screening score. Those that already have an outcome (published, excluded, not prioritized) or were merged are left out. Each one leads to the action that applies to its status.",

  // Tarjetas de pendientes
  "Por hacer": "To do",
  "Atención": "Attention",
  "Para leer": "To read",
  "Al día": "Up to date",
  "Cómo se calcula: {label}": "How it is calculated: {label}",
  "y {n} más": "and {n} more",

  // Última vigilancia
  "En curso": "In progress",
  "Completa": "Complete",
  "Con novedades": "With issues",
  "Con error": "With errors",
  "Última vigilancia": "Latest surveillance run",
  "{when} · lleva {span}": "{when} · running for {span}",
  "{when} · duró {span}": "{when} · took {span}",
  "Fuentes": "Sources",
  "Entraron": "Accessed",
  "Sin acceso": "No access",
  "Señales nuevas": "New signals",

  // Carga
  "No se pudo cargar la bandeja de trabajo": "Could not load the workbench",
  "No se pudieron cargar los indicadores": "Could not load the indicators",
  "No se pudieron cargar los pendientes del perfil": "Could not load the profile's pending tasks",
  "Cargando bandeja de trabajo...": "Loading workbench...",
  "No se pudo cargar la bandeja": "Could not load the workbench",
  "Revise su conexión e intente de nuevo.": "Check your connection and try again.",
  "Reintentar": "Retry",

  // Cabecera
  "Inicio##página": "Home",
  "Bandeja de trabajo": "Workbench",
  "Qué es la bandeja de trabajo": "What the workbench is",
  "Hola, {name}.": "Hello, {name}.",
  "Perfil {role}": "Profile {role}",
  "Ciclo en curso {code} ({status})": "Current cycle {code} ({status})",
  "Ejecutar vigilancia": "Run surveillance",
  "<b>No hay ciclo operativo abierto.</b> La priorización oficial P1 a P6 y el filtrado de novedad requieren un ciclo activo.":
    "<b>There is no open operating cycle.</b> The official P1 to P6 prioritization and the novelty screening require an active cycle.",
  "Crear ciclo": "Create cycle",
  "Ver ciclos": "View cycles",

  // Mis pendientes
  "Mis pendientes": "My pending tasks",
  "Qué son mis pendientes": "What my pending tasks are",
  "{n} tarea(s) por hacer para su perfil": "{n} task(s) to do for your profile",
  "Está al día: no tiene tareas pendientes para su perfil": "You are up to date: there are no pending tasks for your profile",
  "{n} aviso(s) que requieren atención": "{n} notice(s) that need attention",
  "Sin pendientes": "Nothing pending",
  "Su perfil no tiene tareas asignadas en el sistema. Puede consultar el tablero estratégico o los boletines.":
    "Your profile has no tasks assigned in the system. You can check the strategic dashboard or the bulletins.",

  // Indicadores
  "En bandeja de entrada": "In the inbox",
  "Sin asignar a ciclo": "Not assigned to a cycle",
  "Cribado alto": "High screening score",
  "Puntaje de {n} o más": "Score of {n} or higher",
  "Me toca calificar": "For me to rate",
  "Criterios {list}": "Criteria {list}",
  "Priorizadas por evaluar": "Prioritized, awaiting assessment",
  "Bajo vigilancia": "Under surveillance",
  "Sin ciclo activo": "No active cycle",
  "Ciclo en curso": "Current cycle",
  "{n} tecnología(s) sin %P completo": "{n} technology(ies) without a complete %P",
  "Qué es sin %P completo": "What “without a complete %P” means",
  "Gestionar ciclos": "Manage cycles",
  "Qué es {label}": "What {label} is",

  // Cola de trabajo
  "Ver todas ({n})": "View all ({n})",
  "Cola de trabajo": "Work queue",
  "Nueva": "New",
  "Revisada": "Reviewed",
  "Cola vacía": "Empty queue",
  "No hay señales pendientes. Ejecute la vigilancia de fuentes para detectar tecnologías emergentes.":
    "There are no pending signals. Run the source surveillance to detect emerging technologies.",
  "Fase 1 · Vigilancia": "Phase 1 · Surveillance",

  // Estado de vigilancia
  "Estado de vigilancia": "Surveillance status",
  "Fuentes vigiladas": "Sources under surveillance",
  "Señales últimos 7 días": "Signals in the last 7 days",
  "{nuevas} nuevas · {detectadas} detectadas": "{nuevas} new · {detectadas} detected",
  "Aún no hay escaneos registrados.": "No scans have been recorded yet.",
  "Ir a vigilancia de fuentes": "Go to source surveillance",
  "La vigilancia la ejecuta el equipo técnico; aquí ve su estado.":
    "Surveillance is run by the technical team; here you can see its status.",
};
