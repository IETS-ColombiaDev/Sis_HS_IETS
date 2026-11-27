// Evaluación: cola con estado del expediente, aviso de cambios sin guardar, observaciones
// que se resuelven y reabren, versiones con lo que cambió y exporte del estado editorial.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, expectToast, techInCycle, useCycleInPage } from "./flow_api";

const FIELDS = [
  "health_condition", "mechanism", "target_population_co", "evidence_state", "comparators_sgsss", "adoption_risks",
  "narrative", "evidence_phases", "efficacy_outcomes", "safety_outcomes",
];

test("evaluacion: cola, cambios sin guardar, observaciones, versiones y exporte", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const cycle = await createCycle(api, { status: "en_evaluacion" });
  const tech = await techInCycle(api, cycle.id, { name: uid("Robusta") });
  const other = await techInCycle(api, cycle.id, { name: uid("Pendiente") });
  const doc = await api.post("/reports", { cycle_id: cycle.id, technology_id: tech.id });
  await api.post(`/reports/${doc.id}/coi`, { accepted: true });
  await api.put(`/reports/${doc.id}`, { body: Object.fromEntries(FIELDS.map((k) => [k, `Texto ${k}`])) });
  await api.post(`/reports/${doc.id}/comments`, { field_key: "mechanism", body: "Precisar el mecanismo (E2E)." });

  await useCycleInPage(page, cycle.id);
  await loginAs(page, "superadmin", "/evaluacion");
  await settle(page);

  // Indicadores y cola: una sin expediente y una observación abierta.
  await expect(page.getByTestId("eval-kpi-none")).toContainText("1");
  await expect(page.getByTestId("eval-kpi-open")).toContainText("1");
  await expect(page.getByTestId(`eval-item-${tech.id}`)).toContainText("1 obs.");
  await page.getByTestId("eval-status").selectOption("sin_expediente");
  await expect(page.getByTestId("eval-queue").getByRole("button")).toHaveCount(1);
  await expect(page.getByTestId(`eval-item-${other.id}`)).toBeVisible();
  await page.getByTestId("eval-status").selectOption("");

  // Cambios sin guardar: avisa antes de cambiar de tecnología.
  await page.getByTestId(`eval-item-${tech.id}`).click();
  await expect(page.locator("#eval-field-mechanism")).toHaveValue("Texto mechanism");
  await expect(page.getByText("1 observación(es) abierta(s) sobre este campo")).toBeVisible();
  await page.locator("#eval-field-mechanism").fill("Inhibidor selectivo, descrito con más detalle.");
  await expect(page.getByTestId("eval-dirty")).toBeVisible();
  await expect(page.getByTestId("eval-move-revision_interna")).toBeDisabled();
  await page.getByTestId(`eval-item-${other.id}`).click();
  await expect(page.getByText("Este expediente tiene cambios que no se han guardado")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByTestId("eval-save").click();
  await expectToast(page, "Guardado v");
  await expect(page.getByTestId("eval-dirty")).toHaveCount(0);

  // Observaciones: resolver con respuesta y reabrir.
  await page.getByTestId("eval-tab-observaciones").click();
  const item = page.getByTestId("eval-comments").locator("li", { hasText: "Precisar el mecanismo (E2E)." });
  await expect(item).toContainText("Abierta");
  await item.getByRole("button", { name: "Resolver" }).click();
  await page.locator("#eval-resolve-note").fill("Se amplió la descripción del mecanismo.");
  await page.getByTestId("eval-resolve-confirm").click();
  await expectToast(page, "Observación resuelta");
  await expect(page.getByText("No quedan observaciones abiertas.")).toBeVisible();
  await page.getByRole("button", { name: /^Todas/ }).click();
  await expect(item).toContainText("Se amplió la descripción del mecanismo.");
  await item.getByRole("button", { name: "Reabrir" }).click();
  await expectToast(page, "Observación reabierta");
  await expect(item).toContainText("Abierta");

  // Versiones: la transición guarda una instantánea y dice qué campo cambió.
  await page.getByTestId("eval-move-revision_interna").click();
  await expectToast(page, "Estado editorial: Revisión interna");
  await page.getByTestId("eval-tab-versiones").click();
  const versions = page.getByTestId("eval-versions");
  await expect(versions).toContainText("Revisión interna de calidad");
  await expect(versions).toContainText("Mecanismo biológico o tecnológico");
  await versions.getByRole("button", { name: "Ver esta versión" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Inhibidor selectivo, descrito con más detalle.");
  await page.keyboard.press("Escape");

  // Exporte del estado editorial del ciclo.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("eval-export-queue").click()]);
  expect(download.suggestedFilename()).toMatch(/^evaluacion_.+\.csv$/);
  expectClean(errors);
});
