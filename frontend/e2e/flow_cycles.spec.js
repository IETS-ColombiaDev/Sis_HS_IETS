// Flujo de ciclos (RF05): crear con validaciones de ventana y cuota, editar,
// transicionar, eliminar, cerrar con congelacion y arrastrar lo bajo vigilancia.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, freeYear, isoDate, techInCycle, expectToast } from "./flow_api";

function cardOf(page, id) {
  return page.getByTestId(`cycle-card-${id}`).locator("xpath=..");
}

test.describe("ciclos de escaneo", () => {
  test("crea con validaciones, edita, transiciona y elimina un ciclo", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const fullYear = freeYear();
    const quota = [];
    for (let i = 0; i < 3; i += 1) {
      quota.push(
        await api.post("/cycles", {
          code: uid(`REG-Cuota ${fullYear}`),
          opened_on: isoDate(fullYear, 1 + i * 4, 1),
          data_cutoff_on: isoDate(fullYear, 3 + i * 4, 20),
          notes: "",
        })
      );
    }
    let year = freeYear();
    while (year === fullYear) year = freeYear();
    const code = uid("REG-UI");

    await loginAs(page, "superadmin", "/ciclos");
    await settle(page);
    await page.getByTestId("cycle-new").click();

    // Ventana fuera de rango: el formulario lo dice y no deja crear.
    await page.locator("#cycle-code").fill(code);
    await page.locator("#cycle-opened").fill(isoDate(year, 1, 5));
    await page.locator("#cycle-cutoff").fill(isoDate(year, 1, 26));
    await page.locator("#cycle-bulletin").fill("");
    await expect(page.getByTestId("cycle-window")).toContainText("el sistema exige entre");
    await expect(page.getByTestId("cycle-submit")).toBeDisabled();

    // Cuota anual llena: mensaje explicito.
    await page.locator("#cycle-opened").fill(isoDate(fullYear, 11, 1));
    await page.locator("#cycle-cutoff").fill(isoDate(fullYear, 12, 30));
    await expect(page.getByTestId("cycle-quota")).toContainText(`ya tiene 3 ciclos formales`);
    await expect(page.getByTestId("cycle-submit")).toBeDisabled();

    // Corte antes de la apertura.
    await page.locator("#cycle-opened").fill(isoDate(year, 3, 1));
    await page.locator("#cycle-cutoff").fill(isoDate(year, 2, 1));
    await expect(page.getByText("El corte debe ser posterior a la apertura.")).toBeVisible();

    // Datos validos.
    await page.locator("#cycle-opened").fill(isoDate(year, 1, 5));
    await page.locator("#cycle-cutoff").fill(isoDate(year, 3, 16));
    await page.locator("#cycle-bulletin").fill(isoDate(year, 3, 30));
    await expect(page.getByTestId("cycle-window")).toContainText("dentro del rango metodológico");
    await page.getByTestId("cycle-submit").click();
    await expectToast(page, `Ciclo ${code} creado.`);

    const created = (await api.get("/cycles")).find((c) => c.code === code);
    expect(created.status).toBe("en_configuracion");
    const card = cardOf(page, created.id);
    await expect(card).toContainText("Ciclo en pantalla");

    // Editar
    await card.getByRole("button", { name: "Editar" }).click();
    await page.locator("#cycle-notes").fill("Notas editadas por la prueba E2E");
    await page.getByTestId("cycle-submit").click();
    await expectToast(page, `Ciclo ${code} actualizado.`);
    await expect(card).toContainText("Notas editadas por la prueba E2E");

    // Transiciones: avanzar y retroceder
    await card.getByRole("button", { name: "Pasar a: En filtrado" }).click();
    await expectToast(page, `${code}: En filtrado.`);
    await expect(card.getByRole("button", { name: "Eliminar" })).toHaveCount(0);
    await card.getByRole("button", { name: "Devolver a: En configuración" }).click();
    await expectToast(page, `${code}: En configuración.`);

    // Eliminar con confirmacion
    await card.getByRole("button", { name: "Eliminar" }).click();
    await page.getByRole("button", { name: "Eliminar ciclo" }).click();
    await expectToast(page, `Ciclo ${code} eliminado.`);
    await expect(page.getByTestId(`cycle-card-${created.id}`)).toHaveCount(0);

    for (const c of quota) await api.del(`/cycles/${c.id}`, 204);
    expectClean(errors);
  });

  test("cierra con justificacion, congela y arrastra lo bajo vigilancia", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const source = await createCycle(api, { status: "en_evaluacion" });
    const target = await createCycle(api, { status: "en_filtrado" });
    const inEval = await techInCycle(api, source.id, { name: uid("En evaluacion") });
    await api.post(`/technologies/${inEval.id}/cycles/${source.id}/to-evaluation`);
    const watched = await techInCycle(api, source.id, { name: uid("Vigilada"), values: [1, 1, 1, 0, 0, 0] });

    await loginAs(page, "superadmin", "/ciclos");
    await settle(page);
    const card = cardOf(page, source.id);
    await card.getByRole("button", { name: "Cerrar y consolidar" }).click();

    await expect(page.getByText("tecnología(s) en evaluación sin informe final")).toBeVisible();
    await expect(page.getByTestId("cycle-close-confirm")).toBeDisabled();
    await page.locator("#cycle-close-justification").fill("Cierre E2E: el informe se publica en el ciclo siguiente.");
    await page.getByTestId("cycle-close-confirm").click();
    await expectToast(page, `${source.code} cerrado.`);
    await expectToast(page, "quedaron bajo vigilancia");

    await card.getByRole("button", { name: /Arrastrar 1 bajo vigilancia/ }).click();
    await page.locator("#cycle-carry-target").selectOption(String(target.id));
    await page.getByTestId("cycle-carry-confirm").click();
    await expectToast(page, `propuestas para ${target.code}`);

    // Congelacion: el ciclo cerrado ya no admite calificaciones.
    await api.post(`/priority/${source.id}/${watched.id}/rate`, { criterion: "P4", value: 1 }, 409);
    const queue = await api.get(`/priority/${target.id}/queue`);
    const carried = queue.find((i) => i.technology_id === watched.id);
    expect(carried.carried_from_cycle_id).toBe(source.id);
    expect(carried.previous_priority_pct).toBe(50);
    expectClean(errors);
  });

  test("los permisos del ciclo se reflejan en la interfaz", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_evaluacion" });

    await loginAs(page, "evaluador_tecnico", "/ciclos");
    await settle(page);
    await expect(page.getByTestId("cycle-new")).toBeVisible();
    const close = cardOf(page, cycle.id).locator("[data-disabled-hint]", { hasText: "Cerrar y consolidar" });
    await expect(close).toHaveAttribute("data-disabled-hint", /Solo el superadministrador/);

    await page.goto("/ciclos");
    await settle(page);
    expectClean(errors);
  });

  test("un perfil sin permiso de ciclo solo consulta", async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, "evaluador_clinico", "/ciclos");
    await settle(page);
    await expect(page.getByTestId("cycle-new")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Pasar a:/ })).toHaveCount(0);
    expectClean(errors);
  });
});
