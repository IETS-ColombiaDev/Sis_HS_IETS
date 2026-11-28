import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import { PERM } from "../constants/methodology";
import PhaseGuide from "../components/PhaseGuide";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import DataTable from "../components/DataTable";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { Input, Select, Textarea } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import { downloadFromApi } from "../utils/download";
import { ENTITY_LABELS, canManageNote } from "../components/NotesPanel";
import { fmtDate, fmtDateTime, t, tr, ts } from "../i18n";
import "./prioritization.css";
import "./notes.css";

const FILTERS = [
  { value: "", label: t("Todas") },
  { value: "finding", label: t("Señales") },
  { value: "source", label: t("Fuentes") },
  { value: "recommendation", label: t("Informes") },
  { value: "general", label: t("Generales") },
];
const LINK_PATH = { finding: "/senales", source: "/fuentes", recommendation: "/diseminacion" };
const EMPTY_FORM = { title: "", content: "", entity_type: "general", entity_id: "", pinned: false };
const CONTENT_MAX = 20000;
const SORTS = [
  { value: "recientes", label: t("Más recientes primero") },
  { value: "antiguas", label: t("Más antiguas primero") },
  { value: "titulo", label: t("Por título") },
];
const HISTORY_ICON = { created: "plus", edited: "edit", pinned: "check", unpinned: "refresh" };

