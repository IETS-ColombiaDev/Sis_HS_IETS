// Recorrido de todas las pantallas por perfil: ninguna se cae ni emite errores.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, ROLES } from "./helpers";

const PRIVATE = [
  "/", "/ciclos", "/vigilancia", "/fuentes", "/bandeja-entrada", "/postulaciones",
  "/filtrado", "/priorizacion", "/evaluacion", "/diseminacion", "/boletines", "/notas",
  "/dashboards", "/alertas", "/senales", "/chat",
];
const ADMIN_ONLY = { "/auditoria": "audit:read", "/usuarios": "user:manage", "/configuracion": "config:manage" };
const PUBLIC = ["/login", "/postular", "/expedientes", "/transparencia"];

test.describe("pantallas publicas", () => {
  for (const path of PUBLIC) {
    test(`carga ${path}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(path);
      await settle(page);
      await expect(page.locator("body")).not.toBeEmpty();
      expectClean(errors);
    });
  }
});

for (const role of ROLES) {
  test.describe(`perfil ${role}`, () => {
    test("recorre todas las pantallas sin errores", async ({ page }) => {
      // Un solo test recorre 19 pantallas esperando que cada una se asiente: en
      // equipos cargados supera los 60 s por defecto sin que nada falle.
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await loginAs(page, role, "/");
      const me = await page.evaluate(async () => {
        const r = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${localStorage.getItem("iets_hs_token")}` } });
        return r.json();
      });
      expect(me.role).toBe(role);
      for (const path of PRIVATE) {
        await page.goto(path);
        await settle(page);
        expect(new URL(page.url()).pathname, `ruta ${path}`).toBe(path);
      }
      for (const [path, perm] of Object.entries(ADMIN_ONLY)) {
        await page.goto(path);
        await settle(page);
        const allowed = me.permissions.includes(perm);
        const landed = new URL(page.url()).pathname;
        expect(landed, `ruta ${path} con permiso=${allowed}`).toBe(allowed ? path : "/");
      }
      expectClean(errors);
    });
  });
}
