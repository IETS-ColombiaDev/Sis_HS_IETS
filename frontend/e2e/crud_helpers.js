// Preparacion de datos por API para las pruebas CRUD del frente B.
// Nada de esto sale a internet: las fuentes usan el conector `fixture` y las
// URL apuntan al propio servidor de pruebas.
import { expect } from "@playwright/test";
import { apiToken, auth, tokenForRole, uid } from "./helpers";

/** Cliente autenticado minimo sobre `request` de Playwright. */
export async function apiAs(request, role = "superadmin") {
  const token = role === "superadmin" ? await apiToken(request) : await tokenForRole(request, role);
  const headers = auth(token);
  const call = async (method, path, data, expectStatus) => {
    const res = await request[method](`/api${path}`, { headers, data });
    const text = await res.text();
    if (expectStatus !== undefined) {
      expect(res.status(), `${method.toUpperCase()} ${path}: ${text}`).toBe(expectStatus);
    } else {
      expect(res.ok(), `${method.toUpperCase()} ${path}: ${res.status()} ${text}`).toBeTruthy();
    }
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  };
  return {
    token,
    get: (p, s) => call("get", p, undefined, s),
    post: (p, d, s) => call("post", p, d ?? {}, s),
    put: (p, d, s) => call("put", p, d ?? {}, s),
    del: (p, s) => call("delete", p, undefined, s),
  };
}

/** URL absoluta del propio servidor (la usan la sonda y la vista previa). */
export function selfUrl(baseURL, path = "/api/health") {
  return new URL(path, baseURL).href;
}

/** Fuente con conector `fixture`: ingiere un registro sin red. */
export async function fixtureSource(api, baseURL, name = uid("Fuente")) {
  const ext = uid("EXT");
  return api.post("/sources", {
    title: name,
    url: `${selfUrl(baseURL)}?f=${encodeURIComponent(ext)}`,
    category: "Agencias regulatorias",
    connector: "fixture",
    access_level: "D",
    sync_frequency: "mensual",
    scrape_enabled: true,
    connector_config: {
      records: [
        {
          external_id: ext,
          title: `Senal ${name}`,
          commercial_name: `${name} mab`,
          inn_name: "e2emab",
          manufacturer: "Laboratorio E2E",
          indication: "Melanoma",
          technology_type: "medicamento",
          horizon: "emergente",
          raw: { id: ext },
        },
      ],
    },
  });
}

/** Senal creada a mano sobre una fuente fixture. */
export async function signal(api, baseURL, title = uid("Senal")) {
  const src = await fixtureSource(api, baseURL);
  const finding = await api.post("/findings", { source_id: src.id, title, summary: "Resumen de prueba", technology: title });
  return { source: src, finding };
}

/** Espera el toast con el texto dado. */
export async function expectToast(page, text) {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
}

/** El tooltip de un boton deshabilitado queda en `data-disabled-hint` (HintButton). */
export function disabledHint(page, text) {
  return page.locator(`[data-disabled-hint*="${text}"]`);
}
