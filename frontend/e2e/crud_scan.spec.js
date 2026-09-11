// Vigilancia por la interfaz: rastreo por fuente y por seleccion, vista previa,
// registro de escaneos y vigilancia programada. Todo con fuentes `fixture` o con
// respuestas simuladas: nunca sale a internet.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, disabledHint, expectToast, fixtureSource, selfUrl } from "./crud_helpers";

test.describe("vigilancia · evaluador tecnico", () => {
  test("rastrea una fuente, una seleccion, previsualiza y ve la bitacora", async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const one = await fixtureSource(api, baseURL, uid("Vig uno"));
    const two = await fixtureSource(api, baseURL, uid("Vig dos"));
    await loginAs(page, "evaluador_tecnico", "/vigilancia");
    await settle(page);

    // Rastreo por fuente: corre el fixture y deja una senal nueva.
    await page.getByLabel("Buscar referente").fill(one.title);
    const card = page.getByTestId(`scan-source-${one.id}`);
    await card.getByRole("button", { name: "Rastrear" }).click();
    await expectToast(page, `${one.title}: 1 señales nuevas`);
    await expect(page.getByTestId("scan-log")).toContainText(one.title);

    // Bitacora filtrable por estado.
    await page.getByLabel("Filtrar registro por estado").selectOption("error");
    await expect(page.getByTestId("scan-log")).not.toContainText(one.title);
    await page.getByLabel("Filtrar registro por estado").selectOption("");

    // Rastreo de una seleccion: se encola y el worker la atiende en segundo plano.
    await page.getByLabel("Buscar referente").fill(two.title);
    await page.getByLabel(`Seleccionar ${two.title}`).check();
    await page.getByRole("button", { name: /Rastrear selección \(1\)/ }).click();
    await expectToast(page, "Vigilancia encolada: 1 fuente(s)");
    await expect(page.getByTestId("ingest-jobs")).toContainText(two.title);

    // Vista previa de un enlace del propio servidor.
    await page.getByLabel("URL a previsualizar").fill(selfUrl(baseURL, "/transparencia"));
    await page.getByRole("button", { name: "Previsualizar" }).click();
    await expect(page.getByTestId("link-preview")).toBeVisible({ timeout: 30_000 });
    expectClean(errors);
  });

  test("vigilancia masiva y programada: la pantalla informa sin bloquearse", async ({ page }) => {
    const errors = watchErrors(page);
    // Respuestas simuladas: encolar las fuentes reales saldria a internet.
    await page.route("**/api/ingest/run", (route) =>
      route.fulfill({ json: { jobs: [], queued: 38, processed: 0 } })
    );
    await page.route("**/api/config/schedule/vigilancia/run", (route) =>
      route.fulfill({
        json: {
          id: 999999, task: "vigilancia", label: "Vigilancia programada", status: "en_curso", origin: "manual",
          triggered_by: "e2e", started_at: new Date().toISOString(), finished_at: null, items_found: 0, items_new: 0,
          message: "3 fuente(s) encoladas; el worker las procesa en segundo plano.", jobs_total: 3, jobs_pending: 3, cycle_code: "",
        },
      })
    );
    await loginAs(page, "superadmin", "/vigilancia");
    await settle(page);
    await expect(page.getByTestId("scan-schedule")).toContainText("Activa");
    await page.getByRole("button", { name: /Ejecutar vigilancia/ }).click();
    await expectToast(page, "Vigilancia encolada: 38 fuente(s)");
    await page.getByRole("button", { name: "Ejecutar ahora" }).click();
    await expectToast(page, "3 fuente(s) encoladas");
    await page.getByRole("button", { name: "Configurar", exact: true }).click();
    await expect(page).toHaveURL(/\/configuracion\?tab=programacion/);
    await expect(page.getByTestId("schedule-panel")).toBeVisible();
    expectClean(errors);
  });
});

test.describe("vigilancia · permisos", () => {
  test("tomador de decisiones consulta sin poder ejecutar", async ({ page, baseURL }) => {
    const errors = watchErrors(page);
    const admin = await apiAs(page.request);
    const src = await fixtureSource(admin, baseURL);
    await loginAs(page, "tomador_decisiones", "/vigilancia");
    await settle(page);
    await expect(page.getByTestId("scan-readonly")).toBeVisible();
    await expect(disabledHint(page, "scan:run").first()).toBeVisible();
    await page.getByLabel("Buscar referente").fill(src.title);
    await expect(page.getByTestId(`scan-source-${src.id}`).getByRole("button", { name: "Rastrear" })).toHaveCount(0);
    const api = await apiAs(page.request, "tomador_decisiones");
    await api.post(`/scan/source/${src.id}`, {}, 403);
    await api.post("/ingest/run", { source_ids: [src.id] }, 403);
    await api.post("/config/schedule/vigilancia/run", {}, 403);
    expectClean(errors);
  });
});
