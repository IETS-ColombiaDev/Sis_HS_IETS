// Alertas: indicadores, reglas, filtros, enlace a la tecnología, leer y desleer, quitar y exporte.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, expectToast, techInCycle } from "./flow_api";

test("alertas: filtra la bandeja, abre la tecnología, marca, quita y exporta", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const admin = await apiAs(page.request);
  const me = await apiAs(page.request, "tomador_decisiones");

  // Suscripción general y una tecnología de alto riesgo (5 puntos) que cambia de etapa.
  await me.post("/alerts/subscriptions", { cluster_id: null, enabled: true });
  const cycle = await createCycle(admin, { status: "en_priorizacion" });
  const name = uid("AlertaRobusta");
  await techInCycle(admin, cycle.id, { name, values: [1, 1, 1, 1, 1, 0] });
  const mine = await me.get(`/alerts?q=${encodeURIComponent(name)}`);
  expect(mine.length).toBeGreaterThan(0);
  const alert = mine[0];
  const otherName = uid("AlertaQuitar");
  await techInCycle(admin, cycle.id, { name: otherName, values: [1, 1, 1, 1, 1, 0] });
  const [other] = await me.get(`/alerts?q=${encodeURIComponent(otherName)}`);
  expect(alert.technology_name).toContain(name);
  expect(alert.kind_label).toBe("Cambio de etapa · alto riesgo presupuestal");

  await loginAs(page, "tomador_decisiones", "/alertas");
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /Alertas tempranas/ })).toBeVisible();

  // Indicadores y reglas.
  await expect(page.getByTestId("alerts-tile-unread").locator("strong")).not.toHaveText("0");
  await page.getByTestId("alerts-rules-toggle").click();
  await expect(page.getByTestId("alerts-rules")).toContainText("o más puntos en la matriz de priorización");
  await expect(page.getByTestId("alerts-rules")).toContainText("Vigilancia programada");

  // Búsqueda y filtro por tipo.
  await page.getByTestId("alerts-search").fill(name);
  await expect(page.getByTestId("alerts-count")).toHaveText(`Mostrando ${mine.length} de ${mine.length}`);
  await page.getByTestId("alerts-kind").selectOption(alert.kind);
  const card = page.getByTestId(`alert-${alert.id}`);
  await expect(card).toContainText(name);
  await expect(card).toContainText("Cambio de etapa · alto riesgo presupuestal");
  await expect(page.getByTestId(`alert-open-${alert.id}`)).toHaveAttribute("href", new RegExp(`tecnologia=${alert.technology_id}`));

  // Exporte con el filtro de la pantalla.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("alerts-export").click()]);
  expect(download.suggestedFilename()).toBe("alertas_tempranas.csv");

  // Leer, desleer y quitar.
  await page.getByTestId(`alert-read-${alert.id}`).click();
  await expect(page.getByTestId(`alert-unread-${alert.id}`)).toBeVisible();
  await page.getByTestId(`alert-unread-${alert.id}`).click();
  await expect(page.getByTestId(`alert-read-${alert.id}`)).toBeVisible();

  if (process.env.SHOTS_OUT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/alertas_full.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page.getByTestId("alerts-clear-filters").click();
  await expect(page.getByTestId("alerts-search")).toHaveValue("");
  await page.getByTestId(`alert-delete-${other.id}`).click();
  await expect(page.getByTestId(`alert-${other.id}`)).toHaveCount(0);
  await expect(card).toBeVisible();

  // Quitar las leídas conserva las sin leer.
  await page.getByRole("button", { name: "Marcar todas como leídas" }).click();
  await expectToast(page, /marcadas como leídas|No había alertas sin leer/);
  await page.getByTestId("alerts-clear-read").click();
  await page.getByRole("button", { name: "Quitar las leídas" }).last().click();
  await expectToast(page, "leídas quitadas de la bandeja");
  await expect(page.getByText("Sin alertas", { exact: true })).toBeVisible();

  // Deja al perfil como estaba.
  await me.post("/alerts/subscriptions", { cluster_id: null, enabled: false });
  expectClean(errors);
});
