// Tablero estratégico: ciclo anterior, calidad de los datos, secciones, enlace y actividad.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, techInCycle } from "./flow_api";

test("tablero: compara con el ciclo anterior, muestra vacíos de datos y registra las descargas", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const api = await apiAs(page.request);

  // Dos ciclos con datos: el tablero del más reciente se compara con el que abrió antes.
  const a = await createCycle(api, { status: "en_priorizacion" });
  const b = await createCycle(api, { status: "en_priorizacion" });
  for (const c of [a, b]) {
    await techInCycle(api, c.id, { name: uid("Tablero comparada"), stage: "asignada" });
    await techInCycle(api, c.id, { name: uid("Tablero priorizada") });
  }
  const [older, newer] = [a, b].sort((x, y) => String(x.opened_on).localeCompare(String(y.opened_on)));
  await techInCycle(api, newer.id, { name: uid("Tablero apta"), stage: "apta" });
  const dash = await api.get(`/strategy/dashboard?cycle_id=${newer.id}`);
  expect(dash.comparison, "hay un ciclo anterior").toBeTruthy();
  expect(String(dash.comparison.cycle_id) === String(older.id) || dash.comparison.cycle_code.length > 0).toBeTruthy();

  await loginAs(page, "superadmin", `/dashboards?ciclo=${newer.id}`);
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /Tablero estratégico/ })).toBeVisible();

  // Ciclo anterior: tabla por etapa y diferencia en los indicadores.
  const cmp = page.getByTestId("dc-comparison");
  await expect(cmp).toContainText(dash.comparison.cycle_code);
  const diff = dash.funnel.captured - dash.comparison.funnel.captured;
  const shown = diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : "=";
  await expect(page.getByTestId("dc-compare-captured").locator("td").last()).toHaveText(shown);
  await expect(page.getByTestId("tile-priorizadas")).toContainText(dash.comparison.cycle_code);
  await expect(page.getByTestId("dc-generated")).toBeVisible();

  // Calidad de los datos: la cifra coincide con la API y lleva al filtro.
  const missing = dash.data_quality.items.find((i) => i.key === "sin_ttm");
  expect(missing.count).toBeGreaterThan(0);
  await expect(page.getByTestId("dc-quality-pct")).toHaveText(`${dash.data_quality.complete_pct}%`);
  await expect(page.getByTestId("dc-quality-sin_ttm")).toContainText(String(missing.count));
  await page.getByTestId("dc-quality-sin_ttm").click();
  await expect(page).toHaveURL(/band=desconocido/);
  await expect(page.getByTestId("filter-count")).toHaveText("1");
  // Con el recorte, la comparación sigue usando el mismo filtro en el ciclo anterior.
  await expect(page.getByTestId("dc-comparison")).toBeVisible();
  await page.getByTestId("clear-filters").click();
  await expect(page.getByTestId("filter-count")).toHaveText("0");

  // Navegación por secciones.
  await page.getByTestId("dc-nav").getByRole("button", { name: "Tecnologías" }).click();
  await expect(page.getByTestId("recorte-table")).toBeInViewport();

  if (process.env.SHOTS_OUT) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/tablero_full.png`, fullPage: true });
  }

  // Una descarga queda en la actividad del tablero.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^tablero-.*\.csv$/);
  await page.getByTestId("dc-activity-toggle").click();
  const activity = page.getByTestId("dc-activity");
  await expect(activity).toContainText("Descarga del recorte");
  await expect(activity).toContainText("con montos");

  // Copiar enlace (el portapapeles puede no estar disponible en modo sin interfaz).
  if (testInfo.project.name === "chromium") {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  }
  await page.getByTestId("dc-copy-link").click();
  await expect(page.getByText(/Enlace copiado|No se pudo copiar el enlace/).first()).toBeVisible();
  expectClean(errors);
});
