/**
 * Devuelve la etiqueta a mostrar para fuentes/hallazgos relacionados con el IETS,
 * o null si la categoria no corresponde a un producto o participacion del IETS.
 */
export function ietsTag(category = "") {
  const c = (category || "").toLowerCase();
  if (c.includes("producto directo iets")) {
    return { label: "Producto IETS", tone: "priorizado" };
  }
  if (c.includes("participacion iets") || c.includes("participación iets")) {
    return { label: "IETS regional", tone: "editor" };
  }
  if (c.includes("iets")) {
    return { label: "IETS", tone: "priorizado" };
  }
  return null;
}

export function isIets(category = "") {
  return ietsTag(category) !== null;
}
