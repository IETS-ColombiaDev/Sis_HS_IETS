// Priorizacion P1-P6 por perfil (permisos por campo, %P solo completo, franjas),
// nombres largos recortados y cola paginada con busqueda (P5-2).
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import {
  apiAs,
  assign,
  classify,
  createCycle,
  expectToast,
  qualify,
  seedTechs,
  techInCycle,
  useCycleInPage,
} from "./flow_api";

test.describe.configure({ mode: "serial" });

const shared = {};
const LONG_TAIL =
  " + ADT +/- abiraterone EvoPAR-Prostate02 localised/locally advanced BRCAm prostate cancer - Phase III " +
  "Close Mechanism: PARP1 inhibitor + ADT +/- NHA Area under investigation: localised/locally advanced " +
  "BRCAm prostate cancer Molecule size: Small molecule";

async function openItem(page, name) {
  await page.getByTestId("prio-search").fill(name.slice(0, 40));
  const item = page.getByTestId(`prio-item-${shared.tech.id}`);
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByTestId("pm-row-P1")).toBeVisible();
}

test.describe("priorizacion P1 a P6", () => {
  test("el evaluador tecnico califica P1, P5 y P6; el nombre largo se recorta", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    shared.cycle = await createCycle(api, { status: "en_priorizacion" });
    shared.tag = uid("Prio");
    shared.name = `${shared.tag} saruparib${LONG_TAIL}`;
    shared.tech = await techInCycle(api, shared.cycle.id, { name: shared.name, stage: "apta" });

    await useCycleInPage(page, shared.cycle.id);
    await loginAs(page, "evaluador_tecnico", "/priorizacion");
    await settle(page);
    await openItem(page, shared.name);

    // Nombre largo: recortado en la cola y en el detalle, completo a demanda.
    const itemName = page.getByTestId(`prio-item-${shared.tech.id}`).locator(".prio-item-name");
    await expect(itemName).toHaveAttribute("data-clamped", "true");
    await expect(itemName).toHaveAttribute("title", shared.name);
    const title = page.getByTestId("prio-detail-title");
    await expect(title).toHaveAttribute("data-clamped", "true");
    const box = await title.boundingBox();
    expect(box.height).toBeLessThan(110);
    await page.getByRole("button", { name: "Ver nombre completo" }).click();
    await expect(title).toHaveAttribute("data-clamped", "false");
    await expect(page.getByRole("button", { name: "Ver menos" })).toBeVisible();

    // Permisos por campo: el tecnico no ve botones de P2-P4.
    await expect(page.getByRole("button", { name: "P2 Sí" })).toHaveCount(0);
    await expect(page.getByTestId("pm-row-P2")).toContainText("Califica evaluador clínico");
    await page.getByRole("button", { name: "P1 Sí" }).click();
    await expectToast(page, "P1 registrado. Faltan");
    await page.getByRole("button", { name: "P5 No" }).click();
    await expectToast(page, "P5 registrado.");
    await page.getByRole("button", { name: "P6 Sí" }).click();
    await expectToast(page, "P6 registrado. Faltan P2, P3, P4");
    // %P no se muestra con criterios pendientes.
    await expect(page.getByText("3 de 6 calificados")).toBeVisible();
    await expect(page.getByText("El índice %P no se calcula con criterios pendientes")).toBeVisible();
    await expect(page.getByTestId("prio-to-evaluation")).toBeDisabled();
    expectClean(errors);
  });

  test("el evaluador clinico completa P2 a P4 y la franja se asigna sola", async ({ page }) => {
    const errors = watchErrors(page);
    await useCycleInPage(page, shared.cycle.id);
    await loginAs(page, "evaluador_clinico", "/priorizacion");
    await settle(page);
    await page.getByTestId("prio-only-mine").click();
    await openItem(page, shared.name);

    await expect(page.getByRole("button", { name: "P1 Sí" })).toHaveCount(0);
    await page.getByRole("button", { name: "P2 Sí" }).click();
    await expectToast(page, "P2 registrado.");
    await page.getByRole("button", { name: "P3 Sí" }).click();
    await expectToast(page, "P3 registrado.");
    await page.getByRole("button", { name: "Agregar justificación a P4" }).click();
    await page.getByLabel("Justificación de P4").fill("Sin cambio de ruta clinica relevante (E2E).");
    await page.getByRole("button", { name: "P4 No" }).click();
    await expectToast(page, "%P = 66.67%");
    await expect(page.locator(".pm-gauge")).toContainText("66.67%");
    await expect(page.locator(".pm-gauge")).toContainText("Priorizada");
    await expect(page.getByTestId("pm-row-P4")).toContainText("Sin cambio de ruta clinica relevante");
    // Con "Solo lo que me toca", la calificada sale de la cola pero sigue a la vista
    // (antes desaparecia antes de poder leer el %P resultante).
    await expect(page.getByTestId("prio-out-of-filter")).toBeVisible();
    await page.waitForTimeout(6000); // un ciclo del sondeo en vivo no la debe quitar
    await expect(page.locator(".pm-gauge")).toContainText("66.67%");
    expectClean(errors);
  });

  test("un tomador de decisiones consulta la matriz sin poder calificar", async ({ page }) => {
    const errors = watchErrors(page);
    await useCycleInPage(page, shared.cycle.id);
    await loginAs(page, "tomador_decisiones", "/priorizacion");
    await settle(page);
    await openItem(page, shared.name);
    await expect(page.locator(".pm-btn-yes")).toHaveCount(0);
    await expect(page.getByTestId("pm-row-P1")).toContainText("Registrado");
    await expect(page.getByTestId("prio-to-evaluation")).toHaveCount(0);
    await expect(page.getByTestId("prio-exclude")).toHaveCount(0);
    expectClean(errors);
  });

  test("la cola pagina, busca y filtra; la priorizada pasa a evaluacion", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const bulkTag = uid("Lote");
    const bulk = await seedTechs(
      api,
      Array.from({ length: 55 }, (_, i) => ({ name: `${bulkTag} tecnologia ${String(i).padStart(2, "0")}` }))
    );
    for (const t of bulk) await classify(api, t.id);
    await assign(api, shared.cycle.id, bulk.map((t) => t.id));
    for (const t of bulk) await qualify(api, shared.cycle.id, t.id);

    await useCycleInPage(page, shared.cycle.id);
    await loginAs(page, "superadmin", "/priorizacion");
    await settle(page);
    const pager = page.getByTestId("prio-pager");
    await expect(pager).toContainText("1-50 de 56");
    await expect(page.getByTestId("prio-queue").getByRole("button")).toHaveCount(50);
    await page.getByTestId("prio-next-page").click();
    await expect(pager).toContainText("51-56 de 56");
    await expect(page.getByTestId("prio-queue").getByRole("button")).toHaveCount(6);

    await page.getByTestId("prio-search").fill(bulkTag);
    await expect(pager).toContainText("1-50 de 55");
    await page.getByTestId("prio-search").fill("");
    await page.getByTestId("prio-status").selectOption("priorizada");
    await expect(pager).toContainText("1-1 de 1");
    await page.getByTestId(`prio-item-${shared.tech.id}`).click();

    await page.getByTestId("prio-to-evaluation").click();
    await page.getByRole("button", { name: "Pasar a evaluación", exact: true }).last().click();
    await expectToast(page, "Pasa a evaluación temprana");
    await expect(page.getByText("Sin resultados")).toBeVisible();

    const reports = await api.get(`/reports?cycle_id=${shared.cycle.id}`);
    const item = reports.find((r) => r.technology_id === shared.tech.id);
    expect(item.entry_status).toBe("en_evaluacion");
    expect(item.doc_id).toBeTruthy();
    // La calificacion queda fija: la API rechaza recalificar.
    await api.post(`/priority/${shared.cycle.id}/${shared.tech.id}/rate`, { criterion: "P4", value: 1 }, 409);
    expectClean(errors);
  });
});
