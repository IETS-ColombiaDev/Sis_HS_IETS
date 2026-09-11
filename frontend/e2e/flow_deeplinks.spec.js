// Enlaces directos ?tecnologia=<id> desde la bandeja de trabajo y el tablero:
// cada pantalla abre la tecnologia, la lleva a la vista y la resalta; si no es
// del ciclo en pantalla lo avisa y ofrece cambiar; la URL sigue la seleccion.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import {
  apiAs,
  assign,
  classify,
  createCycle,
  qualify,
  seedTechs,
  techInCycle,
  useCycleInPage,
} from "./flow_api";

/** Navegacion dentro de la SPA (sin recargar): conserva el estado de la pantalla. */
async function spaNavigate(page, path) {
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test.describe("enlaces directos a una tecnologia", () => {
  test("priorizacion: la ubica en otra pagina y fuera de 'Solo lo que me toca'", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const tech = await apiAs(page.request, "evaluador_tecnico");
    const cycle = await createCycle(api, { status: "en_priorizacion" });
    const tag = uid("Enlace");
    const bulk = await seedTechs(
      api,
      Array.from({ length: 52 }, (_, i) => ({ name: `${tag} cola ${String(i).padStart(2, "0")}` }))
    );
    for (const t of bulk) await classify(api, t.id);
    await assign(api, cycle.id, bulk.map((t) => t.id));
    for (const t of bulk) await qualify(api, cycle.id, t.id);
    const firstPage = await api.get(`/priority/${cycle.id}/queue?limit=50&offset=0`);
    const target = bulk.find((t) => !firstPage.some((i) => i.technology_id === t.id));
    expect(target, "una tecnologia fuera de la primera pagina").toBeTruthy();
    // El tecnico ya califico sus criterios: no aparece en "Solo lo que me toca".
    for (const code of ["P1", "P5", "P6"]) {
      await tech.post(`/priority/${cycle.id}/${target.id}/rate`, { criterion: code, value: 1 });
    }

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "evaluador_tecnico", "/priorizacion");
    await settle(page);
    await page.getByTestId("prio-only-mine").click();
    await expect(page.getByTestId("prio-pager")).toContainText("de 51");

    await spaNavigate(page, `/priorizacion?tecnologia=${target.id}`);
    const item = page.getByTestId(`prio-item-${target.id}`);
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute("data-flash", "1");
    await expect(item).toBeInViewport();
    await expect(page.getByTestId("prio-detail-title")).toHaveText(target.commercial_name);
    await expect(page.getByTestId("prio-pager")).toContainText("51-52 de 52");
    await expect(page.getByTestId("prio-only-mine")).toHaveText(/Solo lo que me toca/);

    // Elegir otra actualiza la URL (compartible) sin apilar historial.
    const other = bulk.find((t) => t.id !== target.id && !firstPage.some((i) => i.technology_id === t.id));
    await page.getByTestId(`prio-item-${other.id}`).click();
    await expect(page).toHaveURL(new RegExp(`tecnologia=${other.id}$`));
    await page.goBack();
    await expect(page).not.toHaveURL(/tecnologia=/);
    expectClean(errors);
  });

  test("filtrado: abre la pestana segun el estado y explica las excluidas", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_filtrado" });
    const tag = uid("EnlaceFil");
    const [pending, qualified, excluded] = await seedTechs(api, [
      { name: `${tag} pendiente` },
      { name: `${tag} apta` },
      { name: `${tag} excluida` },
    ]);
    for (const t of [pending, qualified, excluded]) await classify(api, t.id);
    await assign(api, cycle.id, [pending.id, qualified.id, excluded.id]);
    await qualify(api, cycle.id, qualified.id);
    await api.post(`/technologies/${excluded.id}/cycles/${cycle.id}/exclude`, {
      reason_code: "fuera_alcance",
      note: "E2E",
    });

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "superadmin", `/filtrado?tecnologia=${pending.id}`);
    await settle(page);
    await expect(page.getByRole("tab", { name: /Novedad y registro sanitario/ })).toHaveAttribute("aria-selected", "true");
    const item = page.getByTestId(`novelty-item-${pending.id}`);
    await expect(item).toHaveClass(/prio-item-active/);
    await expect(item).toHaveAttribute("data-flash", "1");

    await spaNavigate(page, `/filtrado?tecnologia=${qualified.id}`);
    await expect(page.getByRole("tab", { name: /Listado único/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId(`unique-row-${qualified.id}`)).toHaveAttribute("data-flash", "1");

    await spaNavigate(page, `/filtrado?tecnologia=${excluded.id}`);
    const notice = page.getByTestId("tech-link-notice");
    await expect(notice).toContainText("fue excluida");
    await expect(notice).toContainText("Fuera del alcance");
    expectClean(errors);
  });

  test("evaluacion: abre el expediente y ofrece cambiar al ciclo de la tecnologia", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_evaluacion" });
    const other = await createCycle(api, { status: "en_evaluacion" });
    const first = await techInCycle(api, cycle.id, { name: uid("EnlaceEval uno") });
    const second = await techInCycle(api, cycle.id, { name: uid("EnlaceEval dos") });
    await api.post(`/technologies/${second.id}/cycles/${cycle.id}/to-evaluation`);
    const foreign = await techInCycle(api, other.id, { name: uid("EnlaceEval otro ciclo") });

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "superadmin", `/evaluacion?tecnologia=${second.id}`);
    await settle(page);
    const item = page.getByTestId(`eval-item-${second.id}`);
    await expect(item).toHaveClass(/is-active/);
    await expect(item).toHaveAttribute("data-flash", "1");
    await expect(page.getByTestId("eval-coi-sign")).toBeVisible();

    await page.getByTestId(`eval-item-${first.id}`).click();
    await expect(page).toHaveURL(new RegExp(`tecnologia=${first.id}$`));
    await expect(page.getByTestId("eval-open")).toBeVisible();

    await spaNavigate(page, `/evaluacion?tecnologia=${foreign.id}`);
    const notice = page.getByTestId("tech-link-notice");
    await expect(notice).toContainText(`no pertenece a ${cycle.code}`);
    await notice.getByTestId("tech-link-switch-cycle").click();
    await expect(page.getByTestId(`eval-item-${foreign.id}`)).toHaveClass(/is-active/);
    await expect(page.getByTestId("tech-link-notice")).toHaveCount(0);
    expectClean(errors);
  });

  test("bandeja de entrada: abre el detalle, o dice a donde fue la senal", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_filtrado" });
    const tag = uid("EnlaceBan");
    const [staged, assigned] = await seedTechs(api, [{ name: `${tag} en bandeja` }, { name: `${tag} asignada` }]);
    await classify(api, assigned.id);
    await assign(api, cycle.id, [assigned.id]);

    await useCycleInPage(page, cycle.id);
    await loginAs(page, "superadmin", `/bandeja-entrada?tecnologia=${staged.id}`);
    await settle(page);
    await expect(page.getByRole("heading", { name: "Clasificar señal" })).toBeVisible();
    await expect(page.locator("#stg-commercial")).toHaveValue(staged.commercial_name);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page).not.toHaveURL(/tecnologia=/);

    // Abrir desde la tabla deja un enlace compartible.
    await page.getByLabel("Buscar señales").fill(tag);
    await page.getByTestId(`staging-row-${staged.id}`).getByRole("button", { name: "Clasificar" }).click();
    await expect(page).toHaveURL(new RegExp(`tecnologia=${staged.id}$`));
    await page.getByRole("button", { name: "Cancelar" }).click();

    await spaNavigate(page, `/bandeja-entrada?tecnologia=${assigned.id}`);
    const notice = page.getByTestId("tech-link-notice");
    await expect(notice).toContainText(`fue asignada a ${cycle.code}`);
    await notice.getByTestId("tech-link-go-filtrado").click();
    await expect(page).toHaveURL(new RegExp(`/filtrado\\?tecnologia=${assigned.id}$`));
    await expect(page.getByTestId(`novelty-item-${assigned.id}`)).toHaveClass(/prio-item-active/);
    expectClean(errors);
  });

  test("bandeja de entrada: un perfil de consulta ve el detalle en solo lectura", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const [staged] = await seedTechs(api, [{ name: uid("EnlaceLectura") }]);

    await loginAs(page, "tomador_decisiones", `/bandeja-entrada?tecnologia=${staged.id}`);
    await settle(page);
    await expect(page.getByRole("heading", { name: "Detalle de la señal" })).toBeVisible();
    await expect(page.getByTestId("staging-readonly")).toBeVisible();
    await expect(page.locator("#stg-commercial")).toBeDisabled();
    await expect(page.getByTestId("staging-save")).toHaveCount(0);
    expectClean(errors);
  });

  test("un enlace a una tecnologia inexistente lo dice con claridad", async ({ page }) => {
    const errors = watchErrors(page);
    const api = await apiAs(page.request);
    const cycle = await createCycle(api, { status: "en_priorizacion" });
    await useCycleInPage(page, cycle.id);
    await loginAs(page, "superadmin", "/priorizacion?tecnologia=987654321");
    await settle(page);
    await expect(page.getByTestId("tech-link-notice")).toContainText("#987654321 no existe");
    await spaNavigate(page, "/evaluacion?tecnologia=abc");
    await expect(page.getByTestId("tech-link-notice")).toContainText("no es válido");
    expectClean(errors);
  });
});
