// src/components/ToolGuide.jsx: acordeón «qué es y cómo funciona la herramienta».
export default {
  "¿Qué es esta herramienta?": "What is this tool?",
  "Es el <b>Sistema de Escaneo de Horizonte del IETS</b>: una plataforma de alerta temprana que vigila fuentes internacionales y nacionales para detectar <b>tecnologías sanitarias emergentes</b> (medicamentos, dispositivos, salud digital) y generar <b>recomendaciones de adopción para Colombia</b>.":
    "It is the <b>IETS Horizon Scanning System</b>: an early-warning platform that monitors international and national sources to detect <b>emerging health technologies</b> (medicines, devices, digital health) and produce <b>adoption recommendations for Colombia</b>.",

  "¿Cómo funciona?": "How does it work?",
  "<b>Fuentes</b> - listado maestro de URLs y documentos vigilados.":
    "<b>Sources</b> - master list of monitored URLs and documents.",
  "<b>Vigilancia</b> - conectores de API y rastreo HTML/PDF consultan cada fuente, a mano o de forma programada.":
    "<b>Surveillance</b> - API connectors and HTML/PDF crawling query each source, manually or on a schedule.",
  "<b>Señales</b> - tecnologías capturadas, clasificadas por tipo, horizonte y estado de triage.":
    "<b>Signals</b> - captured technologies, classified by type, horizon and triage status.",
  "<b>Diseminación</b> - recomendaciones de adopción para Colombia (IA como borrador) y paquete ZIP por ciclo.":
    "<b>Dissemination</b> - adoption recommendations for Colombia (AI as a draft) and a ZIP package per cycle.",
  "<b>Notas del equipo</b> - observaciones editables, descargables y mejorables con IA.":
    "<b>Team notes</b> - comments that can be edited, downloaded and improved with AI.",
  "<b>Dashboards</b> - gráficas que se actualizan en tiempo real cuando hay cambios.":
    "<b>Dashboards</b> - charts that update in real time when there are changes.",

  "¿De dónde salen las fuentes?": "Where do the sources come from?",
  "El inventario inicial proviene del <b>Excel de escaneo de horizonte del IETS</b> (NIHR Innovation Observatory, productos IETS, MinSalud, referentes internacionales). Puede <b>agregar más URLs</b> en modo rápido (nombre + enlace) o modo avanzado (categoría, descripción, metadatos). Todas quedan en el listado maestro de Fuentes.":
    "The initial inventory comes from the <b>IETS horizon scanning Excel workbook</b> (NIHR Innovation Observatory, IETS products, MinSalud, international benchmarks). You can <b>add more URLs</b> in quick mode (name + link) or advanced mode (category, description, metadata). They are all kept in the Sources master list.",

  "Inteligencia artificial (MiniMax, con Gemini de respaldo)": "Artificial intelligence (MiniMax, with Gemini as fallback)",
  "Con una <b>llave de MiniMax</b> (o Gemini) configurada en Configuración (solo superadministrador), la IA funciona al 100%: genera recomendaciones de adopción, responde en el chat con contexto del sistema, enriquece señales y mejora notas del equipo. Sin llave, el sistema sigue operando con datos del escaneo y respuestas preliminares.":
    "With a <b>MiniMax key</b> (or Gemini) set up in Settings (superadministrator only), the AI works at 100%: it generates adoption recommendations, answers in the chat with context from the system, enriches signals and improves team notes. Without a key, the system keeps operating with scanning data and preliminary answers.",

  "Notas y comentarios del equipo": "Team notes and comments",
  "En <b>Notas</b> o dentro de cada señal, fuente o informe puede <b>comentar</b>, <b>editar</b>, <b>fijar</b> (📌) y <b>descargar</b> todas las notas en CSV. Los editores pueden pulir una nota con el botón <b>Mejorar con IA</b>.":
    "In <b>Notes</b> or inside each signal, source or report you can <b>comment</b>, <b>edit</b>, <b>pin</b> (📌) and <b>download</b> all the notes as CSV. Editors can polish a note with the <b>Improve with AI</b> button.",

  "Tiempo real": "Real time",
  "El indicador <b>En vivo</b> en la barra superior confirma que los datos se comparten al instante. Escaneos, hallazgos, notas y gráficas se refrescan automáticamente cada pocos segundos para todo el equipo.":
    "The <b>Live</b> indicator in the top bar confirms that data is shared instantly. Scans, findings, notes and charts refresh automatically every few seconds for the whole team.",
};
