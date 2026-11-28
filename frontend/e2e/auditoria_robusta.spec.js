// Auditoría: protección verificada, indicadores, búsqueda, operación completa, enlace directo y descarga.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs } from "./crud_helpers";

test("auditoría: busca, agrupa una operación, abre por enlace y descarga con registro", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const title = uid("Nota auditada");
  const note = await api.post("/notes", { entity_type: "general", title, content: "Contenido inicial." });
  await api.put(`/notes/${note.id}`, { content: "Contenido corregido." });

  // Enlace directo con filtros en la dirección.
  await loginAs(page, "superadmin", `/auditoria?entidad=notes&id=${note.id}`);
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /Bitácora de auditoría/ })).toBeVisible();
  await expect(page.getByLabel("Filtrar por entidad")).toHaveValue("notes");
  await expect(page.getByLabel("Identificador de la entidad")).toHaveValue(String(note.id));

  // La protección se verifica contra la base de datos en uso.
  await expect(page.getByTestId("audit-integrity")).toContainText(/Protección verificada|no se pudo confirmar/);

  // Indicadores del filtro y nombres de las acciones.
  await expect(page.getByTestId("audit-total")).toHaveText("2");
  const table = page.locator(".audit-table");
  await expect(table).toContainText("Escribió una nota");
  await expect(table).toContainText("note:edit");
  await expect(table).toContainText("Editó una nota");

  // Ver toda la operación: los registros de la misma petición.
  const first = page.locator(".audit-table tbody tr").first();
  await first.getByRole("button", { name: "Ver cambios" }).click();
  await page.getByRole("button", { name: "Ver toda la operación" }).click();
  await expect(page.getByTestId("audit-request")).toBeVisible();
  await expect(page).toHaveURL(/peticion=/);
  await page.getByTestId("audit-request").getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByTestId("audit-request")).toHaveCount(0);

  // Búsqueda de texto libre.
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await page.getByLabel("Buscar en la bitácora").fill("note:edit");
  await expect(page).toHaveURL(/q=note/);
  await expect(page.locator(".audit-table tbody tr").first()).toContainText("note:edit");

  if (process.env.SHOTS_OUT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/auditoria_full.png` });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // La descarga respeta el filtro y queda registrada.
  await page.getByLabel("Buscar en la bitácora").fill("");
  await page.getByLabel("Filtrar por entidad").selectOption("notes");
  await page.getByLabel("Identificador de la entidad").fill(String(note.id));
  await expect(page.getByTestId("audit-total")).toHaveText("2");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("audit-export").click()]);
  expect(download.suggestedFilename()).toBe("bitacora_auditoria.csv");
  const exports = await api.get("/audit?action=audit:export&limit=1");
  expect(exports.items[0].new_value.filters).toEqual({ entity_type: "notes", entity_id: String(note.id) });
  expect(exports.items[0].new_value.rows).toBe(2);

  await api.del(`/notes/${note.id}`, 204);
  expectClean(errors);
});
