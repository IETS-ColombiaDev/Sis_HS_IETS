// Marco de la aplicacion: navegar no recarga, las ayudas no disparan acciones
// y el asistente de navegacion responde con pasos y un boton para ir.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle } from "./helpers";

test("navegar entre modulos no rearma el marco ni recarga la pagina", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  // Marca en el menu y en la ventana: si algo se rearma o recarga, desaparecen.
  await page.evaluate(() => {
    document.querySelector(".sidebar").dataset.mark = "vivo";
    window.__sinRecarga = true;
  });
  await page.locator(".sidebar").getByRole("link", { name: "Bandeja de entrada" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Bandeja de entrada/ })).toBeVisible();
  await page.locator(".sidebar").getByRole("link", { name: "2. Priorización" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Priorización/ })).toBeVisible();
  expect(await page.evaluate(() => document.querySelector(".sidebar").dataset.mark)).toBe("vivo");
  expect(await page.evaluate(() => window.__sinRecarga)).toBe(true);

  // La ayuda (i) del menu explica sin navegar.
  const before = page.url();
  const row = page.locator(".nav-row", { hasText: "Ciclos de escaneo" });
  await row.hover();
  await row.getByRole("button", { name: /Qué es Ciclos de escaneo/ }).click();
  await expect(page.getByRole("tooltip")).toBeVisible();
  expect(page.url()).toBe(before);
  expect(await page.evaluate(() => window.__sinRecarga)).toBe(true);

  // El buscador del menu filtra los modulos.
  await page.getByLabel("Buscar módulo en el menú").fill("bitacora");
  await expect(page.locator(".sidebar .sb-link")).toHaveCount(1);
  await expect(page.locator(".sidebar .sb-link")).toContainText("Bitácora de auditoría");
  await page.getByLabel("Buscar módulo en el menú").fill("");
  expectClean(errors);
});

test("el asistente de navegacion indica los pasos y lleva a la pantalla", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  await page.getByTestId("nav-assistant-open").click();
  const panel = page.getByTestId("nav-assistant");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Bandeja de trabajo");

  await panel.getByLabel("Pregunta para el asistente de navegación").fill("¿cómo califico p1 a p6?");
  await panel.getByRole("button", { name: "Enviar pregunta" }).click();
  const answer = panel.getByTestId("nav-assistant-answer").last();
  await expect(answer).toContainText("Calificar P1 a P6");
  await answer.getByTestId("nav-assistant-go-priorizar").click();
  await expect(page).toHaveURL(/\/priorizacion$/);
  await expect(page.getByRole("heading", { level: 1, name: /Priorización/ })).toBeVisible();

  // Sugerencias segun la pantalla, y Ctrl+K abre y cierra.
  await expect(panel.getByRole("button", { name: "¿Cómo califico P1 a P6?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("nav-assistant")).toBeVisible();

  // Una pregunta sin coincidencias ofrece la guia.
  await page.getByLabel("Pregunta para el asistente de navegación").fill("zzzz qwerty");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("nav-assistant-answer").last()).toContainText("No encontré esa opción");
  expectClean(errors);
});

test("la guia de fase se pliega y lo recuerda", async ({ page }) => {
  await loginAs(page, "superadmin", "/priorizacion");
  await settle(page);
  const guide = page.locator(".phase-guide").first();
  await guide.getByRole("button", { name: "Ocultar los pasos de la fase" }).click();
  await expect(guide.locator(".phase-guide-tasks")).toHaveCount(0);
  await page.reload();
  await settle(page);
  await expect(page.locator(".phase-guide").first()).toHaveClass(/is-collapsed/);
  await page.getByRole("button", { name: "Mostrar los pasos de la fase" }).first().click();
  await expect(page.locator(".phase-guide-tasks").first()).toBeVisible();
});
