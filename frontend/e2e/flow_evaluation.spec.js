// Evaluacion temprana (RF13-RF16): expediente, COI, flujo editorial, invitacion y
// revocacion de revisores, portal del revisor por token y publicacion.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, expectToast, techInCycle, useCycleInPage } from "./flow_api";

const INFORME_FIELDS = [
  "health_condition",
  "mechanism",
  "target_population_co",
  "evidence_state",
  "comparators_sgsss",
  "adoption_risks",
  "narrative",
  "evidence_phases",
  "efficacy_outcomes",
  "safety_outcomes",
];

test.describe("evaluacion temprana y revision por pares", () => {
  test("del expediente a la publicacion con revisor externo por token", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_evaluacion" });
    const tech = await techInCycle(api, cycle.id, { name: uid("Eval") });

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "superadmin", "/evaluacion");
    await settle(page);
    await page.getByTestId(`eval-item-${tech.id}`).click();
    await expect(page.getByTestId(`eval-item-${tech.id}`)).toContainText("sin expediente");

    // Abrir el expediente mueve la instancia a evaluacion (antes se creaba solo al entrar).
    await page.getByTestId("eval-open").click();
    await expectToast(page, "Expediente abierto como Informe de evaluación temprana");

    // COI bloqueante
    await expect(page.getByTestId("eval-coi-sign")).toBeDisabled();
    await page.getByTestId("eval-coi-accept").check();
    await page.getByTestId("eval-coi-sign").click();
    await expectToast(page, "Declaración registrada");

    // No se envia a revision interna con campos vacios; el boton lo explica.
    const toInternal = page.locator("[data-disabled-hint]", { hasText: "Enviar a revisión interna" });
    await expect(toInternal).toHaveAttribute("data-disabled-hint", /Complete los campos obligatorios/);
    // En borrador el editor abre en modo campos; "Ver expediente" muestra la vista previa.
    await expect(page.getByRole("button", { name: "Ver expediente" })).toBeVisible();
    for (const key of INFORME_FIELDS) {
      await page.locator(`#eval-field-${key}`).fill(`Contenido E2E de ${key}.`);
    }
    await page.getByTestId("eval-save").click();
    await expectToast(page, "Guardado v");
    await expect(page.getByTestId("eval-completeness")).toContainText("Completitud 100%");

    await page.getByTestId("eval-move-revision_interna").click();
    await expectToast(page, "Estado editorial: Revisión interna");
    await page.getByTestId("eval-move-revision_externa").click();
    await expectToast(page, "Estado editorial: Revisión externa");

    // Invitacion externa: sin SMTP el enlace se muestra una vez para copiarlo.
    await page.locator("#eval-invite-name").fill("Revisora Externa E2E");
    await page.locator("#eval-invite-email").fill(`par.${Date.now()}@universidad.edu`);
    await page.getByTestId("eval-invite-submit").click();
    await expect(page.getByTestId("eval-invite-result")).toBeVisible();
    const link = (await page.getByTestId("eval-invite-link").textContent()).trim();
    expect(link).toContain("/revisar/");

    // Segunda invitacion, revocada: su enlace deja de abrir el portal.
    await page.locator("#eval-invite-name").fill("Revisor Equivocado");
    await page.locator("#eval-invite-email").fill(`equivocado.${Date.now()}@universidad.edu`);
    await page.getByTestId("eval-invite-submit").click();
    await expect(page.getByTestId("eval-invite-link")).not.toHaveText(link);
    const revokedLink = (await page.getByTestId("eval-invite-link").textContent()).trim();
    const row = page.getByTestId("eval-reviewers").locator("li", { hasText: "Revisor Equivocado" });
    await row.getByRole("button", { name: "Revocar" }).click();
    await page.getByRole("button", { name: "Revocar", exact: true }).last().click();
    await expectToast(page, "Invitación revocada");
    await expect(row).toContainText("Revocado");

    // Portal del revisor externo por token
    const portal = await page.context().newPage();
    const portalErrors = watchErrors(portal);
    await portal.goto(new URL(revokedLink).pathname);
    await expect(portal.getByText("La invitación fue revocada")).toBeVisible();
    await portal.goto(new URL(link).pathname);
    await expect(portal.getByTestId("portal-coi-sign")).toBeDisabled();
    await portal.getByTestId("portal-coi-accept").check();
    await portal.getByTestId("portal-coi-sign").click();
    await expect(portal.getByText("Declaración registrada")).toBeVisible();
    await expect(portal.getByText("Contenido E2E de mechanism.")).toBeVisible();
    await portal.locator("#portal-comment").fill("Revisar la poblacion objetivo (E2E).");
    await portal.getByTestId("portal-comment-submit").click();
    await expect(portal.getByText("Observación registrada.")).toBeVisible();
    await portal.getByTestId("portal-submit").click();
    await expect(portal.getByText('Va a enviar el veredicto "Aprobado"')).toBeVisible();
    await portal.getByTestId("portal-submit").click();
    await expect(portal.getByTestId("portal-submitted")).toContainText("Aprobado");
    await portal.close();
    expectClean(portalErrors);

    // Comite y publicacion con confirmacion
    await page.reload();
    await settle(page);
    await page.getByTestId("eval-move-aprobado_comite").click();
    await expectToast(page, "Estado editorial: Aprobado por comité técnico");
    await page.getByTestId("eval-move-publicado").click();
    await page.getByRole("button", { name: "Publicar", exact: true }).last().click();
    await expectToast(page, "Estado editorial: Publicado");

    const [popup] = await Promise.all([
      page.context().waitForEvent("page"),
      page.getByRole("button", { name: "Exportar HTML institucional" }).click(),
    ]);
    await popup.waitForLoadState();
    await expect(popup.locator("body")).toContainText("Instituto de Evaluación Tecnológica en Salud");
    await popup.close();

    const queue = await api.get(`/reports?cycle_id=${cycle.id}`);
    expect(queue.find((i) => i.technology_id === tech.id).entry_status).toBe("publicada");
    const cyc = await api.get(`/cycles/${cycle.id}`);
    expect(cyc.summary.published).toBe(1);
    expectClean(errors);
  });

  test("un perfil sin permiso ve la transicion bloqueada con su motivo", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_evaluacion" });
    const tech = await techInCycle(api, cycle.id, { name: uid("EvalClin") });
    const doc = await api.post("/reports", { cycle_id: cycle.id, technology_id: tech.id });
    await api.post(`/reports/${doc.id}/coi`, { accepted: true });
    const body = Object.fromEntries(INFORME_FIELDS.map((k) => [k, `Texto ${k}`]));
    await api.put(`/reports/${doc.id}`, { body });
    await api.post(`/reports/${doc.id}/transition`, { status: "revision_interna" });

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "evaluador_clinico", "/evaluacion");
    await settle(page);
    await page.getByTestId(`eval-item-${tech.id}`).click();
    await page.getByTestId("eval-coi-accept").check();
    await page.getByTestId("eval-coi-sign").click();
    await expectToast(page, "Declaración registrada");
    const external = page.locator("[data-disabled-hint]", { hasText: "Pasar a revisión externa" });
    await expect(external).toHaveAttribute("data-disabled-hint", /permiso requerido/);
    await expect(page.getByTestId("eval-invite-submit")).toHaveCount(0);
    await expect(page.getByTestId("eval-move-borrador")).toBeEnabled();
    expectClean(errors);
  });
});
