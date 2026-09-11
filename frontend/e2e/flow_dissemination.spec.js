// Diseminacion: boletines (RF19) compilados, aprobados y publicados; alertas (RF20)
// con suscripcion por cluster, bandeja y canal de correo.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, expectToast, techInCycle, useCycleInPage } from "./flow_api";

test.describe("boletines del ciclo", () => {
  test("compila, exige aprobacion, anula la aprobacion al recompilar y publica", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_evaluacion" });
    await techInCycle(api, cycle.id, { name: uid("Boletin") });

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "superadmin", "/boletines");
    await settle(page);
    await expect(page.getByText("Sin boletines")).toBeVisible();

    await page.getByTestId("bulletin-compile").click();
    await expectToast(page, "Boletín compilado");
    const [bulletin] = await api.get(`/bulletins?cycle_id=${cycle.id}`);
    const publish = page.locator("[data-disabled-hint]", { hasText: "Publicar" });
    await expect(publish).toHaveAttribute("data-disabled-hint", /aprobación del líder/);

    await page.getByTestId(`bulletin-approve-${bulletin.id}`).click();
    await expectToast(page, "Boletín aprobado");
    await expect(page.getByTestId(`bulletin-publish-${bulletin.id}`)).toBeEnabled();

    // Recompilar cambia las cifras: la aprobacion anterior ya no vale.
    await page.getByTestId("bulletin-compile").click();
    await expectToast(page, "Boletín compilado");
    await expect(page.getByTestId(`bulletin-publish-${bulletin.id}`)).toBeDisabled();

    await page.getByTestId(`bulletin-approve-${bulletin.id}`).click();
    await expectToast(page, "Boletín aprobado");
    await page.getByTestId(`bulletin-publish-${bulletin.id}`).click();
    await page.getByRole("button", { name: "Publicar", exact: true }).last().click();
    await expectToast(page, "Boletín publicado");
    await expect(page.getByTestId(`bulletin-${bulletin.id}`)).toContainText("Publicado");
    await expect(page.getByTestId(`bulletin-approve-${bulletin.id}`)).toHaveCount(0);

    const [popup] = await Promise.all([
      page.context().waitForEvent("page"),
      page.getByTestId(`bulletin-export-${bulletin.id}`).click(),
    ]);
    await popup.waitForLoadState();
    await expect(popup.locator("body")).toContainText(cycle.code);
    await popup.close();
    expectClean(errors);
  });

  test("un perfil de consulta ve los boletines sin acciones", async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, "tomador_decisiones", "/boletines");
    await settle(page);
    await expect(page.getByTestId("bulletin-compile")).toHaveCount(0);
    await expect(page.locator("[data-testid^='bulletin-approve-']")).toHaveCount(0);
    expectClean(errors);
  });
});

test.describe("alertas tempranas", () => {
  test("suscripcion por cluster, aviso por cambio de franja y bandeja", async ({ page }) => {
    const errors = watchErrors(page);
    const admin = await apiAs(page.request);
    const clinic = await apiAs(page.request, "evaluador_clinico");
    // Estado de partida: sin suscripciones activas para el perfil de prueba.
    for (const sub of await clinic.get("/alerts/subscriptions")) {
      if (sub.enabled) await clinic.post("/alerts/subscriptions", { cluster_id: sub.cluster_id, enabled: false });
    }
    const clusters = await admin.get("/clusters");

    await loginAs(page, "evaluador_clinico", "/alertas");
    await settle(page);
    await expect(page.getByTestId("alerts-channel")).toContainText(/Canal|Canales/);
    await expect(page.getByTestId("alerts-sub-count")).toContainText("0 suscripción(es) activa(s)");

    await page.getByTestId(`alerts-sub-${clusters[1].id}`).click();
    await expectToast(page, `Suscrito a las alertas del clúster ${clusters[1].name}`);
    await expect(page.getByTestId(`alerts-sub-${clusters[1].id}`)).toHaveText("Cancelar");
    await page.getByTestId(`alerts-sub-${clusters[1].id}`).click();
    await expectToast(page, `Ya no recibirá alertas del clúster ${clusters[1].name}`);

    await page.getByTestId("alerts-toggle-all").click();
    await expectToast(page, "Suscrito a las alertas de todos los clústeres");
    await expect(page.getByTestId(`alerts-sub-${clusters[0].id}`)).toBeDisabled();

    // Una tecnologia de alto riesgo presupuestal (5 puntos) cambia de franja.
    const cycle = await createCycle(admin, { status: "en_priorizacion" });
    const name = uid("Alerta");
    await techInCycle(admin, cycle.id, { name, values: [1, 1, 1, 1, 1, 0] });

    await page.reload();
    await settle(page);
    await expect(page.getByText(`Cambio de fase en tecnología de alto riesgo: ${name}`)).toBeVisible();
    await page.getByRole("button", { name: "Marcar todas como leídas" }).click();
    await expectToast(page, "marcadas como leídas");
    await page.getByRole("button", { name: "Solo sin leer" }).click();
    await expect(page.getByText("Sin alertas por leer")).toBeVisible();

    await page.getByTestId("alerts-toggle-all").click();
    await expectToast(page, "Ya no recibirá alertas de todos los clústeres");
    expectClean(errors);
  });
});
