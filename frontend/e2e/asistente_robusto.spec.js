// Asistente: buscar conversaciones, renombrar, volver a responder, descargar, enlace directo y reintento tras un fallo.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, expectToast } from "./crud_helpers";

test("asistente: busca, renombra, vuelve a responder, descarga y abre por enlace", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const status = await (await page.request.get("/api/status")).json();
  test.skip(status.ai_enabled, "Este caso usa el modo sin IA para que la respuesta sea inmediata.");
  const api = await apiAs(page.request, "evaluador_clinico");
  const tag = uid("asistente");
  const first = await api.post("/chat/send", { message: `Qué fuentes de oncología hay ${tag}` });
  await api.post("/chat/send", { message: `Otra consulta distinta ${uid("x")}` });

  // Enlace directo a una conversación.
  await loginAs(page, "evaluador_clinico", `/chat?c=${first.session.id}`);
  await settle(page);
  await expect(page.getByText(`Qué fuentes de oncología hay ${tag}`, { exact: true }).first()).toBeVisible();
  const item = page.getByTestId(`chat-session-${first.session.id}`);
  await expect(item).toContainText("2 mensaje(s)");

  // Búsqueda dentro de las conversaciones.
  await page.getByTestId("chat-search").fill(tag);
  await expect(page.locator('[data-testid^="chat-session-"]')).toHaveCount(1);

  // Renombrar.
  const title = `Oncología ${tag}`;
  await item.getByRole("button", { name: /Cambiar el título de/ }).click();
  await page.locator("#chat-title").fill(title);
  await page.getByTestId("chat-rename-save").click();
  await expectToast(page, "Título actualizado.");
  await expect(item).toContainText(title);

  // Volver a responder reemplaza la respuesta: siguen siendo dos mensajes.
  await page.getByTestId("chat-regenerate").click();
  await expect(page.getByTestId("chat-regenerate")).toBeVisible({ timeout: 20_000 });
  const detail = await api.get(`/chat/sessions/${first.session.id}`);
  expect(detail.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

  // Descargar la conversación.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("chat-export").click()]);
  expect(download.suggestedFilename()).toBe(`conversacion-${first.session.id}.md`);

  if (process.env.SHOTS_OUT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/asistente_full.png` });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await api.del(`/chat/sessions/${first.session.id}`, 204);
  expectClean(errors);
});

test("asistente: si la respuesta falla, la pregunta queda y se puede reintentar", async ({ page }) => {
  test.setTimeout(120_000);
  const status = await (await page.request.get("/api/status")).json();
  test.skip(status.ai_enabled, "Este caso usa el modo sin IA para que la respuesta sea inmediata.");
  const api = await apiAs(page.request, "evaluador_clinico");
  const question = `Pregunta que falla ${uid("f")}`;

  // El primer envío falla después de guardar la pregunta (como cuando el proveedor de IA se cae).
  let failNext = true;
  await page.route("**/api/chat/send", async (route) => {
    if (!failNext) return route.continue();
    failNext = false;
    const res = await route.fetch();
    const body = await res.json();
    // Deja la conversación como si no hubiera alcanzado a responder.
    await api.post(`/chat/sessions/${body.session.id}/retry`).catch(() => {});
    const detail = await api.get(`/chat/sessions/${body.session.id}`);
    expect(detail.messages.length).toBe(2);
    await route.fulfill({ status: 502, json: { detail: "El asistente no pudo responder. Su pregunta quedó guardada: pulse Reintentar." } });
  });

  await loginAs(page, "evaluador_clinico", "/chat");
  await settle(page);
  await page.getByLabel("Pregunta para el asistente").fill(question);
  await page.getByLabel("Pregunta para el asistente").press("Enter");
  await expect(page.getByTestId("chat-failed")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(question, { exact: true }).first()).toBeVisible();

  await page.getByTestId("chat-retry").click();
  await expect(page.getByTestId("chat-failed")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("chat-copy")).toBeVisible();

  const mine = (await api.get("/chat/sessions")).find((s) => s.title === question.slice(0, 80));
  await api.del(`/chat/sessions/${mine.id}`, 204);
});
