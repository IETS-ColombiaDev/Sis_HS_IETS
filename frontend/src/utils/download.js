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

/** Descarga desde endpoint autenticado (axios blob). */
export async function downloadFromApi(api, path, filename) {
  const { data } = await api.get(path, { responseType: "blob" });
  downloadBlob(data, filename);
}
