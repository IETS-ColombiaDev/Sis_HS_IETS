// Diseminación: un informe nace como borrador, una persona lo valida, editarlo lo devuelve
// a borrador, queda el recorrido, y el paquete dice qué trae antes de descargarlo.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, expectToast } from "./crud_helpers";

const CONTENT = "## Síntesis\n" + "Recomendación de adopción condicionada para el sistema de salud colombiano. ".repeat(3);

test("diseminacion: validar, editar un validado, devolver a borrador, recorrido y exporte", async ({ page }) => {
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const title = uid("Informe por validar");
  const rec = await api.post("/recommendations", { title, content: CONTENT, impact: "alto" }, 201);

  await loginAs(page, "evaluador_tecnico", "/diseminacion");
  await settle(page);
  await expect(page.getByTestId("recs-kpi-draft")).toBeVisible();
  await expect(page.getByTestId("package-preview")).toContainText("Qué trae");

  // Nace como borrador y se valida desde la ventana de lectura.
  await page.getByLabel("Buscar informe").fill(title);
  const card = page.locator(".informe-card", { hasText: title });
  await expect(card).toContainText("Borrador");
  await card.getByRole("button", { name: "Leer informe completo" }).click();
  await expect(page.getByTestId("rec-history")).toContainText("Informe creado");
  await page.getByTestId("rec-validate").click();
  await expectToast(page, "Informe validado");
  await expect(page.getByTestId("rec-history")).toContainText("Validado");
  await expect(page.getByTestId("rec-reopen")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toContainText("Validado por");
  await expect(card.getByRole("button", { name: /Eliminar informe/ })).toBeDisabled();

  // Pestañas por estado.
  await page.getByTestId("recs-tab-borrador").click();
  await expect(card).toHaveCount(0);
  await page.getByTestId("recs-tab-validado").click();
  await expect(card).toHaveCount(1);
  await page.getByTestId("recs-tab-todos").click();

  // Editar un validado avisa y lo devuelve a borrador.
  await card.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByTestId("rec-edit-warning")).toBeVisible();
  await page.locator("#edit-rec-content").fill(`${CONTENT}\nAjuste posterior a la validación.`);
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expectToast(page, "Volvió a borrador");
  await expect(card).toContainText("Borrador");

  // Validar de nuevo y devolver a borrador con motivo.
  await card.getByRole("button", { name: "Leer informe completo" }).click();
  await page.getByTestId("rec-validate").click();
  await expectToast(page, "Informe validado");
  await page.getByTestId("rec-reopen").click();
  await page.locator("#rec-reopen-reason").fill("Falta el comparador vigente.");
  await page.getByTestId("rec-reopen-confirm").click();
  await expectToast(page, "Informe devuelto a borrador");
  const history = page.getByTestId("rec-history");
  await expect(history).toContainText("Devuelto a borrador");
  await expect(history).toContainText("Falta el comparador vigente.");
  await expect(history).toContainText("Cambió: contenido");
  await page.keyboard.press("Escape");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("recs-export").click()]);
  expect(download.suggestedFilename()).toBe("informes_diseminacion.csv");

  await api.del(`/recommendations/${rec.id}`, 204);
  expectClean(errors);
});
