import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { AI_TIMEOUT, apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Icon from "../components/Icon";
import Markdown from "../components/Markdown";
import { Spinner } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import InfoTip from "../components/InfoTip";
import { Input, Select, Textarea } from "../components/Field";
import { GLOSSARY } from "../constants/glossary";
import { PERM } from "../constants/methodology";
import { downloadFromApi } from "../utils/download";
import { fmtDate, fmtTime, t, ts } from "../i18n";
import "./chat.css";

const SUGGESTIONS = [
  t("¿Qué tecnologías emergentes de oncología se han detectado?"),
  t("Resume los referentes internacionales de horizon scanning disponibles."),
  t("¿Qué dispositivos médicos debería priorizar el IETS?"),
  t("¿Cómo se define el escaneo de horizonte y sus fases en el IETS?"),
];
// Preguntas listas para cuando hay elementos adjuntos: se envían tal cual.
const QUICK_ACTIONS = [
  { key: "resumir", label: t("Resumir"), prompt: t("Resume los elementos adjuntos en cinco puntos, con lo más importante para decidir.") },
  { key: "comparar", label: t("Comparar"), prompt: t("Compara los elementos adjuntos: en qué coinciden, en qué se diferencian y cuál tiene mejor evidencia.") },
  { key: "riesgos", label: t("Riesgos y vacíos"), prompt: t("Con los elementos adjuntos, señala los riesgos y los vacíos de información que el equipo debería resolver.") },
  { key: "comite", label: t("Preguntas para el comité"), prompt: t("Propón las preguntas que el comité debería hacerse sobre los elementos adjuntos.") },
  { key: "nota", label: t("Redactar una nota"), prompt: t("Redacta una nota breve para el equipo con lo esencial de los elementos adjuntos y el siguiente paso sugerido.") },
];
const TYPE_FILTERS = [
  { key: "", label: t("Todo") },
  { key: "finding", label: t("Señales") },
  { key: "technology", label: t("Tecnologías") },
  { key: "source", label: t("Fuentes") },
  { key: "recommendation", label: t("Informes") },
  { key: "evaluation_doc", label: t("Expedientes") },
  { key: "note", label: t("Notas") },
  { key: "bulletin", label: t("Boletines") },
];
const NOTE_LINKABLE = ["finding", "source", "recommendation"];
const ORIGIN_LABEL = { elegido: t("Adjuntos por usted"), memoria: t("Memoria del equipo"), encontrado: t("Encontrados por el asistente") };
const MESSAGE_MAX = 4000;
const TITLE_MAX = 120;
const MAX_REFS = 12;

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
const refKey = (r) => `${r.type}:${r.id}`;

/** Elegir señales, tecnologías, fuentes, informes, expedientes, notas o boletines como contexto. */
function ContextPicker({ open, onClose, selected, onChange }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const id = window.setTimeout(() => {
      api
        .get("/chat/context/search", { params: { q: q.trim() || undefined, types: type || undefined, limit: type ? 16 : 6 } })
        .then(({ data }) => alive && setResults(Array.isArray(data) ? data : []))
        .catch(() => alive && setResults([]));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [open, q, type]);

  const keys = new Set(selected.map(refKey));
  const full = selected.length >= MAX_REFS;
  const toggle = (item) => {
    if (keys.has(refKey(item))) onChange(selected.filter((r) => refKey(r) !== refKey(item)));
    else if (!full) onChange([...selected, item]);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("Adjuntar al contexto")}
      width={680}
      footer={
        <>
          <span className="ch-picker-count" data-testid="chat-picker-count">
            {t("{n} de {max} adjuntos", { n: selected.length, max: MAX_REFS })}
          </span>
          <Button onClick={onClose} data-testid="chat-picker-done">{t("Listo")}</Button>
        </>
      }
    >
      <p className="ch-help">
        {t("El asistente lee completo lo que usted adjunte y responde con eso como base. Sin adjuntos, busca por su cuenta lo que se parezca a la pregunta.")}
      </p>
      <Input
        id="chat-picker-search"
        label={t("Buscar")}
        placeholder={t("Nombre de la tecnología, título de la señal, fuente, informe...")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ch-chips" role="group" aria-label={t("Tipo de elemento")}>
        {TYPE_FILTERS.map((f) => (
          <button key={f.key || "todo"} type="button" className={`ch-chip${type === f.key ? " is-active" : ""}`} aria-pressed={type === f.key} onClick={() => setType(f.key)} data-testid={`chat-picker-type-${f.key || "todo"}`}>
            {f.label}
          </button>
        ))}
      </div>
      {results == null ? (
        <p className="ch-help">{t("Buscando...")}</p>
      ) : results.length === 0 ? (
        <p className="ch-help">{t("Nada coincide. Pruebe con otra palabra o cambie el tipo.")}</p>
      ) : (
        <ul className="ch-picker-list" data-testid="chat-picker-results">
          {results.map((item) => {
            const on = keys.has(refKey(item));
            return (
              <li key={refKey(item)} className={on ? "is-on" : ""}>
                <div style={{ minWidth: 0 }}>
                  <span className="ch-ref-type">{ts(item.type_label)}</span>
                  <strong>{item.title}</strong>
                  {item.subtitle && <em>{ts(item.subtitle)}</em>}
                </div>
                <Button size="sm" variant={on ? "secondary" : "outline"} disabled={!on && full} onClick={() => toggle(item)} data-testid={`chat-picker-add-${item.type}-${item.id}`}>
                  {on ? t("Quitar") : t("Adjuntar")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/** Registros con los que se armó una respuesta, agrupados por origen y con enlace. */
function AnswerRefs({ refs }) {
  if (!refs?.length) return null;
  const groups = ["elegido", "memoria", "encontrado"].map((origin) => ({ origin, items: refs.filter((r) => r.origin === origin) })).filter((g) => g.items.length);
  return (
    <div className="ch-refs" data-testid="chat-refs">
      {groups.map((g) => (
        <div key={g.origin} className={`ch-refs-group is-${g.origin}`}>
          <span className="ch-refs-label">{ORIGIN_LABEL[g.origin] || g.origin}</span>
          <div className="ch-refs-items">
            {g.items.map((r) =>
              r.to ? (
                <Link key={refKey(r)} to={r.to} className="ch-ref" title={`${ts(r.type_label)}: ${r.title}`}>
                  <span className="ch-ref-type">{ts(r.type_label)}</span> {r.title}
                </Link>
              ) : (
                <span key={refKey(r)} className="ch-ref" title={`${ts(r.type_label)}: ${r.title}`}>
                  <span className="ch-ref-type">{ts(r.type_label)}</span> {r.title}
                </span>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lo que el asistente sabe porque el equipo se lo marcó o se lo enseñó. */
function MemoryPanel({ canWrite, version, onChanged }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get("/chat/memory", { params: { q: q.trim() || undefined, status: archived ? "archivada" : "activa" } });
      setData(res);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cargar la memoria del asistente")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, archived]);

  useEffect(() => {
    const id = window.setTimeout(load, 250);
    return () => window.clearTimeout(id);
  }, [load, version]);

  const openForm = (entry) => {
    setForm({ title: entry?.title || "", content: entry?.content || "" });
    setEditing(entry || { id: null });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing.id) await api.put(`/chat/memory/${editing.id}`, form);
      else await api.post("/chat/memory", form);
      toast.success(editing.id ? t("Entrada actualizada.") : t("El asistente ya cuenta con este dato."));
      setEditing(null);
      load();
      onChanged?.();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar en la memoria")));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (entry, status) => {
    try {
      await api.put(`/chat/memory/${entry.id}`, { status });
      toast.success(status === "archivada" ? t("Entrada archivada: el asistente deja de usarla.") : t("Entrada activa de nuevo."));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cambiar la entrada")));
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/chat/memory/${confirmDel.id}`);
      toast.success(t("Entrada eliminada de la memoria."));
      setConfirmDel(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar la entrada")));
    }
  };

  const stats = data?.stats;
  const formBad = !form.title.trim() || form.content.trim().length < 20;

  return (
    <div className="ch-memory" data-testid="chat-memory">
      <div className="ch-memory-head">
        <p className="ch-help">
          {t("El asistente consulta esta memoria en cada pregunta de cualquier persona del equipo. No entrena un modelo: es texto que lee antes de responder, y cada entrada dice quién la guardó.")}
        </p>
        {stats && (
          <p className="ch-memory-stats" data-testid="chat-memory-stats">
            {t("{n} entrada(s) activas · {r} de respuestas útiles · {d} escritas a mano · usadas {u} veces", { n: stats.active, r: stats.from_answers, d: stats.taught, u: stats.uses })}
          </p>
        )}
        <input className="filter-input" placeholder={t("Buscar en la memoria...")} aria-label={t("Buscar en la memoria")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="chat-memory-search" />
        <div className="ch-memory-tools">
          <label className="ch-check">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> {t("Ver archivadas")}
          </label>
          <HintButton size="sm" disabled={!canWrite} disabledHint={t("Su perfil puede consultar la memoria pero no cambiarla.")} onClick={() => openForm(null)} data-testid="chat-memory-new">
            <Icon name="plus" size={14} /> {t("Enseñar un dato")}
          </HintButton>
        </div>
      </div>
      <div className="ch-list">
        {data == null ? (
          <div className="ch-empty">{t("Cargando...")}</div>
        ) : data.items.length === 0 ? (
          <div className="ch-empty">
            {q || archived
              ? t("Ninguna entrada coincide.")
              : t("La memoria está vacía. Marque una respuesta como útil y guárdela, o enseñe un dato con el botón de arriba.")}
          </div>
        ) : (
          data.items.map((entry) => (
            <article key={entry.id} className="ch-entry" data-testid={`chat-memory-${entry.id}`}>
              <strong>{entry.title}</strong>
              <p>{entry.content.length > 220 ? `${entry.content.slice(0, 220)}…` : entry.content}</p>
              <span className="ch-entry-meta">
                {entry.kind === "respuesta" ? t("Respuesta útil") : t("Escrita a mano")} · {entry.created_by_name} · {fmtDate(entry.created_at)} · {t("usada {n} veces", { n: entry.uses })}
                {entry.restricted ? " · " + t("reservada") : ""}
              </span>
              {entry.can_manage && canWrite && (
                <div className="ch-entry-actions">
                  <button type="button" className="ch-link" onClick={() => openForm(entry)}>{t("Editar")}</button>
                  <button type="button" className="ch-link" onClick={() => setStatus(entry, entry.status === "activa" ? "archivada" : "activa")}>
                    {entry.status === "activa" ? t("Archivar") : t("Reactivar")}
                  </button>
                  <button type="button" className="ch-link is-danger" onClick={() => setConfirmDel(entry)}>{t("Eliminar")}</button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? t("Editar la entrada de la memoria") : t("Enseñar un dato al asistente")}
        width={600}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>{t("Cancelar")}</Button>
            <HintButton onClick={save} loading={saving} disabled={formBad} disabledHint={t("Escriba un título y al menos 20 caracteres de contenido.")} data-testid="chat-memory-save">
              {t("Guardar en la memoria")}
            </HintButton>
          </>
        }
      >
        <p className="ch-help">{t("Escriba un dato que el asistente deba tener presente: un criterio del equipo, una definición, una decisión del comité. Sea concreto; lo verá todo el equipo.")}</p>
        <Input id="chat-memory-title" label={t("Título")} required maxLength={300} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea id="chat-memory-content" label={t("Contenido")} required rows={7} maxLength={6000} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
      </Modal>
      <ConfirmDialog
        open={Boolean(confirmDel)}
        onClose={() => setConfirmDel(null)}
        onConfirm={remove}
        title={t("Eliminar de la memoria")}
        message={t('Se eliminará "{title}". El asistente dejará de tenerlo en cuenta. Si solo quiere que deje de usarla, archívela.', { title: confirmDel?.title || "" })}
        confirmLabel={t("Eliminar")}
      />
    </div>
  );
}

export default function Chat() {
  const { status, can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const canWrite = can(PERM.NOTE_WRITE);

  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [context, setContext] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("conversaciones");
  const [picker, setPicker] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [remembering, setRemembering] = useState(null);
  const [rememberForm, setRememberForm] = useState({ title: "", content: "" });
  const [noting, setNoting] = useState(null);
  const [noteForm, setNoteForm] = useState({ title: "", content: "", link: "" });
  const [memoryVersion, setMemoryVersion] = useState(0);
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
    next.delete("adjuntar");
    setParams(next, { replace: true });
  };

  const openSession = async (id, { quiet = false } = {}) => {
    try {
      const { data } = await api.get(`/chat/sessions/${id}`);
      setActiveId(id);
      setMessages(data.messages);
      setContext(data.context || []);
      // Si la última pregunta quedó sin respuesta, se ofrece reintentar.
      setFailed(data.messages.length > 0 && data.messages[data.messages.length - 1].role === "user");
      setUrl(id);
    } catch (e) {
      if (!quiet) toast.error(apiError(e, t("No se pudo abrir la conversación")));
      setUrl(null);
    }
  };

  // Enlaces directos: /chat?c=12 abre una conversación; /chat?adjuntar=finding:3,source:8 empieza con contexto.
  useEffect(() => {
    const id = Number(params.get("c"));
    if (id && id !== activeId) {
      openSession(id, { quiet: true });
      return;
    }
    const attach = (params.get("adjuntar") || "")
      .split(",")
      .map((part) => part.split(":"))
      .filter(([type, rid]) => type && Number(rid) > 0)
      .map(([type, rid]) => ({ type, id: Number(rid) }));
    if (attach.length) {
      api
        .get("/chat/context/search", { params: { types: [...new Set(attach.map((a) => a.type))].join(","), limit: 20 } })
        .then(({ data }) => {
          const wanted = new Set(attach.map(refKey));
          const found = (Array.isArray(data) ? data : []).filter((r) => wanted.has(refKey(r)));
          // Lo que no salió en la lista reciente se adjunta igual: el servidor valida que exista.
          const missing = attach.filter((a) => !found.some((f) => refKey(f) === refKey(a))).map((a) => ({ ...a, title: `#${a.id}`, type_label: a.type }));
          setContext([...found, ...missing].slice(0, MAX_REFS));
        })
        .catch(() => setContext(attach.map((a) => ({ ...a, title: `#${a.id}`, type_label: a.type }))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setContext([]);
    setFailed(false);
    setUrl(null);
    setTab("conversaciones");
    inputRef.current?.focus();
  };

  const changeContext = async (next) => {
    setContext(next);
    if (!activeId) return;
    try {
      const { data } = await api.put(`/chat/sessions/${activeId}/context`, { context: next.map((r) => ({ type: r.type, id: r.id })) });
      setContext(data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cambiar el contexto")));
    }
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

  const replaceMessage = (next) => setMessages((m) => m.map((x) => (x.id === next.id ? { ...x, ...next } : x)));

  const rate = async (message, feedback) => {
    try {
      const { data } = await api.post(`/chat/messages/${message.id}/feedback`, { feedback: message.feedback === feedback ? "" : feedback });
      replaceMessage(data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar la valoración")));
    }
  };

  const questionOf = (message) => {
    const index = messages.findIndex((m) => m.id === message.id);
    for (let i = index - 1; i >= 0; i -= 1) if (messages[i].role === "user") return messages[i].content;
    return "";
  };

  const startRemember = (message) => {
    setRememberForm({ title: questionOf(message).slice(0, 120), content: message.content });
    setRemembering(message);
  };

  const saveRemember = async () => {
    setBusy("remember");
    try {
      await api.post(`/chat/messages/${remembering.id}/remember`, rememberForm);
      replaceMessage({ id: remembering.id, feedback: "util", remembered: true });
      toast.success(t("Guardado en la memoria: el asistente lo tendrá en cuenta en las próximas preguntas del equipo."));
      setRemembering(null);
      setMemoryVersion((v) => v + 1);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar en la memoria")));
    } finally {
      setBusy("");
    }
  };

  const startNote = (message) => {
    const linkable = (message.refs || []).filter((r) => r.origin === "elegido" && NOTE_LINKABLE.includes(r.type));
    setNoteForm({ title: questionOf(message).slice(0, 120), content: message.content, link: linkable.length === 1 ? refKey(linkable[0]) : "" });
    setNoting({ message, linkable });
  };

  const saveNote = async () => {
    setBusy("note");
    const [type, id] = noteForm.link ? noteForm.link.split(":") : ["general", null];
    try {
      await api.post("/notes", { title: noteForm.title, content: noteForm.content, entity_type: type, entity_id: id ? Number(id) : null, pinned: false });
      toast.success(t("Nota creada. Está en Notas del equipo."));
      setNoting(null);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo crear la nota")));
    } finally {
      setBusy("");
    }
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending || message.length > MESSAGE_MAX) return;
    if (text == null) setInput("");
    setFailed(false);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: message }]);
    setSending(true);
    try {
      const { data } = await api.post(
        "/chat/send",
        { session_id: activeId, message, context: context.map((r) => ({ type: r.type, id: r.id })) },
        { timeout: AI_TIMEOUT }
      );
      setActiveId(data.session.id);
      setUrl(data.session.id);
      setMessages((m) => [...m, data.answer]);
      // El servidor devuelve el contexto validado dentro de las referencias de la respuesta.
      const chosen = (data.answer.refs || []).filter((r) => r.origin === "elegido");
      if (context.length) setContext(chosen);
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
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, height: "calc(100vh - 112px)" }} className="chat-grid">
      {/* Conversaciones y memoria */}
      <div className="chat-sessions ch-panel">
        <div className="ch-panel-head">
          <Button onClick={newChat} style={{ width: "100%" }}>
            <Icon name="plus" size={16} /> {t("Nueva conversación")}
          </Button>
          <div className="ch-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "conversaciones"} className={tab === "conversaciones" ? "is-active" : ""} onClick={() => setTab("conversaciones")} data-testid="chat-tab-conversaciones">
              {t("Conversaciones")}
            </button>
            <button type="button" role="tab" aria-selected={tab === "memoria"} className={tab === "memoria" ? "is-active" : ""} onClick={() => setTab("memoria")} data-testid="chat-tab-memoria">
              {t("Memoria")}
            </button>
          </div>
          {tab === "conversaciones" && (
            <input
              className="filter-input"
              placeholder={t("Buscar en mis conversaciones...")}
              aria-label={t("Buscar en mis conversaciones")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="chat-search"
            />
          )}
        </div>
        {tab === "memoria" ? (
          <MemoryPanel canWrite={canWrite} version={memoryVersion} />
        ) : (
          <>
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
                      <button type="button" className="ch-icon" onClick={() => startRename(s)} aria-label={t("Cambiar el título de {title}", { title: s.title })} title={t("Cambiar el título")}>
                        <Icon name="edit" size={13} />
                      </button>
                      <button type="button" className="ch-icon" onClick={() => setConfirmDel(s)} aria-label={t("Eliminar conversación {title}", { title: s.title })} title={t("Eliminar conversación")}>
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
          </>
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
            <div style={{ maxWidth: 600, margin: "0 auto", paddingTop: 12 }}>
              <EmptyState
                icon="💬"
                title={t("Trabaje con lo que el sistema ya sabe")}
                message={t("Adjunte señales, tecnologías, fuentes o informes y pida un resumen, una comparación o una nota. O pregunte sin adjuntar: el asistente busca por su cuenta.")}
              />
              {!aiOn && (
                <p className="fb-public-note" data-testid="chat-degraded">
                  {t("La IA no está configurada: el asistente responderá mostrando la información relevante que encuentre en el sistema, sin redactar.")}
                </p>
              )}
              <ol className="ch-steps">
                <li><strong>{t("Adjunte")}</strong> {t("lo que quiere analizar con el botón «Adjuntar».")}</li>
                <li><strong>{t("Pregunte")}</strong> {t("o use una acción rápida: resumir, comparar, riesgos.")}</li>
                <li><strong>{t("Aproveche")}</strong> {t("la respuesta: márquela útil, guárdela en la memoria o pásela a una nota.")}</li>
              </ol>
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
                  canWrite={canWrite}
                  onCopy={copyText}
                  onRate={rate}
                  onRemember={startRemember}
                  onNote={startNote}
                  onRetry={!sending && lastAssistant && m.id === lastAssistant.id ? retry : null}
                />
              ))}
              {sending && (
                <div className="ch-waiting">
                  <Spinner size={18} /> {context.length ? t("Leyendo los {n} elementos adjuntos...", { n: context.length }) : t("Analizando la información disponible...")}
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
          <div className="ch-context" data-testid="chat-context">
            <Button size="sm" variant="outline" onClick={() => setPicker(true)} data-testid="chat-attach">
              <Icon name="link" size={14} /> {context.length ? t("Adjuntos ({n})", { n: context.length }) : t("Adjuntar")}
            </Button>
            {context.map((r) => (
              <span key={refKey(r)} className="ch-ref is-chosen" title={`${ts(r.type_label)}: ${r.title}`}>
                <span className="ch-ref-type">{ts(r.type_label)}</span> {r.title}
                <button type="button" onClick={() => changeContext(context.filter((x) => refKey(x) !== refKey(r)))} aria-label={t("Quitar {title} del contexto", { title: r.title })}>
                  ×
                </button>
              </span>
            ))}
          </div>
          {context.length > 0 && (
            <div className="ch-quick" role="group" aria-label={t("Acciones rápidas")}>
              {QUICK_ACTIONS.map((a) => (
                <button key={a.key} type="button" className="ch-chip" disabled={sending} onClick={() => send(a.prompt)} data-testid={`chat-quick-${a.key}`}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
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

      <ContextPicker open={picker} onClose={() => setPicker(false)} selected={context} onChange={changeContext} />

      <Modal
        open={Boolean(remembering)}
        onClose={() => setRemembering(null)}
        title={t("Guardar en la memoria del asistente")}
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemembering(null)}>{t("Cancelar")}</Button>
            <HintButton
              onClick={saveRemember}
              loading={busy === "remember"}
              disabled={!rememberForm.title.trim() || rememberForm.content.trim().length < 20}
              disabledHint={t("Escriba un título y al menos 20 caracteres de contenido.")}
              data-testid="chat-remember-save"
            >
              {t("Guardar en la memoria")}
            </HintButton>
          </>
        }
      >
        <p className="ch-help">
          {t("El asistente tendrá en cuenta este texto cuando alguien del equipo pregunte algo parecido. Revíselo antes de guardar: corrija lo que no sea exacto y quite lo que sobre.")}
        </p>
        <Input id="chat-remember-title" label={t("Título")} required maxLength={300} value={rememberForm.title} onChange={(e) => setRememberForm({ ...rememberForm, title: e.target.value })} />
        <Textarea id="chat-remember-content" label={t("Lo que el asistente debe recordar")} required rows={8} maxLength={6000} value={rememberForm.content} onChange={(e) => setRememberForm({ ...rememberForm, content: e.target.value })} />
      </Modal>

      <Modal
        open={Boolean(noting)}
        onClose={() => setNoting(null)}
        title={t("Pasar la respuesta a una nota")}
        width={620}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoting(null)}>{t("Cancelar")}</Button>
            <Button onClick={saveNote} loading={busy === "note"} disabled={!noteForm.content.trim()} data-testid="chat-note-save">
              {t("Crear la nota")}
            </Button>
          </>
        }
      >
        <p className="ch-help">{t("La nota queda en Notas del equipo, a nombre suyo. Puede editar el texto antes de guardarla.")}</p>
        <Input id="chat-note-title" label={t("Título")} maxLength={390} value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} />
        {noting?.linkable?.length > 0 && (
          <Select id="chat-note-link" label={t("Vincular a")} value={noteForm.link} onChange={(e) => setNoteForm({ ...noteForm, link: e.target.value })}>
            <option value="">{t("Nota general")}</option>
            {noting.linkable.map((r) => (
              <option key={refKey(r)} value={refKey(r)}>
                {ts(r.type_label)}: {r.title.slice(0, 80)}
              </option>
            ))}
          </Select>
        )}
        <Textarea id="chat-note-content" label={t("Contenido")} required rows={8} maxLength={20000} value={noteForm.content} onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })} />
      </Modal>

      <Modal
        open={Boolean(renaming)}
        onClose={() => setRenaming(null)}
        title={t("Cambiar el título de la conversación")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={saveRename} loading={busy === "rename"} disabled={!newTitle.trim() || newTitle.trim().length > TITLE_MAX} data-testid="chat-rename-save">
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

function Bubble({ message, canWrite, onCopy, onRate, onRemember, onNote, onRetry }) {
  const isUser = message.role === "user";
  const saved = typeof message.id === "number";
  return (
    <div className={`ch-row${isUser ? " is-user" : ""}`}>
      <div className={`ch-bubble${isUser ? " is-user" : ""}`}>
        {isUser ? (
          message.content
        ) : (
          <>
            <Markdown>{message.content}</Markdown>
            {message.refs?.length ? (
              <AnswerRefs refs={message.refs} />
            ) : (
              message.sources_used && (
                <div className="ch-sources" title={t("Registros del sistema que se usaron como contexto para esta respuesta")}>
                  📎 {t("Fuentes: {list}", { list: message.sources_used })}
                </div>
              )
            )}
            <div className="ch-bubble-foot">
              {message.created_at && <span>{fmtTime(message.created_at, { hour: "2-digit", minute: "2-digit" })}</span>}
              {saved && (
                <>
                  <button type="button" className={`ch-rate${message.feedback === "util" ? " is-on" : ""}`} aria-pressed={message.feedback === "util"} onClick={() => onRate(message, "util")} data-testid="chat-useful">
                    👍 {t("Útil")}
                  </button>
                  <button type="button" className={`ch-rate${message.feedback === "no_util" ? " is-off" : ""}`} aria-pressed={message.feedback === "no_util"} onClick={() => onRate(message, "no_util")} data-testid="chat-not-useful">
                    👎 {t("No útil")}
                  </button>
                </>
              )}
              {saved && canWrite && (
                message.remembered ? (
                  <span className="ch-remembered" data-testid="chat-remembered">✓ {t("En la memoria")}</span>
                ) : (
                  <button type="button" className="ch-link" onClick={() => onRemember(message)} data-testid="chat-remember">
                    {t("Guardar en la memoria")}
                  </button>
                )
              )}
              {saved && canWrite && (
                <button type="button" className="ch-link" onClick={() => onNote(message)} data-testid="chat-to-note">
                  {t("Pasar a nota")}
                </button>
              )}
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
