import { test, expect } from "@playwright/test";
import { ONBOARDING_KEY, watchErrors, expectClean, settle } from "./helpers";

test("la guía rápida se abre al ingresar y recorre el mapa del sistema", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript((k) => localStorage.removeItem(k), ONBOARDING_KEY);
  await page.goto("/login");
  await page.getByRole("button", { name: /Acceso de desarrollo/ }).click();
  await page.getByRole("button", { name: "Acceso rápido como administrador" }).click();

  const guide = page.getByTestId("onboarding-guide");
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading", { name: "Cómo funciona el escaneo de horizonte" })).toBeVisible();
  await expect(guide.getByText("este es el mapa del sistema", { exact: false })).toBeVisible();

  await guide.getByRole("button", { name: "Siguiente" }).click();
  await expect(guide.getByRole("heading", { name: "De la fuente a la bandeja" })).toBeVisible();
  await guide.getByRole("button", { name: "Siguiente" }).click();
  await expect(guide.getByRole("heading", { name: "Filtrar, luego calificar" })).toBeVisible();
  await guide.getByRole("button", { name: "Siguiente" }).click();
  await expect(guide.getByRole("heading", { name: "Documentar, revisar y diseminar" })).toBeVisible();
  await guide.getByRole("button", { name: "Siguiente" }).click();
  await expect(guide.getByRole("heading", { name: "La IA sugiere, usted decide" })).toBeVisible();
  // Las pestañas permiten saltar a cualquier pantalla y volver.
  await guide.getByRole("button", { name: /Priorizar/ }).click();
  await expect(guide.getByText("4–6 · Priorizada")).toBeVisible();
  await guide.getByRole("button", { name: /Ayudas/ }).click();
  await guide.getByRole("button", { name: "Siguiente" }).click();
  await expect(guide.getByRole("heading", { name: "Tres acciones de hoy" })).toBeVisible();
  await expect(guide.getByRole("button", { name: "Ejecutar vigilancia" })).toBeVisible();

  await guide.getByRole("button", { name: "Entendido, empezar" }).click();
  await expect(guide).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Bandeja de trabajo" }).first()).toBeVisible();

  const stored = await page.evaluate((k) => localStorage.getItem(k), ONBOARDING_KEY);
  expect(stored).toBe("1");

  await page.getByRole("button", { name: "Abrir guía rápida" }).click();
  await expect(page.getByTestId("onboarding-guide")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar guía" }).click();
  await expect(page.getByTestId("onboarding-guide")).toHaveCount(0);

  await settle(page);
  expectClean(errors);
});
