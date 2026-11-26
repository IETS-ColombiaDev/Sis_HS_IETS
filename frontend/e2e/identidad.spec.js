// Logo institucional: se carga desde Configuración y aparece en el menú, el ingreso y las pantallas públicas.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

test("el administrador carga y quita el logo", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/configuracion?tab=identidad");
  await settle(page);
  await expect(page.getByTestId("settings-about")).toContainText("Identidad institucional");
  await expect(page.locator(".sidebar .sb-logo img")).toHaveCount(0);

  // Un archivo que no es imagen se rechaza sin llegar al servidor.
  await page.locator("#branding-file").setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByText("Formato no admitido").first()).toBeVisible();

  await page.locator("#branding-file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Logo actualizado").first()).toBeVisible();
  await expect(page.locator(".sidebar .sb-logo img")).toBeVisible();

  // También en las pantallas públicas y tras recargar.
  await page.goto("/transparencia");
  await expect(page.locator(".public-shell-mark img")).toBeVisible();

  await page.goto("/configuracion?tab=identidad");
  await page.getByRole("button", { name: "Quitar logo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Quitar logo" }).click();
  await expect(page.getByText("Logo quitado").first()).toBeVisible();
  await expect(page.locator(".sidebar .sb-logo img")).toHaveCount(0);
  expectClean(errors);
});
