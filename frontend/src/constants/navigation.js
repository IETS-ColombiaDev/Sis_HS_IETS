import { GLOSSARY } from "./glossary";
import { t } from "../i18n";

/**
 * Mapa de navegacion: el menu lateral, la cabecera y el asistente de
 * navegacion leen de aqui. Una pantalla nueva se agrega una sola vez.
 */
export const NAV = [
  { section: t("Inicio##menú") },
  { to: "/", label: t("Bandeja de trabajo"), icon: "home", end: true, help: GLOSSARY.bandeja_trabajo },
  { to: "/ciclos", label: t("Ciclos de escaneo"), icon: "calendar", help: GLOSSARY.ciclo },
  { to: "/notas", label: t("Notas del equipo"), icon: "note", help: t("Notas internas del equipo, vinculadas a señales, fuentes o informes. No son el informe público.") },
  // Las cuatro fases, en el orden de la metodologia. `sub` marca las pantallas
  // que pertenecen a la fase de arriba, en el orden en que se usan.
  { section: t("Metodología IETS") },
  { to: "/vigilancia", label: t("1. Vigilancia"), icon: "radar", help: GLOSSARY.vigilancia },
  { to: "/fuentes", label: t("Catálogo de fuentes"), icon: "globe", sub: true, help: GLOSSARY.catalogo_fuentes },
  { to: "/senales", label: t("Señales capturadas"), icon: "list", sub: true, help: GLOSSARY.senal },
  { to: "/bandeja-entrada", label: t("Bandeja de entrada"), icon: "inbox", sub: true, help: GLOSSARY.bandeja_entrada },
  { to: "/postulaciones", label: t("Postulaciones"), icon: "note", sub: true, help: GLOSSARY.postulacion },
  { to: "/filtrado", label: t("Filtrado y depuración"), icon: "filter", sub: true, help: GLOSSARY.filtrado },
  { to: "/priorizacion", label: t("2. Priorización"), icon: "layers", help: GLOSSARY.priorizacion },
  { to: "/evaluacion", label: t("3. Evaluación"), icon: "doc", help: GLOSSARY.evaluacion },
  { to: "/diseminacion", label: t("4. Diseminación"), icon: "bulb", help: GLOSSARY.diseminacion },
  { to: "/boletines", label: t("Boletines del ciclo"), icon: "book", sub: true, help: GLOSSARY.boletin },
  { section: t("Análisis y seguimiento") },
  { to: "/dashboards", label: t("Tablero estratégico"), icon: "chart", help: GLOSSARY.tablero },
  { to: "/alertas", label: t("Alertas tempranas"), icon: "pulse", help: GLOSSARY.alertas },
  { to: "/chat", label: t("Asistente IA"), icon: "chat", help: GLOSSARY.minimax },
  { section: t("Administración"), permission: "config:manage" },
  { to: "/configuracion", label: t("Configuración"), icon: "cog", permission: "config:manage", help: t("Metodología, fuentes y vigilancia, inteligencia artificial y respaldo de datos.") },
  { to: "/usuarios", label: t("Usuarios y perfiles"), icon: "users", permission: "user:manage", help: GLOSSARY.rbac },
  { to: "/auditoria", label: t("Bitácora de auditoría"), icon: "shield", permission: "audit:read", help: GLOSSARY.bitacora },
];

