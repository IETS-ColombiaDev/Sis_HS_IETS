// Asistente de chat por la interfaz: conversacion en modo degradado (sin IA),
// historial de sesiones y eliminacion con confirmacion.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, expectToast } from "./crud_helpers";

test("revisor por pares conversa sin IA, reabre y elimina la sesion", async ({ page }) => {
  const errors = watchErrors(page);
  await loginAs(page, "revisor_pares", "/chat");
  await settle(page);
  const status = await (await page.request.get("/api/status")).json();
  test.skip(status.ai_enabled, "Este caso verifica el modo sin IA; el servidor tiene IA configurada.");
  await expect(page.getByTestId("chat-degraded")).toBeVisible();

  const question = `Que fuentes de oncologia hay? ${uid("q")}`;
  await page.getByLabel("Pregunta para el asistente").fill(question);
  await page.getByLabel("Pregunta para el asistente").press("Enter");
  await expect(page.getByText("Modo sin IA").first()).toBeVisible({ timeout: 20_000 });

  // La sesion queda en el historial y se puede reabrir.
  const api = await apiAs(page.request, "revisor_pares");
  const sessions = await api.get("/chat/sessions");
  const session = sessions.find((s) => s.title === question.slice(0, 80));
  expect(session).toBeTruthy();
  await page.getByRole("button", { name: "+ Nueva conversación" }).click();
  await page.getByTestId(`chat-session-${session.id}`).getByRole("button").first().click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();

  // Eliminar con confirmacion.
  await page.getByRole("button", { name: `Eliminar conversación ${session.title}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
  await expectToast(page, "Conversación eliminada");
  await expect(page.getByTestId(`chat-session-${session.id}`)).toHaveCount(0);

  // Una conversacion ajena no se puede leer.
  const other = await apiAs(page.request, "tomador_decisiones");
  await other.get(`/chat/sessions/${session.id}`, 404);
  expectClean(errors);
});