function NoteHistory({ note }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    api
      .get(`/notes/${note.id}/history`)
      .then(({ data }) => alive && setEvents(Array.isArray(data) ? data : []))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [open, note.id, note.updated_at, note.pinned]);
  return (
    <details className="prio-history-fold nt-history" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary data-testid="note-history-toggle">
        <Icon name="clock" size={14} /> {t("Recorrido de la nota")}
        <span>{t("Quién la creó, la editó o la fijó, y cuándo")}</span>
      </summary>
      {events == null ? (
        <p className="prio-history-empty">{t("Cargando el recorrido...")}</p>
      ) : events.length === 0 ? (
        <p className="prio-history-empty">{t("Esta nota es anterior al registro de cambios: no tiene recorrido guardado.")}</p>
      ) : (
        <ol className="prio-history" data-testid="note-history">
          {events.map((ev, i) => (
            <li key={`${ev.at}-${i}`} className={`is-${ev.kind}`}>
              <span className="prio-history-dot" aria-hidden="true">
                <Icon name={HISTORY_ICON[ev.kind] || "info"} size={13} />
              </span>
              <div>
                <strong>{ts(ev.label)}</strong>
                <span className="prio-history-meta">
                  {fmtDateTime(ev.at)}
                  {ev.by ? ` · ${ev.by}` : ""}
                </span>
                {ev.detail && <p>{ts(ev.detail)}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

export default function Notes() {
  const { can, user } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const canWrite = can(PERM.NOTE_WRITE);
  const noWrite = t("Su perfil ({role}) puede leer las notas pero no escribirlas (permiso note:write).", { role: ts(user?.role_label) || user?.role });

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const firstLoad = useRef(true);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [author, setAuthor] = useState("");
  const [sort, setSort] = useState("recientes");
  const [summary, setSummary] = useState(null);
  const [optionQuery, setOptionQuery] = useState("");
  const [discard, setDiscard] = useState(false);
  const initialForm = useRef(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debounce = useRef(null);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(debounce.current);
  }, [q]);

  // Solo se aplica la respuesta de la ultima consulta: si una anterior llega tarde
  // (busqueda, guardado y refresco automatico se cruzan) mostraria datos viejos.
  const loadSeq = useRef(0);

  const filterParams = useMemo(() => {
    const params = {};
    if (typeFilter) params.entity_type = typeFilter;
    if (query) params.q = query;
    if (onlyMine) params.mine = true;
    if (onlyPinned) params.pinned = true;
    if (author) params.author = author;
    return params;
  }, [typeFilter, query, onlyMine, onlyPinned, author]);
  const filtered = Object.keys(filterParams).length > 0;

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [{ data }, sum] = await Promise.all([
        api.get("/notes", { params: { ...filterParams, sort } }),
        api.get("/notes/summary").catch(() => null),
      ]);
      if (seq !== loadSeq.current) return;
      setNotes(data);
      if (sum) setSummary(sum.data);
      setDetail((d) => (d ? data.find((n) => n.id === d.id) || null : d));
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudieron cargar las notas")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterParams, sort]);

  useEffect(() => {
    load();
  }, [load, version]);

  const clearFilters = () => {
    setQ("");
    setTypeFilter("");
    setOnlyMine(false);
    setOnlyPinned(false);
    setAuthor("");
  };

  // Opciones del vinculo segun el tipo elegido en el formulario.
  useEffect(() => {
    if (!formOpen || editing || form.entity_type === "general") {
      setOptions([]);
      return;
    }
    let alive = true;
    setOptionsLoading(true);
    const path = { finding: "/findings", source: "/sources", recommendation: "/recommendations" }[form.entity_type];
    api
      .get(path, { params: form.entity_type === "finding" ? { limit: 300 } : {} })
      .then(({ data }) => {
        if (alive) setOptions(data.map((x) => ({ id: x.id, label: x.title })));
      })
      .catch((e) => toast.error(apiError(e, t("No se pudieron cargar las opciones del vínculo"))))
      .finally(() => alive && setOptionsLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, editing, form.entity_type]);

  const exportNotes = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, "/notes/export", "notas_iets.csv", { params: { format: "csv", ...filterParams } });
      toast.success(t("Notas descargadas"));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descargar")));
    } finally {
      setExporting(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    initialForm.current = EMPTY_FORM;
    setOptionQuery("");
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (n) => {
    const next = { title: n.title || "", content: n.content, entity_type: n.entity_type, entity_id: n.entity_id || "", pinned: n.pinned };
    setEditing(n);
    setForm(next);
    initialForm.current = next;
    setFormError("");
    setFormOpen(true);
  };

  // Cerrar con texto sin guardar pide confirmación: una nota larga no se pierde por un clic afuera.
  const formDirty = formOpen && (form.title !== initialForm.current.title || form.content !== initialForm.current.content);
  const closeForm = () => {
    if (saving) return;
    if (formDirty) setDiscard(true);
    else setFormOpen(false);
  };

  const copyNote = async (n) => {
    try {
      await navigator.clipboard.writeText(n.title ? `${n.title}\n\n${n.content}` : n.content);
      toast.success(t("Texto de la nota copiado."));
    } catch {
      toast.error(t("No se pudo copiar. Seleccione el texto y cópielo a mano."));
    }
  };

  const save = async () => {
    setFormError("");
    if (!form.content.trim()) {
      setFormError(t("Escriba el contenido de la nota."));
      return;
    }
    if (form.content.length > CONTENT_MAX) {
      setFormError(t("El contenido admite hasta {n} caracteres.", { n: CONTENT_MAX }));
      return;
    }
    if (!editing && form.entity_type !== "general" && !form.entity_id) {
      setFormError(t("Elija el elemento al que se vincula la nota, o cambie el tipo a 'General'."));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/notes/${editing.id}`, { title: form.title, content: form.content, pinned: form.pinned });
        toast.success(t("Nota actualizada"));
      } else {
        await api.post("/notes", {
          title: form.title,
          content: form.content,
          pinned: form.pinned,
          entity_type: form.entity_type,
          entity_id: form.entity_type === "general" ? null : Number(form.entity_id),
        });
        toast.success(t("Nota creada"));
      }
      setFormOpen(false);
      load();
    } catch (e) {
      setFormError(apiError(e, t("No se pudo guardar la nota")));
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (n) => {
    try {
      await api.put(`/notes/${n.id}`, { pinned: !n.pinned });
      toast.success(n.pinned ? t("Nota soltada") : t("Nota fijada"));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo fijar la nota")));
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/notes/${confirmDel.id}`);
      toast.success(t("Nota eliminada"));
      setConfirmDel(null);
      setDetail(null);
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar")));
    } finally {
      setDeleting(false);
    }
  };

  const NoteActions = ({ n }) => {
    const own = canManageNote(n, user, can);
    if (!canWrite) return null;
    return (
      <div className="fb-toolbar" style={{ justifyContent: "flex-end", gap: 2 }}>
        <HintButton size="sm" variant="ghost" hint={GLOSSARY.fb_nota_fijar} onClick={() => togglePin(n)} aria-label={n.pinned ? t("Soltar nota") : t("Fijar nota")}>
          {n.pinned ? t("Soltar") : t("Fijar")}
        </HintButton>
        <HintButton size="sm" variant="ghost" hint={t("Editar la nota")} disabled={!own} disabledHint={GLOSSARY.fb_nota_autor} onClick={() => openEdit(n)} aria-label={t("Editar nota")}>
          <Icon name="edit" size={14} />
        </HintButton>
        <HintButton size="sm" variant="ghost" style={{ color: own ? "#DC2626" : undefined }} hint={t("Eliminar la nota")} disabled={!own} disabledHint={GLOSSARY.fb_nota_autor} onClick={() => setConfirmDel(n)} aria-label={t("Eliminar nota")}>
          <Icon name="trash" size={14} />
        </HintButton>
      </div>
    );
  };

  const columns = [
      {
        key: "note",
        label: t("Nota"),
        render: (n) => (
          <div>
            <button
              type="button"
              onClick={() => setDetail(n)}
              style={{ border: "none", background: "none", padding: 0, fontWeight: 600, color: "#0F172A", cursor: "pointer", textAlign: "left", overflowWrap: "anywhere" }}
            >
              {n.pinned && "📌 "}{n.title || n.content.slice(0, 80)}
            </button>
            {n.title ? (
              <div className="nt-snippet">{n.content.length > 140 ? `${n.content.slice(0, 140)}…` : n.content}</div>
            ) : (
              n.content.length > 80 && <div className="nt-snippet">{n.content.slice(0, 120)}…</div>
            )}
          </div>
        ),
      },
      {
        key: "type",
        width: 200,
        label: t("Vinculada a"),
        tip: <InfoTip text={GLOSSARY.fb_nota_vinculo} label={t("Qué es el vínculo")} />,
        render: (n) => (
          <div>
            <Badge>{ENTITY_LABELS[n.entity_type] || n.entity_type}</Badge>
            {n.entity_type !== "general" && <div style={{ fontSize: 12, color: "#64748B", marginTop: 2, overflowWrap: "anywhere" }}>{n.entity_label}</div>}
            {n.entity_missing && <div className="nt-missing">{t("El elemento vinculado ya no existe")}</div>}
          </div>
        ),
      },
      { key: "author", width: 160, label: t("Autor"), render: (n) => <span style={{ fontSize: 13, color: "#64748B" }}>{n.author_name || n.author_email}</span> },
      { key: "updated", width: 110, label: t("Actualizada"), render: (n) => (
        <span style={{ fontSize: 12, color: "#94A3B8" }}>
          {fmtDate(n.updated_at)}
          {n.edited && <span className="nt-edited">{t("editada")}</span>}
        </span>
      ) },
      { key: "actions", width: 190, align: "right", label: t("Acciones"), render: (n) => <NoteActions n={n} /> },
  ];

  const optionNeedle = optionQuery.trim().toLowerCase();
  const shownOptions = optionNeedle
    ? options.filter((o) => String(o.id) === String(form.entity_id) || (o.label || "").toLowerCase().includes(optionNeedle))
    : options;

  if (loading) return <LoadingBlock label={t("Cargando notas...")} />;

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title={t("Notas del equipo")}
        titleHint={t("Notas internas del equipo, vinculadas a señales, fuentes o informes. No son el informe público.")}
        purpose={t("Documentación colaborativa vinculada a señales, fuentes e informes de diseminación.")}
        actions={
          <div className="fb-toolbar">
            <HintButton variant="secondary" hint={t("Descarga todas las notas en CSV (abre en Excel)")} onClick={exportNotes} loading={exporting}>
              <Icon name="doc" size={16} /> {t("Descargar CSV")}
            </HintButton>
            <HintButton hint={t("Crear una nota general o vinculada a una señal, fuente o informe")} disabled={!canWrite} disabledHint={noWrite} onClick={openCreate}>
              <Icon name="plus" size={16} /> {t("Nueva nota")}
            </HintButton>
          </div>
        }
      />

      <PhaseGuide
        phase={t("Soporte a diseminación")}
        hint={GLOSSARY.diseminacion}
        tasks={[
          t("Registrar observaciones del equipo sobre señales e informes."),
          t("Documentar decisiones de comité y seguimiento regulatorio (INVIMA, ETS)."),
          t("Vincular cada nota a la entidad correspondiente del pipeline."),
        ]}
      />

      {summary && (
        <div className="nt-tiles" data-testid="notes-tiles">
          <div className="nt-tile">
            <span>{t("Notas del equipo")}</span>
            <strong>{summary.total}</strong>
            <em>{t("{n} autor(es)", { n: summary.authors.length })}</em>
          </div>
          <button type="button" className={`nt-tile is-button${onlyPinned ? " is-active" : ""}`} onClick={() => setOnlyPinned((v) => !v)} aria-pressed={onlyPinned} data-testid="notes-tile-pinned">
            <span>{t("Fijadas")}</span>
            <strong>{summary.pinned}</strong>
            <em>{onlyPinned ? t("Mostrando solo las fijadas") : t("Clic para ver solo las fijadas")}</em>
          </button>
          <button type="button" className={`nt-tile is-button${onlyMine ? " is-active" : ""}`} onClick={() => setOnlyMine((v) => !v)} aria-pressed={onlyMine} data-testid="notes-tile-mine">
            <span>{t("Escritas por mí")}</span>
            <strong>{summary.mine}</strong>
            <em>{onlyMine ? t("Mostrando solo las mías") : t("Clic para ver solo las mías")}</em>
          </button>
          <div className="nt-tile">
            <span>{t("Vinculadas")}</span>
            <strong>{summary.total - (summary.by_type.general || 0)}</strong>
            <em>
              {t("{s} a señales · {f} a fuentes · {i} a informes", {
                s: summary.by_type.finding || 0,
                f: summary.by_type.source || 0,
                i: summary.by_type.recommendation || 0,
              })}
            </em>
          </div>
        </div>
      )}

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div className="fb-toolbar">
          <input placeholder={t("Buscar en notas...")} aria-label={t("Buscar en notas")} value={q} onChange={(e) => setQ(e.target.value)} className="filter-input" style={{ flex: 1, minWidth: 200 }} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="filter-select" aria-label={t("Filtrar por vínculo")}>
            {FILTERS.map((f) => (
              <option key={f.value || "all"} value={f.value}>
                {f.label}
                {summary ? ` (${f.value ? summary.by_type[f.value] || 0 : summary.total})` : ""}
              </option>
            ))}
          </select>
          <select value={author} onChange={(e) => setAuthor(e.target.value)} className="filter-select" aria-label={t("Filtrar por autor")} data-testid="notes-author">
            <option value="">{t("Cualquier autor")}</option>
            {(summary?.authors || []).map((a) => (
              <option key={a.email} value={a.email}>
                {a.name} ({a.count})
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="filter-select" aria-label={t("Ordenar las notas")} data-testid="notes-sort">
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {filtered && (
            <Button size="sm" variant="ghost" onClick={clearFilters} data-testid="notes-clear">
              {t("Quitar filtros")}
            </Button>
          )}
          <span style={{ fontSize: 13, color: "#64748B" }} data-testid="notes-count">{t("{n} notas", { n: notes.length })}</span>
        </div>
      </Card>

      {notes.length === 0 ? (
        <Card>
          <EmptyState
            icon="📝"
            title={filtered ? t("Ninguna nota coincide") : t("Sin notas")}
            message={canWrite ? t("Cree una nota para documentar observaciones del equipo.") : t("Aún no hay notas registradas.")}
            action={canWrite ? <Button onClick={openCreate}><Icon name="plus" size={16} /> {t("Nueva nota")}</Button> : null}
          />
        </Card>
      ) : (
        <Card padding={0}>
          <DataTable stack columns={columns} rows={notes.map((n) => ({ key: n.id, data: n }))} minWidth={860} />
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || t("Nota")} width={640} footer={detail ? <NoteActions n={detail} /> : null}>
        {detail && (
          <div data-testid="note-detail">
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <Badge>{ENTITY_LABELS[detail.entity_type]}</Badge>
              {detail.pinned && <Badge tone="medio">{t("Fijada")}</Badge>}
            </div>
            {detail.entity_type !== "general" && (
              <p style={{ fontSize: 13, color: "#64748B", marginBottom: 10 }}>
                {tr("Vinculada a: {label}", { label: <strong>{detail.entity_label}</strong> })}
                {LINK_PATH[detail.entity_type] && (
                  <> · <Link to={LINK_PATH[detail.entity_type]} style={{ color: "#1D4ED8" }}>{t("Ir al módulo")}</Link></>
                )}
              </p>
            )}
            {detail.entity_missing && (
              <div className="fa-notice fa-notice--warn" style={{ marginBottom: 10 }}>
                {t("El elemento al que estaba vinculada esta nota ya no existe. La nota se conserva.")}
              </div>
            )}
            <p style={{ fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", color: "#334155", overflowWrap: "anywhere" }}>{detail.content}</p>
            <div className="nt-detail-foot">
              <span>
                {detail.author_name || detail.author_email} · {t("creada {fecha}", { fecha: fmtDateTime(detail.created_at) })}
                {detail.edited ? " · " + t("editada {fecha}", { fecha: fmtDateTime(detail.updated_at) }) : ""}
              </span>
              <Button size="sm" variant="ghost" onClick={() => copyNote(detail)} data-testid="note-copy">
                {t("Copiar texto")}
              </Button>
            </div>
            <NoteHistory note={detail} />
          </div>
        )}
      </Modal>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? t("Editar nota") : t("Nueva nota")}
        width={600}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>{t("Cancelar")}</Button>
            <Button onClick={save} loading={saving}>{editing ? t("Guardar cambios") : t("Guardar nota")}</Button>
          </>
        }
      >
        {formError && <p className="public-submit-error" role="alert">{formError}</p>}
        {!editing && (
          <div className="fb-grid-2">
            <Select id="note-entity-type" label={t("Vincular a")} hint={GLOSSARY.fb_nota_vinculo} value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value, entity_id: "" })}>
              <option value="general">{t("Nota general")}</option>
              <option value="finding">{t("Una señal")}</option>
              <option value="source">{t("Una fuente")}</option>
              <option value="recommendation">{t("Un informe de diseminación")}</option>
            </Select>
            {form.entity_type !== "general" && (
              <Select id="note-entity-id" label={t("Elemento")} required value={form.entity_id} onChange={(e) => setForm({ ...form, entity_id: e.target.value })} disabled={optionsLoading}>
                <option value="">{optionsLoading ? t("Cargando...") : shownOptions.length ? t("Seleccione...") : t("No hay elementos")}</option>
                {shownOptions.map((o) => (
                  <option key={o.id} value={o.id}>{(o.label || `#${o.id}`).slice(0, 90)}</option>
                ))}
              </Select>
            )}
          </div>
        )}
        {!editing && form.entity_type !== "general" && options.length > 12 && (
          <Input
            id="note-entity-search"
            label={t("Buscar el elemento")}
            help={t("Escriba parte del nombre para acortar la lista de arriba ({n} de {total}).", { n: shownOptions.length, total: options.length })}
            value={optionQuery}
            onChange={(e) => setOptionQuery(e.target.value)}
          />
        )}
        {editing && editing.entity_type !== "general" && (
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 0 }}>{tr("Vinculada a: {label} (el vínculo no se cambia).", { label: <strong>{editing.entity_label}</strong> })}</p>
        )}
        <Input id="note-title" label={t("Título (opcional)")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea id="note-content" label={t("Contenido")} required maxLength={CONTENT_MAX} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={7} placeholder={t("Documente una observación, seguimiento o decisión del equipo...")} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
          {t("Fijar la nota")} <InfoTip text={GLOSSARY.fb_nota_fijar} />
        </label>
      </Modal>

      <ConfirmDialog
        open={discard}
        onClose={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          setFormOpen(false);
        }}
        title={t("Descartar los cambios")}
        message={t("La nota tiene texto sin guardar. Si la cierra ahora, se pierde.")}
        confirmLabel={t("Descartar")}
      />

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={doDelete}
        loading={deleting}
        title={t("Eliminar nota")}
        message={t("La nota se eliminará para todo el equipo. Esta acción no se puede deshacer.")}
        confirmLabel={t("Eliminar")}
      />
    </div>
  );
}
