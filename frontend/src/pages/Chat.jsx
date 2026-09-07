import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Markdown from "../components/Markdown";
import { Spinner } from "../components/Spinner";
import EmptyState from "../components/EmptyState";

const SUGGESTIONS = [
  "Que tecnologias emergentes de oncologia se han detectado?",
  "Resume los referentes internacionales de horizon scanning disponibles.",
  "Que dispositivos medicos deberia priorizar el IETS?",
  "Como se define el escaneo de horizonte y sus fases en el IETS?",
];

export default function Chat() {
  const { status } = useAuth();
  const toast = useToast();

  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/sessions");
      setSessions(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las conversaciones"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const openSession = async (id) => {
    try {
      const { data } = await api.get(`/chat/sessions/${id}`);
      setActiveId(id);
      setMessages(data.messages);
    } catch (e) {
      toast.error(apiError(e, "No se pudo abrir la conversacion"));
    }
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
  };

  const deleteSession = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/chat/sessions/${id}`);
      if (activeId === id) newChat();
      loadSessions();
    } catch (err) {
      toast.error(apiError(err, "No se pudo eliminar"));
    }
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: message }]);
    setSending(true);
    try {
      const { data } = await api.post("/chat/send", { session_id: activeId, message });
      setActiveId(data.session.id);
      setMessages((m) => [...m, data.answer]);
      loadSessions();
    } catch (e) {
      toast.error(apiError(e, "No se pudo enviar el mensaje"));
      setMessages((m) => m.filter((x) => !String(x.id).startsWith("tmp-")));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, height: "calc(100vh - 112px)" }} className="chat-grid">
      {/* Sesiones */}
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }} className="chat-sessions">
        <div style={{ padding: 14, borderBottom: "1px solid #E2E8F0" }}>
          <Button onClick={newChat} style={{ width: "100%" }}>+ Nueva conversacion</Button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {sessions.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: "#94A3B8", textAlign: "center" }}>
              Sin conversaciones aun.
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => openSession(s.id)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                cursor: "pointer",
                marginBottom: 4,
                background: activeId === s.id ? "#EEF2FF" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
              onMouseEnter={(e) => { if (activeId !== s.id) e.currentTarget.style.background = "#F1F5F9"; }}
              onMouseLeave={(e) => { if (activeId !== s.id) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 13, color: activeId === s.id ? "#4F46E5" : "#334155", fontWeight: activeId === s.id ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                💬 {s.title}
              </span>
              <button onClick={(e) => deleteSession(s.id, e)} style={{ border: "none", background: "none", color: "#CBD5E1", fontSize: 15 }} aria-label="Eliminar">×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Conversacion */}
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#6366F1,#3B82F6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>🤖</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Asistente de Escaneo de Horizonte</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>
              {status?.ai_enabled || status?.gemini_enabled
                ? `${status.ai_provider === "gemini" ? "Gemini" : "MiniMax"} · ${status.ai_model || status.gemini_model || "modelo automatico"}`
                : "Modo sin IA (configure MiniMax en Configuracion)"}
            </div>
          </div>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {messages.length === 0 ? (
            <div style={{ maxWidth: 560, margin: "0 auto", paddingTop: 20 }}>
              <EmptyState
                icon="💬"
                title="Converse con la base de conocimiento"
                message="Pregunte sobre las fuentes, hallazgos y tecnologias emergentes registradas en el sistema."
              />
              <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{ textAlign: "left", padding: "12px 14px", border: "1px solid #E2E8F0", borderRadius: 10, background: "#F8FAFC", fontSize: 14, color: "#334155", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#EEF2FF")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820, margin: "0 auto" }}>
              {messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
              {sending && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#64748B", fontSize: 14 }}>
                  <Spinner size={18} /> Analizando la informacion disponible...
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: 16, borderTop: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", gap: 10, maxWidth: 820, margin: "0 auto" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Escriba su pregunta... (Enter para enviar)"
              rows={1}
              style={{
                flex: 1,
                padding: "12px 14px",
                border: "2px solid #E2E8F0",
                borderRadius: 10,
                fontSize: 14,
                resize: "none",
                outline: "none",
                maxHeight: 120,
              }}
              onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
              onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
            />
            <Button onClick={() => send()} loading={sending} disabled={!input.trim()}>
              Enviar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "82%",
          padding: "12px 16px",
          borderRadius: 14,
          background: isUser ? "linear-gradient(135deg,#6366F1,#3B82F6)" : "#F1F5F9",
          color: isUser ? "#fff" : "#0F172A",
          fontSize: 14,
        }}
      >
        {isUser ? (
          message.content
        ) : (
          <>
            <Markdown>{message.content}</Markdown>
            {message.sources_used && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #E2E8F0", fontSize: 11, color: "#64748B" }}>
                📎 Fuentes: {message.sources_used}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
