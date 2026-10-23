import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { AI_TIMEOUT } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { aiEnabled } from "../ai/status";
import { HOWTO, NAV, SUGGESTED, fold, matchHowto, screenLabel } from "../constants/navigation";
import Icon from "./Icon";
import Markdown from "./Markdown";
import "./nav-assistant.css";

const STORE_KEY = "iets_hs_nav_assistant";
// Pantallas con una caja de escritura fija abajo: el boton sube para no taparla.
const RAISED = new Set(["/chat"]);
const DEFAULT_SUGGESTED = ["¿Qué tengo pendiente?", "¿Cómo clasifico una señal?", "¿Cómo califico P1 a P6?"];

function loadHistory() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.slice(-30) : [];
  } catch {
    return [];
  }
}

/** "1. a 2. b" en una sola linea se muestra como lista numerada. */
function asSteps(text) {
  const t = String(text || "");
  if (!/(^|\s)1\.\s/.test(t) || t.includes("\n")) return t;
  return t.replace(/\s+(\d+)\.\s/g, "\n$1. ").trim();
}

/** Mapa compacto para la IA: solo lo que existe, con lo que el perfil puede hacer. */
function siteMap(can) {
  const screens = NAV.filter((n) => n.to && (!n.permission || can(n.permission)))
    .map((n) => `- ${n.label.replace(/^\d+\.\s*/, "")} (${n.to}): ${n.help || ""}`)
    .join("\n");
  const tasks = HOWTO.map((h) => {
    const allowed = !h.perm || can(h.perm);
    return `* ${h.title}${h.to ? ` [${h.to}]` : ""}${allowed ? "" : " (SU PERFIL NO TIENE PERMISO)"}: ${h.steps.join(" ")}`;
  }).join("\n");
  return `PANTALLAS\n${screens}\n\nTAREAS\n${tasks}\n\nCABECERA: «Guía» (guía rápida), selector de ciclo, menú del usuario (cambiar contraseña, cerrar sesión).`;
}

/**
 * Asistente de navegacion: responde "donde/como hago X" con pasos y un boton
 * para ir. Usa la IA si esta activa; si no (o si falla), un buscador local
 * sobre la misma base de conocimiento, asi que siempre responde.
 */
