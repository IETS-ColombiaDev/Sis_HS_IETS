/** Descarga un blob como archivo en el navegador. */
export function downloadBlob(content, filename, mime = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Nombre de archivo sugerido por el servidor (Content-Disposition), si lo hay. */
function filenameFrom(headers, fallback) {
  const raw = headers?.["content-disposition"] || "";
  const match = /filename="?([^";]+)"?/i.exec(raw);
  return match ? match[1] : fallback;
}

/**
 * Descarga desde endpoint autenticado (axios blob).
 *
 * Con `responseType: "blob"` el error del servidor tambien llega como Blob, y
 * `apiError` terminaba mostrando "Request failed with status code 403". Aqui se
 * lee el cuerpo y se deja el `detail` en espanol donde `apiError` lo busca.
 */
export async function downloadFromApi(api, path, filename, config = {}) {
  try {
    const res = await api.get(path, { responseType: "blob", ...config });
    downloadBlob(res.data, filenameFrom(res.headers, filename));
    return res;
  } catch (error) {
    const data = error?.response?.data;
    if (data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await data.text());
      } catch {
        error.response.data = { detail: `No se pudo descargar (HTTP ${error.response.status}).` };
      }
    }
    throw error;
  }
}
