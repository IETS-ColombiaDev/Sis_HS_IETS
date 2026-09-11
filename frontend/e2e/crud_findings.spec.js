// Senales capturadas por la interfaz: listar, filtrar, ver, editar, cambiar estado,
// generar informe (preliminar sin IA), IA deshabilitada con motivo y eliminar.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, expectToast, signal } from "./crud_helpers";

async function findRow(page, title) {
  await page.getByLabel("Buscar señal").fill(title);
  await page.getByRole("button", { name: "Tabla" }).click();
  const row = page.locator(".data-table tbody tr", { hasText: title });
  await expect(row).toHaveCount(1);
  return row;
}

test.describe("senales · evaluador clinico", () => {
  test("filtra, abre la ficha, edita, cambia estado, genera informe y elimina", async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const title = uid("Senal CRUD");
    const { finding } = await signal(api, baseURL, title);
    await loginAs(page, "evaluador_clinico", "/senales");
    await settle(page);
    await expect(page.getByTestId("findings-kpi-nuevas")).toBeVisible();

    // Filtro por texto y por estado.
    let row = await findRow(page, title);
    await page.getByLabel("Filtrar por estado").selectOption("descartado");
    await expect(page.locator(".data-table tbody tr", { hasText: title })).toHaveCount(0);
    await page.getByLabel("Filtrar por estado").selectOption("");
    row = page.locator(".data-table tbody tr", { hasText: title });
    await expect(row).toHaveCount(1);

    // Ficha: IA apagada explica por que no se puede enriquecer.
    await row.getByRole("button", { name: "Ver" }).click();
    const detail = page.getByTestId("finding-detail");
    await expect(detail).toContainText(title);
    await expect(detail.locator('[data-disabled-hint*="IA no está configurada"]')).toHaveCount(1);

    // Cambio rapido de estado desde la ficha.
    await detail.getByRole("button", { name: "revisado" }).click();
    await expectToast(page, "Marcada como revisado");

    // Editar desde la ficha: titulo vacio no se acepta.
    await detail.getByRole("button", { name: "Editar" }).click();
    await page.locator("#finding-title").fill("   ");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.locator(".public-submit-error")).toContainText("obligatorio");
    const renamed = `${title} editada`;
    await page.locator("#finding-title").fill(renamed);
    await page.locator("#finding-horizon").selectOption("inminente");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expectToast(page, "Señal actualizada");
    await expect(detail).toContainText(renamed);

    // Generar informe sin IA: queda una version preliminar.
    await detail.getByRole("button", { name: "Generar informe" }).click();
    await expectToast(page, "informe preliminar");
    await page.keyboard.press("Escape");

    // Eliminar con confirmacion (sigue en la bandeja sin asignar).
    row = await findRow(page, renamed);
    await row.getByRole("button", { name: `Eliminar ${renamed}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expectToast(page, "Señal eliminada");
    await expect(page.locator(".data-table tbody tr", { hasText: renamed })).toHaveCount(0);
    await api.get(`/findings/${finding.id}`, 404);
    expectClean(errors);
  });
});

test.describe("senales · permisos", () => {
  test("tomador de decisiones lee y comenta, pero no edita ni elimina", async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    const admin = await apiAs(page.request);
    const title = uid("Senal lectura");
    const { finding } = await signal(admin, baseURL, title);
    await loginAs(page, "tomador_decisiones", "/senales");
    await settle(page);
    await expect(page.getByTestId("findings-readonly")).toBeVisible();
    const row = await findRow(page, title);
    await expect(row.getByRole("button", { name: `Eliminar ${title}` })).toHaveCount(0);
    await row.getByRole("button", { name: "Ver" }).click();
    const detail = page.getByTestId("finding-detail");
    await expect(detail.getByRole("button", { name: "Editar" })).toHaveCount(0);
    // Si puede dejar una nota en la ficha (note:write).
    await detail.getByLabel("Contenido de la nota").fill("Observacion del tomador de decisiones");
    await detail.getByRole("button", { name: "Agregar nota" }).click();
    await expectToast(page, "Nota guardada");
    const api = await apiAs(page.request, "tomador_decisiones");
    await api.put(`/findings/${finding.id}`, { status: "revisado" }, 403);
    await api.del(`/findings/${finding.id}`, 403);
    expectClean(errors);
  });
});
