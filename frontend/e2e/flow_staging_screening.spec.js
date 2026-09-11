// Bandeja de entrada (RF04, RF06-RF08) y filtrado (RF09-RF12) recorridos por la interfaz.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import {
  apiAs,
  assign,
  classify,
  createCycle,
  expectToast,
  seedTechs,
  useCycleInPage,
} from "./flow_api";

test.describe("bandeja de entrada", () => {
  test("clasifica con sugerencia, bloquea lo no clasificado y asigna por lotes", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_filtrado" });
    const tag = uid("Bandeja");
    const techs = await seedTechs(api, [
      { name: `${tag} Alfa`, indication: "Cancer de mama metastasico" },
      { name: `${tag} Beta`, indication: "Diabetes tipo 2" },
      { name: `${tag} Gamma`, indication: "Asma grave" },
    ]);
    // La fuente solo propone cluster: sin confirmacion la senal no entra al ciclo.
    for (const t of techs) expect(t.cluster_id).toBeNull();

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "superadmin", "/bandeja-entrada");
    await settle(page);
    await page.getByLabel("Buscar señales").fill(tag);
    await expect(page.getByTestId("staging-count")).toContainText("Mostrando 3 de 3");

    await page.getByLabel("Seleccionar todas las filas cargadas").check();
    await page.getByTestId("staging-assign").click();
    await expect(page.getByText("3 señal(es) quedan fuera porque les falta clúster")).toBeVisible();
    await expect(page.getByTestId("staging-assign-confirm")).toBeDisabled();
    await page.getByRole("button", { name: "Cancelar" }).click();

    // Clasificar dos senales desde la interfaz (una con la sugerencia asistida).
    const { clusters, types } = await (async () => ({
      clusters: await api.get("/clusters"),
      types: await api.get("/tech-types"),
    }))();
    for (const tech of techs.slice(0, 2)) {
      await page.getByTestId(`staging-row-${tech.id}`).getByRole("button", { name: "Clasificar" }).click();
      if (tech === techs[0]) {
        await page.getByRole("button", { name: "Sugerir clasificación" }).click();
        await expect(page.getByText(/Sugerencia aplicada|no encontró evidencia/).first()).toBeVisible();
      }
      await page.locator("#stg-cluster").selectOption(String(clusters[0].id));
      await page.locator("#stg-type").selectOption(String(types[0].id));
      await page.locator("#stg-condition").selectOption("emergente");
      await page.getByTestId("staging-save").click();
      await expectToast(page, "Clasificación guardada");
    }

    await page.getByTestId("staging-assign").click();
    await expect(page.getByText(/Se asignarán\s*2\s*de 3/)).toBeVisible();
    await page.getByTestId("staging-assign-confirm").click();
    await expectToast(page, `2 señal(es) asignadas a ${cycle.code}`);
    await expect(page.getByTestId("staging-count")).toContainText("Mostrando 1 de 1");

    const inCycle = await api.get(`/technologies?cycle_id=${cycle.id}`);
    expect(inCycle.map((t) => t.id).sort()).toEqual([techs[0].id, techs[1].id].sort());
    expect(inCycle.every((t) => t.cycle_status === "asignada_a_ciclo")).toBeTruthy();
    expectClean(errors);
  });

  test("la asignacion explica por que no procede en un ciclo cerrado", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycles = await api.get("/cycles");
    const closed = cycles.find((c) => c.status === "cerrado_consolidado" && !c.is_historic);
    test.skip(!closed, "no hay ciclos cerrados en la base");
    await useCycleInPage(page, closed.id);
    await loginAs(page, "superadmin", "/bandeja-entrada");
    await settle(page);
    const wrap = page.locator("[data-disabled-hint]", { hasText: "Asignar" });
    await expect(wrap).toHaveAttribute("data-disabled-hint", /cerrado y no admite asignaciones/);
    await expect(page.getByText(`${closed.code} no admite asignaciones.`)).toBeVisible();
    expectClean(errors);
  });
});

