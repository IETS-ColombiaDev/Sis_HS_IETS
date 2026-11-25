// Base de conocimiento de busqueda (Configuracion -> Parametros de fuentes) y
// vigilante de la cola. Nada sale a internet: las paginas se cargan por API con
// un paquete de prueba, que es justo como llegan desde otro equipo.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs } from "./crud_helpers";

function pack(tag) {
  return {
    version: 1,
    pages: [
      { domain: "e2e-fuente.example.org", url: `https://e2e-fuente.example.org/horizonte/${tag}-terapia-genica`, title: `${tag} terapia génica aprobada`, snippet: "Informe de horizonte", engine: "sitemap", signals: 3, visits: 1 },
      { domain: "e2e-fuente.example.org", url: `https://e2e-fuente.example.org/noticias/${tag}-institucional`, title: `${tag} nota institucional`, engine: "yahoo", signals: 0, visits: 2, status: "sin_senal" },
      { domain: "otro.example.org", url: "https://sitio-ajeno.example.com/fuera-del-dominio", title: "No debe entrar" },
    ],
  };
}

test("la base de búsqueda se carga, se consulta y se descarga desde Parámetros de fuentes", async ({ page }) => {
  const errors = watchErrors(page);
  const tag = uid("KB").toLowerCase();
  const admin = await apiAs(page.request);
  const loaded = await admin.post("/search-knowledge/import", pack(tag));
  expect(loaded.added).toBe(2);
  expect(loaded.skipped).toBe(1);
  // Cargar el mismo paquete otra vez no duplica ni borra nada.
  const again = await admin.post("/search-knowledge/import", pack(tag));
  expect(again.added).toBe(0);
  expect(again.updated).toBe(2);

  await loginAs(page, "superadmin", "/configuracion");
  await settle(page);
  await page.getByRole("button", { name: "Parámetros de fuentes" }).click();
  const panel = page.getByTestId("search-knowledge");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("knowledge-stats")).toContainText("página(s)");
  await expect(panel.getByTestId("knowledge-stats")).toContainText("han aportado señales");
  // Los interruptores nuevos de la búsqueda están a la vista y encendidos por defecto.
  await expect(page.getByTestId("search-knowledge_enabled")).toBeChecked();
  await expect(page.getByTestId("search-sitemap_fallback")).toBeChecked();

  await panel.getByLabel("Consultar la base").fill(`${tag} terapia genica`);
  await panel.getByTestId("knowledge-search").click();
  const table = panel.getByTestId("knowledge-table");
  // La que contiene todas las palabras queda primera (la base ya trae las páginas del paquete del sistema).
  const first = table.locator("tbody tr").first();
  await expect(first).toContainText(`${tag} terapia génica aprobada`);
  await expect(first).toContainText("Mapa del sitio");
  await expect(first).toContainText("Activa");

  await panel.getByLabel("Consultar la base").fill("zzz-no-existe-en-la-base");
  await panel.getByTestId("knowledge-search").click();
  await expect(panel.getByTestId("knowledge-empty")).toContainText("Ninguna página coincide");

  const [download] = await Promise.all([page.waitForEvent("download"), panel.getByTestId("knowledge-export").click()]);
  expect(download.suggestedFilename()).toBe("base_busqueda_eh.json");

  // Cargar un paquete desde la pantalla.
  const extra = { version: 1, pages: [{ domain: "e2e-fuente.example.org", url: `https://e2e-fuente.example.org/horizonte/${tag}-dispositivo`, title: `${tag} dispositivo` }] };
  await panel.getByTestId("knowledge-file").setInputFiles({
    name: "paquete.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(extra)),
  });
  await expect(page.getByText("Paquete cargado: 1 página(s) nuevas y 0 ya conocidas. No se borró nada.")).toBeVisible();
  await panel.getByTestId("knowledge-file").setInputFiles({
    name: "roto.json", mimeType: "application/json", buffer: Buffer.from("esto no es json"),
  });
  await expect(page.getByText("El archivo no es un paquete JSON válido.")).toBeVisible();
  expectClean(errors);
});

test("cualquier perfil consulta la base de búsqueda y solo quien administra la configuración la cambia", async ({ page }) => {
  const tecnico = await apiAs(page.request, "evaluador_tecnico");
  const body = await tecnico.get("/search-knowledge?limit=5");
  expect(body.stats.pages).toBeGreaterThanOrEqual(0);
  await tecnico.get("/search-knowledge/coverage");
  await tecnico.get("/search-knowledge/export", 403);
  await tecnico.post("/search-knowledge/import", { pages: [] }, 403);
  const admin = await apiAs(page.request);
  await admin.post("/search-knowledge/import", { otra: "cosa" }, 422);
});

test("el avance de la vigilancia informa quién cuida la cola y el estado de la base de búsqueda", async ({ page }) => {
  const admin = await apiAs(page.request);
  const progress = await admin.get("/ingest/progress");
  // Servidor de un solo proceso con SQLite (como Render): el vigilante de la cola está en marcha.
  expect(progress.guardian_running).toBe(true);
  const report = await admin.get("/ingest/access-report");
  expect(report.search_health.knowledge).toBeTruthy();
  expect(report.search_health.knowledge.pages).toBeGreaterThanOrEqual(0);
});
