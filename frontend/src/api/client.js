import axios from "axios";
import { getLanguage, t, ts } from "../i18n";

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

// "Ver como" del superadministrador: el perfil simulado viaja en esta cabecera.
// El servidor la ignora si la cuenta real no es superadministrador.
const ACTING_ROLE_KEY = "iets_hs_acting_role";
export const ACTING_ROLE_HEADER = "X-Acting-Role";

export function getActingRole() {
  try {
    return localStorage.getItem(ACTING_ROLE_KEY) || "";
  } catch {
    return "";
  }
}

export function setActingRole(role) {
  try {
    if (role) localStorage.setItem(ACTING_ROLE_KEY, role);
    else localStorage.removeItem(ACTING_ROLE_KEY);
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

// Las llamadas que consultan a la IA esperan al modelo (hasta 120 s en el
// servidor); el escaneo de una fuente suma descarga, fichas, busqueda e IA.
export const AI_TIMEOUT = 150000;
export const SCAN_TIMEOUT = 300000;

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // El servidor lo usa para responder en el idioma de la interfaz (asistente de IA).
  config.headers["X-UI-Language"] = getLanguage();
  const acting = getActingRole();
  if (token && acting && !config.headers[ACTING_ROLE_HEADER]) config.headers[ACTING_ROLE_HEADER] = acting;
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
  400: t("La solicitud no es válida."),
  401: t("Su sesión terminó. Ingrese de nuevo."),
  403: t("Su perfil no tiene permiso para esta acción."),
  404: t("El recurso no existe o ya fue eliminado."),
  409: t("La acción entra en conflicto con el estado actual. Actualice la pantalla."),
  413: t("El archivo es demasiado grande."),
  422: t("Revise los datos: hay campos con valores no válidos."),
  423: t("La cuenta está bloqueada temporalmente."),
  429: t("Demasiadas solicitudes seguidas. Espere un momento e intente de nuevo."),
  500: t("Error interno del servidor. Si persiste, informe al administrador."),
  502: t("El servidor no está disponible en este momento. Intente en unos minutos."),
  503: t("El servidor no está disponible en este momento. Intente en unos minutos."),
  504: t("El servidor tardó demasiado en responder. Intente de nuevo."),
};

/**
 * Mensaje de error para mostrar. `fallback` llega ya traducido (o en español: se
 * traduce aquí si está en el diccionario). El detalle del servidor pasa por `ts`.
 */
export function apiError(error, fallback = "Ocurrió un error") {
  const d = error?.response?.data?.detail;
  if (d) {
    if (typeof d === "string") return ts(d);
    if (Array.isArray(d)) {
      // Errores de validacion de FastAPI: "campo: mensaje".
      return d
        .map((x) => {
          const field = Array.isArray(x.loc) ? x.loc.filter((p) => p !== "body").join(".") : "";
          const msg = ts(x.msg);
          return field ? `${field}: ${msg}` : msg || JSON.stringify(x);
        })
        .join("; ");
    }
  }
  const status = error?.response?.status;
  if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (error?.code === "ECONNABORTED") {
    return t("El servidor tardó demasiado en responder. Si llevaba un rato sin uso, está iniciando: espere un minuto e intente de nuevo.");
  }
  if (error?.request && !error?.response) {
    return t("No hay conexión con el servidor. Verifique su red e intente de nuevo.");
  }
  return t(fallback);
}

export default api;
