import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { PageHeader, Card } from "../components/Card";
import Button from "../components/Button";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import Tooltip from "../components/Tooltip";
import Modal from "../components/Modal";
import HelpNote from "../components/HelpNote";
import DataTable from "../components/DataTable";
import NotesPanel from "../components/NotesPanel";
import { ietsTag } from "../utils/iets";
import { downloadFromApi } from "../utils/download";
import ConfirmDialog from "../components/ConfirmDialog";
import { Input, Textarea, Select } from "../components/Field";
import { LoadingBlock } from "../components/Spinner";
import EmptyState from "../components/EmptyState";

const CATEGORIES = [
  "Producto directo IETS",
  "Participacion IETS (regional)",
  "Contexto Colombia (divulgativo)",
  "Contexto MinSalud",
  "Referente internacional",
];

const EMPTY = {
  title: "",
  url: "",
  category: CATEGORIES[4],
  authors: "",
  year: "",
  description: "",
  relation_iets: "",
  language: "Espanol",
  resource_type: "",
  link_status: "Activo",
  scrape_enabled: true,
  tags: "",
};

export default function Sources() {
  const { isEditor } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();

  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [viewMode, setViewMode] = useState("table");

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({ title: "", url: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [scanningId, setScanningId] = useState(null);
  const [detailSource, setDetailSource] = useState(null);

  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/sources");
      setSources(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar las fuentes"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const filtered = useMemo(() => {
    return sources.filter((s) => {
      const okCat = !catFilter || s.category === catFilter;
      const q = search.toLowerCase();
      const okSearch =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);
      return okCat && okSearch;
    });
  }, [sources, search, catFilter]);

  const openQuick = () => {
    setQuickForm({ title: "", url: "" });
    setQuickOpen(true);
  };

  const openAdvanced = (s = null) => {
    setEditing(s);
    setForm(s ? { ...EMPTY, ...s } : EMPTY);
    setPreview(null);
    setModalOpen(true);
  };

  const saveQuick = async () => {
    if (!quickForm.title.trim() || !quickForm.url.trim()) {
      toast.warning("Nombre y URL son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await api.post("/sources/quick", quickForm);
      toast.success("Fuente agregada al listado maestro");
      setQuickOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo agregar la fuente"));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.warning("El titulo es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing) await api.put(`/sources/${editing.id}`, payload);
      else await api.post("/sources", payload);
      toast.success(editing ? "Fuente actualizada" : "Fuente creada");
      setModalOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar la fuente"));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/sources/${confirmDel.id}`);
      toast.success("Fuente eliminada");
      setConfirmDel(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar"));
    } finally {
      setDeleting(false);
    }
  };

  const previewUrl = async () => {
    if (!form.url.trim()) {
      toast.warning("Escriba una URL para previsualizar");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const { data } = await api.post("/scan/preview", { url: form.url.trim() });
      setPreview(data);
      if (data.ok && !form.title.trim() && data.title) {
        setForm((f) => ({ ...f, title: data.title.slice(0, 200) }));
      }
      if (data.ok && !form.description.trim() && data.description) {
        setForm((f) => ({ ...f, description: data.description }));
      }
    } catch (e) {
      toast.error(apiError(e, "No se pudo previsualizar el enlace"));
    } finally {
      setPreviewing(false);
    }
  };

  const scanOne = async (s) => {
    setScanningId(s.id);
    try {
      const { data } = await api.post(`/scan/source/${s.id}`);
      toast.success(`Escaneo: ${data.items_new} nuevos de ${data.items_found}`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo escanear la fuente"));
    } finally {
      setScanningId(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFromApi(api, "/sources/export", "fuentes_iets.csv");
      toast.success("Listado maestro descargado");
    } catch (e) {
      toast.error(apiError(e, "No se pudo exportar"));
    } finally {
      setExporting(false);
    }
  };

  const tableColumns = useMemo(
    () => [
      {
        key: "title",
        label: "Nombre / titulo",
        render: (s) => (
          <div>
            <button
              type="button"
              onClick={() => setDetailSource(s)}
              style={{ border: "none", background: "none", padding: 0, fontWeight: 600, color: "#0F172A", cursor: "pointer", textAlign: "left" }}
            >
              {s.title}
            </button>
            {ietsTag(s.category) && (
              <Badge tone={ietsTag(s.category).tone} style={{ marginLeft: 6 }}>{ietsTag(s.category).label}</Badge>
            )}
          </div>
        ),
      },
      {
        key: "url",
        width: 220,
        label: "URL",
        render: (s) =>
          s.url ? (
            <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, wordBreak: "break-all" }} title={s.url}>
              {s.url.replace(/^https?:\/\//, "").slice(0, 45)}{s.url.length > 50 ? "…" : ""}
            </a>
          ) : (
            <span style={{ color: "#CBD5E1" }}>—</span>
          ),
      },
      {
        key: "category",
        width: 160,
        label: "Categoria",
        render: (s) => <Badge>{s.category || "—"}</Badge>,
      },
      {
        key: "watch",
        width: 100,
        label: "Vigilada",
        render: (s) => (s.scrape_enabled ? <Badge tone="ok">Si</Badge> : <Badge tone="viewer">No</Badge>),
      },
      {
        key: "findings",
        width: 90,
        label: "Hallazgos",
        render: (s) => <span style={{ fontWeight: 600 }}>{s.findings_count || 0}</span>,
      },
      {
        key: "actions",
        width: isEditor ? 200 : 80,
        align: "right",
        label: "Acciones",
        render: (s) => (
          <div style={{ whiteSpace: "nowrap" }}>
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="ghost"><Icon name="external" size={14} /></Button>
              </a>
            )}
            {isEditor && (
              <>
                <Tooltip text="Escanear esta fuente">
                  <Button size="sm" variant="outline" loading={scanningId === s.id} disabled={!s.scrape_enabled} onClick={() => scanOne(s)}>
                    <Icon name="radar" size={14} />
                  </Button>
                </Tooltip>
                <Button size="sm" variant="ghost" onClick={() => openAdvanced(s)}><Icon name="edit" size={14} /></Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [isEditor, scanningId]
  );

  if (loading) return <LoadingBlock label="Cargando listado maestro de fuentes..." />;

  return (
    <div>
      <PageHeader
        title="Listado maestro de fuentes"
        subtitle="Inventario central de URLs y documentos vigilados. Agregue fuentes en modo rapido (nombre + URL) o avanzado (metadatos completos)."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={exportCsv} loading={exporting}>
              <Icon name="doc" size={16} /> Descargar CSV
            </Button>
            {isEditor && (
              <>
                <Button variant="outline" onClick={openQuick}>
                  <Icon name="plus" size={16} /> Agregar rapido
                </Button>
                <Button onClick={() => openAdvanced()}>
                  <Icon name="layers" size={16} /> Agregar avanzado
                </Button>
              </>
            )}
          </div>
        }
      />

      <HelpNote id="sources-master">
        Este es el <strong>listado maestro</strong> de todas las fuentes del sistema. Proviene del inventario inicial
        del IETS (Excel) y de fuentes que usted agregue. Use <strong>Agregar rapido</strong> para solo nombre + URL, o{" "}
        <strong>Agregar avanzado</strong> para categoria, descripcion y mas opciones. Las fuentes vigiladas se incluyen
        en el escaneo automatico.
      </HelpNote>

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Buscar por nombre o URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="filter-input"
            style={{ flex: 1, minWidth: 200 }}
          />
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="filter-select">
            <option value="">Todas las categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 8 }}>
            <button type="button" onClick={() => setViewMode("table")} className={`view-toggle${viewMode === "table" ? " active" : ""}`}>Tabla</button>
            <button type="button" onClick={() => setViewMode("cards")} className={`view-toggle${viewMode === "cards" ? " active" : ""}`}>Tarjetas</button>
          </div>
          <span style={{ fontSize: 13, color: "#64748B" }}>{filtered.length} de {sources.length} fuentes</span>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="🌐" title="Sin fuentes" message="No hay fuentes que coincidan con el filtro." />
        </Card>
      ) : viewMode === "table" ? (
        <Card padding={0}>
          <DataTable columns={tableColumns} rows={filtered.map((s) => ({ key: s.id, data: s }))} minWidth={980} />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
          {filtered.map((s) => (
            <Card key={s.id} padding={20} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <Badge>{s.category}</Badge>
                {s.scrape_enabled ? <Badge tone="ok">Vigilada</Badge> : <Badge tone="viewer">Sin vigilar</Badge>}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>{s.title}</h3>
              {s.url && (
                <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, marginTop: 4, wordBreak: "break-all" }}>
                  {s.url}
                </a>
              )}
              <p style={{ fontSize: 13, color: "#64748B", marginTop: 8, flex: 1 }}>{s.description?.slice(0, 120)}</p>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>{s.findings_count || 0} hallazgos</div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: "1px solid #F1F5F9", paddingTop: 12 }}>
                <Button size="sm" variant="ghost" onClick={() => setDetailSource(s)}>Ver</Button>
                {isEditor && (
                  <>
                    <Button size="sm" variant="outline" loading={scanningId === s.id} disabled={!s.scrape_enabled} onClick={() => scanOne(s)}>
                      Escanear
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openAdvanced(s)}>Editar</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Agregar rapido */}
      <Modal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="Agregar fuente (modo rapido)"
        width={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setQuickOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveQuick} loading={saving}>Agregar al listado</Button>
          </>
        }
      >
        <HelpNote id="quick-add" tone="tip" dismissible={false}>
          Solo necesita el <strong>nombre</strong> y la <strong>URL</strong>. La fuente queda vigilada y lista para escanear.
        </HelpNote>
        <Input label="Nombre del sitio / fuente" required value={quickForm.title} onChange={(e) => setQuickForm({ ...quickForm, title: e.target.value })} placeholder="Ej. NIHR Innovation Observatory" />
        <Input label="URL" required value={quickForm.url} onChange={(e) => setQuickForm({ ...quickForm, url: e.target.value })} placeholder="https://..." />
      </Modal>

      {/* Agregar avanzado */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Editar fuente (avanzado)" : "Agregar fuente (avanzado)"} width={640}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={save} loading={saving}>{editing ? "Guardar" : "Crear"}</Button></>}
      >
        <Input label="Titulo" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input label="URL / enlace" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
        <div style={{ marginBottom: 14 }}>
          <Button variant="secondary" size="sm" onClick={previewUrl} loading={previewing} disabled={!form.url.trim()}>
            <Icon name="compass" size={15} /> Previsualizar extraccion
          </Button>
          {preview && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${preview.ok ? "#BBF7D0" : "#FECACA"}`, background: preview.ok ? "#F0FDF4" : "#FEF2F2", fontSize: 13 }}>
              <strong>{preview.ok ? `${preview.candidates_count} hallazgo(s) detectables` : "Error"}</strong>
              <div>{preview.message}</div>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Select label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="Ano" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
        </div>
        <Input label="Autores / entidad" value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} />
        <Textarea label="Descripcion" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginTop: 6 }}>
          <input type="checkbox" checked={form.scrape_enabled} onChange={(e) => setForm({ ...form, scrape_enabled: e.target.checked })} style={{ width: 18, height: 18 }} />
          Habilitar vigilancia (web scraping)
        </label>
      </Modal>

      {/* Detalle fuente + notas */}
      <Modal open={!!detailSource} onClose={() => setDetailSource(null)} title={detailSource?.title || "Fuente"} width={680}>
        {detailSource && (
          <div>
            <Badge>{detailSource.category}</Badge>
            {detailSource.url && (
              <div style={{ marginTop: 12 }}>
                <a href={detailSource.url} target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="sm"><Icon name="external" size={14} /> Abrir URL</Button>
                </a>
              </div>
            )}
            <p style={{ marginTop: 12, fontSize: 14, color: "#475569" }}>{detailSource.description || "Sin descripcion."}</p>
            <NotesPanel entityType="source" entityId={detailSource.id} />
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={doDelete} loading={deleting}
        title="Eliminar fuente" message={`Se eliminara "${confirmDel?.title}" y sus hallazgos.`} confirmLabel="Eliminar" />
    </div>
  );
}
