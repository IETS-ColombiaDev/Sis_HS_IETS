// Frente C: tablero estrategico (/dashboards, RF17).
// Filtros en la URL, limpiar, profundizacion por clic y teclado, exportacion y
// capa de acceso (sin analytics:restricted no hay mapa presupuestal).
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, createCycle, isoDate, techInCycle } from "./flow_api";

async function apiGet(page, path) {
  return page.evaluate(async (p) => {
    const r = await fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem("iets_hs_token")}` } });
    return { status: r.status, body: await r.json() };
  }, path);
}

async function cyclesWithData(page) {
  const { body: cycles } = await apiGet(page, "/api/cycles");
  const out = [];
  for (const c of cycles) {
    const { body } = await apiGet(page, `/api/strategy/dashboard?cycle_id=${c.id}`);
    if ((body.total_in_cycle || 0) > 0) out.push({ ...c, dash: body });
  }
  return out;
}

/**
 * Sobre una base nueva (modo autocontenido o CI) la siembra de ciclos oficiales se
 * omite y no hay ningun ciclo con datos: se arma uno por API (asignada, apta y
 * priorizada) para que el tablero tenga embudo, clusteres y franjas que probar.
 */
const withTtm = (c) => c.dash.ttm_scatter.some((r) => r.months != null);

async function ensureCycleWithData(page) {
  const current = await cyclesWithData(page);
  if (current.some((c) => c.dash.funnel.filtered > 0 && withTtm(c))) return;
  const api = await apiAs(page.request);
  const cycle = await createCycle(api, { status: "en_priorizacion" });
  await techInCycle(api, cycle.id, { name: uid("Tablero asignada"), stage: "asignada" });
  await techInCycle(api, cycle.id, { name: uid("Tablero apta"), stage: "apta" });
  const prio = await techInCycle(api, cycle.id, { name: uid("Tablero priorizada") });
  // Una con fecha de fin de fase III (grafica el time-to-market) y dos sin dato.
  await api.put(`/technologies/${prio.id}`, { phase3_completion_date: isoDate(new Date().getFullYear() + 1, 6, 30) });
  const seeded = await cyclesWithData(page);
  expect(seeded.some((c) => c.dash.funnel.filtered > 0 && withTtm(c)), "ciclo sembrado con datos").toBeTruthy();
}

async function openCycle(page, id, query = "") {
  await page.goto(`/dashboards?ciclo=${id}${query}`);
  await settle(page);
  await expect(page.getByRole("heading", { level: 1, name: /Tablero estratégico/ })).toBeVisible();
}

/** Registros de un CSV respetando saltos de linea dentro de comillas. */
function csvRecords(text) {
  let inQuotes = false;
  let records = 0;
  const body = text.replace(/\r/g, "");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "\n" && !inQuotes) records += 1;
  }
  return body.endsWith("\n") ? records : records + 1;
}

test("filtros reflejados en la URL, contador, chips y limpiar", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  await ensureCycleWithData(page);
  const [cycle] = await cyclesWithData(page);
  expect(cycle, "ciclo con tecnologias").toBeTruthy();
  const cluster = cycle.dash.by_cluster[0];
  await openCycle(page, cycle.id);
  await expect(page.getByTestId("filter-count")).toHaveText("0");
  await expect(page.getByTestId("clear-filters")).toBeDisabled();

  await page.locator("#f-cluster").selectOption(String(cluster.cluster_id ?? 0));
  await settle(page);
  await expect(page).toHaveURL(new RegExp(`cluster_id=${cluster.cluster_id ?? 0}`));
  await expect(page).toHaveURL(new RegExp(`ciclo=${cycle.id}`));
  await expect(page.getByTestId("filter-count")).toHaveText("1");
  await expect(page.getByRole("button", { name: `Quitar filtro Clúster: ${cluster.label}` })).toBeVisible();
  // KPI de capturadas = cifra del API para el mismo recorte.
  const { body: cut } = await apiGet(page, `/api/strategy/dashboard?cycle_id=${cycle.id}&cluster_id=${cluster.cluster_id ?? 0}`);
  expect(cut.funnel.captured).toBe(cluster.value);
  await expect(page.getByRole("button", { name: new RegExp(`^Capturadas: ${cluster.value}\\.`) })).toBeVisible();

  // Segundo filtro combinado y enlace compartible: recargar conserva el recorte.
  await page.locator("#f-band").selectOption("desconocido");
  await settle(page);
  await expect(page.getByTestId("filter-count")).toHaveText("2");
  const shared = page.url();
  await page.goto(shared);
  await settle(page);
  await expect(page.getByTestId("filter-count")).toHaveText("2");
  await expect(page.locator("#f-band")).toHaveValue("desconocido");
  const { body: both } = await apiGet(page, `/api/strategy/dashboard?cycle_id=${cycle.id}&cluster_id=${cluster.cluster_id ?? 0}&band=desconocido`);
  if (both.ttm_scatter.length) {
    await expect(page.locator(".dc-table-tools")).toContainText(`de ${both.ttm_scatter.length} tecnología(s)`);
  } else {
    await expect(page.getByText("Ninguna tecnología coincide con estos filtros")).toBeVisible();
  }

  // Quitar un filtro desde su chip y luego limpiar todo.
  await page.getByRole("button", { name: /Quitar filtro Time-to-market/ }).click();
  await expect(page.getByTestId("filter-count")).toHaveText("1");
  await page.getByTestId("clear-filters").click();
  await settle(page);
  await expect(page.getByTestId("filter-count")).toHaveText("0");
  expect(new URL(page.url()).searchParams.get("cluster_id")).toBeNull();
  expect(new URL(page.url()).searchParams.get("ciclo")).toBe(String(cycle.id));
  expectClean(errors);
});

test("profundizacion: clic en barra, boton de datos y teclado filtran el recorte", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  await ensureCycleWithData(page);
  const cycle = (await cyclesWithData(page)).find((c) => c.dash.funnel.filtered > 0);
  expect(cycle, "ciclo con tecnologias filtradas").toBeTruthy();
  await openCycle(page, cycle.id);
  const total = cycle.dash.total_in_cycle;
  await expect(page.locator(".dc-table-tools")).toContainText(`de ${total} tecnología(s)`);

  // Boton de datos del grafico de cluster (misma accion que clic en la barra).
  const cluster = cycle.dash.by_cluster[0];
  const value = String(cluster.cluster_id ?? 0);
  await page.getByTestId(`pick-cluster-${value}`).click();
  await settle(page);
  await expect(page).toHaveURL(new RegExp(`cluster_id=${value}`));
  await expect(page.getByTestId(`pick-cluster-${value}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".dc-table-tools")).toContainText(`de ${cluster.value} tecnología(s)`);
  // Segundo clic quita el filtro.
  await page.getByTestId(`pick-cluster-${value}`).click();
  await settle(page);
  expect(new URL(page.url()).searchParams.get("cluster_id")).toBeNull();

  // Clic directo en una barra de Recharts (embudo -> etapa "Filtradas").
  const filtered = cycle.dash.funnel.filtered;
  await page.getByTestId("chart-funnel").locator(".recharts-bar-rectangle").nth(1).click();
  await settle(page);
  await expect(page).toHaveURL(/stage=filtered/);
  await expect(page.locator(".dc-table-tools")).toContainText(`de ${filtered} tecnología(s)`);

  // Teclado: foco en un boton de franja y Enter.
  const band = cycle.dash.by_band.find((b) => b.value > 0);
  await page.getByTestId("clear-filters").click();
  await settle(page);
  const pick = page.getByTestId(`pick-franja-${band.code}`);
  await pick.focus();
  await page.keyboard.press("Enter");
  await settle(page);
  await expect(page).toHaveURL(new RegExp(`band=${band.code}`));
  await expect(page.locator(".dc-table-tools")).toContainText(`de ${band.value} tecnología(s)`);
  expectClean(errors);
});

