import axios from "axios";

const TOKEN_KEY = "iets_hs_token";
const LAST_EMAIL_KEY = "iets_hs_last_email";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getLastEmail() {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

export function setLastEmail(email) {
  try {
    const value = (email || "").trim().toLowerCase();
    if (value) localStorage.setItem(LAST_EMAIL_KEY, value);
  } catch {
    /* modo privado */
  }
}

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
  // Mayor que el busy_timeout de SQLite (15 s): si Firebase está copiando la
  // base, la UI espera en lugar de cortar y mostrar "tardó demasiado".
  timeout: 45000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Con el Content-Type JSON por defecto, axios convierte un FormData en JSON y el archivo no llega.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) config.headers.setContentType("multipart/form-data");
  if (typeof Blob !== "undefined" && config.data instanceof Blob) config.headers.setContentType("application/octet-stream");
  return config;
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const config = error.config;
    if (error.response && error.response.status === 401) {
      if (onUnauthorized) onUnauthorized();
      return Promise.reject(error);
    }
    const method = String(config?.method || "get").toLowerCase();
    const retriable =
      config &&
      !config.__retried &&
      method === "get" &&
      (error.code === "ECONNABORTED" ||
        !error.response ||
        [502, 503, 504].includes(error.response.status));
    if (retriable) {
      config.__retried = true;
      return api.request(config);
    }
    return Promise.reject(error);
  }
);

// Mensajes para cuando el servidor no explica el error (axios los da en ingles).
const STATUS_MESSAGES = {
  400: "La solicitud no es válida.",
  401: "Su sesión terminó. Ingrese de nuevo.",
  403: "Su perfil no tiene permiso para esta acción.",
  404: "El recurso no existe o ya fue eliminado.",
  409: "La acción entra en conflicto con el estado actual. Actualice la pantalla.",
  413: "El archivo es demasiado grande.",
  422: "Revise los datos: hay campos con valores no válidos.",
  423: "La cuenta está bloqueada temporalmente.",
  429: "Demasiadas solicitudes seguidas. Espere un momento e intente de nuevo.",
  500: "Error interno del servidor. Si persiste, informe al administrador.",
  502: "El servidor no está disponible en este momento. Intente en unos minutos.",
  503: "El servidor no está disponible en este momento. Intente en unos minutos.",
  504: "El servidor tardó demasiado en responder. Intente de nuevo.",
};

export function apiError(error, fallback = "Ocurrió un error") {
  const d = error?.response?.data?.detail;
  if (d) {
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      // Errores de validacion de FastAPI: "campo: mensaje".
      return d
        .map((x) => {
          const field = Array.isArray(x.loc) ? x.loc.filter((p) => p !== "body").join(".") : "";
          return field ? `${field}: ${x.msg}` : x.msg || JSON.stringify(x);
        })
        .join("; ");
    }
  }
  const status = error?.response?.status;
  if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (error?.code === "ECONNABORTED") return "El servidor tardó demasiado en responder. Intente de nuevo.";
  if (error?.request && !error?.response) {
    return "No hay conexión con el servidor. Verifique su red e intente de nuevo.";
  }
  return fallback;
}

export default api;
