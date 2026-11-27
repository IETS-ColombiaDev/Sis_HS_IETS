// Ciclos: indicadores, calendario, etapas con avisos, motivo al devolver, recorrido, búsqueda y exporte.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, techInCycle, expectToast } from "./flow_api";

test("ciclos: avisa antes de avanzar, pide motivo al devolver y deja el recorrido", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const cycle = await createCycle(api, { status: "en_priorizacion" });
  await techInCycle(api, cycle.id, { name: uid("Ciclo sin filtrar"), stage: "asignada" });
  const year = cycle.opened_on.slice(0, 4);

  await loginAs(page, "superadmin", "/ciclos");
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /Ciclos de escaneo/ })).toBeVisible();

  // Indicadores y calendario del año del ciclo.
  await expect(page.getByTestId("cycles-tile-quota")).toContainText(/\d+ de \d+/);
  await expect(page.getByTestId("cycles-tile-open")).toBeVisible();
  await page.getByTestId("cycles-year").selectOption(year);
  await expect(page.getByTestId(`cycles-bar-${cycle.id}`)).toBeVisible();

  // Búsqueda y pestañas.
  await page.getByTestId("cycles-search").fill(cycle.code);
  await expect(page.locator('[data-testid^="cycle-card-"]')).toHaveCount(1);
  await page.getByTestId("cycles-tab-cerrados").click();
  await expect(page.getByText("Ningún ciclo coincide")).toBeVisible();
  await page.getByTestId("cycles-tab-abiertos").click();
  const card = page.getByTestId(`cycle-card-${cycle.id}`).locator("xpath=..");
  await expect(card).toBeVisible();

  // Etapas y ventana: el ciclo de prueba abre en el futuro.
  await expect(card.locator(".cy-steps li.is-current")).toHaveText(/Priorización/);
  await expect(page.getByTestId(`cycle-schedule-${cycle.id}`)).toContainText("Abre en");
  await expect(card).toContainText("1 tecnología(s) en el ciclo");

  // Avanzar con trabajo pendiente: avisa y deja seguir.
  await card.getByRole("button", { name: "Pasar a: En evaluación" }).click();
  const warnings = page.getByTestId("cycle-move-warnings");
  await expect(warnings).toContainText("1 tecnología(s) siguen sin filtrar.");
  await expect(warnings).toContainText("Ninguna tecnología quedó priorizada todavía.");
  await page.getByTestId("cycle-move-confirm").click();
  await expectToast(page, `${cycle.code}: En evaluación.`);
  await expect(card.locator(".cy-steps li.is-current")).toHaveText(/Evaluación/);

  // Devolver: sin motivo no se puede.
  await card.getByRole("button", { name: "Devolver a: En priorización" }).click();
  await expect(page.getByTestId("cycle-move-confirm")).toBeDisabled();
  await page.locator("#cycle-move-reason").fill("Faltó calificar una tecnología");
  await page.getByTestId("cycle-move-confirm").click();
  await expectToast(page, `${cycle.code}: En priorización.`);
  const status = await api.put(`/cycles/${cycle.id}/status`, { status: "en_filtrado", justification: "" }, 422);
  expect(status.detail).toContain("motivo");

  // Recorrido.
  await page.getByTestId(`cycle-history-toggle-${cycle.id}`).click();
  const history = page.getByTestId(`cycle-history-${cycle.id}`);
  await expect(history).toContainText("Avanzó de etapa");
  await expect(history).toContainText("Devuelto a una etapa anterior");
  await expect(history).toContainText("En evaluación → En priorización · Motivo: Faltó calificar una tecnología");

  if (process.env.SHOTS_OUT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/ciclos_full.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/ciclos_movil.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // Exporte del listado.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("cycles-export-csv").click()]);
  expect(download.suggestedFilename()).toBe("ciclos_de_escaneo.csv");

  // El formulario avisa cuando la ventana se cruza con otro ciclo, sin impedir guardar.
  await page.getByTestId("cycle-new").click();
  await page.locator("#cycle-opened").fill(cycle.opened_on);
  await page.locator("#cycle-cutoff").fill(cycle.data_cutoff_on);
  await page.locator("#cycle-bulletin").fill(cycle.bulletin_due_on);
  await expect(page.getByTestId("cycle-overlap")).toContainText(cycle.code);
  expectClean(errors);
});
