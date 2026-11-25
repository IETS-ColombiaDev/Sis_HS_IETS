// Puntos de recuperacion de la base (Configuracion -> Persistencia).
//
// Las pruebas corren con Firestore apagado, asi que las respuestas de la copia se
// simulan en el navegador: se verifica la pantalla (lista, confirmacion escrita,
// desbloqueo expreso) y que nada se restaure sin la palabra de confirmacion.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle } from "./helpers";
import { apiAs } from "./crud_helpers";

const ITEMS = [
  {
    gen: "aaa111", reason: "actual", label: "Copia actual", current: true, taken_at: "2026-11-24T15:00:00+00:00",
    raw_size: 33500000, code: "7.2.0+abc", counts: { findings: 651, technologies: 656, sources: 141, users: 6 },
  },
  {
    gen: "bbb222", reason: "antes_despliegue", label: "Antes de un despliegue", taken_at: "2026-11-23T22:10:00+00:00",
    raw_size: 33100000, code: "7.1.1+def", counts: { findings: 640, technologies: 650, sources: 141, users: 6 },
  },
  {
    gen: "ccc333", reason: "diaria", label: "Cierre del día", taken_at: "2026-11-22T23:50:00+00:00",
    raw_size: 32900000, code: "7.1.1+def", counts: { findings: 600, technologies: 610, sources: 141, users: 6 },
  },
];

async function mockFirebase(page, { blocked = false } = {}) {
  const calls = { restore: [], pin: 0, override: 0 };
  const firebase = {
    configured: true, enabled: true, synced: !blocked, collection: "hs_iets_db", database: "(default)",
    taken_at: ITEMS[0].taken_at, gzip_size: 7000000,
    ...(blocked ? { blocked_shrink: true, error: "Copia bloqueada: la tabla findings pasaría de 651 a 3 filas." } : {}),
  };
  await page.route("**/api/backup/info", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ json: { ...body, firebase } });
  });
  await page.route("**/api/backup/firebase/checkpoints", (route) =>
    route.fulfill({ json: { enabled: true, items: ITEMS, retention: { antes_despliegue: 5, diaria: 7 } } })
  );
  await page.route("**/api/backup/firebase/checkpoints/pin", (route) => {
    calls.pin += 1;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/backup/firebase/checkpoints/*/restore**", (route) => {
    calls.restore.push(route.request().url());
    return route.fulfill({ json: { ok: true, restored: true } });
  });
  await page.route("**/api/backup/firebase/push**", (route) => {
    if (route.request().url().includes("override=true")) calls.override += 1;
    return route.fulfill({ json: { ok: true } });
  });
  return calls;
}

async function openPanel(page) {
  await loginAs(page, "superadmin", "/configuracion");
  await settle(page);
  await page.getByRole("button", { name: "Persistencia (Firebase)" }).click();
  await expect(page.getByTestId("recovery-points")).toBeVisible();
}

test("los puntos de recuperación se listan y solo se restauran con la confirmación escrita", async ({ page }) => {
  const errors = watchErrors(page);
  const calls = await mockFirebase(page);
  await openPanel(page);

  const panel = page.getByTestId("recovery-points");
  await expect(panel.locator("li")).toHaveCount(3);
  await expect(panel).toContainText("Antes de un despliegue");
  await expect(panel).toContainText("versión 7.1.1+def");
  await expect(panel).toContainText("640 señales");
  await expect(panel).toContainText("últimos 7 días");
  // La copia vigente no ofrece restaurar; las otras dos si.
  await expect(panel.getByRole("button", { name: /^Restaurar la copia del/ })).toHaveCount(2);

  // Palabra equivocada: no se llama al servidor.
  page.once("dialog", (dialog) => dialog.accept("si"));
  await panel.getByRole("button", { name: /^Restaurar la copia del/ }).first().click();
  await expect(page.getByText("No se restauró: debía escribir RESTAURAR.")).toBeVisible();
  expect(calls.restore).toHaveLength(0);

  // Cancelar: tampoco.
  page.once("dialog", (dialog) => dialog.dismiss());
  await panel.getByRole("button", { name: /^Restaurar la copia del/ }).first().click();
  expect(calls.restore).toHaveLength(0);

  // Fijar el estado actual.
  await panel.getByRole("button", { name: "Fijar el estado actual" }).click();
  await expect(page.getByText("Estado actual publicado; la copia anterior quedó fijada.")).toBeVisible();
  expect(calls.pin).toBe(1);

  // Confirmacion correcta: se pide la copia previa al despliegue.
  page.once("dialog", (dialog) => dialog.accept("restaurar"));
  await Promise.all([
    page.waitForEvent("load"),
    panel.getByRole("button", { name: /^Restaurar la copia del/ }).first().click(),
  ]);
  expect(calls.restore).toHaveLength(1);
  expect(calls.restore[0]).toContain("/checkpoints/bbb222/restore");
  expect(calls.restore[0]).toContain("confirm=RESTAURAR");
  expectClean(errors);
});

test("una copia bloqueada se explica y solo se fuerza con confirmación escrita", async ({ page }) => {
  const calls = await mockFirebase(page, { blocked: true });
  await openPanel(page);

  const card = page.getByTestId("firebase-db-panel");
  await expect(card.getByRole("alert").first()).toContainText("Copia bloqueada");
  page.once("dialog", (dialog) => dialog.accept("no"));
  await card.getByTestId("firebase-override").click();
  await expect(page.getByText("No se publicó: debía escribir PUBLICAR.")).toBeVisible();
  expect(calls.override).toBe(0);

  page.once("dialog", (dialog) => dialog.accept("PUBLICAR"));
  await card.getByTestId("firebase-override").click();
  await expect(page.getByText("Base publicada. La copia anterior quedó como punto de recuperación.")).toBeVisible();
  expect(calls.override).toBe(1);
});

test("la copia y sus puntos de recuperación son solo del superadministrador", async ({ page }) => {
  const tecnico = await apiAs(page.request, "evaluador_tecnico");
  await tecnico.get("/backup/firebase/checkpoints", 403);
  await tecnico.post("/backup/firebase/checkpoints/abc/restore?confirm=RESTAURAR", {}, 403);
  await tecnico.post("/backup/firebase/checkpoints/pin", {}, 403);
  await tecnico.post("/backup/firebase/push?override=true", {}, 403);

  // Con Firestore apagado (como en las pruebas) el listado responde vacio, sin error.
  const admin = await apiAs(page.request);
  const body = await admin.get("/backup/firebase/checkpoints");
  expect(body.enabled).toBe(false);
  expect(body.items).toEqual([]);
  // Sin la palabra de confirmacion no se restaura nada.
  await admin.post("/backup/firebase/checkpoints/abc/restore", {}, 400);
});
