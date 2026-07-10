import axios from "axios";

const TOKEN_KEY = "iets_hs_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response && error.response.status === 401) {
      if (onUnauthorized) onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export function apiError(error, fallback = "Ocurrio un error") {
  if (error?.response?.data?.detail) {
    const d = error.response.data.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join("; ");
  }
  return error?.message || fallback;
}

export default api;
