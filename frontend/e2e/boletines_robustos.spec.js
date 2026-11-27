// Boletines: contenido ampliado, mensaje del líder, anular aprobación, cifras desactualizadas, recorrido y baja.
import { test, expect } from "@playwright/test";
import { auth, loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, expectToast, techInCycle, useCycleInPage } from "./flow_api";

test("boletines: mensaje del líder, anular aprobación, aviso de cifras viejas, recorrido y baja", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const cycle = await createCycle(api, { status: "en_evaluacion" });
  const name = uid("Boletin priorizada");
  await techInCycle(api, cycle.id, { name });
  const bulletin = await api.post(`/bulletins/compile/${cycle.id}`);
  expect(bulletin.body.top_prioritized.map((x) => x.name)).toContain(name);

  await useCycleInPage(page, cycle.id);
  await loginAs(page, "superadmin", "/boletines");
  await settle(page);

  // Avance y contenido ampliado.
  const steps = page.getByTestId(`bulletin-steps-${bulletin.id}`);
  await expect(steps.locator("li.is-done")).toHaveText(/Compilado/);
  await expect(steps.locator("li.is-next")).toHaveText(/Aprobado/);
  await expect(page.getByTestId("bulletin-top")).toContainText(name);
  await expect(page.getByTestId("bulletins-tab-por_aprobar")).toContainText("1");

  // Mensaje del líder.
  await page.getByTestId(`bulletin-edit-${bulletin.id}`).click();
  await page.locator("#bulletin-note").fill("Este ciclo priorizó una terapia que llega pronto.");
  await page.getByTestId("bulletin-edit-save").click();
  await expectToast(page, "Boletín actualizado.");
  await expect(page.getByTestId("bulletin-note")).toContainText("Este ciclo priorizó una terapia que llega pronto.");

  // Aprobar y anular la aprobación con motivo.
  await page.getByTestId(`bulletin-approve-${bulletin.id}`).click();
  await expectToast(page, "Boletín aprobado");
  await expect(page.getByTestId("bulletins-tab-aprobados")).toContainText("1");
  await page.getByTestId(`bulletin-unapprove-${bulletin.id}`).click();
  await expect(page.getByTestId("bulletin-unapprove-confirm")).toBeDisabled();
  await page.locator("#bulletin-unapprove-reason").fill("Falta revisar las cifras");
  await page.getByTestId("bulletin-unapprove-confirm").click();
  await expectToast(page, "Aprobación anulada");
  await expect(page.getByTestId(`bulletin-publish-${bulletin.id}`)).toBeDisabled();

  // El ciclo cambia después de compilar: el boletín lo avisa hasta que se recompila.
  await techInCycle(api, cycle.id, { name: uid("Boletin nueva") });
  await page.reload();
  await settle(page);
  const stale = page.getByTestId(`bulletin-stale-${bulletin.id}`);
  await expect(stale).toContainText("1 → 2");
  await page.getByTestId("bulletin-compile").click();
  await expectToast(page, "Boletín compilado");
  await expect(stale).toHaveCount(0);
  await expect(page.getByTestId("bulletin-note")).toContainText("Este ciclo priorizó"); // la nota se conserva

  // Recorrido.
  await page.getByTestId(`bulletin-history-toggle-${bulletin.id}`).click();
  const history = page.getByTestId(`bulletin-history-${bulletin.id}`);
  await expect(history).toContainText("Compilado");
  await expect(history).toContainText("Cambió: nota editorial");
  await expect(history).toContainText("Motivo: Falta revisar las cifras");
  await expect(history).toContainText("Recompilado con las cifras del ciclo");

  if (process.env.SHOTS_OUT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/boletines_full.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // El HTML ejecutivo trae el mensaje y las priorizadas.
  const html = await page.request.get(`/api/bulletins/${bulletin.id}/export`, { headers: auth(api.token) });
  if (html.ok()) {
    const text = await html.text();
    expect(text).toContain("Mensaje del líder del ciclo");
    expect(text).toContain(name);
  }

  // Baja de un boletín sin publicar.
  await page.getByTestId(`bulletin-delete-${bulletin.id}`).click();
  await page.getByRole("button", { name: "Eliminar boletín" }).last().click();
  await expectToast(page, "Boletín eliminado.");
  await expect(page.getByText("Sin boletines")).toBeVisible();
  expectClean(errors);
});