test.describe("filtrado y depuracion", () => {
  test("barrido y fusion, novedad con cruce INVIMA, exclusion y Listado Unico", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_filtrado" });
    const tag = uid("Filtro");
    const nct = `NCT9${String(Date.now()).slice(-7)}`;
    const [dupA, dupB, keeper] = await seedTechs(api, [
      { name: `${tag} Zetamab`, nct: [nct] },
      { name: `${tag} Zetamab 100 mg`, nct: [nct] },
      { name: `${tag} Omegacel`, indication: "Leucemia linfoblastica" },
    ]);
    for (const t of [dupA, dupB, keeper]) await classify(api, t.id);
    await assign(api, cycle.id, [dupA.id, dupB.id, keeper.id]);

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "superadmin", "/filtrado");
    await settle(page);

    // RF09: barrido y fusion confirmada por una persona
    await page.getByTestId("dedup-scan").click();
    await expectToast(page, "Barrido con umbral");
    const proposals = await api.get("/screening/merges?status=propuesta&limit=200");
    const pair = proposals.find(
      (p) => [p.technology_a_id, p.technology_b_id].sort().join() === [dupA.id, dupB.id].sort().join()
    );
    expect(pair, "propuesta para el par que comparte NCT").toBeTruthy();
    expect(pair.decisive).toBeTruthy();
    const card = page.getByTestId(`merge-${pair.id}`).locator("xpath=..");
    await expect(card).toContainText("Mismo ensayo clínico");
    await card.getByRole("button", { name: /Fusionar y conservar/ }).click();
    await page.getByRole("button", { name: "Fusionar", exact: true }).click();
    await expectToast(page, "Registros fusionados");
    await expect(page.getByTestId(`merge-${pair.id}`)).toHaveCount(0);

    // RF10 + RF11: novedad con cruce INVIMA y paso a apta
    await page.getByRole("tab", { name: /Novedad y registro sanitario/ }).click();
    await page.getByLabel("Buscar en la cola de filtrado").fill(tag);
    const queue = page.getByTestId("novelty-queue");
    await expect(queue.getByRole("button")).toHaveCount(2);
    await queue.getByRole("button", { name: /Omegacel/ }).click();
    await expect(page.getByTestId("novelty-qualify")).toBeDisabled();
    await page.getByTestId("novelty-invima-check").click();
    await expectToast(page, "registro sanitario");
    await page.locator("#novelty-option").selectOption("nueva_indicacion");
    await page.locator("#novelty-justification").fill("corta");
    await expect(page.getByTestId("novelty-save")).toBeDisabled();
    await page
      .locator("#novelty-justification")
      .fill("Nueva indicacion en leucemia pediatrica sin registro sanitario vigente en Colombia.");
    await page.getByText("Concepto de la Sala Especializada del INVIMA (opcional)").click();
    await page.locator("#novelty-sala-ref").fill("Acta E2E 01 de 2026");
    await page.getByTestId("novelty-save").click();
    await expectToast(page, "Criterio de novedad registrado");
    await page.getByTestId("novelty-qualify").click();
    await expectToast(page, "Tecnología apta para priorización");

    // RF12: exclusion con causa tipificada del superviviente de la fusion
    await queue.getByRole("button", { name: new RegExp(`${tag} Zetamab`) }).first().click();
    await page.getByTestId("novelty-exclude").click();
    await expect(page.getByTestId("novelty-exclude-confirm")).toBeDisabled();
    await page.locator("#novelty-exclusion-reason").selectOption("fuera_alcance");
    await page.locator("#novelty-exclusion-note").fill("Excluida por la prueba E2E");
    await page.getByTestId("novelty-exclude-confirm").click();
    await expectToast(page, "Tecnología excluida con causa registrada");

    // Listado Unico y exportacion CSV
    await page.getByRole("tab", { name: /Listado único/ }).click();
    await expect(page.getByText(`${tag} Omegacel`).first()).toBeVisible();
    await expect(page.getByText(`${tag} Zetamab`)).toHaveCount(0);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("unique-export").click()]);
    expect(download.suggestedFilename()).toMatch(/^listado_unico_.*\.csv$/);

    const unique = await api.get(`/screening/unique-list/${cycle.id}`);
    const ids = unique.clusters.flatMap((g) => g.items.map((i) => i.technology_id));
    expect(ids).toEqual([keeper.id]);
    expect(unique.excluded_count).toBe(2);
    expectClean(errors);
  });

  test("un perfil de consulta ve el filtrado sin acciones", async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, "tomador_decisiones", "/filtrado");
    await settle(page);
    await expect(page.getByTestId("dedup-scan")).toHaveCount(0);
    await page.getByRole("tab", { name: /Novedad y registro sanitario/ }).click();
    await settle(page);
    await expect(page.getByTestId("novelty-qualify")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sincronizar desde datos.gov.co" })).toHaveCount(0);
    expectClean(errors);
  });
});
