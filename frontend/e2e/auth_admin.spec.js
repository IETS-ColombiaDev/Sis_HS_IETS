// Acceso con contrasena y modulo de administracion de usuarios, por la interfaz.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, apiToken, auth } from "./helpers";

const STRONG = "Horizonte2026seguro";

function uniqueEmail(tag) {
  return `e2e.${tag}.${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}@iets.org.co`;
}

async function createViaUi(page, email, roleLabel = "Evaluador técnico") {
  await page.getByRole("button", { name: "+ Nuevo usuario" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#user-email").fill(email);
  await dialog.locator("#user-name").fill("Persona E2E");
  await dialog.locator(".role-card", { hasText: roleLabel }).click();
  await dialog.getByRole("button", { name: "Crear cuenta" }).click();
  const temp = await page.getByTestId("temp-password").locator("span").first().innerText();
  expect(temp.length).toBeGreaterThanOrEqual(10);
  await page.getByRole("button", { name: "Entendido, ya la guardé" }).click();
  return temp.trim();
}

async function logoutUi(page) {
  await page.getByRole("button", { name: /Menú de/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function loginUi(page, email, password) {
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}

test("credenciales equivocadas muestran un error claro y no revelan si la cuenta existe", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/login");
  await loginUi(page, "no.existe@iets.org.co", "Cualquiera123");
  await expect(page.getByRole("alert")).toContainText("Correo o contraseña incorrectos");
  await expect(page.locator("#login-password")).toHaveValue("");
  expectClean(errors);
});

test("alta de cuenta, primer ingreso con clave temporal y cambio obligatorio", async ({ page }) => {
  const errors = watchErrors(page);
  const email = uniqueEmail("alta");
  await loginAs(page, "superadmin", "/usuarios");
  await settle(page);
  const temp = await createViaUi(page, email, "Evaluador clínico");
  const row = page.getByTestId(`user-row-${email}`);
  await expect(row).toContainText("Evaluador clínico");
  await expect(row).toContainText("Contraseña temporal");
  await expect(row).toContainText("Califica P2, P3, P4");

  // La persona entra con la temporal y el sistema la obliga a cambiarla.
  await page.evaluate(() => localStorage.removeItem("iets_hs_token"));
  await page.goto("/login");
  await loginUi(page, email, temp);
  await expect(page.getByRole("heading", { name: "Cree su contraseña personal" })).toBeVisible();
  await page.locator("#pwd-current").fill(temp);
  await page.locator("#pwd-new").fill("corta");
  await expect(page.getByRole("button", { name: "Guardar contraseña" })).toBeDisabled();
  await page.locator("#pwd-new").fill(STRONG);
  await page.locator("#pwd-confirm").fill(STRONG);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("heading", { name: "Bandeja de trabajo" }).first()).toBeVisible();
  await expect(page.locator(".user-meta")).toContainText("Evaluador clínico");
  // Un evaluador no ve la administracion.
  await expect(page.getByRole("link", { name: "Usuarios y perfiles" })).toHaveCount(0);

  // Y en adelante entra con su contrasena propia.
  await logoutUi(page);
  await loginUi(page, email, STRONG);
  await expect(page.getByRole("heading", { name: "Bandeja de trabajo" }).first()).toBeVisible();
  expectClean(errors);
});

test("editar, restablecer, desactivar y eliminar desde la administracion", async ({ page }) => {
  const errors = watchErrors(page);
  const email = uniqueEmail("gestion");
  await loginAs(page, "superadmin", "/usuarios");
  await settle(page);
  await createViaUi(page, email);

  // Buscar filtra la tabla.
  await page.locator("#users-search").fill(email);
  await expect(page.locator("tbody tr")).toHaveCount(1);

  // Editar nombre y perfil.
  const row = page.getByTestId(`user-row-${email}`);
  await row.getByRole("button", { name: `Editar ${email}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#user-name").fill("Nombre Editado E2E");
  await dialog.locator(".role-card", { hasText: "Tomador de decisiones" }).click();
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(row).toContainText("Nombre Editado E2E");
  await expect(row).toContainText("Tomador de decisiones");

  // Restablecer muestra una clave nueva una sola vez.
  await row.getByRole("button", { name: `Restablecer contraseña de ${email}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restablecer" }).click();
  await expect(page.getByTestId("temp-password")).toBeVisible();
  await page.getByRole("button", { name: "Entendido, ya la guardé" }).click();

  // Desactivar y reactivar.
  await row.getByRole("button", { name: `Desactivar ${email}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Desactivar" }).click();
  await expect(row).toContainText("Inactiva");
  await row.getByRole("button", { name: `Activar ${email}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Activar" }).click();
  await expect(row).toContainText("Activa");

  // Nunca uso la cuenta: se puede eliminar.
  await row.getByRole("button", { name: `Eliminar ${email}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByTestId(`user-row-${email}`)).toHaveCount(0);
  expectClean(errors);
});

test("una cuenta con actividad no se elimina y el propio administrador esta protegido", async ({ page, request }) => {
  const errors = watchErrors(page);
  const email = uniqueEmail("activa");
  const admin = await apiToken(request);
  const created = await request.post("/api/users", {
    headers: auth(admin),
    data: { email, name: "Con Actividad", role: "evaluador_tecnico", password: STRONG },
  });
  expect(created.ok()).toBeTruthy();
  const login = await request.post("/api/auth/login", { data: { email, password: STRONG } });
  expect(login.ok()).toBeTruthy();

  await loginAs(page, "superadmin", "/usuarios");
  await settle(page);
  await page.locator("#users-search").fill(email);
  const row = page.getByTestId(`user-row-${email}`);
  await expect(row.getByRole("button", { name: `Eliminar ${email}` })).toBeDisabled();

  await page.locator("#users-search").fill("admin@iets.org.co");
  const mine = page.getByTestId("user-row-admin@iets.org.co");
  await expect(mine).toContainText("(usted)");
  await expect(mine.getByRole("button", { name: "Desactivar admin@iets.org.co" })).toBeDisabled();
  await expect(mine.getByRole("button", { name: "Eliminar admin@iets.org.co" })).toBeDisabled();
  expectClean(errors);
});

test("la matriz de permisos es legible y los indicadores filtran", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "superadmin", "/usuarios");
  await settle(page);
  await page.getByRole("button", { name: "Ver matriz" }).click();
  const matrix = page.locator(".perm-matrix");
  await expect(matrix).toContainText("Calificar P1, P5, P6");
  await expect(matrix).toContainText("Gestionar usuarios");
  await expect(matrix.locator("thead th")).toHaveCount(6);

  await page.getByTitle("Filtrar: Activas", { exact: true }).click();
  await expect(page.locator("#users-state")).toHaveValue("active");
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.locator("#users-state")).toHaveValue("");
  expectClean(errors);
});

test("cambio voluntario de contrasena desde el menu del usuario", async ({ page, request }) => {
  const errors = watchErrors(page);
  const email = uniqueEmail("menu");
  const admin = await apiToken(request);
  await request.post("/api/users", {
    headers: auth(admin),
    data: { email, name: "Menu E2E", role: "tomador_decisiones", password: STRONG },
  });
  // Completa el cambio obligatorio por API para llegar a una cuenta normal.
  const first = await (await request.post("/api/auth/login", { data: { email, password: STRONG } })).json();
  await request.post("/api/auth/change-password", {
    headers: auth(first.access_token),
    data: { current_password: STRONG, new_password: "Segunda2026clave" },
  });

  await page.goto("/login");
  await loginUi(page, email, "Segunda2026clave");
  await expect(page.locator(".user-meta")).toContainText("Tomador de decisiones");
  await page.getByRole("button", { name: /Menú de/ }).click();
  await page.getByRole("menuitem", { name: "Cambiar contraseña" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#pwd-current").fill("Segunda2026clave");
  await dialog.locator("#pwd-new").fill("Tercera2026clave");
  await dialog.locator("#pwd-confirm").fill("Tercera2026clave");
  await dialog.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await logoutUi(page);
  await loginUi(page, email, "Tercera2026clave");
  await expect(page.getByRole("heading", { name: "Bandeja de trabajo" }).first()).toBeVisible();
  expectClean(errors);
});
