// Frente C: bandeja de trabajo ("/") orientada al perfil.
// Cada perfil ve SUS pendientes (los mismos bloques y cifras que calcula
// GET /api/dashboard/my-work), con enlace directo a la accion.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, ROLES } from "./helpers";

const EXPECTED_KEYS = {
  superadmin: ["rate", "classify", "novelty", "filter_ready", "invima", "drafts", "submissions", "merges", "cycle_deadline", "close_blockers", "bulletins_pending"],
  evaluador_tecnico: ["rate", "classify", "novelty", "filter_ready", "invima"],
  evaluador_clinico: ["rate", "drafts"],
  tomador_decisiones: ["bulletins_published", "alerts", "dashboard"],
  revisor_pares: ["reviews"],
};
// Bloques que dependen del estado (solo aparecen si hay algo que avisar).
const CONDITIONAL = new Set(["invima", "cycle_deadline"]);

async function myWork(page) {
  return page.evaluate(async () => {
    const r = await fetch("/api/dashboard/my-work", {
      headers: { Authorization: `Bearer ${localStorage.getItem("iets_hs_token")}` },
    });
    return r.json();
  });
}

for (const role of ROLES) {
  test(`bandeja de ${role}: ve sus pendientes con cifras y enlaces`, async ({ page }) => {
    const errors = watchErrors(page);
    await loginAs(page, role, "/");
    await settle(page);
    await expect(page.getByRole("heading", { level: 1, name: /Bandeja de trabajo/ })).toBeVisible();
    const work = await myWork(page);
    expect(work.role).toBe(role);

    const keys = work.items.map((i) => i.key);
    const required = EXPECTED_KEYS[role].filter((k) => !CONDITIONAL.has(k));
    for (const k of required) expect(keys, `${role} debe ver ${k}`).toContain(k);
    for (const k of keys) expect(EXPECTED_KEYS[role], `${role} no debe ver ${k}`).toContain(k);

    const grid = page.getByTestId("work-grid");
    await expect(grid).toHaveAttribute("data-role", role);
    await expect(grid.locator("article.dc-work-card")).toHaveCount(work.items.length);
    for (const item of work.items) {
      await expect(page.getByTestId(`work-${item.key}-count`)).toHaveText(String(item.count));
      await expect(page.getByTestId(`work-${item.key}-go`)).toHaveAttribute("href", item.to);
    }
    // La cola de senales es trabajo de quien edita tecnologias.
    const editor = ["superadmin", "evaluador_tecnico", "evaluador_clinico"].includes(role);
    if (editor && work.queue.length) {
      await expect(page.getByTestId("work-queue").locator("li")).toHaveCount(work.queue.length);
    } else if (!editor) {
      await expect(page.getByTestId("work-queue")).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Ejecutar vigilancia/ })).toHaveCount(0);
    }
    // Ayuda de cada KPI: explica que mide y como se calcula.
    const firstKpiHelp = page.getByTestId("bandeja-kpis").locator(".info-tip").first();
    await firstKpiHelp.focus();
    await expect(page.getByRole("tooltip")).toContainText(/Qué mide:.*Cómo se calcula:/);
    expect(await page.locator("button button").count(), "botones anidados").toBe(0);
    expectClean(errors);
  });
}

test("el enlace de un pendiente lleva a la pantalla de la accion", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "evaluador_tecnico", "/");
  await settle(page);
  const work = await myWork(page);
  const rate = work.items.find((i) => i.key === "rate");
  expect(rate).toBeTruthy();
  await page.getByTestId("work-rate-go").click();
  await settle(page);
  expect(new URL(page.url()).pathname).toBe("/priorizacion");
  expectClean(errors);
});

test("la cola de trabajo recorta nombres largos y conserva el nombre completo", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  const work = await myWork(page);
  test.skip(!work.queue.length, "sin senales en la cola");
  const titles = page.getByTestId("work-queue").getByTestId("queue-title");
  await expect(titles).toHaveCount(work.queue.length);
  for (let i = 0; i < work.queue.length; i++) {
    const title = titles.nth(i);
    await expect(title).toHaveText(work.queue[i].title.replace(/\s+/g, " ").trim());
    // Nunca mas de 2 lineas (~ 2 x 20 px de alto de linea).
    const box = await title.boundingBox();
    expect(box.height).toBeLessThanOrEqual(44);
    if ((await title.getAttribute("data-clamped")) === "true") {
      await expect(title).toHaveAttribute("title", work.queue[i].title);
    }
  }
  const first = work.queue[0];
  const link = page.getByTestId("work-queue").getByRole("link").first();
  await expect(link).toHaveAttribute("href", first.to);
  await link.click();
  await settle(page);
  expect(new URL(page.url()).pathname).toBe(first.to.split("?")[0]);
  expectClean(errors);
});
