// Bandeja de trabajo ("/"): sin errores de consola en ningun perfil y sin
// botones anidados (el InfoTip de cada fase es un <button>; dentro de la tarjeta
// clicable React emitia validateDOMNesting).
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, ROLES } from "./helpers";

for (const role of ROLES) {
  test(`bandeja de trabajo limpia para ${role}`, async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, role, "/");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: /Bandeja de trabajo/ })).toBeVisible();
    await expect(page.locator(".methodology-card").first()).toBeVisible();
    expect(await page.locator("button button").count(), "botones anidados").toBe(0);
    expectClean(errors);
  });
}

test("la ayuda de una fase no navega y la tarjeta si", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  await page.locator(".methodology-cards .info-tip").first().click();
  expect(new URL(page.url()).pathname).toBe("/");
  await page.locator(".methodology-card").first().click();
  await settle(page);
  expect(new URL(page.url()).pathname).not.toBe("/");
  expectClean(errors);
});
