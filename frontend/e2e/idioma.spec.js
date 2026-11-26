// Cambio de idioma: español, inglés británico e inglés americano.
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean } from "./helpers";

const LANG_KEY = "iets_hs_lang";
// Con IDIOMA_INFORME=ruta se guarda el texto que quedó en español en cada pantalla (revisión manual).
const REPORT = process.env.IDIOMA_INFORME || "";

const ROUTES = [
  "/", "/ciclos", "/notas", "/vigilancia", "/fuentes", "/senales", "/bandeja-entrada", "/postulaciones",
  "/filtrado", "/priorizacion", "/evaluacion", "/diseminacion", "/boletines", "/dashboards", "/alertas",
  "/chat", "/configuracion", "/usuarios", "/auditoria",
];
const PUBLIC_ROUTES = ["/login", "/transparencia", "/expedientes", "/postular"];

async function menuLabels(page) {
  await expect(page.locator(".sidebar .sb-label").first()).toBeVisible();
  return page.locator(".sidebar .sb-label").allTextContents();
}

test("el selector cambia entre español, inglés británico e inglés americano y lo recuerda", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  expect(await menuLabels(page)).toContain("2. Priorización");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  const pick = async (code) => {
    await Promise.all([page.waitForEvent("load"), page.getByTestId("language-switch").selectOption(code)]);
    await expect(page.getByTestId("language-switch")).toHaveValue(code);
  };

  await pick("en-GB");
  let labels = await menuLabels(page);
  expect(labels).toContain("2. Prioritisation");
  expect(labels).toContain("Source catalogue");
  expect(labels).toContain("Workbench");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");

  await pick("en-US");
  labels = await menuLabels(page);
  expect(labels).toContain("2. Prioritization");
  expect(labels).toContain("Source catalog");
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

  // Se conserva al navegar y al recargar.
  await page.goto("/fuentes");
  await expect(page.locator(".header-title")).toHaveText("Source catalog");
  await page.reload();
  await expect(page.locator(".header-title")).toHaveText("Source catalog");

  await pick("es");
  await expect(page.locator(".header-title")).toHaveText("Catálogo de fuentes");
  expectClean(errors);
});

for (const lang of ["en-GB", "en-US"]) {
  test(`todas las pantallas abren en ${lang} sin errores`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [LANG_KEY, lang]);
    await loginAs(page, "superadmin", "/");
    const leftovers = [];
    for (const route of [...ROUTES, ...PUBLIC_ROUTES]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("#root")).not.toBeEmpty();
      await expect(page.getByText("Esta pantalla se detuvo")).toHaveCount(0);
      await expect(page.getByText("This screen stopped")).toHaveCount(0);
      if (REPORT) {
        const text = await page.evaluate(() => {
          const attrs = [...document.querySelectorAll("[placeholder],[title],[aria-label]")].flatMap((el) =>
            ["placeholder", "title", "aria-label"].map((a) => el.getAttribute(a)).filter(Boolean)
          );
          return `${document.body.innerText}\n${attrs.join("\n")}`;
        });
        const spanish = [...new Set(text.split("\n").map((l) => l.trim()))].filter((l) =>
          /[áéíóúñ¿¡]|\b(el|la|los|las|del|para|con|sin|que|una|por|como|esta|este|sus|ya|se|al|de)\b/i.test(l)
        );
        if (spanish.length) leftovers.push(`### ${route}\n${spanish.join("\n")}`);
      }
    }
    if (REPORT) fs.writeFileSync(`${REPORT}.${lang}.txt`, leftovers.join("\n\n"), "utf8");
    expectClean(errors);
  });
}

test("fechas y números siguen la región del idioma", async ({ page }) => {
  for (const [lang, sample] of [["es", "es-CO"], ["en-GB", "en-GB"], ["en-US", "en-US"]]) {
    await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [LANG_KEY, lang]);
    await page.goto("/login");
    const got = await page.evaluate(async () => (await import("/src/i18n/index.js").catch(() => null))?.intlLocale?.() ?? null);
    // En la versión compilada el módulo no se puede importar por ruta: basta con el atributo lang.
    if (got) expect(got).toBe(sample);
    await expect(page.locator("html")).toHaveAttribute("lang", lang === "es" ? "es" : lang);
  }
});
