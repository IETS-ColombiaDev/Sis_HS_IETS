// Inteligencia del sistema (7.4.0): pestaña de Configuracion (base de conocimiento,
// clasificador, calibracion, prompts y vigencia por año), las tres direcciones de la
// señal y la sugerencia con evidencia en Clasificar, y el marco analitico en Analitica.
// La IA esta apagada en las pruebas: todo debe funcionar con reglas y aprendizaje.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, catalogs, classify, createCycle, seedTechs, techInCycle } from "./flow_api";

test("Configuración › Inteligencia muestra la base de conocimiento, guarda parámetros y calibra", async ({ page }) => {
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  await seedTechs(api, [{ name: uid("Intel base") }]);
  await loginAs(page, "superadmin", "/configuracion?tab=inteligencia");
  await settle(page);
  const panel = page.getByTestId("intelligence-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("intel-kb-stats")).toContainText("señal(es) en la base");
  await expect(panel.getByTestId("intel-kb-stats")).toContainText("primera búsqueda histórica");
  await expect(panel.getByTestId("intel-enabled")).toBeChecked();
  await expect(panel.getByText("IA apagada: reglas y aprendizaje")).toBeVisible();

  await panel.getByLabel("Señales parecidas que votan").fill("5");
  await panel.getByTestId("intel-save").click();
  await expect(page.getByText("Parámetros de inteligencia guardados.")).toBeVisible();
  const status = await api.get("/intelligence/status");
  expect(status.config.neighbors).toBe(5);

  await panel.getByTestId("intel-calibrate").click();
  await expect(panel.getByTestId("intel-calibration-message")).toBeVisible();

  await panel.getByLabel("Buscar señales parecidas a un texto").fill("melanoma avanzado");
  await panel.getByTestId("intel-search").click();
  await expect(panel.getByTestId("intel-search-table").or(panel.getByTestId("intel-search-empty"))).toBeVisible();

  await panel.getByTestId("intel-reset").click();
  await expect(page.getByText("Parámetros de inteligencia restaurados a los de fábrica.")).toBeVisible();
  expect((await api.get("/intelligence/status")).config.neighbors).toBe(7);
  expectClean(errors);
});

test("la vigencia por año se fija, se revisa sin cambiar nada y vuelve a todos los años", async ({ page }) => {
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  await loginAs(page, "superadmin", "/configuracion?tab=inteligencia");
  await settle(page);
  const box = page.getByTestId("signal-window");
  await expect(box).toBeVisible();
  await expect(box.getByTestId("window-summary")).toContainText("Vigencia general: todos los años");

  await box.getByLabel("Desde el año").fill("2020");
  await box.getByTestId("window-save").click();
  await expect(box.getByTestId("window-summary")).toContainText("Vigencia general: desde 2020");
  expect((await api.get("/intelligence/window")).year_from).toBe(2020);

  await box.getByTestId("window-preview").click();
  await expect(box.getByTestId("window-preview-result")).toBeVisible();

  // Un rango invertido se rechaza con su mensaje.
  await box.getByLabel("Hasta el año").fill("2010");
  await box.getByTestId("window-save").click();
  await expect(page.getByText("El año inicial no puede ser mayor que el año final.")).toBeVisible();

  await box.getByTestId("window-all-years").click();
  await expect(box.getByTestId("window-summary")).toContainText("Vigencia general: todos los años");
  expect((await api.get("/intelligence/window")).year_from).toBeNull();
  expectClean(errors);
});

test("un perfil sin permiso de configuración consulta la vigencia pero la API no le deja cambiarla", async ({ page }) => {
  const tecnico = await apiAs(page.request, "evaluador_tecnico");
  await tecnico.get("/intelligence/status");
  await tecnico.get("/intelligence/window");
  await tecnico.get("/intelligence/insights");
  await tecnico.put("/intelligence/config", { neighbors: 3 }, 403);
  await tecnico.put("/intelligence/window", { scope: "all", year_from: 2020 }, 403);
  await tecnico.post("/intelligence/window/apply", {}, 403);
});

test("al clasificar se ven las tres direcciones de la señal y la sugerencia trae confianza y evidencia", async ({ page }) => {
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const tag = uid("Intel");
  const names = [1, 2, 3, 4, 5, 6].map((i) => `${tag} aprendida ${i}`);
  const techs = await seedTechs(api, [...names.map((name) => ({ name })), { name: `${tag} por clasificar` }]);
  const { clusters, types } = await catalogs(api);
  for (const tech of techs.slice(0, 6)) await classify(api, tech.id, { cluster_id: clusters[1].id, tech_type_id: types[0].id });
  const target = techs[6];

  await loginAs(page, "superadmin", "/bandeja-entrada");
  await settle(page);
  await page.getByLabel("Buscar señales").fill(`${tag} por clasificar`);
  await page.getByTestId(`staging-row-${target.id}`).getByRole("button", { name: "Clasificar" }).click();

  const urls = page.getByTestId("signal-urls");
  await expect(urls).toBeVisible();
  // La señal de prueba llega sin dirección propia: se dice, y no se inventa un enlace.
  await expect(urls.getByTestId("signal-url-exact")).toContainText("no trae URL exacta");
  await expect(urls.getByTestId("signal-url-source")).toContainText("Fuente original");
  await expect(urls.getByTestId("signal-url-source")).toHaveAttribute("href", /^https:\/\/fixture\.example\//);
  await expect(urls.getByTestId("signal-url-source")).toHaveAttribute("target", "_blank");

  await page.getByRole("button", { name: "Sugerir clasificación" }).click();
  const box = page.getByTestId("classification-suggestion");
  await expect(box).toBeVisible();
  await expect(box.getByTestId("suggestion-cluster")).toContainText(clusters[1].name);
  await expect(box.getByTestId("suggestion-cluster")).toContainText(/Confianza \d+ %/);
  await expect(box.getByTestId("suggestion-similar")).toContainText("señales parecidas que el equipo ya clasificó");
  await box.getByTestId("suggestion-similar").locator("summary").click();
  await expect(box.getByTestId("suggestion-similar")).toContainText(`${tag} aprendida`);
  expectClean(errors);
});

test("Analítica muestra el marco analítico con sus cuatro lentes aunque la IA esté apagada", async ({ page }) => {
  const errors = watchErrors(page);
  const api = await apiAs(page.request);
  const cycle = await createCycle(api, { status: "en_priorizacion" });
  await techInCycle(api, cycle.id, { name: uid("Intel analítica") });
  await loginAs(page, "superadmin", "/");
  await page.goto(`/dashboards?ciclo=${cycle.id}`);
  await settle(page);
  const box = page.getByTestId("analytics-insights");
  await expect(box).toBeVisible({ timeout: 20_000 });
  for (const lens of ["descriptivo", "diagnostico", "predictivo", "prescriptivo"]) {
    await expect(box.getByTestId(`lens-${lens}`)).toBeVisible();
  }
  await expect(box.getByTestId("lens-descriptivo")).toContainText("Señales capturadas");
  await expect(box.getByTestId("insights-note")).toContainText("La IA no está configurada");
  await expect(box.getByTestId("insights-generate")).toHaveCount(0);
  expectClean(errors);
});

test("la URL exacta de la señal es un botón como los demás, y un enlace que ya no existe no se ofrece", async ({ page }) => {
  const api = await apiAs(page.request);
  const tag = uid("Botones");
  const [ok, gone] = await seedTechs(api, [{ name: `${tag} vigente` }, { name: `${tag} retirada` }]);
  const exact = "https://agencia.example.org/ficha/vigente";
  const listing = "https://agencia.example.org/novedades";
  await page.route(/\/api\/technologies\/staging(\?|$)/, async (route) => {
    const response = await route.fetch();
    const rows = (await response.json()).map((row) => {
      if (row.id === ok.id) return { ...row, signal_url: `${exact}#:~:text=Vigente`, link_type: "exacto", link_status: "ok", query_url: listing };
      if (row.id === gone.id) {
        return { ...row, signal_url: listing, link_type: "consulta", link_status: "sin_verificar", query_url: listing,
          evidence: { ...(row.evidence || {}), broken_url: "https://agencia.example.org/ficha/retirada" } };
      }
      return row;
    });
    await route.fulfill({ response, json: rows });
  });
  await loginAs(page, "superadmin", "/bandeja-entrada");
  await settle(page);
  await page.getByLabel("Buscar señales").fill(tag);

  await page.getByTestId(`staging-row-${ok.id}`).getByRole("button", { name: "Clasificar" }).click();
  const urls = page.getByTestId("signal-urls");
  const button = urls.getByTestId("signal-url-exact");
  await expect(button).toContainText("URL exacta de la señal");
  await expect(button).toHaveAttribute("href", `${exact}#:~:text=Vigente`);
  await expect(button).toHaveAttribute("target", "_blank");
  await expect(button).toHaveClass(/so-link/);
  await expect(urls.getByTestId("signal-url-query")).toHaveAttribute("href", listing);
  await expect(urls.getByTestId("signal-url-source")).toContainText("Fuente original");
  // Un solo juego de botones: el recuadro de tipo de enlace ya no repite los suyos.
  await expect(page.getByTestId("signal-link-open")).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar" }).first().click();

  await page.getByTestId(`staging-row-${gone.id}`).getByRole("button", { name: "Clasificar" }).click();
  await expect(page.getByTestId("signal-url-exact")).toContainText("Página donde está la señal");
  await expect(page.getByTestId("signal-url-exact")).toHaveAttribute("href", listing);
  await expect(page.getByTestId("signal-url-broken")).toContainText("ya no existe en el sitio");
});
