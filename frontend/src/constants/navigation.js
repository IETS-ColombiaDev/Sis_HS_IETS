import { GLOSSARY } from "./glossary";

/**
 * Mapa de navegacion: el menu lateral, la cabecera y el asistente de
 * navegacion leen de aqui. Una pantalla nueva se agrega una sola vez.
 */
export const NAV = [
  { section: "Operación diaria" },
  { to: "/", label: "Bandeja de trabajo", icon: "home", end: true, help: GLOSSARY.bandeja_trabajo },
  { to: "/ciclos", label: "Ciclos de escaneo", icon: "calendar", help: GLOSSARY.ciclo },
  { section: "Metodología IETS" },
  { to: "/vigilancia", label: "1. Vigilancia", icon: "radar", help: GLOSSARY.vigilancia },
  { to: "/fuentes", label: "Catálogo de fuentes", icon: "globe", help: GLOSSARY.catalogo_fuentes },
  { to: "/bandeja-entrada", label: "Bandeja de entrada", icon: "inbox", help: GLOSSARY.bandeja_entrada },
  { to: "/postulaciones", label: "Postulaciones", icon: "note", help: GLOSSARY.postulacion },
  { to: "/filtrado", label: "Filtrado y depuración", icon: "filter", help: GLOSSARY.filtrado },
  { to: "/priorizacion", label: "2. Priorización", icon: "layers", help: GLOSSARY.priorizacion },
  { to: "/evaluacion", label: "3. Evaluación", icon: "doc", help: GLOSSARY.evaluacion },
  { to: "/diseminacion", label: "4. Diseminación", icon: "bulb", help: GLOSSARY.diseminacion },
  { to: "/boletines", label: "Boletines del ciclo", icon: "book", help: GLOSSARY.boletin },
  { to: "/notas", label: "Notas del equipo", icon: "note", help: "Notas internas del equipo, vinculadas a señales, fuentes o informes. No son el informe público." },
  { section: "Análisis y alertas" },
  { to: "/dashboards", label: "Tablero estratégico", icon: "chart", help: GLOSSARY.tablero },
  { to: "/alertas", label: "Alertas tempranas", icon: "pulse", help: GLOSSARY.alertas },
  { to: "/senales", label: "Señales capturadas", icon: "list", help: GLOSSARY.senal },
  { to: "/chat", label: "Asistente IA", icon: "chat", help: GLOSSARY.minimax },
  { section: "Administración", permission: "config:manage" },
  { to: "/auditoria", label: "Bitácora de auditoría", icon: "shield", permission: "audit:read", help: GLOSSARY.bitacora },
  { to: "/configuracion", label: "Configuración", icon: "cog", permission: "config:manage", help: "Parámetros de la metodología, el modelo de IA y las llaves de las fuentes automáticas." },
  { to: "/usuarios", label: "Usuarios y perfiles", icon: "users", permission: "user:manage", help: GLOSSARY.rbac },
];

// Titulo de cada ruta (cabecera y pestaña del navegador).
export const TITLES = {
  "/": "Bandeja de trabajo",
  "/ciclos": "Ciclos de escaneo",
  "/dashboards": "Tablero estratégico",
  "/vigilancia": "Vigilancia",
  "/fuentes": "Catálogo de fuentes",
  "/bandeja-entrada": "Bandeja de entrada",
  "/postulaciones": "Postulaciones",
  "/filtrado": "Filtrado y depuración",
  "/senales": "Señales capturadas",
  "/priorizacion": "Priorización",
  "/evaluacion": "Evaluación temprana",
  "/diseminacion": "Diseminación",
  "/boletines": "Boletines del ciclo",
  "/alertas": "Alertas tempranas",
  "/notas": "Notas del equipo",
  "/chat": "Asistente IA",
  "/auditoria": "Bitácora de auditoría",
  "/usuarios": "Usuarios y perfiles",
  "/configuracion": "Configuración",
};

/** Seccion del menu a la que pertenece una ruta (para la miga de pan). */
export function sectionFor(pathname) {
  let section = "";
  for (const item of NAV) {
    if (item.section) section = item.section;
    else if (item.to === pathname) return section;
  }
  return "";
}

/** Nombre corto de la pantalla, sin el numero de fase. */
export function screenLabel(pathname) {
  const item = NAV.find((n) => n.to === pathname);
  return TITLES[pathname] || item?.label?.replace(/^\d+\.\s*/, "") || "";
}

