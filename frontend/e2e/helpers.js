// Utilidades compartidas por las pruebas E2E.
import { expect } from "@playwright/test";

export const TOKEN_KEY = "iets_hs_token";
export const ADMIN_EMAIL = "admin@iets.org.co";

export const ROLES = [
  "superadmin",
  "evaluador_tecnico",
  "evaluador_clinico",
  "tomador_decisiones",
  "revisor_pares",
];

/** Correo estable por perfil, para no multiplicar cuentas entre corridas. */
export function emailFor(role) {
  return role === "superadmin" ? ADMIN_EMAIL : `e2e.${role}@iets.org.co`;
}

/** Inicia sesion por la API de desarrollo y devuelve el token de sesion. */
export async function apiToken(request, email = ADMIN_EMAIL, name = "") {
  const res = await request.post("/api/auth/dev-login", { data: { email, name } });
  expect(res.ok(), `dev-login ${email}: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.access_token;
}

/** Cabeceras autenticadas para llamadas directas a la API. */
export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Token de un usuario con el perfil pedido (lo crea y le asigna el perfil si hace falta). */
export async function tokenForRole(request, role) {
  const adminToken = await apiToken(request, ADMIN_EMAIL);
  if (role === "superadmin") return adminToken;
  const email = emailFor(role);
  await apiToken(request, email, `E2E ${role}`);
  const list = await request.get("/api/users", { headers: auth(adminToken) });
  const users = await list.json();
  const u = users.find((x) => x.email === email);
  expect(u, `usuario ${email}`).toBeTruthy();
  if (u.role !== role) {
    const put = await request.put(`/api/users/${u.id}/role`, { headers: auth(adminToken), data: { role } });
    expect(put.ok(), `cambio de perfil a ${role}`).toBeTruthy();
  }
  return apiToken(request, email);
}

/** Deja la pagina autenticada con el perfil pedido y navega a `path`. */
export async function loginAs(page, role = "superadmin", path = "/") {
  const token = await tokenForRole(page.request, role);
  // Se inyecta una sola vez por pestana: asi un cierre de sesion posterior en la
  // prueba no queda deshecho por la siguiente navegacion.
  await page.addInitScript(([k, t]) => {
    if (!window.sessionStorage.getItem("e2e_token_injected")) {
      window.localStorage.setItem(k, t);
      window.sessionStorage.setItem("e2e_token_injected", "1");
    }
  }, [TOKEN_KEY, token]);
  await page.goto(path);
  return token;
}

/**
 * Registra errores de consola, excepciones de pagina y respuestas 5xx de la API.
 * Devuelve el arreglo vivo; use `expectClean(errors)` al final de la prueba.
 */
export function watchErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Los 4xx esperados (validaciones de negocio) ya los informa la interfaz.
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().includes("/api/")) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return errors;
}

export function expectClean(errors) {
  expect(errors, errors.join("\n")).toEqual([]);
}

/** Espera a que desaparezcan los indicadores de carga de la pantalla. */
export async function settle(page) {
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Esta pantalla se detuvo")).toHaveCount(0);
}

/** Texto unico para registros creados por la prueba. */
export function uid(prefix = "E2E") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}
