// Fichas publicas (RF18): buscador, ficha, transparencia y ausencia de datos
// restringidos, por la interfaz y por la API publica (sin sesion).
import { test, expect } from "@playwright/test";
import { watchErrors, expectClean, settle } from "./helpers";

const RESTRICTED = ["budget", "presupuesto", "comparators", "comparadores", "impacto_presupuestal", "confidential_fields"];

test("buscador de expedientes, ficha y transparencia sin datos restringidos", async ({ page, request }) => {
  const errors = watchErrors(page);
  await page.goto("/expedientes");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Expedientes de tecnologías emergentes" })).toBeVisible();

  const list = await (await request.get("/api/public/technologies")).json();
  for (const item of list) {
    for (const key of RESTRICTED) expect(Object.keys(item)).not.toContain(key);
  }

  // Busqueda sin resultados: mensaje claro.
  await page.getByLabel("Buscar expediente").fill("zzzz-no-existe-zzzz");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("No hay expedientes públicos que coincidan")).toBeVisible();

  if (list.length) {
    const first = list[0];
    const fiche = await (await request.get(`/api/public/technologies/${first.id}`)).json();
    const flat = JSON.stringify(fiche).toLowerCase();
    for (const key of ["budget_", "presupuest", "comparator"]) expect(flat).not.toContain(key);
    await page.goto(`/expedientes/${first.id}`);
    await settle(page);
    await expect(page.locator(".iets-dossier")).toContainText(fiche.title);
    await expect(page.getByRole("button", { name: "Descargar ficha técnica" })).toBeVisible();
  }

  // Una ficha inexistente o no publicada no se muestra.
  await page.goto("/expedientes/99999999");
  await settle(page);
  await expect(page.getByText("Expediente no disponible")).toBeVisible();

  // Transparencia: solo agregados.
  await page.goto("/transparencia");
  await settle(page);
  await expect(page.getByText("Tecnologías publicadas")).toBeVisible();
  const stats = await (await request.get("/api/public/strategy/stats")).json();
  expect(Object.keys(stats).sort()).toEqual(["by_cluster", "cycles", "published"]);
  expectClean(errors);
});