/**
 * Base de conocimiento del asistente de navegacion. Cada entrada responde
 * "como hago X": donde se hace, los pasos y quien puede hacerlo. `keys` son
 * palabras que la gente usa para preguntarlo (sin tildes, en minuscula).
 */
export const HOWTO = [
  {
    id: "vigilancia",
    title: "Ejecutar la vigilancia (capturar señales nuevas)",
    to: "/vigilancia",
    perm: "scan:run",
    keys: ["vigilancia", "escanear", "escaneo", "capturar", "buscar tecnologias", "rastrear", "ejecutar", "nuevas senales", "scan"],
    steps: [
      "Abra 1. Vigilancia en el menú.",
      "Pulse «Ejecutar vigilancia» para recorrer todas las fuentes activas, o «Rastrear» en una sola fuente.",
      "Las señales nuevas llegan a la Bandeja de entrada para clasificarlas.",
    ],
  },
  {
    id: "fuente-nueva",
    title: "Agregar o editar una fuente",
    to: "/fuentes",
    perm: "source:write",
    keys: ["fuente", "agregar fuente", "nueva fuente", "sitio", "url", "alta rapida", "catalogo", "rss", "editar fuente"],
    steps: [
      "Abra Catálogo de fuentes.",
      "«Alta rápida» registra solo con la URL; «Agregar fuente» abre el formulario completo (adaptador, nivel, flujo de escaneo).",
      "Use «Vista previa» para comprobar qué lee el sistema antes de guardar.",
    ],
  },
  {
    id: "salud-fuentes",
    title: "Revisar si las fuentes funcionan (sonda de salud)",
    to: "/fuentes",
    perm: "source:write",
    keys: ["sonda", "salud", "fuente caida", "rojo", "ambar", "403", "bloquea", "no funciona fuente", "sondear"],
    steps: [
      "Abra Catálogo de fuentes y la pestaña «Salud de fuentes».",
      "«Sondear A/B» prueba las fuentes principales; «Sonda» o «Repetir sonda» prueba una sola.",
      "Verde = funciona (o usa una ruta de respaldo); ámbar = revise la URL; rojo = sin acceso.",
    ],
  },
  {
    id: "clasificar",
    title: "Clasificar una señal de la bandeja de entrada",
    to: "/bandeja-entrada",
    perm: "technology:write",
    keys: ["clasificar", "cluster", "tipologia", "bandeja de entrada", "staging", "sin clasificar", "sugerir clasificacion"],
    steps: [
      "Abra Bandeja de entrada y pulse «Clasificar» en la fila.",
      "Revise el origen: «Abrir fuente original», «Ver JSON original» y «¿Es confiable? Analizar con IA».",
      "Elija clúster y tipología (o «Sugerir clasificación») y pulse «Guardar clasificación».",
    ],
  },
  {
    id: "confiable",
    title: "Saber si una señal es confiable",
    to: "/bandeja-entrada",
    perm: "technology:write",
    keys: ["confiable", "confiabilidad", "fiable", "verificar", "falsa", "json", "url original", "origen", "crudo"],
    steps: [
      "En Bandeja de entrada pulse «Clasificar» (o «Editar») en la señal.",
      "En «Origen de la señal» pulse «¿Es confiable? Analizar con IA».",
      "Lea el veredicto, las alertas y «Qué verificar»; despliegue los chequeos automáticos si quiere el detalle.",
    ],
  },
  {
    id: "asignar",
    title: "Pasar señales al ciclo",
    to: "/bandeja-entrada",
    perm: "staging:assign",
    keys: ["asignar", "pasar al ciclo", "al ciclo", "meter al ciclo", "arrastrar", "mover al ciclo", "lote", "entrar al ciclo"],
    steps: [
      "Elija el ciclo en el selector de la cabecera.",
      "En Bandeja de entrada marque las señales clasificadas.",
      "Pulse «Asignar al ciclo» y confirme. Las que no tienen clúster y tipología quedan fuera.",
    ],
  },
  {
    id: "ciclo",
    title: "Crear, abrir o cerrar un ciclo",
    to: "/ciclos",
    perm: "cycle:write",
    keys: ["ciclo", "crear ciclo", "nuevo ciclo", "cerrar ciclo", "consolidar", "cambiar estado ciclo", "corte"],
    steps: [
      "Abra Ciclos de escaneo y pulse «Nuevo ciclo».",
      "Avance el estado con los botones de transición (filtrado → priorización → evaluación).",
      "«Cerrar y consolidar» congela los puntajes; solo el superadministrador puede hacerlo.",
    ],
  },
  {
    id: "cambiar-ciclo",
    title: "Cambiar el ciclo que veo en pantalla",
    to: null,
    keys: ["cambiar ciclo", "otro ciclo", "ciclo en pantalla", "ciclo historico", "seleccionar ciclo"],
    steps: [
      "Use el selector de ciclo de la cabecera (el botón con el calendario).",
      "Elija un ciclo abierto o uno histórico; todas las pantallas se ajustan a ese ciclo.",
    ],
  },
  {
    id: "postulaciones",
    title: "Moderar postulaciones externas",
    to: "/postulaciones",
    perm: "technology:write",
    keys: ["postulacion", "postulaciones", "moderar", "aceptar", "rechazar", "fabricante", "formulario publico", "reactiva"],
    steps: [
      "Abra Postulaciones; la pestaña «Por moderar» muestra las pendientes.",
      "Pulse «Revisar y decidir», lea el conflicto de interés y acepte o rechace.",
      "«Copiar enlace del formulario» le da el enlace público para compartir.",
    ],
  },
  {
    id: "filtrado",
    title: "Quitar duplicados y verificar novedad (INVIMA)",
    to: "/filtrado",
    perm: "screening:write",
    keys: ["duplicado", "fusionar", "fusion", "invima", "novedad", "registro sanitario", "filtrar", "barrido", "listado unico", "apta"],
    steps: [
      "Abra Filtrado y depuración.",
      "Pestaña «Duplicados»: «Ejecutar barrido» y confirme o descarte las fusiones.",
      "Pestaña «Novedad y registro sanitario»: «Cruzar con el INVIMA», guarde el criterio y «Marcar apta para priorización».",
    ],
  },
  {
    id: "excluir",
    title: "Excluir una tecnología del ciclo",
    to: "/filtrado",
    perm: "screening:write",
    keys: ["excluir", "descartar", "sacar", "eliminar del ciclo"],
    steps: [
      "En Filtrado y depuración o en 2. Priorización pulse «Excluir».",
      "Elija la causa tipificada y deje una nota. La exclusión queda en la bitácora.",
    ],
  },
  {
    id: "priorizar",
    title: "Calificar P1 a P6 (priorización)",
    to: "/priorizacion",
    perm: "technology:write",
    keys: ["priorizar", "calificar", "p1", "p2", "p3", "p4", "p5", "p6", "criterios", "puntaje", "%p", "matriz"],
    steps: [
      "Abra 2. Priorización; «Solo lo que me toca» filtra lo de su perfil.",
      "Elija una tecnología de la cola y responda Sí o No en cada criterio (justifique si se pide).",
      "Al completar los seis, el sistema asigna el estado: priorizada (4-6), bajo vigilancia (3) o no priorizada.",
    ],
  },
  {
    id: "evaluacion",
    title: "Redactar el expediente o informe de evaluación",
    to: "/evaluacion",
    perm: "report:write",
    keys: ["expediente", "informe", "evaluacion", "ficha", "mini hta", "redactar", "borrador"],
    steps: [
      "Abra 3. Evaluación y pulse «Abrir expediente» en una tecnología priorizada.",
      "Complete las secciones y «Guardar».",
      "Envíe a revisión interna; luego el ciclo pasa a revisión externa, comité y publicación.",
    ],
  },
  {
    id: "revisor",
    title: "Invitar a un revisor externo",
    to: "/evaluacion",
    perm: "cycle:write",
    keys: ["revisor", "revision externa", "pares", "invitacion", "invitar", "enlace revisor"],
    steps: [
      "En 3. Evaluación abra el expediente en revisión externa.",
      "Pulse «Generar invitación» y comparta el enlace; el revisor no necesita cuenta.",
      "«Revocar» anula una invitación. Las observaciones vuelven al expediente.",
    ],
  },
  {
    id: "pdf",
    title: "Descargar en PDF o exportar",
    to: "/evaluacion",
    perm: null,
    keys: ["pdf", "descargar", "exportar", "imprimir", "html", "zip", "csv"],
    steps: [
      "Expediente: en 3. Evaluación, «Descargar PDF» o «Exportar HTML institucional».",
      "Informes: en 4. Diseminación, «Descargar ZIP». Notas: «Descargar CSV».",
      "Listado Único: en Filtrado, «Exportar CSV».",
    ],
  },
  {
    id: "diseminar",
    title: "Publicar informes y difundir",
    to: "/diseminacion",
    perm: "report:write",
    keys: ["diseminar", "difundir", "publicar", "informe publico", "recomendacion", "generar informe"],
    steps: [
      "Abra 4. Diseminación.",
      "«Nuevo informe» o «Generar desde una señal» (con IA); edite y guarde.",
      "Lo publicado aparece en la ficha pública de expedientes.",
    ],
  },
  {
    id: "boletin",
    title: "Compilar y publicar el boletín del ciclo",
    to: "/boletines",
    perm: "cycle:write",
    keys: ["boletin", "compilar", "resumen ejecutivo", "minsalud"],
    steps: [
      "Abra Boletines del ciclo y pulse «Compilar desde el ciclo».",
      "Revise, apruebe y pulse «Publicar».",
    ],
  },
  {
    id: "tablero",
    title: "Ver indicadores y gráficos del ciclo",
    to: "/dashboards",
    perm: null,
    keys: ["tablero", "indicadores", "graficos", "estadisticas", "dashboard", "embudo", "presupuesto", "kpi"],
    steps: [
      "Abra Tablero estratégico.",
      "Filtre por ciclo, clúster o tipología; haga clic en barras y etapas para profundizar.",
    ],
  },
  {
    id: "alertas",
    title: "Revisar alertas tempranas",
    to: "/alertas",
    perm: null,
    keys: ["alerta", "alertas", "aviso", "notificacion", "suscripcion"],
    steps: ["Abra Alertas tempranas; «Marcar leída» o «Marcar todas como leídas».", "Active suscripciones por correo por clúster."],
  },
  {
    id: "senales",
    title: "Buscar una señal o tecnología capturada",
    to: "/senales",
    perm: null,
    keys: ["buscar", "senal", "senales", "hallazgo", "tecnologia", "encontrar"],
    steps: ["Abra Señales capturadas y use el buscador y los filtros.", "«Ver» abre el detalle; «Informe» genera un análisis con IA."],
  },
  {
    id: "notas",
    title: "Dejar una nota para el equipo",
    to: "/notas",
    perm: "note:write",
    keys: ["nota", "notas", "comentario", "apunte"],
    steps: ["Abra Notas del equipo y pulse «Nueva nota».", "Vincúlela a una señal, fuente o informe; puede fijarla arriba."],
  },
  {
    id: "chat-ia",
    title: "Preguntar a la IA sobre las tecnologías registradas",
    to: "/chat",
    perm: null,
    keys: ["preguntar", "ia", "chat", "asistente ia", "conversar", "minimax"],
    steps: ["Abra Asistente IA y escriba su pregunta; responde con lo que hay en el sistema."],
  },
  {
    id: "usuarios",
    title: "Crear usuarios o cambiar perfiles",
    to: "/usuarios",
    perm: "user:manage",
    keys: ["usuario", "usuarios", "perfil", "rol", "permiso", "crear usuario", "desbloquear", "contrasena de otro"],
    steps: ["Abra Usuarios y perfiles y pulse «+ Nuevo usuario».", "Elija el perfil; «Editar», «Desbloquear» o «Restablecer» desde la fila."],
  },
  {
    id: "configuracion-ia",
    title: "Configurar la IA (MiniMax)",
    to: "/configuracion",
    perm: "config:manage",
    keys: ["configurar ia", "token", "llave", "minimax", "modelo", "api key", "ia sin configurar"],
    steps: ["Abra Configuración, pestaña «Integración con IA».", "Pegue la llave, «Detectar mejor modelo» y «Guardar IA»."],
  },
  {
    id: "copia",
    title: "Copias de seguridad y Firebase",
    to: "/configuracion",
    perm: "config:manage",
    keys: ["copia", "respaldo", "backup", "firebase", "restaurar", "guardado aqui"],
    steps: ["Abra Configuración, pestaña «Persistencia (Firebase)».", "Ahí ve la copia en la nube y la copia local del navegador."],
  },
  {
    id: "auditoria",
    title: "Ver quién cambió algo (bitácora)",
    to: "/auditoria",
    perm: "audit:read",
    keys: ["bitacora", "auditoria", "quien cambio", "historial", "cambios", "log"],
    steps: ["Abra Bitácora de auditoría y filtre por entidad, acción o usuario.", "«Vida» muestra toda la historia de un registro."],
  },
  {
    id: "contrasena",
    title: "Cambiar mi contraseña o cerrar sesión",
    to: null,
    keys: ["contrasena", "password", "clave", "cerrar sesion", "salir"],
    steps: ["Pulse su nombre arriba a la derecha.", "Elija «Cambiar contraseña» o «Cerrar sesión»."],
  },
  {
    id: "guia",
    title: "Ver la guía rápida del sistema",
    to: null,
    keys: ["guia", "tutorial", "como funciona", "empezar", "ayuda", "inicio", "roles", "quien hace que"],
    steps: ["Pulse «Guía» en la cabecera.", "Recorre las fases, los perfiles y cómo se pasan el trabajo."],
  },
  {
    id: "pendientes",
    title: "Ver lo que tengo pendiente",
    to: "/",
    perm: null,
    keys: ["pendiente", "pendientes", "tareas", "que hago", "por hacer", "mi trabajo", "hoy"],
    steps: ["Abra Bandeja de trabajo: «Mis pendientes» lista lo que toca a su perfil, con el botón para ir a resolverlo."],
  },
];

