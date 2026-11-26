// Pendientes del Módulo 0 (24-11-2026): fuentes tipo E por validar, catálogo y
// sondas en Excel, diagnóstico de enlaces (RF-001) y cruce de postulaciones (RF-02-F).
import { test, expect } from "@playwright/test";
import { loginAs, settle, watchErrors, expectClean, tokenForRole, auth, uid } from "./helpers";

test("el equipo técnico ve el aviso de fuentes tipo E al entrar y las valida desde la bandeja", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "evaluador_tecnico", "/", { manualPrompt: true });
  const prompt = page.getByTestId("manual-review-prompt");
  await expect(prompt).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Por favor valide manualmente estas fuentes");

  const badge = page.getByTestId("nav-manual-review-count");
  await expect(badge).toBeVisible();
  const before = Number(await badge.innerText());
  expect(before).toBeGreaterThan(0);

  await page.getByTestId("manual-prompt-go").click();
  await expect(page).toHaveURL(/\/bandeja-entrada$/);
  const panel = page.getByTestId("manual-review-panel");
  await expect(panel).toBeVisible();
  const first = panel.locator("article.mr-item").first();
  await expect(first.getByRole("link", { name: /Abrir la fuente/ })).toHaveAttribute("target", "_blank");
  await first.getByRole("button", { name: /Marcar como validada/ }).click();
  await expect(page.getByText(/quedó validada/)).toBeVisible();
  await expect(badge).toHaveText(String(before - 1));

  // El aviso no vuelve a salir en la misma sesión; el banner de la bandeja sí sigue.
  await page.getByRole("button", { name: "Cerrar" }).last().click();
  await expect(page.getByTestId("manual-review-banner")).toBeVisible();
  await page.goto("/");
  await settle(page);
  await expect(page.getByTestId("manual-review-prompt")).toHaveCount(0);
  await expect(page.getByTestId("work-manual_sources")).toBeVisible();
  expectClean(errors);
});

test("el catálogo y el informe de sondas se descargan en Excel", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/fuentes");
  await settle(page);
  const [catalog] = await Promise.all([page.waitForEvent("download"), (async () => { await page.getByTestId("sources-download-menu").click(); await page.getByTestId("sources-export-xlsx").click(); })()]);
  expect(catalog.suggestedFilename()).toMatch(/^catalogo_fuentes_iets_\d{4}-\d{2}-\d{2}\.xlsx$/);
  await page.getByTestId("sources-maintenance-menu").click();
  await expect(page.getByTestId("sources-probe-all")).toBeVisible();

  await page.getByText("Salud de fuentes", { exact: true }).first().click();
  await expect(page.getByTestId("probe-bulk-state")).toBeVisible();
  const [probes] = await Promise.all([page.waitForEvent("download"), page.getByTestId("probe-report-xlsx").click()]);
  expect(probes.suggestedFilename()).toMatch(/^sondas_fuentes_.*\.xlsx$/);
  expectClean(errors);
});

test("el reporte de enlaces muestra el diagnóstico para la matriz y lo descarga en Excel", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/senales");
  await settle(page);
  await page.getByTestId("link-report-toggle").click();
  await expect(page.getByTestId("link-resolve")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Diagnóstico para la matriz/ })).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByTestId("link-diagnosis-xlsx").click()]);
  expect(file.suggestedFilename()).toMatch(/^diagnostico_enlaces_matriz.*\.xlsx$/);
  expectClean(errors);
});

test("una postulación llega cruzada con la vigilancia y se puede volver a cruzar", async ({ page, request }) => {
  const errors = watchErrors(page);
  const name = uid("Cruzamab");
  const res = await request.post("/api/public/submissions", {
    data: {
      commercial_name: name,
      inn_name: "",
      mechanism: "Anticuerpo",
      manufacturer: "Laboratorio E2E",
      indication: "Melanoma",
      development_phase: "Fase II",
      evidence_links: ["https://clinicaltrials.gov/"],
      has_conflict: false,
      coi_accepted: true,
      submitter_name: "E2E",
      submitter_email: "e2e@example.org",
    },
  });
  expect(res.status()).toBe(201);
  const { id } = await res.json();
  const token = await tokenForRole(request, "superadmin");
  const list = await (await request.get("/api/submissions", { headers: auth(token) })).json();
  const row = list.find((r) => r.id === id);
  expect(row.cross_check.proactive.count).toBe(0);

  await loginAs(page, "superadmin", "/postulaciones");
  await settle(page);
  const box = page.getByTestId(`submission-cross-${id}`);
  await expect(box).toBeVisible();
  await expect(box).toContainText("no la ha detectado");
  await expect(box.getByTestId(`submission-cross-run-${id}`)).toBeVisible();
  expectClean(errors);
});

test("depurar ruido simula primero y solo lo ve quien administra la configuración", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/bandeja-entrada");
  await settle(page);
  await page.getByTestId("noise-cleanup-open").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Depurar ruido de captura");
  // La simulación termina en la lista de lo que retiraría o en «la bandeja está limpia».
  await expect(dialog.getByTestId("noise-cleanup-preview").or(dialog.getByTestId("noise-cleanup-empty"))).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
  expectClean(errors);
});

test("el evaluador técnico no ve la depuración de ruido", async ({ page }) => {
  await loginAs(page, "evaluador_tecnico", "/bandeja-entrada");
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /Bandeja de entrada/ })).toBeVisible();
  await expect(page.getByTestId("noise-cleanup-open")).toHaveCount(0);
});
