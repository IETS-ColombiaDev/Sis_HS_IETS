// Diseminacion por la interfaz: informe manual, generado desde una senal (sin IA
// sale preliminar), edicion, eliminacion y paquete ZIP del ciclo.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, disabledHint, expectToast, signal } from "./crud_helpers";

test.describe("diseminacion · evaluador tecnico", () => {
  test("crea, genera, edita, elimina y descarga el paquete del ciclo", async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    const admin = await apiAs(page.request);
    const signalTitle = uid("Senal informe");
    await signal(admin, baseURL, signalTitle);
    await loginAs(page, "evaluador_tecnico", "/diseminacion");
    await settle(page);

    // Informe manual: titulo y contenido obligatorios.
    const title = uid("Informe manual");
    await page.getByRole("button", { name: "Nuevo informe" }).click();
    await page.getByRole("button", { name: "Guardar informe" }).click();
    await expect(page.locator(".public-submit-error")).toContainText("obligatorios");
    await page.locator("#rec-title").fill(title);
    await page.locator("#rec-impact").selectOption("alto");
    await page.locator("#rec-content").fill("## Sintesis\nRecomendacion redactada a mano.");
    await page.getByRole("button", { name: "Guardar informe" }).click();
    await expectToast(page, "Informe creado");
    await expect(page.getByTestId("rec-detail")).toContainText("Recomendacion redactada a mano.");
    await page.keyboard.press("Escape");

    // Editar desde la tarjeta.
    await page.getByLabel("Buscar informe").fill(title);
    const card = page.locator(".informe-card", { hasText: title });
    await expect(card).toHaveCount(1);
    await card.getByRole("button", { name: "Editar" }).click();
    await page.locator("#edit-rec-impact").selectOption("bajo");
    await page.locator("#edit-rec-content").fill("Contenido revisado por el comite.");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expectToast(page, "Informe actualizado");
    await expect(page.locator(".informe-card", { hasText: title })).toContainText("Impacto bajo");

    // Generar desde una senal: sin IA queda preliminar.
    await page.getByRole("button", { name: "Generar desde una señal" }).click();
    await page.locator("#rec-finding-search").fill(signalTitle);
    await expect(page.locator("#rec-finding option", { hasText: signalTitle })).toHaveCount(1);
    await page.locator("#rec-finding").selectOption({ label: signalTitle });
    await page.getByRole("button", { name: "Crear versión preliminar" }).click();
    await expectToast(page, "informe preliminar");
    await expect(page.getByTestId("rec-detail")).toContainText("modo sin IA");
    await page.keyboard.press("Escape");

    // Eliminar el informe manual.
    await page.getByLabel("Buscar informe").fill(title);
    await page.locator(".informe-card", { hasText: title }).getByRole("button", { name: /Eliminar informe/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expectToast(page, "Informe eliminado");
    await expect(page.locator(".informe-card", { hasText: title })).toHaveCount(0);

    // Paquete de diseminacion del ciclo seleccionado.
    await page.getByLabel("Ciclo del paquete").selectOption({ index: 0 });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("package-card").getByRole("button", { name: "Descargar ZIP" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^paquete_diseminacion_.*\.zip$/);
    await expectToast(page, "Paquete descargado");
    expectClean(errors);
  });
});

test.describe("diseminacion · permisos", () => {
  test("revisor por pares solo lee: sin alta ni paquete, y la API responde 403", async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, "revisor_pares", "/diseminacion");
    await settle(page);
    await expect(disabledHint(page, "report:write").first()).toBeVisible();
    await expect(disabledHint(page, "notas internas")).toHaveCount(1);
    const api = await apiAs(page.request, "revisor_pares");
    await api.post("/recommendations", { title: "x", content: "y" }, 403);
    const cycles = await api.get("/cycles");
    if (cycles.length) await api.get(`/recommendations/package/${cycles[0].id}`, 403);
    expectClean(errors);
  });

  test("tomador de decisiones descarga el paquete pero no redacta", async ({ page }) => {
    await loginAs(page, "tomador_decisiones", "/diseminacion");
    await settle(page);
    await expect(disabledHint(page, "report:write").first()).toBeVisible();
    await expect(page.getByTestId("package-card").getByRole("button", { name: "Descargar ZIP" })).toBeEnabled();
  });
});
