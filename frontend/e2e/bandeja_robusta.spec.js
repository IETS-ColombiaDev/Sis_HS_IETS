// Bandeja de trabajo: actualizar, filtros de pendientes, avance del ciclo, semana, actividad propia y bloques caídos.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle } from "./helpers";
import { apiAs, createCycle } from "./flow_api";

test("bandeja: filtra pendientes, muestra el ciclo y la semana, y deja retomar lo último", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  // Deja una acción reciente del superadministrador: avanzar un ciclo de etapa.
  const cycle = await createCycle(api, { status: "en_filtrado" });
  const activity = await api.get("/dashboard/my-activity");
  expect(activity[0].label).toBe("Cambió la etapa de un ciclo");
  expect(activity[0].name).toBe(cycle.code);

  await loginAs(page, "superadmin", "/");
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /Bandeja de trabajo/ })).toBeVisible();

  // Hora del cálculo y actualizar.
  await expect(page.getByTestId("bandeja-updated")).toContainText("Actualizado a las");
  await page.getByTestId("bandeja-refresh").click();
  await expect(page.getByTestId("bandeja-refresh")).toBeEnabled();

  // Filtros de pendientes: «Al día» solo deja las tarjetas sin trabajo.
  const cards = page.locator('[data-testid="work-grid"] article');
  const total = await cards.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.getByTestId("work-filter-todos")).toContainText(String(total));
  const idle = page.getByTestId("work-filter-ok");
  if (await idle.count()) {
    await idle.click();
    await expect(page.locator('[data-testid="work-grid"] article[data-empty="false"]')).toHaveCount(0);
    await page.getByTestId("work-filter-todos").click();
    await expect(cards).toHaveCount(total);
  }

  // Avance del ciclo en curso y señales de la semana.
  await expect(page.getByTestId("bandeja-schedule")).toBeVisible();
  await expect(page.getByTestId("bandeja-week").locator(".bw-week-day")).toHaveCount(7);

  if (process.env.SHOTS_OUT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/bandeja_full.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // Lo último que hice lleva a la pantalla donde se retoma.
  const list = page.getByTestId("bandeja-activity");
  await expect(list).toContainText("Cambió la etapa de un ciclo");
  await expect(list).toContainText(cycle.code);
  await list.getByRole("link", { name: /Retomar/ }).first().click();
  await expect(page).toHaveURL(/\/ciclos/);
  expectClean(errors);
});

test("bandeja: un bloque que no se pudo calcular se avisa sin ocultar el resto", async ({ page }) => {
  const errors = watchErrors(page);
  await page.route("**/api/dashboard/my-work", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, degraded: ["drafts"] } });
  });
  await loginAs(page, "superadmin", "/");
  await settle(page);
  await expect(page.getByTestId("bandeja-degraded")).toContainText("1 bloque(s) de la bandeja no se pudieron calcular.");
  await expect(page.getByTestId("work-grid")).toBeVisible();
  expectClean(errors);
});