/** Normaliza texto para comparar sin tildes ni mayusculas. */
export function fold(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set("como donde que hago puedo para el la los las un una de del en y o a me mi se lo al por con quiero necesito hacer veo esta este".split(" "));

// Palabras que aparecen en casi todo: cuentan poco para decidir la respuesta.
const GENERIC = new Set(["senal", "senales", "tecnologia", "ciclo", "buscar", "ia", "ayuda", "inicio", "ejecutar"]);

// Raiz corta: "clasifico", "clasificar" y "clasificacion" comparten "clasif".
const stem = (w) => w.slice(0, Math.min(6, Math.max(4, w.length - 2)));

/** Respuestas locales (sin IA): las entradas que mejor coinciden con la pregunta. */
export function matchHowto(question, { limit = 3 } = {}) {
  const q = fold(question);
  if (!q) return [];
  const words = q.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  const stems = new Set(words.filter((w) => w.length >= 5).map(stem));
  const scored = HOWTO.map((h) => {
    let score = 0;
    for (const k of h.keys) {
      if (q.includes(k)) score += k.includes(" ") ? 6 : GENERIC.has(k) ? 1 : 4;
      else if (!k.includes(" ") && k.length >= 5 && stems.has(stem(k))) score += 3;
    }
    const hay = fold(`${h.title} ${h.keys.join(" ")}`);
    for (const w of words) {
      if (hay.includes(w)) score += 1;
      else if (w.length > 4 && hay.includes(w.slice(0, -1))) score += 0.5;
    }
    return { h, score };
  })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.h);
}

