import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { AI_TIMEOUT, apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Icon from "../components/Icon";
import Markdown from "../components/Markdown";
import { Spinner } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import InfoTip from "../components/InfoTip";
import { Input } from "../components/Field";
import { GLOSSARY } from "../constants/glossary";
import { downloadFromApi } from "../utils/download";
import { fmtTime, t } from "../i18n";
import "./chat.css";

const SUGGESTIONS = [
  t("¿Qué tecnologías emergentes de oncología se han detectado?"),
  t("Resume los referentes internacionales de horizon scanning disponibles."),
  t("¿Qué dispositivos médicos debería priorizar el IETS?"),
  t("¿Cómo se define el escaneo de horizonte y sus fases en el IETS?"),
];
const MESSAGE_MAX = 4000;
const TITLE_MAX = 120;

// El servidor puede enviar la fecha sin zona (UTC): se lee igual que `fmtDateTime`.
function toDate(value) {
  const naive = typeof value === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value);
  return new Date(naive ? `${value.replace(" ", "T")}Z` : value);
}

function dayGroup(value) {
  const d = toDate(value);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days <= 7) return "semana";
  return "antes";
}
const GROUP_LABEL = { hoy: t("Hoy"), ayer: t("Ayer"), semana: t("Últimos 7 días"), antes: t("Anteriores") };

