// Orden del menu lateral (fases en orden, con sus pantallas debajo) y
// pestañas de Configuracion agrupadas por tema.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle } from "./helpers";

const SHOTS = process.env.MENU_SHOTS || "";

test("el menu muestra las fases en orden y sus pantallas como submodulos", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  const labels = await page.locator(".sidebar .sb-label").allTextContents();
  expect(labels).toEqual([
    "Bandeja de trabajo",
    "Ciclos de escaneo",
    "Notas del equipo",
    "1. Vigilancia",
    "Catálogo de fuentes",
    "Señales capturadas",
    "Bandeja de entrada",
    "Postulaciones",
    "Filtrado y depuración",
    "2. Priorización",
    "3. Evaluación",
    "4. Diseminación",
    "Boletines del ciclo",
    "Tablero estratégico",
    "Alertas tempranas",
    "Asistente IA",
    "Configuración",
    "Usuarios y perfiles",
    "Bitácora de auditoría",
  ]);
  const subs = await page.locator(".sidebar .nav-row.is-sub .sb-label").allTextContents();
  expect(subs).toEqual([
    "Catálogo de fuentes",
    "Señales capturadas",
    "Bandeja de entrada",
    "Postulaciones",
    "Filtrado y depuración",
    "Boletines del ciclo",
  ]);
  await expect(page.locator(".sidebar .sb-section")).toHaveText([
    "Inicio",
    "Metodología IETS",
    "Análisis y seguimiento",
    "Administración",
  ]);
  // Un submodulo abre su pantalla y queda marcado.
  await page.locator(".sidebar").getByRole("link", { name: "Catálogo de fuentes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Catálogo de fuentes/ })).toBeVisible();
  await expect(page.locator(".sidebar .sb-link.is-active")).toHaveText(/Catálogo de fuentes/);
  if (SHOTS) await page.locator(".sidebar").screenshot({ path: `${SHOTS}/menu.png` });
  expectClean(errors);
});

test("Configuracion agrupa las pestañas por tema y explica la que esta abierta", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/configuracion");
  await settle(page);
  await expect(page.locator(".settings-group-title")).toHaveText([
    "Metodología",
    "Fuentes y vigilancia",
    "Inteligencia artificial",
    "Datos y respaldo",
  ]);
  await expect(page.locator(".settings-menu button")).toHaveCount(9);
  await expect(page.getByTestId("settings-about")).toContainText("Gobierno metodológico");
  await page.locator(".settings-menu").getByRole("button", { name: "Tareas programadas" }).click();
  await expect(page).toHaveURL(/tab=programacion/);
  await expect(page.getByTestId("settings-about")).toContainText("Cuándo corren solas");
  await expect(page.locator(".settings-menu button[aria-pressed='true']")).toHaveText(/Tareas programadas/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/configuracion.png` });
  expectClean(errors);
});
