// Canal reactivo por la interfaz: portal publico /postular (con y sin conflicto de
// interes, modo anti-robot declarado) y moderacion en /postulaciones.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, disabledHint, expectToast } from "./crud_helpers";

async function fillForm(page, name, { conflict = "" } = {}) {
  await page.locator("#ps-commercial").fill(name);
  await page.locator("#ps-inn").fill("e2emab");
  await page.locator("#ps-mechanism").fill("Anticuerpo monoclonal de prueba");
  await page.locator("#ps-manufacturer").fill("Laboratorio E2E");
  await page.locator("#ps-indication").fill("Melanoma avanzado");
  await page.locator("#ps-phase").selectOption("Fase III");
  await page.locator("#ps-links").fill("https://clinicaltrials.gov/study/NCT00000000");
  if (conflict) {
    await page.getByLabel("Declaro que existe un conflicto de interés").check();
    await page.locator("#ps-conflict").fill(conflict);
  }
  await page.getByLabel(/Firmo la declaración de conflicto de interés/).check();
  await page.locator("#ps-name").fill("Persona E2E");
  await page.locator("#ps-email").fill("persona.e2e@example.org");
}

function publicSubmission(name, extra = {}) {
  return {
    commercial_name: name, inn_name: "e2emab", mechanism: "Anticuerpo", manufacturer: "Lab E2E",
    indication: "Melanoma", development_phase: "Fase III", evidence_links: ["https://example.org/evidencia"],
    coi_accepted: true, submitter_name: "Persona E2E", submitter_email: "persona.e2e@example.org", ...extra,
  };
}

test.describe("portal publico /postular", () => {
  test("envia con conflicto de interes declarado y avisa el modo anti-robot", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/postular");
    await settle(page);
    await expect(page.getByTestId("captcha-note")).toContainText(/modo degradado|reCAPTCHA/);
    const name = uid("Postulada COI");

    // Enlace sin http: el formulario lo explica antes de enviar.
    await fillForm(page, name, { conflict: "Consultoria remunerada por el fabricante durante 2025." });
    await page.locator("#ps-links").fill("www.sin-esquema.org");
    await page.getByRole("button", { name: "Enviar postulación" }).click();
    await expect(page.locator(".public-submit-error")).toContainText("http://");
    await page.locator("#ps-links").fill("https://clinicaltrials.gov/study/NCT00000001");
    await page.getByRole("button", { name: "Enviar postulación" }).click();
    await expect(page.getByTestId("submit-ok")).toContainText("moderación");
    await page.getByRole("button", { name: "Enviar otra postulación" }).click();
    await expect(page.locator("#ps-commercial")).toHaveValue("");
    expectClean(errors);
  });

  test("sin firmar la declaracion de conflicto de interes no se guarda (API 422)", async ({ request }) => {
    const res = await request.post("/api/public/submissions", { data: publicSubmission(uid("Sin COI"), { coi_accepted: false }) });
    expect(res.status()).toBe(422);
    expect((await res.json()).detail).toContain("conflicto de interés");
    const cfg = await (await request.get("/api/public/submissions/config")).json();
    expect(cfg).toHaveProperty("mode");
    expect(JSON.stringify(cfg)).not.toContain("secret");
  });
});

test.describe("moderacion en /postulaciones", () => {
  test("acepta una postulacion (llega a la bandeja como reactiva) y rechaza otra con motivo", async ({ page, request }) => {
    const errors = watchErrors(page);
    const accepted = uid("Postulada aceptar");
    const rejected = uid("Postulada rechazar");
    for (const [name, extra] of [[accepted, { has_conflict: true, conflict_statement: "Relacion comercial declarada con el fabricante." }], [rejected, {}]]) {
      const res = await request.post("/api/public/submissions", { data: publicSubmission(name, extra) });
      expect(res.status(), await res.text()).toBe(201);
    }
    await loginAs(page, "evaluador_clinico", "/postulaciones");
    await settle(page);
    await expect(page.getByTestId("captcha-mode")).toBeVisible();

    // Aceptar.
    let card = page.locator(".merge-list > div", { hasText: accepted });
    await expect(card).toContainText("Declara conflicto de interés");
    await card.getByRole("button", { name: "Revisar y decidir" }).click();
    await page.getByRole("button", { name: "Aceptar y enviar a bandeja" }).click();
    await expectToast(page, "señal reactiva");

    // Rechazar exige motivo: el boton explica por que esta deshabilitado.
    card = page.locator(".merge-list > div", { hasText: rejected });
    await card.getByRole("button", { name: "Revisar y decidir" }).click();
    await expect(disabledHint(page, "motivo del rechazo")).toHaveCount(1);
    await page.locator("#submission-note").fill("Fuera del alcance del escaneo de horizonte.");
    await page.getByRole("button", { name: "Rechazar" }).click();
    await expectToast(page, "Postulación rechazada");

    // Pestanas de resultados.
    await page.getByRole("button", { name: "Aceptadas" }).click();
    await expect(page.locator(".merge-list > div", { hasText: accepted })).toContainText("Ver en la bandeja");
    await page.getByRole("button", { name: "Rechazadas" }).click();
    await expect(page.locator(".merge-list > div", { hasText: rejected })).toContainText("Fuera del alcance");

    // La tecnologia aceptada esta en la bandeja de entrada, marcada como reactiva.
    const api = await apiAs(page.request);
    const staging = await api.get(`/technologies/staging?channel=reactiva&q=${encodeURIComponent(accepted)}`);
    const items = Array.isArray(staging) ? staging : staging.items;
    expect(items.some((t) => t.commercial_name === accepted && t.source_channel === "reactiva")).toBeTruthy();
    expectClean(errors);
  });

  test("tomador de decisiones consulta la cola pero no modera", async ({ page, request }) => {
    const name = uid("Postulada lectura");
    await request.post("/api/public/submissions", { data: publicSubmission(name) });
    await loginAs(page, "tomador_decisiones", "/postulaciones");
    await settle(page);
    const card = page.locator(".merge-list > div", { hasText: name });
    await expect(card.locator('[data-disabled-hint*="staging:assign"]')).toHaveCount(1);
    const api = await apiAs(page.request, "tomador_decisiones");
    const list = await api.get("/submissions?status=recibida");
    const row = list.find((s) => s.commercial_name === name);
    await api.post(`/submissions/${row.id}/accept`, { note: "" }, 403);
  });
});