export default function Chat() {
  const { status } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const aiOn = Boolean(status?.ai_enabled || status?.gemini_enabled);

  useEffect(() => {
    const id = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const loadSessions = useCallback(async () => {
    try {
      const { data } = await api.get("/chat/sessions", { params: query ? { q: query } : {} });
      setSessions(data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron cargar las conversaciones")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // El cuadro de texto crece con lo escrito, hasta su alto máximo.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const setUrl = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set("c", String(id));
    else next.delete("c");
    setParams(next, { replace: true });
  };

  const openSession = async (id, { quiet = false } = {}) => {
    try {
      const { data } = await api.get(`/chat/sessions/${id}`);
      setActiveId(id);
      setMessages(data.messages);
      // Si la última pregunta quedó sin respuesta, se ofrece reintentar.
      setFailed(data.messages.length > 0 && data.messages[data.messages.length - 1].role === "user");
      setUrl(id);
    } catch (e) {
      if (!quiet) toast.error(apiError(e, t("No se pudo abrir la conversación")));
      setUrl(null);
    }
  };

  // Enlace directo: /chat?c=12 abre esa conversación.
  useEffect(() => {
    const id = Number(params.get("c"));
    if (id && id !== activeId) openSession(id, { quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setFailed(false);
    setUrl(null);
    inputRef.current?.focus();
  };

  const deleteSession = async () => {
    const id = confirmDel?.id;
    setDeleting(true);
    try {
      await api.delete(`/chat/sessions/${id}`);
      if (activeId === id) newChat();
      toast.success(t("Conversación eliminada"));
      setConfirmDel(null);
      loadSessions();
    } catch (err) {
      toast.error(apiError(err, t("No se pudo eliminar la conversación")));
    } finally {
      setDeleting(false);
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    try {
      const { data } = await api.delete("/chat/sessions");
      toast.success(t("{n} conversación(es) eliminadas.", { n: data.deleted }));
      setConfirmAll(false);
      newChat();
      loadSessions();
    } catch (err) {
      toast.error(apiError(err, t("No se pudieron eliminar las conversaciones")));
    } finally {
      setDeleting(false);
    }
  };

  const startRename = (s) => {
    setNewTitle(s.title || "");
    setRenaming(s);
  };

  const saveRename = async () => {
    setBusy("rename");
    try {
      await api.put(`/chat/sessions/${renaming.id}`, { title: newTitle });
      toast.success(t("Título actualizado."));
      setRenaming(null);
      loadSessions();
    } catch (err) {
      toast.error(apiError(err, t("No se pudo cambiar el título")));
    } finally {
      setBusy("");
    }
  };

  const exportSession = async () => {
    setBusy("export");
    try {
      await downloadFromApi(api, `/chat/sessions/${activeId}/export`, `conversacion-${activeId}.md`);
    } catch (err) {
      toast.error(apiError(err, t("No se pudo descargar la conversación")));
    } finally {
      setBusy("");
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("Respuesta copiada."));
    } catch {
      toast.error(t("No se pudo copiar. Seleccione el texto y cópielo a mano."));
    }
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending || message.length > MESSAGE_MAX) return;
    setInput("");
    setFailed(false);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: message }]);
    setSending(true);
    try {
      const { data } = await api.post("/chat/send", { session_id: activeId, message }, { timeout: AI_TIMEOUT });
      setActiveId(data.session.id);
      setUrl(data.session.id);
      setMessages((m) => [...m, data.answer]);
      loadSessions();
    } catch (e) {
      // La pregunta no se pierde: queda en pantalla con la opción de reintentar.
      toast.error(apiError(e, t("No se pudo enviar el mensaje")));
      setFailed(true);
      try {
        const { data } = await api.get("/chat/sessions");
        setSessions(data);
        const mine = activeId ? data.find((s) => s.id === activeId) : data.find((s) => s.title === message.slice(0, 80));
        if (mine && !activeId) {
          setActiveId(mine.id);
          setUrl(mine.id);
        }
        if (!mine) {
          // Ni siquiera se guardó: se devuelve el texto al cuadro para no reescribirlo.
          setMessages((m) => m.filter((x) => !String(x.id).startsWith("tmp-")));
          setInput(message);
          setFailed(false);
        }
      } catch {
        setMessages((m) => m.filter((x) => !String(x.id).startsWith("tmp-")));
        setInput(message);
        setFailed(false);
      }
    } finally {
      setSending(false);
    }
  };

  const retry = async () => {
    if (!activeId || sending) return;
    setSending(true);
    setFailed(false);
    // Reintentar reemplaza la última respuesta, si la había.
    setMessages((m) => {
      const lastUser = m.map((x) => x.role).lastIndexOf("user");
      return lastUser >= 0 ? m.slice(0, lastUser + 1) : m;
    });
    try {
      const { data } = await api.post(`/chat/sessions/${activeId}/retry`, null, { timeout: AI_TIMEOUT });
      setMessages((m) => [...m, data.answer]);
      loadSessions();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo responder")));
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  const active = sessions.find((s) => s.id === activeId);
  const groups = useMemo(() => {
    const out = [];
    sessions.forEach((s) => {
      const key = dayGroup(s.updated_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(s);
      else out.push({ key, items: [s] });
    });
    return out;
  }, [sessions]);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const tooLong = input.trim().length > MESSAGE_MAX;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, height: "calc(100vh - 112px)" }} className="chat-grid">
      {/* Sesiones */}
      <div className="chat-sessions ch-panel">
        <div className="ch-panel-head">
          <Button onClick={newChat} style={{ width: "100%" }}>
            <Icon name="plus" size={16} /> {t("Nueva conversación")}
          </Button>
          <input
            className="filter-input"
            placeholder={t("Buscar en mis conversaciones...")}
            aria-label={t("Buscar en mis conversaciones")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="chat-search"
          />
        </div>
        <div className="ch-list">
          {sessions.length === 0 && (
            <div className="ch-empty">{query ? t("Ninguna conversación coincide.") : t("Sin conversaciones aún.")}</div>
          )}
          {groups.map((group) => (
            <div key={group.key}>
              <div className="ch-group">{GROUP_LABEL[group.key]}</div>
              {group.items.map((s) => (
                <div key={s.id} data-testid={`chat-session-${s.id}`} className={`ch-session${activeId === s.id ? " is-active" : ""}`}>
                  <button type="button" className="ch-session-open" onClick={() => openSession(s.id)} title={s.title}>
                    <span className="ch-session-title">💬 {s.title}</span>
                    <span className="ch-session-meta">
                      {t("{n} mensaje(s)", { n: s.message_count ?? 0 })}
                      {s.preview ? ` · ${s.preview}` : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ch-icon"
                    onClick={() => startRename(s)}
                    aria-label={t("Cambiar el título de {title}", { title: s.title })}
                    title={t("Cambiar el título")}
                  >
                    <Icon name="edit" size={13} />
                  </button>
                  <button
                    type="button"
                    className="ch-icon"
                    onClick={() => setConfirmDel(s)}
                    aria-label={t("Eliminar conversación {title}", { title: s.title })}
                    title={t("Eliminar conversación")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        {sessions.length > 1 && !query && (
          <div className="ch-panel-foot">
            <button type="button" className="ch-link is-danger" onClick={() => setConfirmAll(true)} data-testid="chat-delete-all">
              {t("Eliminar todas mis conversaciones")}
            </button>
          </div>
        )}
      </div>

      {/* Conversacion */}
      <div className="ch-panel">
        <div className="ch-head">
          <div className="ch-avatar">
            <Icon name="spark" size={18} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="ch-head-title">
              {active ? active.title : t("Asistente de Escaneo de Horizonte")} <InfoTip text={GLOSSARY.fb_chat} label={t("Cómo responde el asistente")} />
            </div>
            <div className="ch-head-sub">
              {status?.ai_enabled || status?.gemini_enabled
                ? `${status.ai_provider === "gemini" ? "Gemini" : "MiniMax"} · ${status.ai_model || status.gemini_model || t("modelo automático")}`
                : t("Modo sin IA: muestra lo encontrado en el sistema sin redactar (un superadministrador puede activar la IA en Configuración)")}
            </div>
          </div>
          {activeId && messages.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportSession} loading={busy === "export"} data-testid="chat-export">
              {t("Descargar")}
            </Button>
          )}
        </div>

        <div ref={scrollRef} className="ch-body">
          {messages.length === 0 ? (
            <div style={{ maxWidth: 560, margin: "0 auto", paddingTop: 20 }}>
              <EmptyState
                icon="💬"
                title={t("Converse con la base de conocimiento")}
                message={t("Pregunte sobre las fuentes, señales y tecnologías emergentes registradas en el sistema.")}
              />
              {!aiOn && (
                <p className="fb-public-note" data-testid="chat-degraded">
                  {t("La IA no está configurada: el asistente responderá mostrando la información relevante que encuentre en el sistema, sin redactar.")}
                </p>
              )}
              <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="ch-suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="ch-thread">
              {messages.map((m) => (
                <Bubble
                  key={m.id}
                  message={m}
                  onCopy={copyText}
                  onRetry={!sending && lastAssistant && m.id === lastAssistant.id ? retry : null}
                />
              ))}
              {sending && (
                <div className="ch-waiting">
                  <Spinner size={18} /> {t("Analizando la información disponible...")}
                </div>
              )}
              {failed && !sending && (
                <div className="fa-notice fa-notice--warn" role="alert" data-testid="chat-failed">
                  <div style={{ flex: 1 }}>
                    <strong>{t("La última pregunta quedó sin respuesta.")}</strong>
                    <div style={{ marginTop: 4 }}>{t("Su pregunta está guardada. Puede volver a pedir la respuesta sin escribirla de nuevo.")}</div>
                  </div>
                  <Button size="sm" onClick={retry} data-testid="chat-retry">
                    {t("Reintentar")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="ch-compose">
          <div className="ch-compose-row">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={t("Escriba su pregunta... (Enter para enviar, Shift+Enter nueva línea)")}
              aria-label={t("Pregunta para el asistente")}
              aria-invalid={tooLong || undefined}
              rows={1}
              className={`ch-input${tooLong ? " is-bad" : ""}`}
            />
            <Button onClick={() => send()} loading={sending} disabled={!input.trim() || tooLong}>
              {t("Enviar")}
            </Button>
          </div>
          <div className="ch-compose-foot">
            <span>{t("Es un apoyo: verifique cada dato en la fuente antes de usarlo.")}</span>
            {input.length > MESSAGE_MAX * 0.8 && (
              <span className={tooLong ? "is-bad" : ""} data-testid="chat-counter">
                {input.trim().length}/{MESSAGE_MAX}
              </span>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title={t("Cambiar el título de la conversación")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              {t("Cancelar")}
            </Button>
            <Button
              onClick={saveRename}
              loading={busy === "rename"}
              disabled={!newTitle.trim() || newTitle.trim().length > TITLE_MAX}
              data-testid="chat-rename-save"
            >
              {t("Guardar")}
            </Button>
          </>
        }
      >
        <Input
          id="chat-title"
          label={t("Título")}
          required
          maxLength={TITLE_MAX}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTitle.trim()) saveRename();
          }}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={deleteSession}
        loading={deleting}
        title={t("Eliminar conversación")}
        message={t('Se eliminará "{title}" con todos sus mensajes. Esta acción no se puede deshacer.', { title: confirmDel?.title || "" })}
        confirmLabel={t("Eliminar")}
      />
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={deleteAll}
        loading={deleting}
        title={t("Eliminar todas mis conversaciones")}
        message={t("Se eliminarán sus {n} conversaciones con el asistente y todos sus mensajes. Las conversaciones del grafo del tablero se conservan. Esta acción no se puede deshacer.", { n: sessions.length })}
        confirmLabel={t("Eliminar todas")}
      />
    </div>
  );
}

function Bubble({ message, onCopy, onRetry }) {
  const isUser = message.role === "user";
  return (
    <div className={`ch-row${isUser ? " is-user" : ""}`}>
      <div className={`ch-bubble${isUser ? " is-user" : ""}`}>
        {isUser ? (
          message.content
        ) : (
          <>
            <Markdown>{message.content}</Markdown>
            {message.sources_used && (
              <div className="ch-sources" title={t("Registros del sistema que se usaron como contexto para esta respuesta")}>
                📎 {t("Fuentes: {list}", { list: message.sources_used })}
              </div>
            )}
            <div className="ch-bubble-foot">
              {message.created_at && <span>{fmtTime(message.created_at, { hour: "2-digit", minute: "2-digit" })}</span>}
              <button type="button" className="ch-link" onClick={() => onCopy(message.content)} data-testid="chat-copy">
                {t("Copiar")}
              </button>
              {onRetry && (
                <button type="button" className="ch-link" onClick={onRetry} data-testid="chat-regenerate">
                  {t("Volver a responder")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