export default function NavAssistant({ onOpenGuide }) {
  const { user, can, status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadHistory);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const withAi = aiEnabled(status);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* almacenamiento no disponible: la conversacion vive en memoria */
    }
  }, [messages]);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open, messages.length]);

  // Ctrl+K (o Cmd+K) abre el asistente desde cualquier pantalla; Esc lo cierra.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const screen = screenLabel(location.pathname) || "el sistema";
  const suggestions = SUGGESTED[location.pathname] || DEFAULT_SUGGESTED;

  // Mientras escribe: pantallas que coinciden, para saltar sin preguntar.
  const jump = useMemo(() => {
    const q = fold(text);
    if (q.length < 2) return [];
    return NAV.filter((n) => n.to && (!n.permission || can(n.permission)) && fold(n.label).includes(q)).slice(0, 4);
  }, [text, can]);

  const go = (to) => {
    navigate(to);
    if (window.innerWidth < 640) setOpen(false);
  };

  const localAnswer = (question) => {
    const found = matchHowto(question);
    if (!found.length) {
      return {
        role: "assistant",
        kind: "none",
        content:
          "No encontré esa opción. Pruebe con otras palabras (por ejemplo «clasificar», «ciclo», «PDF») o abra la Guía para ver el recorrido completo.",
      };
    }
    const [best, ...rest] = found;
    return {
      role: "assistant",
      kind: "howto",
      howto: best.id,
      also: rest.map((r) => r.id),
    };
  };

  const ask = async (raw) => {
    const question = (raw ?? text).trim();
    if (!question || busy) return;
    setText("");
    const history = messages.filter((m) => m.content).slice(-4).map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    const fallback = localAnswer(question);
    if (!withAi) {
      setMessages((prev) => [...prev, fallback]);
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(
        "/chat/navigate",
        { question, path: location.pathname, context: siteMap(can), history },
        { timeout: AI_TIMEOUT }
      );
      if (data.ai_used && data.answer) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", kind: "ai", content: data.answer, routes: data.routes || [], also: fallback.howto ? [fallback.howto] : [] },
        ]);
      } else {
        setMessages((prev) => [...prev, fallback]);
      }
    } catch {
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setBusy(false);
    }
  };

  const renderHowto = (id, compact = false) => {
    const h = HOWTO.find((x) => x.id === id);
    if (!h) return null;
    const allowed = !h.perm || can(h.perm);
    if (compact) {
      return (
        <button key={id} type="button" className="na-chip" onClick={() => ask(h.title)}>
          {h.title}
        </button>
      );
    }
    return (
      <div className="na-howto">
        <strong>{h.title}</strong>
        <ol>
          {h.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {!allowed && (
          <p className="na-warn">
            <Icon name="alert" size={13} /> Su perfil no tiene este permiso: pídaselo a un superadministrador.
          </p>
        )}
        <div className="na-actions">
          {h.to && (
            <button type="button" className="na-go" onClick={() => go(h.to)} data-testid={`nav-assistant-go-${h.id}`}>
              Ir a {screenLabel(h.to)} →
            </button>
          )}
          {h.id === "guia" && onOpenGuide && (
            <button type="button" className="na-go" onClick={onOpenGuide}>
              Abrir la guía →
            </button>
          )}
        </div>
      </div>
    );
  };

  if (!user) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          className={`na-fab${RAISED.has(location.pathname) ? " is-raised" : ""}`}
          onClick={() => setOpen(true)}
          aria-label="Abrir asistente de navegación"
          title="¿Cómo llego a…? (Ctrl+K)"
          data-testid="nav-assistant-open"
        >
          <Icon name="compass" size={20} />
          <span className="na-fab-label">¿Cómo llego a…?</span>
        </button>
      )}
      {open && (
        <section className="na-panel" role="dialog" aria-label="Asistente de navegación" data-testid="nav-assistant">
          <header className="na-head">
            <div className="na-avatar">
              <Icon name="compass" size={18} />
            </div>
            <div className="na-head-text">
              <strong>Asistente de navegación</strong>
              <span>{withAi ? "Con IA · le indica dónde está cada cosa" : "Le indica dónde está cada cosa"}</span>
            </div>
            {messages.length > 0 && (
              <button type="button" className="na-icon-btn" onClick={() => setMessages([])} title="Nueva conversación" aria-label="Nueva conversación">
                <Icon name="refresh" size={15} />
              </button>
            )}
            <button type="button" className="na-icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar asistente">
              <Icon name="x" size={16} />
            </button>
          </header>

          <div className="na-body" ref={listRef}>
            <div className="na-msg na-msg--bot">
              <p>
                Hola{user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Está en <strong>{screen}</strong>. Pregúnteme cómo hacer algo y le
                muestro los pasos y el botón para ir.
              </p>
              <div className="na-chips">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="na-chip" onClick={() => ask(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="na-msg na-msg--user">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="na-msg na-msg--bot" data-testid="nav-assistant-answer">
                  {m.kind === "ai" && (
                    <>
                      <Markdown>{asSteps(m.content)}</Markdown>
                      {m.routes?.length > 0 && (
                        <div className="na-actions">
                          {m.routes.map((r) => (
                            <button key={r} type="button" className="na-go" onClick={() => go(r)}>
                              Ir a {screenLabel(r)} →
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {m.kind === "howto" && renderHowto(m.howto)}
                  {m.kind === "none" && (
                    <>
                      <p>{m.content}</p>
                      {onOpenGuide && (
                        <div className="na-actions">
                          <button type="button" className="na-go" onClick={onOpenGuide}>
                            Abrir la guía →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {m.also?.length > 0 && (
                    <div className="na-also">
                      <span>También puede servirle:</span>
                      <div className="na-chips">{m.also.map((id) => renderHowto(id, true))}</div>
                    </div>
                  )}
                </div>
              )
            )}
            {busy && (
              <div className="na-msg na-msg--bot na-typing" aria-live="polite">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          {jump.length > 0 && (
            <div className="na-jump">
              <span>Ir directo:</span>
              {jump.map((n) => (
                <button key={n.to} type="button" className="na-chip" onClick={() => { setText(""); go(n.to); }}>
                  <Icon name={n.icon} size={13} /> {n.label.replace(/^\d+\.\s*/, "")}
                </button>
              ))}
            </div>
          )}

          <form
            className="na-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ej.: ¿cómo paso señales al ciclo?"
              aria-label="Pregunta para el asistente de navegación"
              maxLength={500}
            />
            <button type="submit" disabled={!text.trim() || busy} aria-label="Enviar pregunta">
              <Icon name="send" size={16} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
