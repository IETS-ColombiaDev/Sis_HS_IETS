// Entrega final: informe de acceso plegable, historial de vigilancias,
// «Última realizada» bajo el botón y ficha de modelos de inteligencia.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle } from "./helpers";

test("vigilancia: informe plegado, historial y ultima realizada", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/vigilancia");
  await settle(page);

  await expect(page.getByTestId("last-run-caption")).toContainText(/Última realizada|Vigilancia en curso/);

  const report = page.getByTestId("access-report");
  const toggle = page.getByTestId("access-report-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(report.locator("table")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(report.locator("table")).toBeVisible();
  await toggle.click();
  await expect(report.locator("table")).toHaveCount(0);

  const history = page.getByTestId("scan-history");
  await expect(history).toContainText("Historial de vigilancias");
  await expectClean(errors);
});

test("inteligencia: la ficha dice que modelos corren y como aprenden", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/configuracion?tab=inteligencia");
  await settle(page);
  const card = page.getByTestId("model-card");
  await expect(card).toBeVisible();
  for (const key of ["reglas", "aprendizaje", "calibracion", "ia"]) {
    await expect(card.getByTestId(`model-part-${key}`)).toBeVisible();
  }
  await expect(card.getByTestId("model-part-aprendizaje")).toContainText("k-NN");
  await expect(card.getByTestId("model-part-ia")).toContainText("No se entrena");
  await expect(card.getByTestId("model-rule").locator("li")).toHaveCount(4);
  await expect(card.getByTestId("model-trace").or(card.getByTestId("model-trace-empty"))).toBeVisible();
  await expectClean(errors);
});

test("parametros de fuentes: el cliente compatible con navegador viene apagado", async ({ page }) => {
  await loginAs(page, "superadmin", "/configuracion?tab=parametros_fuentes");
  await settle(page);
  const box = page.getByTestId("search-browser_fetch");
  await expect(box).toBeVisible();
  await expect(box).not.toBeChecked();
});
