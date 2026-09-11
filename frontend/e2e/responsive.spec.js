// Movil (P5-6): ninguna pantalla desborda el ancho del telefono.
// Las tablas anchas pueden desplazarse dentro de su propio contenedor, pero la
// pagina en si nunca debe obligar a desplazarse horizontalmente.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle } from "./helpers";

const ROUTES = [
  "/", "/ciclos", "/vigilancia", "/fuentes", "/bandeja-entrada", "/postulaciones",
  "/filtrado", "/priorizacion", "/evaluacion", "/diseminacion", "/boletines", "/notas",
  "/dashboards", "/alertas", "/senales", "/chat", "/auditoria", "/configuracion", "/usuarios",
];
const PUBLIC = ["/login", "/postular", "/expedientes", "/transparencia"];

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { scroll: doc.scrollWidth, client: doc.clientWidth };
  });
}

test("pantallas publicas caben en 390 px", async ({ page }) => {
  const errors = watchErrors(page);
  for (const path of PUBLIC) {
    await page.goto(path);
    await settle(page);
    const { scroll, client } = await overflow(page);
    expect(scroll, `${path} desborda: ${scroll}px de contenido en ${client}px`).toBeLessThanOrEqual(client + 1);
  }
  expectClean(errors);
});

test("pantallas internas caben en 390 px y el menu se abre", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/");
  await settle(page);
  // El menu lateral se convierte en cajon con boton propio.
  await page.getByRole("button", { name: "Abrir menú de módulos" }).click();
  await expect(page.locator(".sidebar.sidebar-open")).toBeVisible();
  await page.locator(".sidebar-overlay").click({ position: { x: 370, y: 400 } });
  const offenders = [];
  for (const path of ROUTES) {
    await page.goto(path);
    await settle(page);
    const { scroll, client } = await overflow(page);
    if (scroll > client + 1) {
      // Identifica el elemento mas ancho para orientar la correccion.
      const culprit = await page.evaluate((limit) => {
        let worst = null;
        for (const el of document.querySelectorAll("main *")) {
          const r = el.getBoundingClientRect();
          if (r.right > limit + 1 && (!worst || r.right > worst.right)) {
            worst = { right: Math.round(r.right), tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), text: (el.innerText || "").slice(0, 40) };
          }
        }
        return worst;
      }, client);
      offenders.push(`${path}: ${scroll}px en ${client}px -> ${JSON.stringify(culprit)}`);
    }
  }
  expect(offenders, offenders.join("\n")).toEqual([]);
  expectClean(errors);
});
