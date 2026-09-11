// CRUD de fuentes por la interfaz: alta rapida con vista previa, edicion avanzada,
// ingesta, sonda, habilitar/deshabilitar, eliminar, exportar y recargar catalogo.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, disabledHint, expectToast, fixtureSource, selfUrl } from "./crud_helpers";

async function openSourceCard(page, title) {
  await page.getByLabel("Buscar fuente").fill(title);
  const card = page.locator(".registry-card", { hasText: title });
  await expect(card).toHaveCount(1);
  return card;
}

test.describe("fuentes · superadministrador", () => {
  test("alta rapida con vista previa, edicion, ingesta, sonda, apagar y eliminar", async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    await loginAs(page, "superadmin", "/fuentes");
    await settle(page);
    const name = uid("Fuente rapida");

    // Alta rapida, con vista previa del propio servidor (sin internet).
    await page.getByRole("button", { name: "Alta rápida" }).click();
    await page.locator("#quick-title").fill(name);
    await page.locator("#quick-url").fill(selfUrl(baseURL, `/expedientes?e2e=${encodeURIComponent(name)}`));
    await page.getByRole("button", { name: "Vista previa" }).click();
    await expect(page.getByTestId("link-preview")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Registrar fuente" }).click();
    await expectToast(page, "Fuente registrada");

    // Edicion avanzada: adaptador fixture con un lote en la configuracion JSON.
    let card = await openSourceCard(page, name);
    await card.getByRole("button", { name: "Editar" }).click();
    await page.locator("#source-connector").selectOption("fixture");
    await page.locator("#source-level").selectOption("C");
    await page.locator("#source-frequency").selectOption("semanal");
    await page.locator("#source-url").fill(selfUrl(baseURL, `/api/health?e2e=${encodeURIComponent(name)}`));
    await page.locator("#source-config").fill("{ esto no es json");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.locator(".public-submit-error")).toContainText("JSON");
    const ext = uid("EXT");
    await page.locator("#source-config").fill(JSON.stringify({ records: [{ external_id: ext, title: `Senal ${name}`, commercial_name: `${name} mab` }] }));
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expectToast(page, "Fuente actualizada");
    card = await openSourceCard(page, name);
    await expect(card).toContainText("Nivel C");
    await expect(card).toContainText("fixture");

    // Ingesta de la fuente: el fixture deja una senal nueva.
    await card.getByRole("button", { name: "Ingerir" }).click();
    await expectToast(page, "Ingesta: 1 nuevas");

    // Sonda contra el propio servidor: verde.
    await card.getByRole("button", { name: "Sonda" }).click();
    await expectToast(page, "Sonda Verde");

    // Apagar y volver a encender la ingesta.
    await card.getByRole("button", { name: "Deshabilitar" }).click();
    await expectToast(page, "Ingesta deshabilitada");
    card = await openSourceCard(page, name);
    await expect(card).toContainText("Ingesta apagada");
    await expect(card.locator("[data-disabled-hint]").filter({ hasText: "Ingerir" })).toHaveCount(1);
    await card.getByRole("button", { name: "Habilitar" }).click();
    await expectToast(page, "Ingesta habilitada");

    // Con senales ya no se elimina: el boton explica por que.
    card = await openSourceCard(page, name);
    await expect(card.locator('[data-disabled-hint*="señal(es) capturadas"]')).toHaveCount(1);

    // Una fuente sin senales si se elimina, con confirmacion.
    const tmp = uid("Fuente temporal");
    await page.getByRole("button", { name: "Alta rápida" }).click();
    await page.locator("#quick-title").fill(tmp);
    await page.locator("#quick-url").fill(`https://temporal.example.org/${encodeURIComponent(tmp)}`);
    await page.getByRole("button", { name: "Registrar fuente" }).click();
    await expectToast(page, "Fuente registrada");
    const tmpCard = await openSourceCard(page, tmp);
    await tmpCard.getByRole("button", { name: `Eliminar ${tmp}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expectToast(page, "Fuente eliminada");
    await expect(page.locator(".registry-card", { hasText: tmp })).toHaveCount(0);
    expectClean(errors);
  });

  test("validaciones, duplicados, CSV, vista de tabla, salud, cobertura y recarga del catalogo", async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const existing = await fixtureSource(api, baseURL);
    await loginAs(page, "superadmin", "/fuentes");
    await settle(page);

    // URL invalida y URL repetida: mensajes claros.
    await page.getByRole("button", { name: "Alta rápida" }).click();
    await page.locator("#quick-title").fill("Sin esquema");
    await page.locator("#quick-url").fill("ftp://algo");
    await page.getByRole("button", { name: "Registrar fuente" }).click();
    await expectToast(page, "http://");
    await page.locator("#quick-url").fill(existing.url);
    await page.getByRole("button", { name: "Registrar fuente" }).click();
    await expectToast(page, "Ya existe una fuente con esa URL");
    await page.getByRole("button", { name: "Cancelar" }).click();

    // Exportar CSV.
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    // Vista de tabla con las acciones por fila.
    await page.getByLabel("Buscar fuente").fill(existing.title);
    await page.getByRole("button", { name: "Tabla" }).click();
    await expect(page.locator(".data-table tbody tr", { hasText: existing.title })).toHaveCount(1);

    // Pestanas de salud y cobertura.
    await page.getByRole("button", { name: "Salud de fuentes", exact: true }).click();
    await expect(page.locator(".health-counts")).toBeVisible();
    await page.getByRole("button", { name: "Cobertura", exact: true }).click();
    await expect(page.getByText("Huecos frente a fuentes de contraste")).toBeVisible();

    // Recargar el catalogo pide confirmacion.
    await page.getByRole("button", { name: "Catálogo", exact: true }).click();
    await page.getByRole("button", { name: "Recargar catálogo" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Recargar" }).click();
    await expectToast(page, "actualizadas");
    expectClean(errors);
  });
});

test.describe("fuentes · permisos", () => {
  for (const role of ["tomador_decisiones", "revisor_pares"]) {
    test(`${role}: modo consulta, botones deshabilitados con motivo y API 403`, async ({ page }) => {
      const errors = watchErrors(page);
      await loginAs(page, role, "/fuentes");
      await settle(page);
      await expect(page.getByTestId("sources-readonly")).toBeVisible();
      await expect(disabledHint(page, "source:write").first()).toBeVisible();
      await expect(page.locator(".registry-card").first().getByRole("button", { name: "Editar" })).toHaveCount(0);
      const api = await apiAs(page.request, role);
      await api.post("/sources/quick", { title: "No", url: "https://no.example.org" }, 403);
      expectClean(errors);
    });
  }

  test("evaluador clinico puede dar de alta y editar", async ({ page }) => {
    await loginAs(page, "evaluador_clinico", "/fuentes");
    await settle(page);
    await expect(page.getByRole("button", { name: "Alta rápida" })).toBeEnabled();
    await expect(page.getByTestId("sources-readonly")).toHaveCount(0);
  });
});
