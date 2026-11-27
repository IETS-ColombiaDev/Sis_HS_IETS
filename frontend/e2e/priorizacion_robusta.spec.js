// Priorización: avance por criterio, cambio de respuesta con justificación, recorrido,
// matriz del ciclo y exporte.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, expectToast, techInCycle, useCycleInPage } from "./flow_api";

test("priorizacion: avance, cambio justificado, recorrido, matriz del ciclo y exporte", async ({ page }) => {
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const cycle = await createCycle(api, { status: "en_priorizacion" });
  const done = await techInCycle(api, cycle.id, { name: uid("Completa"), values: [1, 1, 1, 1, 1, 0] });
  const open = await techInCycle(api, cycle.id, { name: uid("Abierta"), stage: "apta" });

  await useCycleInPage(page, cycle.id);
  await loginAs(page, "superadmin", "/priorizacion");
  await settle(page);

  // Avance del ciclo y lo que espera al perfil.
  await expect(page.getByTestId("prio-progress")).toContainText("1 de 2 tecnologías con los seis criterios");
  await expect(page.getByTestId("prio-crit-P1")).toContainText("1/2");
  await expect(page.getByTestId("prio-kpi-mine")).toContainText("1");
  await expect(page.getByTestId(`prio-item-${open.id}`).locator(".prio-dot.is-mine")).toHaveCount(6);
  await expect(page.getByTestId(`prio-item-${done.id}`).locator(".prio-dot.is-yes")).toHaveCount(5);

  // Filtro por avance.
  await page.getByTestId("prio-progress-filter").selectOption("incompletas");
  await expect(page.getByTestId("prio-pager")).toContainText("1-1 de 1");
  await page.getByTestId("prio-progress-filter").selectOption("");

  // Cambiar una respuesta ya registrada pide justificación.
  await page.getByTestId(`prio-item-${done.id}`).click();
  await expect(page.locator(".pm-gauge")).toContainText("83.33%");
  await page.getByRole("button", { name: "P5 No" }).click();
  await expect(page.getByTestId("pm-change-note-P5")).toBeVisible();
  await expect(page.locator(".pm-gauge")).toContainText("83.33%");
  await page.getByLabel("Justificación de P5").fill("La aprobación tiene más de doce meses.");
  await page.getByRole("button", { name: "P5 No" }).click();
  await expectToast(page, "%P = 66.67%");

  // El recorrido cuenta quién calificó y qué cambió.
  await page.getByTestId("prio-history-toggle").locator("summary").click();
  const history = page.getByTestId("prio-history");
  await expect(history).toContainText("P1 calificado: Sí");
  await expect(history).toContainText("P5 cambió de Sí a No");
  await expect(history).toContainText("La aprobación tiene más de doce meses.");
  await expect(history).toContainText("Matriz completa: Priorizada");

  // «Siguiente que me toca» lleva a la que aún espera respuesta.
  await page.getByTestId("prio-next-mine").click();
  await expect(page.getByTestId(`prio-item-${open.id}`)).toHaveClass(/prio-item-active/);

  // Matriz del ciclo: una fila por tecnología y al pulsar el nombre se abre para calificar.
  await page.getByTestId("prio-view-matrix").click();
  const row = page.getByTestId(`prio-row-${done.id}`);
  await expect(row.locator("td.is-yes")).toHaveCount(4);
  await expect(row.locator("td.is-no")).toHaveCount(2);
  await expect(row).toContainText("66.67%");
  await expect(page.getByTestId(`prio-row-${open.id}`).locator("td.is-mine")).toHaveCount(6);
  await row.locator(".prio-table-name").click();
  await expect(page.getByTestId("pm-row-P1")).toBeVisible();
  await expect(page.getByTestId(`prio-item-${done.id}`)).toHaveClass(/prio-item-active/);

  // Exporte de la matriz.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("prio-export").click()]);
  expect(download.suggestedFilename()).toMatch(/^priorizacion_.+\.csv$/);
  expectClean(errors);
});