/** Preguntas sugeridas segun la pantalla en la que esta la persona. */
export const SUGGESTED = {
  "/": ["¿Qué tengo pendiente?", "¿Cómo ejecuto la vigilancia?", "¿Cómo cambio de ciclo?"],
  "/vigilancia": ["¿Cómo ejecuto la vigilancia?", "¿Por qué una fuente sale en rojo?", "¿Dónde quedan las señales?"],
  "/fuentes": ["¿Cómo agrego una fuente?", "¿Qué significa la sonda ámbar?", "¿Cómo pruebo una fuente?"],
  "/bandeja-entrada": ["¿Cómo clasifico una señal?", "¿Cómo sé si es confiable?", "¿Cómo la paso al ciclo?"],
  "/postulaciones": ["¿Cómo modero una postulación?", "¿Dónde está el formulario público?"],
  "/filtrado": ["¿Cómo fusiono duplicados?", "¿Cómo cruzo con el INVIMA?", "¿Cómo excluyo una tecnología?"],
  "/priorizacion": ["¿Cómo califico P1 a P6?", "¿Qué criterios me tocan?", "¿Qué pasa al completar los seis?"],
  "/evaluacion": ["¿Cómo abro un expediente?", "¿Cómo invito a un revisor externo?", "¿Cómo descargo el PDF?"],
  "/diseminacion": ["¿Cómo genero un informe con IA?", "¿Dónde se publica?"],
  "/boletines": ["¿Cómo compilo el boletín?"],
  "/ciclos": ["¿Cómo creo un ciclo?", "¿Cómo cierro el ciclo?"],
  "/configuracion": ["¿Cómo configuro la IA?", "¿Dónde están las copias de seguridad?"],
  "/usuarios": ["¿Cómo creo un usuario?", "¿Qué hace cada perfil?"],
};
