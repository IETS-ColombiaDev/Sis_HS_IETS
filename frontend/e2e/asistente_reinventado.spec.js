// Asistente: adjuntar contexto, acción rápida, referencias, valorar, guardar en la memoria y pasar a nota.
import { test, expect } from "@playwright/test";
import { loginAs, watchErrors, expectClean, settle, uid } from "./helpers";
import { apiAs, expectToast } from "./crud_helpers";

test("asistente: responde con lo adjunto, aprende de lo útil y lo pasa a una nota", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  const status = await (await page.request.get("/api/status")).json();
  test.skip(status.ai_enabled, "Este caso usa el modo sin IA para que la respuesta sea inmediata y predecible.");
  const api = await apiAs(page.request, "evaluador_tecnico");
  const tag = uid("ctx");
  const fact = `Zolgensma${tag.replace(/[^a-z0-9]/gi, "")}`;
  const note = await api.post("/notes", { entity_type: "general", title: `Nota ${tag}`, content: `El comité pidió revisar el comparador de ${fact} antes de marzo.` });

  await loginAs(page, "evaluador_tecnico", "/chat");
  await settle(page);

  // Adjuntar una nota como contexto.
  await page.getByTestId("chat-attach").click();
  await page.locator("#chat-picker-search").fill(tag);
  await page.getByTestId("chat-picker-type-note").click();
  await page.getByTestId(`chat-picker-add-note-${note.id}`).click();
  await expect(page.getByTestId("chat-picker-count")).toContainText("1 de 12");
  await page.getByTestId("chat-picker-done").click();
  await expect(page.getByTestId("chat-context")).toContainText(`Nota ${tag}`);

  // Acción rápida: la respuesta se arma con lo adjunto y lo cita.
  await page.getByTestId("chat-quick-resumir").click();
  const refs = page.getByTestId("chat-refs").first();
  await expect(refs).toContainText("Adjuntos por usted", { timeout: 20_000 });
  await expect(refs).toContainText(`Nota ${tag}`);
  await expect(page.locator(".ch-bubble:not(.is-user)").first()).toContainText(fact);

  // Valorar y guardar en la memoria, con el texto revisado.
  await page.getByTestId("chat-useful").click();
  await expect(page.getByTestId("chat-useful")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("chat-remember").click();
  await page.locator("#chat-remember-title").fill(`Comparador ${fact}`);
  await page.locator("#chat-remember-content").fill(`Para ${fact} el comité exige revisar el comparador antes de priorizar.`);
  await page.getByTestId("chat-remember-save").click();
  await expectToast(page, "Guardado en la memoria");
  await expect(page.getByTestId("chat-remembered")).toBeVisible();

  // Pasar la respuesta a una nota.
  await page.getByTestId("chat-to-note").click();
  await page.locator("#chat-note-title").fill(`Nota del asistente ${tag}`);
  await page.getByTestId("chat-note-save").click();
  await expectToast(page, "Nota creada");
  const notes = await api.get(`/notes?q=${encodeURIComponent(`Nota del asistente ${tag}`)}`);
  expect(notes.length).toBe(1);

  // La memoria muestra la entrada.
  await page.getByTestId("chat-tab-memoria").click();
  await page.getByTestId("chat-memory-search").fill(fact);
  await expect(page.getByTestId("chat-memory")).toContainText(`Comparador ${fact}`);
  await expect(page.getByTestId("chat-memory")).toContainText("Respuesta útil");

  if (process.env.SHOTS_OUT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.SHOTS_OUT}/asistente_nuevo.png` });
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  // Otra conversación, sin adjuntos: la memoria alimenta la respuesta.
  await page.getByRole("button", { name: "Nueva conversación" }).click();
  await page.getByLabel("Pregunta para el asistente").fill(`Qué exige el comité para ${fact} sobre el comparador`);
  await page.getByLabel("Pregunta para el asistente").press("Enter");
  const second = page.getByTestId("chat-refs").first();
  await expect(second).toContainText("Memoria del equipo", { timeout: 20_000 });
  await expect(second).toContainText(`Comparador ${fact}`);

  // Limpieza.
  const memory = await api.get(`/chat/memory?q=${encodeURIComponent(fact)}`);
  for (const entry of memory.items) await api.del(`/chat/memory/${entry.id}`, 204);
  for (const n of [note, ...notes]) await api.del(`/notes/${n.id}`, 204);
  for (const s of await api.get("/chat/sessions")) await api.del(`/chat/sessions/${s.id}`, 204);
  expectClean(errors);
});

test("asistente: un enlace con adjuntos abre la conversación con ese contexto", async ({ page }) => {
  const api = await apiAs(page.request, "evaluador_tecnico");
  const title = `Nota enlace ${uid("e")}`;
  const note = await api.post("/notes", { entity_type: "general", title, content: "Contenido para adjuntar desde un enlace." });
  await loginAs(page, "evaluador_tecnico", `/chat?adjuntar=note:${note.id}`);
  await settle(page);
  await expect(page.getByTestId("chat-context")).toContainText(title);
  await expect(page.getByTestId("chat-quick-resumir")).toBeVisible();
  await api.del(`/notes/${note.id}`, 204);
});