test("exportacion CSV y Excel del recorte respeta la capa de acceso", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  await ensureCycleWithData(page);
  const [cycle] = await cyclesWithData(page);
  await openCycle(page, cycle.id);

  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar CSV" }).click()]);
  expect(csv.suggestedFilename()).toMatch(/^tablero-.*\.csv$/);
  const text = fs.readFileSync(await csv.path(), "utf-8").replace(/^﻿/, "");
  const header = text.split(/\r?\n/)[0];
  expect(header).toContain("Tecnologia;Cluster;Tipologia");
  expect(header).toContain("Impacto presupuestal anio 1");
  expect(csvRecords(text) - 1).toBe(cycle.dash.total_in_cycle);

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar Excel" }).click()]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  const bytes = fs.readFileSync(await xlsx.path());
  expect(bytes.subarray(0, 2).toString()).toBe("PK"); // contenedor OOXML
  expectClean(errors);
});

test("sin analytics:restricted no hay mapa presupuestal ni montos (UI, API y CSV)", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "evaluador_tecnico", "/");
  await settle(page);
  await ensureCycleWithData(page);
  const cycles = await cyclesWithData(page);
  const cycle = cycles[0];
  for (const c of cycles) {
    expect(c.dash.restricted).toBe(false);
    expect(c.dash.budget_heatmap ?? null).toBeNull();
    expect(c.dash.budget_items ?? null).toBeNull();
    expect(c.dash.comparators ?? null).toBeNull();
    for (const row of c.dash.ttm_scatter) expect(row.year1).toBeUndefined();
  }
  await openCycle(page, cycle.id);
  await expect(page.getByTestId("budget-locked")).toBeVisible();
  await expect(page.getByTestId("budget-heatmap")).toHaveCount(0);
  await expect(page.locator(".dc-toolbar-right").getByText("Vista agregada")).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar CSV" }).click()]);
  const text = fs.readFileSync(await csv.path(), "utf-8");
  expect(text).not.toContain("Impacto presupuestal");
  expectClean(errors);
});

