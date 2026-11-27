// Postulaciones: radicado y consulta pública del estado, motivo tipificado de rechazo,
// reapertura con recorrido, búsqueda y exporte de la cola.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { expectToast } from "./crud_helpers";

function submission(name, email, extra = {}) {
  return {
    commercial_name: name, inn_name: "", mechanism: "Anticuerpo", manufacturer: "Lab E2E",
    indication: "Melanoma", development_phase: "Fase III", evidence_links: ["https://example.org/evidencia"],
    coi_accepted: true, submitter_name: "Persona E2E", submitter_email: email, ...extra,
  };
}

test("quien postula recibe un radicado y consulta el estado con su correo", async ({ page }) => {
  const errors = watchErrors(page);
  const name = uid("Radicada");
  const email = `${uid("persona").toLowerCase()}@example.org`;
  await page.goto("/postular");
  await settle(page);
  await page.locator("#ps-commercial").fill(name);
  await page.locator("#ps-indication").fill("Melanoma avanzado");
  await page.locator("#ps-links").fill("https://clinicaltrials.gov/study/NCT00000009");
  await page.getByLabel(/Firmo la declaración de conflicto de interés/).check();
  await page.locator("#ps-email").fill(email);
  await page.getByRole("button", { name: "Enviar postulación" }).click();
  await expect(page.getByTestId("submit-tracking")).toBeVisible();
  const code = (await page.locator(".ps-tracking-code").textContent()).trim();
  expect(code).toMatch(/^POS-\d{4}-\d{5}$/);

  // Con otro correo no se revela nada.
  await page.getByText("¿Ya postuló? Consulte el estado de su postulación").click();
  await page.locator("#ps-track-code").fill(code);
  await page.locator("#ps-track-email").fill("otra.persona@example.org");
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(page.getByTestId("status-check").locator(".public-submit-error")).toContainText("No encontramos una postulación");

  await page.locator("#ps-track-email").fill(email);
  await page.getByRole("button", { name: "Consultar estado" }).click();
  await expect(page.getByTestId("status-result")).toContainText(`${code} · En moderación`);
  expect(errors.filter((e) => !/404/.test(e))).toEqual([]);
});

test("moderacion: busca, rechaza con motivo de la lista, reabre y queda el recorrido", async ({ page, request }) => {
  const errors = watchErrors(page);
  const name = uid("Tipificada");
  const email = `${uid("mod").toLowerCase()}@example.org`;
  const res = await request.post("/api/public/submissions", { data: submission(name, email) });
  expect(res.status(), await res.text()).toBe(201);
  const { tracking_code: code } = await res.json();

  await loginAs(page, "evaluador_clinico", "/postulaciones");
  await settle(page);
  await expect(page.getByTestId("subm-kpi-pending")).toBeVisible();

  // La búsqueda por radicado deja solo esa postulación.
  await page.getByLabel("Buscar postulaciones").fill(code);
  await expect(page.getByTestId("subm-count")).toHaveText("1 postulación");
  const card = page.locator(".merge-list > div", { hasText: name });
  await expect(card).toContainText(code);

  // Rechazo con motivo de la lista: no hace falta nota.
  await card.getByRole("button", { name: "Revisar y decidir" }).click();
  await expect(page.getByTestId("submission-history")).toContainText("Postulación recibida por el formulario público");
  await page.locator("#submission-reason").selectOption("evidencia_insuficiente");
  await page.getByRole("button", { name: "Rechazar" }).click();
  await expectToast(page, "Postulación rechazada");

  await page.getByRole("button", { name: /^Rechazadas/ }).click();
  await expect(card).toContainText("Motivo: Fuente de información insuficiente o no verificable");

  // Quien postuló ve el motivo, no la nota interna.
  const status = await request.post("/api/public/submissions/status", { data: { code, email } });
  expect((await status.json()).message).toContain("Fuente de información insuficiente");

  // Reabrir exige explicar por qué y devuelve la postulación a la cola.
  await card.getByRole("button", { name: "Reabrir" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Reabrir postulación" })).toBeDisabled();
  await page.locator("#submission-reopen-note").fill("El postulante envió el registro del ensayo.");
  await page.getByRole("dialog").getByRole("button", { name: "Reabrir postulación" }).click();
  await expectToast(page, "Postulación reabierta");
  await page.getByRole("button", { name: /^Por moderar/ }).click();
  await card.getByRole("button", { name: "Revisar y decidir" }).click();
  const history = page.getByTestId("submission-history");
  await expect(history).toContainText("Rechazada");
  await expect(history).toContainText("Reabierta para una nueva revisión");
  await expect(history).toContainText("El postulante envió el registro del ensayo.");
  await page.getByRole("button", { name: "Cancelar" }).click();

  // Exporte de la cola filtrada.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("submissions-export").click()]);
  expect(download.suggestedFilename()).toBe("postulaciones.csv");
  expectClean(errors);
});
