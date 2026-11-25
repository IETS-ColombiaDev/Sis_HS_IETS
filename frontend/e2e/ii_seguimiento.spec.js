// II seguimiento del Modulo 0 (25-11-2026), RF-001-A: la Bandeja de entrada nunca
// se presenta vacia cuando no se pudo leer, y la fila de cada senal abre la pagina
// resaltando la senal cuando el sistema ya la ubico.
import { test, expect } from "@playwright/test";
import { loginAs, settle } from "./helpers";
import { apiAs, signal } from "./crud_helpers";

const LIST = /\/api\/technologies\/staging(\?|$)/;

test("si la bandeja no se puede leer lo dice, no se muestra vacía y se recupera al reintentar", async ({ page, baseURL }) => {
  const admin = await apiAs(page.request);
  await signal(admin, baseURL);
  let fail = true;
  await page.route(LIST, async (route) => {
    if (fail) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Error interno del servidor (ref prueba)." }) });
    else await route.continue();
  });
  await loginAs(page, "superadmin", "/bandeja-entrada");
  const error = page.getByTestId("staging-load-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("No se pudo cargar la bandeja de entrada");
  await expect(error).toContainText("la bandeja no está vacía");
  await expect(page.getByText("La bandeja está vacía")).toHaveCount(0);
  // Los indicadores llegaron por su lado: no dependen del listado.
  await expect(page.getByText("Sin asignar").first()).toBeVisible();

  fail = false;
  const [reply] = await Promise.all([
    page.waitForResponse((r) => LIST.test(r.url()) && r.status() === 200),
    error.getByRole("button", { name: "Reintentar ahora" }).click(),
  ]);
  expect((await reply.json()).length).toBeGreaterThan(0);
  await expect(page.getByTestId("staging-load-error")).toHaveCount(0);
  await expect(page.getByText("La bandeja está vacía")).toHaveCount(0);
  await expect(page.getByRole("checkbox").first()).toBeVisible();
});

test("la fila de una señal ubicada abre la página y resalta la señal", async ({ page, baseURL }) => {
  const admin = await apiAs(page.request);
  await signal(admin, baseURL);
  const located = "https://fuente.example.org/pipeline#:~:text=Cardiovex%20XR";
  await page.route(LIST, async (route) => {
    const response = await route.fetch();
    const rows = await response.json();
    if (rows.length) {
      rows[0] = { ...rows[0], signal_url: "https://fuente.example.org/pipeline", link_type: "consulta", evidence: { ...(rows[0].evidence || {}), locator_url: located, locator_text: "Cardiovex XR" } };
      if (rows[1]) rows[1] = { ...rows[1], link_type: "exacto" };
    }
    await route.fulfill({ response, json: rows });
  });
  await loginAs(page, "superadmin", "/bandeja-entrada");
  await settle(page);
  const link = page.getByTestId("staging-open-located").first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", located);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("title", /resalta la señal «Cardiovex XR»/);
});