test("con analytics:restricted el mapa de calor presupuestal se ve y profundiza", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "tomador_decisiones", "/");
  await settle(page);
  await ensureCycleWithData(page);
  const cycles = await cyclesWithData(page);
  const withBudget = cycles.find((c) => (c.dash.budget_heatmap || []).some((r) => r.year1 || r.year2 || r.year3));
  test.skip(!withBudget, "ningun ciclo con montos presupuestales");
  await openCycle(page, withBudget.id);
  const heat = page.getByTestId("budget-heatmap");
  await expect(heat).toBeVisible();
  const top = withBudget.dash.budget_heatmap[0];
  await expect(heat.locator("tbody tr").first()).toContainText(top.cluster);
  await heat.locator(".dc-heat-cell").first().click();
  await settle(page);
  await expect(page).toHaveURL(new RegExp(`cluster_id=${top.cluster_id ?? 0}`));
  expectClean(errors);
});

test("tablero: estados vacios guiados, dispersion sin '0 m' ambiguo y nombres recortados", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  await ensureCycleWithData(page);
  // Un ciclo con al menos una tecnologia graficable: la nota de "sin dato" vive bajo la dispersion.
  const cycle = (await cyclesWithData(page)).find(withTtm);
  expect(cycle, "ciclo con time-to-market graficable").toBeTruthy();
  // Combinacion imposible -> estado vacio con accion para limpiar.
  await openCycle(page, cycle.id, "&stage=published&status=asignada_a_ciclo");
  await expect(page.getByText("Ninguna tecnología coincide con estos filtros")).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).last().click();
  await settle(page);
  await expect(page.getByTestId("filter-count")).toHaveText("0");

  // Sin dato y 0 meses se distinguen en la tabla.
  const rows = cycle.dash.ttm_scatter;
  const noData = rows.find((r) => r.months == null);
  if (noData) await expect(page.getByTestId("recorte-table")).toContainText("Falta fecha de fin de fase III o de aprobación");
  const zero = rows.find((r) => r.months === 0);
  if (zero) await expect(page.getByTestId("recorte-table")).toContainText(/Ya aprobada|Fecha esperada vencida|registro INVIMA/);
  await expect(page.getByTestId("ttm-without")).toBeVisible();

  // Los nombres largos quedan en 2 lineas como maximo.
  const names = page.getByTestId("recorte-name");
  const n = await names.count();
  for (let i = 0; i < n; i++) {
    const box = await names.nth(i).boundingBox();
    expect(box.height).toBeLessThanOrEqual(42);
  }
  // Parametros invalidos en el enlace se ignoran sin romper la pantalla.
  await openCycle(page, cycle.id, "&band=pronto&priority_min=99&date_from=ayer");
  await expect(page.getByTestId("filter-count")).toHaveText("0");
  expectClean(errors);
});

test("el grafo de gobernanza se despliega con el mismo recorte", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  await ensureCycleWithData(page);
  const [cycle] = await cyclesWithData(page);
  await openCycle(page, cycle.id, "&stage=filtered");
  const toggle = page.getByRole("button", { name: /Grafo de gobernanza/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const [graphReq] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/api/strategy/graph?")),
    toggle.click(),
  ]);
  expect(graphReq.url()).toContain("stage=filtered");
  await settle(page);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expectClean(errors);
});
