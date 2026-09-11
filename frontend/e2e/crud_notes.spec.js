// Notas del equipo por la interfaz: crear (general y vinculada), editar, fijar,
// eliminar, exportar CSV y reglas de autor y de perfil.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, disabledHint, expectToast, fixtureSource } from "./crud_helpers";

async function noteRow(page, text) {
  await page.getByLabel("Buscar en notas").fill(text);
  const row = page.locator(".data-table tbody tr", { hasText: text });
  await expect(row).toHaveCount(1);
  return row;
}

test.describe("notas · tomador de decisiones (note:write)", () => {
  test("crea una nota general y otra vinculada, la edita, la fija, la elimina y exporta", async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    const admin = await apiAs(page.request);
    const source = await fixtureSource(admin, baseURL, uid("Fuente con nota"));
    await loginAs(page, "tomador_decisiones", "/notas");
    await settle(page);

    // Nota general.
    const general = uid("Nota general");
    await page.getByRole("button", { name: "Nueva nota" }).click();
    await page.locator("#note-title").fill(general);
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expect(page.locator(".public-submit-error")).toContainText("contenido");
    await page.locator("#note-content").fill("Decision del comite registrada por E2E.");
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expectToast(page, "Nota creada");

    // Nota vinculada a una fuente.
    const linked = uid("Nota fuente");
    await page.getByRole("button", { name: "Nueva nota" }).click();
    await page.locator("#note-entity-type").selectOption("source");
    await expect(page.locator("#note-entity-id option", { hasText: source.title })).toHaveCount(1);
    await page.locator("#note-entity-id").selectOption({ label: source.title });
    await page.locator("#note-title").fill(linked);
    await page.locator("#note-content").fill("Seguimiento de la fuente.");
    await page.getByRole("button", { name: "Guardar nota" }).click();
    await expectToast(page, "Nota creada");
    const linkedRow = await noteRow(page, linked);
    await expect(linkedRow).toContainText(source.title);

    // Editar y fijar.
    let row = await noteRow(page, general);
    await row.getByRole("button", { name: "Editar nota" }).click();
    await page.locator("#note-content").fill("Contenido corregido.");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expectToast(page, "Nota actualizada");
    row = await noteRow(page, general);
    await row.getByRole("button", { name: "Fijar nota" }).click();
    await expectToast(page, "Nota fijada");
    await expect(page.locator(".data-table tbody tr", { hasText: general })).toContainText("📌");

    // Detalle y eliminacion con confirmacion.
    row = await noteRow(page, general);
    await row.getByRole("button", { name: general }).click();
    await expect(page.getByTestId("note-detail")).toContainText("Contenido corregido.");
    await page.keyboard.press("Escape");
    row = await noteRow(page, general);
    await row.getByRole("button", { name: "Eliminar nota" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expectToast(page, "Nota eliminada");

    // Exportar CSV.
    await page.getByLabel("Buscar en notas").fill("");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar CSV" }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    expectClean(errors);
  });
});

test.describe("notas · permisos", () => {
  test("una nota ajena no se edita ni se elimina; el revisor por pares no escribe", async ({ page }) => {
    const errors = watchErrors(page);
    const tecnico = await apiAs(page.request, "evaluador_tecnico");
    const title = uid("Nota ajena");
    const note = await tecnico.post("/notes", { entity_type: "general", title, content: "Nota del tecnico" });

    await loginAs(page, "evaluador_clinico", "/notas");
    await settle(page);
    const row = await noteRow(page, title);
    await expect(row.locator('[data-disabled-hint*="Solo el autor"]')).toHaveCount(2);
    const clinico = await apiAs(page.request, "evaluador_clinico");
    await clinico.put(`/notes/${note.id}`, { content: "cambio" }, 403);
    await clinico.del(`/notes/${note.id}`, 403);
    // Fijar si esta permitido.
    await clinico.put(`/notes/${note.id}`, { pinned: true });

    const revisor = await apiAs(page.request, "revisor_pares");
    await revisor.post("/notes", { entity_type: "general", content: "No" }, 403);
    await tecnico.del(`/notes/${note.id}`, 204);
    expectClean(errors);
  });

  test("revisor por pares ve el boton de nueva nota deshabilitado con motivo", async ({ page }) => {
    await loginAs(page, "revisor_pares", "/notas");
    await settle(page);
    await expect(disabledHint(page, "note:write")).toHaveCount(1);
  });
});
