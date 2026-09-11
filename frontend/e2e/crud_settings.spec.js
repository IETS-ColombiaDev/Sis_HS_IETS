// Configuracion por la interfaz: parametros metodologicos, catalogos de clusteres y
// tipologias (CRUD), tareas programadas (P0-4 / P1-4) y llaves de fuentes.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, expectToast } from "./crud_helpers";

test.describe("configuracion · superadministrador", () => {
  test("parametro metodologico: valida, guarda y restaura", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const key = "ttm.regulatory_review_days";
    const original = (await api.get("/methodology/params")).find((p) => p.key === key).value;
    await loginAs(page, "superadmin", "/configuracion");
    await settle(page);
    const input = page.getByLabel(`Valor de ${key}`);
    const row = page.locator("div", { has: input }).filter({ hasText: key }).last();
    await input.fill("12.5");
    await row.getByRole("button", { name: "Guardar" }).click();
    await expectToast(page, "entero");
    await input.fill(String(Number(original) + 1));
    await row.getByRole("button", { name: "Guardar" }).click();
    await expectToast(page, `${key} actualizado`);
    await api.put(`/methodology/params/${key}`, { value: original });
    expectClean(errors);
  });

  test("catalogo de clusteres: crear, editar, desactivar y eliminar", async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, "superadmin", "/configuracion");
    await settle(page);
    const code = `e2e_${Date.now().toString(36)}`;
    const name = uid("Cluster E2E");
    await page.getByRole("button", { name: "+ Agregar" }).first().click();
    await page.locator("#catalog-code").fill("Codigo Invalido");
    await page.locator("#catalog-name").fill(name);
    await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator(".public-submit-error")).toContainText("minúsculas");
    await page.locator("#catalog-code").fill(code);
    await page.locator("#catalog-keywords").fill("prueba, e2e");
    await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
    await expectToast(page, `${name} creado`);

    await page.getByRole("button", { name: `Editar ${name}` }).click();
    await expect(page.locator("#catalog-code")).toBeDisabled();
    await page.locator("#catalog-name").fill(`${name} v2`);
    await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
    await expectToast(page, `${name} v2 actualizado`);

    const item = page.getByTestId(`catalog-item-${code}`);
    await item.getByRole("button", { name: "Desactivar" }).click();
    await expectToast(page, "desactivado");
    await page.getByRole("button", { name: `Eliminar ${name} v2` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expectToast(page, `${name} v2 eliminado`);
    await expect(page.getByTestId(`catalog-item-${code}`)).toHaveCount(0);

    // Lo sembrado por la especificacion no se elimina: se explica y se sugiere desactivar.
    const api = await apiAs(page.request);
    const seeded = (await api.get("/clusters?include_inactive=true")).find((c) => c.code === "cancer");
    await api.del(`/clusters/${seeded.id}`, 409);
    expectClean(errors);
  });

  test("tareas programadas: intervalo, ejecucion manual del barrido y registro", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const before = await api.get("/config/schedule");
    await loginAs(page, "superadmin", "/configuracion?tab=programacion");
    await settle(page);
    const panel = page.getByTestId("schedule-panel");
    await expect(panel).toBeVisible();

    await page.locator("#hours-duplicados").fill("0");
    await panel.getByRole("button", { name: "Guardar programación" }).click();
    await expectToast(page, "entre 1 y 720");
    await page.locator("#hours-duplicados").fill("12");
    await panel.getByRole("button", { name: "Guardar programación" }).click();
    await expectToast(page, "Programación guardada");
    expect((await api.get("/config/schedule")).dedup_interval_hours).toBe(12);

    // El barrido de duplicados no sale a internet: se ejecuta de verdad.
    const dedupCard = panel.locator(".fb-schedule-card", { hasText: "Barrido de duplicados" });
    await dedupCard.getByRole("button", { name: "Ejecutar ahora" }).click();
    await expectToast(page, "Barrido sobre");
    await expect(panel.locator(".data-table tbody tr", { hasText: "Barrido de duplicados" }).first()).toContainText("Manual");

    await api.put("/config/schedule", { dedup_interval_hours: before.dedup_interval_hours, scan_interval_hours: before.scan_interval_hours });
    expectClean(errors);
  });

  test("llaves de fuentes: correo NCBI y estado de las llaves", async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, "superadmin", "/configuracion?tab=fuentes");
    await settle(page);
    await expect(page.getByTestId("key-status-openFDA")).toBeVisible();
    await page.locator("#ncbi-email").fill("correo-invalido");
    await page.getByRole("button", { name: "Guardar llaves" }).click();
    await expectToast(page, "no es válido");
    await page.locator("#ncbi-email").fill("escaneo.horizonte@iets.org.co");
    await page.getByRole("button", { name: "Guardar llaves" }).click();
    await expectToast(page, "Llaves de fuentes guardadas");
    expectClean(errors);
  });
});

test.describe("configuracion · permisos", () => {
  test("la API de configuracion responde 403 a los demas perfiles", async ({ page }) => {
    for (const role of ["evaluador_tecnico", "evaluador_clinico", "tomador_decisiones", "revisor_pares"]) {
      const api = await apiAs(page.request, role);
      await api.get("/config", 403);
      await api.put("/config/schedule", { scan_interval_hours: 5 }, 403);
      await api.post("/clusters", { code: "no_puede", name: "No" }, 403);
      await api.put("/methodology/params/cycle.max_per_year", { value: "3" }, 403);
      // La programacion se puede consultar (la pantalla de vigilancia la muestra).
      await api.get("/config/schedule");
    }
  });
});
