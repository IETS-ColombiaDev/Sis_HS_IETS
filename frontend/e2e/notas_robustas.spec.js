// Notas: indicadores, filtro de las mías, orden, recorrido, texto sin guardar y exporte con filtro.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, expectToast } from "./crud_helpers";

test("notas: filtra las mías, muestra el recorrido y avisa antes de perder texto", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const admin = await apiAs(page.request);
  const tecnico = await apiAs(page.request, "evaluador_tecnico");
  const tag = uid("NotaRobusta");
  const mine = await admin.post("/notes", { entity_type: "general", title: `${tag} propia`, content: "Decisión del comité." });
  await tecnico.post("/notes", { entity_type: "general", title: `${tag} ajena`, content: "Seguimiento del técnico." });
  await admin.put(`/notes/${mine.id}`, { content: "Decisión del comité, corregida." });

  await loginAs(page, "superadmin", "/notas");
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /Notas del equipo/ })).toBeVisible();
  await expect(page.getByTestId("notes-tiles")).toBeVisible();

  // Las dos notas de la prueba; con «Escritas por mí» queda una.
  await page.getByLabel("Buscar en notas").fill(tag);
  const rows = page.locator(".data-table tbody tr", { hasText: tag });
  await expect(rows).toHaveCount(2);
  await page.getByTestId("notes-tile-mine").click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("propia");
  await expect(rows.first()).toContainText("editada");
  await expect(rows.first()).toContainText("Decisión del comité, corregida.");

  // Exporte con el filtro de la pantalla.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(csv).toString("utf-8");
  expect(text).toContain(`${tag} propia`);
  expect(text).not.toContain(`${tag} ajena`);

  // Recorrido en el detalle.
  await rows.first().getByRole("button", { name: `${tag} propia` }).click();
  await page.getByTestId("note-history-toggle").click();
  const history = page.getByTestId("note-history");
  await expect(history).toContainText("Nota creada");
  await expect(history).toContainText("Cambió: contenido");
  await page.keyboard.press("Escape");

  // Quitar filtros y ordenar por título.
  await page.getByTestId("notes-tile-mine").click();
  await expect(rows).toHaveCount(2);
  await page.getByTestId("notes-sort").selectOption("titulo");
  await expect(rows.first()).toContainText("ajena");

  if (process.env.SHOTS_OUT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/notas_full.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // Texto sin guardar: cancelar pide confirmación.
  await page.getByRole("button", { name: "Nueva nota" }).first().click();
  await page.locator("#note-content").fill("Borrador que no quiero perder.");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText("La nota tiene texto sin guardar.")).toBeVisible();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.locator("#note-content")).toHaveCount(0);

  await admin.del(`/notes/${mine.id}`, 204);
  expectClean(errors);
});