// Titulo de cada ruta (cabecera y pestaña del navegador).
export const TITLES = {
  "/": t("Bandeja de trabajo"),
  "/ciclos": t("Ciclos de escaneo"),
  "/dashboards": t("Tablero estratégico"),
  "/vigilancia": t("Vigilancia"),
  "/fuentes": t("Catálogo de fuentes"),
  "/bandeja-entrada": t("Bandeja de entrada"),
  "/postulaciones": t("Postulaciones"),
  "/filtrado": t("Filtrado y depuración"),
  "/senales": t("Señales capturadas"),
  "/priorizacion": t("Priorización"),
  "/evaluacion": t("Evaluación temprana"),
  "/diseminacion": t("Diseminación"),
  "/boletines": t("Boletines del ciclo"),
  "/alertas": t("Alertas tempranas"),
  "/notas": t("Notas del equipo"),
  "/chat": t("Asistente IA"),
  "/auditoria": t("Bitácora de auditoría"),
  "/usuarios": t("Usuarios y perfiles"),
  "/configuracion": t("Configuración"),
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
    title: t("Ejecutar la vigilancia (capturar señales nuevas)"),
    to: "/vigilancia",
    perm: "scan:run",
    keys: t("vigilancia, escanear, escaneo, capturar, buscar tecnologias, rastrear, ejecutar, nuevas senales, scan").split(", "),
    steps: [
      t("Abra 1. Vigilancia en el menú."),
      t("Pulse «Ejecutar vigilancia» para recorrer todas las fuentes activas, o «Rastrear» en una sola fuente."),
      t("Las señales nuevas llegan a la Bandeja de entrada para clasificarlas."),
    ],
  },
  {
    id: "fuente-nueva",
    title: t("Agregar o editar una fuente"),
    to: "/fuentes",
    perm: "source:write",
    keys: t("fuente, agregar fuente, nueva fuente, sitio, url, alta rapida, catalogo, rss, editar fuente").split(", "),
    steps: [
      t("Abra Catálogo de fuentes."),
      t("En «Agregar fuente»: «Alta rápida» registra solo con la URL y «Registro completo» abre el formulario (adaptador, nivel, flujo de escaneo)."),
      t("Use «Vista previa» para comprobar qué lee el sistema antes de guardar."),
    ],
  },
  {
    id: "salud-fuentes",
    title: t("Revisar si las fuentes funcionan (sonda de salud)"),
    to: "/fuentes",
    perm: "source:write",
    keys: t("sonda, salud, fuente caida, rojo, ambar, 403, bloquea, no funciona fuente, sondear").split(", "),
    steps: [
      t("Abra Catálogo de fuentes y la pestaña «Salud de fuentes»."),
      t("En «Mantenimiento», «Sondear todas» prueba el inventario completo en segundo plano (o «Solo A/B» las principales); «Sonda» o «Repetir sonda» prueba una sola."),
      t("Verde = funciona (o usa una ruta de respaldo); ámbar = revise la URL; rojo = sin acceso."),
    ],
  },
  {
    id: "clasificar",
    title: t("Clasificar una señal de la bandeja de entrada"),
    to: "/bandeja-entrada",
    perm: "technology:write",
    keys: t("clasificar, cluster, tipologia, bandeja de entrada, staging, sin clasificar, sugerir clasificacion").split(", "),
    steps: [
      t("Abra Bandeja de entrada y pulse «Clasificar» en la fila."),
      t("Revise el origen: «Abrir fuente original», «Ver JSON original» y «¿Es confiable? Analizar con IA»."),
      t("Elija clúster y tipología (o «Sugerir clasificación») y pulse «Guardar clasificación»."),
    ],
  },
  {
    id: "confiable",
    title: t("Saber si una señal es confiable"),
    to: "/bandeja-entrada",
    perm: "technology:write",
    keys: t("confiable, confiabilidad, fiable, verificar, falsa, json, url original, origen, crudo").split(", "),
    steps: [
      t("En Bandeja de entrada pulse «Clasificar» (o «Editar») en la señal."),
      t("En «Origen de la señal» pulse «¿Es confiable? Analizar con IA»."),
      t("Lea el veredicto, las alertas y «Qué verificar»; despliegue los chequeos automáticos si quiere el detalle."),
    ],
  },
  {
    id: "asignar",
    title: t("Pasar señales al ciclo"),
    to: "/bandeja-entrada",
    perm: "staging:assign",
    keys: t("asignar, pasar al ciclo, al ciclo, meter al ciclo, arrastrar, mover al ciclo, lote, entrar al ciclo").split(", "),
    steps: [
      t("Elija el ciclo en el selector de la cabecera."),
      t("En Bandeja de entrada marque las señales clasificadas."),
      t("Pulse «Asignar al ciclo» y confirme. Las que no tienen clúster y tipología quedan fuera."),
    ],
  },
  {
    id: "ciclo",
    title: t("Crear, abrir o cerrar un ciclo"),
    to: "/ciclos",
    perm: "cycle:write",
    keys: t("ciclo, crear ciclo, nuevo ciclo, cerrar ciclo, consolidar, cambiar estado ciclo, corte").split(", "),
    steps: [
      t("Abra Ciclos de escaneo y pulse «Nuevo ciclo»."),
      t("Avance el estado con los botones de transición (filtrado → priorización → evaluación)."),
      t("«Cerrar y consolidar» congela los puntajes; solo el superadministrador puede hacerlo."),
    ],
  },
  {
    id: "cambiar-ciclo",
    title: t("Cambiar el ciclo que veo en pantalla"),
    to: null,
    keys: t("cambiar ciclo, otro ciclo, ciclo en pantalla, ciclo historico, seleccionar ciclo").split(", "),
    steps: [
      t("Use el selector de ciclo de la cabecera (el botón con el calendario)."),
      t("Elija un ciclo abierto o uno histórico; todas las pantallas se ajustan a ese ciclo."),
    ],
  },
  {
    id: "postulaciones",
    title: t("Moderar postulaciones externas"),
    to: "/postulaciones",
    perm: "technology:write",
    keys: t("postulacion, postulaciones, moderar, aceptar, rechazar, fabricante, formulario publico, reactiva").split(", "),
    steps: [
      t("Abra Postulaciones; la pestaña «Por moderar» muestra las pendientes."),
      t("Pulse «Revisar y decidir», lea el conflicto de interés y acepte o rechace."),
      t("«Copiar enlace del formulario» le da el enlace público para compartir."),
    ],
  },
  {
    id: "filtrado",
    title: t("Quitar duplicados y verificar novedad (INVIMA)"),
    to: "/filtrado",
    perm: "screening:write",
    keys: t("duplicado, fusionar, fusion, invima, novedad, registro sanitario, filtrar, barrido, listado unico, apta").split(", "),
    steps: [
      t("Abra Filtrado y depuración."),
      t("Pestaña «Duplicados»: «Ejecutar barrido» y confirme o descarte las fusiones."),
      t("Pestaña «Novedad y registro sanitario»: «Cruzar con el INVIMA», guarde el criterio y «Marcar apta para priorización»."),
    ],
  },
  {
    id: "excluir",
    title: t("Excluir una tecnología del ciclo"),
    to: "/filtrado",
    perm: "screening:write",
    keys: t("excluir, descartar, sacar, eliminar del ciclo").split(", "),
    steps: [
      t("En Filtrado y depuración o en 2. Priorización pulse «Excluir»."),
      t("Elija la causa tipificada y deje una nota. La exclusión queda en la bitácora."),
    ],
  },
  {
    id: "priorizar",
    title: t("Calificar P1 a P6 (priorización)"),
    to: "/priorizacion",
    perm: "technology:write",
    keys: t("priorizar, calificar, p1, p2, p3, p4, p5, p6, criterios, puntaje, %p, matriz").split(", "),
    steps: [
      t("Abra 2. Priorización; «Solo lo que me toca» filtra lo de su perfil."),
      t("Elija una tecnología de la cola y responda Sí o No en cada criterio (justifique si se pide)."),
      t("Al completar los seis, el sistema asigna el estado: priorizada (4-6), bajo vigilancia (3) o no priorizada."),
    ],
  },
  {
    id: "evaluacion",
    title: t("Redactar el expediente o informe de evaluación"),
    to: "/evaluacion",
    perm: "report:write",
    keys: t("expediente, informe, evaluacion, ficha, mini hta, redactar, borrador").split(", "),
    steps: [
      t("Abra 3. Evaluación y pulse «Abrir expediente» en una tecnología priorizada."),
      t("Complete las secciones y «Guardar»."),
      t("Envíe a revisión interna; luego el ciclo pasa a revisión externa, comité y publicación."),
    ],
  },
  {
    id: "revisor",
    title: t("Invitar a un revisor externo"),
    to: "/evaluacion",
    perm: "cycle:write",
    keys: t("revisor, revision externa, pares, invitacion, invitar, enlace revisor").split(", "),
    steps: [
      t("En 3. Evaluación abra el expediente en revisión externa."),
      t("Pulse «Generar invitación» y comparta el enlace; el revisor no necesita cuenta."),
      t("«Revocar» anula una invitación. Las observaciones vuelven al expediente."),
    ],
  },
  {
    id: "pdf",
    title: t("Descargar en PDF o exportar"),
    to: "/evaluacion",
    perm: null,
    keys: t("pdf, descargar, exportar, imprimir, html, zip, csv").split(", "),
    steps: [
      t("Expediente: en 3. Evaluación, «Descargar PDF» o «Exportar HTML institucional»."),
      t("Informes: en 4. Diseminación, «Descargar ZIP». Notas: «Descargar CSV»."),
      t("Listado Único: en Filtrado, «Exportar CSV»."),
    ],
  },
  {
    id: "diseminar",
    title: t("Publicar informes y difundir"),
    to: "/diseminacion",
    perm: "report:write",
    keys: t("diseminar, difundir, publicar, informe publico, recomendacion, generar informe").split(", "),
    steps: [
      t("Abra 4. Diseminación."),
      t("«Nuevo informe» o «Generar desde una señal» (con IA); edite y guarde."),
      t("Lo publicado aparece en la ficha pública de expedientes."),
    ],
  },
  {
    id: "boletin",
    title: t("Compilar y publicar el boletín del ciclo"),
    to: "/boletines",
    perm: "cycle:write",
    keys: t("boletin, compilar, resumen ejecutivo, minsalud").split(", "),
    steps: [
      t("Abra Boletines del ciclo y pulse «Compilar desde el ciclo»."),
      t("Revise, apruebe y pulse «Publicar»."),
    ],
  },
  {
    id: "tablero",
    title: t("Ver indicadores y gráficos del ciclo"),
    to: "/dashboards",
    perm: null,
    keys: t("tablero, indicadores, graficos, estadisticas, dashboard, embudo, presupuesto, kpi").split(", "),
    steps: [
      t("Abra Tablero estratégico."),
      t("Filtre por ciclo, clúster o tipología; haga clic en barras y etapas para profundizar."),
    ],
  },
  {
    id: "alertas",
    title: t("Revisar alertas tempranas"),
    to: "/alertas",
    perm: null,
    keys: t("alerta, alertas, aviso, notificacion, suscripcion").split(", "),
    steps: [t("Abra Alertas tempranas; «Marcar leída» o «Marcar todas como leídas»."), t("Active suscripciones por correo por clúster.")],
  },
  {
    id: "senales",
    title: t("Buscar una señal o tecnología capturada"),
    to: "/senales",
    perm: null,
    keys: t("buscar, senal, senales, hallazgo, tecnologia, encontrar").split(", "),
    steps: [t("Abra Señales capturadas y use el buscador y los filtros."), t("«Ver» abre el detalle; «Informe» genera un análisis con IA.")],
  },
  {
    id: "notas",
    title: t("Dejar una nota para el equipo"),
    to: "/notas",
    perm: "note:write",
    keys: t("nota, notas, comentario, apunte").split(", "),
    steps: [t("Abra Notas del equipo y pulse «Nueva nota»."), t("Vincúlela a una señal, fuente o informe; puede fijarla arriba.")],
  },
  {
    id: "chat-ia",
    title: t("Preguntar a la IA sobre las tecnologías registradas"),
    to: "/chat",
    perm: null,
    keys: t("preguntar, ia, chat, asistente ia, conversar, minimax").split(", "),
    steps: [t("Abra Asistente IA y escriba su pregunta; responde con lo que hay en el sistema.")],
  },
  {
    id: "usuarios",
    title: t("Crear usuarios o cambiar perfiles"),
    to: "/usuarios",
    perm: "user:manage",
    keys: t("usuario, usuarios, perfil, rol, permiso, crear usuario, desbloquear, contrasena de otro").split(", "),
    steps: [t("Abra Usuarios y perfiles y pulse «+ Nuevo usuario»."), t("Elija el perfil; «Editar», «Desbloquear» o «Restablecer» desde la fila.")],
  },
  {
    id: "configuracion-ia",
    title: t("Configurar la IA (MiniMax)"),
    to: "/configuracion",
    perm: "config:manage",
    keys: t("configurar ia, token, llave, minimax, modelo, api key, ia sin configurar").split(", "),
    steps: [t("Abra Configuración, pestaña «Integración con IA»."), t("Pegue la llave, «Detectar mejor modelo» y «Guardar IA».")],
  },
  {
    id: "copia",
    title: t("Copias de seguridad y Firebase"),
    to: "/configuracion",
    perm: "config:manage",
    keys: t("copia, respaldo, backup, firebase, restaurar, guardado aqui").split(", "),
    steps: [t("Abra Configuración, pestaña «Persistencia (Firebase)»."), t("Ahí ve la copia en la nube y la copia local del navegador.")],
  },
  {
    id: "auditoria",
    title: t("Ver quién cambió algo (bitácora)"),
    to: "/auditoria",
    perm: "audit:read",
    keys: t("bitacora, auditoria, quien cambio, historial, cambios, log").split(", "),
    steps: [t("Abra Bitácora de auditoría y filtre por entidad, acción o usuario."), t("«Vida» muestra toda la historia de un registro.")],
  },
  {
    id: "contrasena",
    title: t("Cambiar mi contraseña o cerrar sesión"),
    to: null,
    keys: t("contrasena, password, clave, cerrar sesion, salir").split(", "),
    steps: [t("Pulse su nombre arriba a la derecha."), t("Elija «Cambiar contraseña» o «Cerrar sesión».")],
  },
  {
    id: "guia",
    title: t("Ver la guía rápida del sistema"),
    to: null,
    keys: t("guia, tutorial, como funciona, empezar, ayuda, inicio, roles, quien hace que").split(", "),
    steps: [t("Pulse «Guía» en la cabecera."), t("Recorre las fases, los perfiles y cómo se pasan el trabajo.")],
  },
  {
    id: "pendientes",
    title: t("Ver lo que tengo pendiente"),
    to: "/",
    perm: null,
    keys: t("pendiente, pendientes, tareas, que hago, por hacer, mi trabajo, hoy").split(", "),
    steps: [t("Abra Bandeja de trabajo: «Mis pendientes» lista lo que toca a su perfil, con el botón para ir a resolverlo.")],
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

// Palabras vacias, genericas y `keys` van en una sola cadena por idioma: la pregunta llega en el idioma activo.
const STOP = new Set(t("como donde que hago puedo para el la los las un una de del en y o a me mi se lo al por con quiero necesito hacer veo esta este").split(" "));

// Palabras que aparecen en casi todo: cuentan poco para decidir la respuesta.
const GENERIC = new Set(t("senal senales tecnologia ciclo buscar ia ayuda inicio ejecutar").split(" "));

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
  "/": [t("¿Qué tengo pendiente?"), t("¿Cómo ejecuto la vigilancia?"), t("¿Cómo cambio de ciclo?")],
  "/vigilancia": [t("¿Cómo ejecuto la vigilancia?"), t("¿Por qué una fuente sale en rojo?"), t("¿Dónde quedan las señales?")],
  "/fuentes": [t("¿Cómo agrego una fuente?"), t("¿Qué significa la sonda ámbar?"), t("¿Cómo pruebo una fuente?")],
  "/bandeja-entrada": [t("¿Cómo clasifico una señal?"), t("¿Cómo sé si es confiable?"), t("¿Cómo la paso al ciclo?")],
  "/postulaciones": [t("¿Cómo modero una postulación?"), t("¿Dónde está el formulario público?")],
  "/filtrado": [t("¿Cómo fusiono duplicados?"), t("¿Cómo cruzo con el INVIMA?"), t("¿Cómo excluyo una tecnología?")],
  "/priorizacion": [t("¿Cómo califico P1 a P6?"), t("¿Qué criterios me tocan?"), t("¿Qué pasa al completar los seis?")],
  "/evaluacion": [t("¿Cómo abro un expediente?"), t("¿Cómo invito a un revisor externo?"), t("¿Cómo descargo el PDF?")],
  "/diseminacion": [t("¿Cómo genero un informe con IA?"), t("¿Dónde se publica?")],
  "/boletines": [t("¿Cómo compilo el boletín?")],
  "/ciclos": [t("¿Cómo creo un ciclo?"), t("¿Cómo cierro el ciclo?")],
  "/configuracion": [t("¿Cómo configuro la IA?"), t("¿Dónde están las copias de seguridad?")],
  "/usuarios": [t("¿Cómo creo un usuario?"), t("¿Qué hace cada perfil?")],
};
