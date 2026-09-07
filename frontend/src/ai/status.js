/** Estado unificado de IA (MiniMax o Gemini). */

export function aiEnabled(status) {
  return Boolean(status?.ai_enabled ?? status?.gemini_enabled);
}

export function aiModel(status) {
  return status?.ai_model || status?.gemini_model || "";
}

export function aiProvider(status) {
  return status?.ai_provider || (status?.gemini_enabled ? "gemini" : "");
}

export function aiLabel(status) {
  if (!aiEnabled(status)) return "IA sin configurar";
  const provider = aiProvider(status);
  const model = aiModel(status);
  const name = provider === "minimax" ? "MiniMax" : provider === "gemini" ? "Gemini" : "IA";
  return model ? `${name} · ${model}` : name;
}
