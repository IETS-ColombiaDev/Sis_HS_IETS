// Bitacora de auditoria por la interfaz: filtros por entidad, id, accion y correo,
// detalle de cambios y vida completa de una entidad.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs } from "./crud_helpers";

test("superadministrador filtra la bitacora y reconstruye la vida de una fuente", async ({ page }) => {
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const src = await api.post("/sources/quick", { title: uid("Fuente auditada"), url: `https://auditada.example.org/${uid("u")}` });
  await api.put(`/sources/${src.id}`, { scrape_enabled: false });

  await loginAs(page, "superadmin", "/auditoria");
  await settle(page);
  await page.getByLabel("Filtrar por entidad").selectOption("sources");
  await page.getByLabel("Identificador de la entidad").fill(String(src.id));
  const rows = page.locator(".audit-table tbody tr");
  await expect(rows.first()).toContainText(`#${src.id}`);
  await expect(page.locator(".audit-table")).toContainText("update");

  // Detalle de un cambio: antes y despues.
  await rows.first().getByRole("button", { name: "Ver cambios" }).click();
  await expect(page.locator(".audit-diff").first()).toBeVisible();

  // Vida completa de la entidad, en orden cronologico.
  await rows.first().getByRole("button", { name: "Vida" }).click();
  const trail = page.getByTestId("audit-trail");
  await expect(trail.locator("li")).toHaveCount(2);
  await expect(trail.locator("li").first()).toContainText("create");
  await page.keyboard.press("Escape");

  // Filtro por accion y limpieza de filtros.
  await page.getByLabel("Filtrar por acción").selectOption("create");
  await expect(page.locator(".audit-table")).not.toContainText("update");
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByLabel("Identificador de la entidad")).toHaveValue("");
  expectClean(errors);
});

test("la bitacora es solo para quien tiene audit:read", async ({ page }) => {
  for (const role of ["evaluador_tecnico", "evaluador_clinico", "tomador_decisiones", "revisor_pares"]) {
    const api = await apiAs(page.request, role);
    await api.get("/audit", 403);
    await api.get("/audit/entities", 403);
  }
});
