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
import { ietsTag } from "../utils/iets";
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

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [scanningId, setScanningId] = useState(null);

  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);

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
      const okSearch =
        !search ||
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      return okCat && okSearch;
    });
  }, [sources, search, catFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setPreview(null);
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({ ...EMPTY, ...s });
    setPreview(null);
    setModalOpen(true);
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
      toast.success(`Escaneo de "${s.title}": ${data.items_new} nuevos de ${data.items_found}`);
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo escanear la fuente"));
    } finally {
      setScanningId(null);
    }
  };

  if (loading) return <LoadingBlock label="Cargando fuentes..." />;

  return (
    <div>
      <PageHeader
        title="Fuentes de informacion"
        subtitle="Inventario de documentos, plataformas y repositorios de escaneo de horizonte relevantes para el IETS."
        actions={
          isEditor && (
            <Tooltip text="Agregue una nueva URL / fuente al inventario. Podra vigilarla y escanearla como las demas.">
              <Button onClick={openCreate}>
                <Icon name="plus" size={16} /> Agregar URL / fuente
              </Button>
            </Tooltip>
          )
        }
      />

      <HelpNote id="sources-intro">
        Las <strong>fuentes</strong> son los sitios y documentos que el sistema vigila. Al crear una, escriba la URL
        y pulse <strong>Previsualizar extraccion</strong> para ver que informacion se obtiene antes de guardar.
        Marque <strong>Habilitar vigilancia</strong> para incluirla en los escaneos. El boton <strong>Escanear</strong> de
        cada tarjeta la procesa individualmente.
      </HelpNote>

      <Card style={{ marginBottom: 16 }} padding={16}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="🔎 Buscar por titulo o descripcion..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 220,
              padding: "9px 12px",
              border: "2px solid #E2E8F0",
              borderRadius: 8,
              fontSize: 14,
              outline: "none",
            }}
          />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            style={{
              padding: "9px 12px",
              border: "2px solid #E2E8F0",
              borderRadius: 8,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <option value="">Todas las categorias</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: "#64748B" }}>{filtered.length} fuentes</span>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="🌐" title="Sin fuentes" message="No hay fuentes que coincidan con el filtro." />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {filtered.map((s) => (
            <Card key={s.id} padding={20} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Badge>{s.category}</Badge>
                  {ietsTag(s.category) && (
                    <Tooltip text="Fuente producida por el IETS.">
                      <Badge tone={ietsTag(s.category).tone}>{ietsTag(s.category).label}</Badge>
                    </Tooltip>
                  )}
                </div>
                {s.scrape_enabled ? (
                  <Badge tone="ok">Vigilada</Badge>
                ) : (
                  <Badge tone="viewer">Sin vigilar</Badge>
                )}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{s.title}</h3>
              <div style={{ fontSize: 12, color: "#94A3B8", margin: "6px 0" }}>
                {s.authors} {s.year && `· ${s.year}`} · {s.language}
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: "#64748B",
                  flex: 1,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {s.description}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0", fontSize: 12 }}>
                <span style={{ color: "#64748B" }}>🔭 {s.findings_count} hallazgos</span>
                {s.last_scraped_at && (
                  <span style={{ color: "#94A3B8" }}>
                    · {new Date(s.last_scraped_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #F1F5F9", paddingTop: 12 }}>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary">
                      🔗 Abrir
                    </Button>
                  </a>
                )}
                {isEditor && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={scanningId === s.id}
                      disabled={!s.scrape_enabled}
                      onClick={() => scanOne(s)}
                    >
                      🛰️ Escanear
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      ✏️ Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDel(s)} style={{ color: "#EF4444" }}>
                      🗑️
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar fuente" : "Nueva fuente"}
        width={640}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? "Guardar cambios" : "Crear fuente"}
            </Button>
          </>
        }
      >
        <Input
          label="Titulo"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Input
          label="URL / enlace"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="https://..."
        />
        <div style={{ marginTop: -6, marginBottom: 14 }}>
          <Tooltip text="Descarga el enlace y muestra que informacion se extraeria (titulo, resumen y hallazgos potenciales), sin guardar nada.">
            <Button variant="secondary" size="sm" onClick={previewUrl} loading={previewing} disabled={!form.url.trim()}>
              <Icon name="compass" size={15} /> Previsualizar extraccion
            </Button>
          </Tooltip>
          {preview && (
            <div
              style={{
                marginTop: 10,
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${preview.ok ? "#BBF7D0" : "#FECACA"}`,
                background: preview.ok ? "#F0FDF4" : "#FEF2F2",
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon name={preview.ok ? "check" : "alert"} size={16} color={preview.ok ? "#16A34A" : "#DC2626"} />
                <strong style={{ color: preview.ok ? "#166534" : "#991B1B" }}>
                  {preview.ok ? `${preview.candidates_count} hallazgo(s) detectable(s)` : "No se pudo extraer"}
                </strong>
                {preview.content_type && (
                  <span style={{ fontSize: 11, color: "#64748B" }}>· {preview.content_type.split(";")[0]}</span>
                )}
              </div>
              <div style={{ color: "#475569" }}>{preview.message}</div>
              {preview.description && (
                <p style={{ color: "#64748B", marginTop: 8, fontStyle: "italic" }}>
                  “{preview.description.slice(0, 260)}{preview.description.length > 260 ? "…" : ""}”
                </p>
              )}
              {preview.candidates && preview.candidates.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#334155" }}>
                  {preview.candidates.slice(0, 6).map((c, idx) => (
                    <li key={idx} style={{ marginBottom: 3 }}>
                      <Badge>{c.technology_type}</Badge>{" "}
                      <span>{c.title.slice(0, 70)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Select
            label="Categoria"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input
            label="Ano"
            value={form.year}
            onChange={(e) => setForm({ ...form, year: e.target.value })}
          />
        </div>
        <Input
          label="Autores / entidad"
          value={form.authors}
          onChange={(e) => setForm({ ...form, authors: e.target.value })}
        />
        <Textarea
          label="Descripcion"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
        />
        <Input
          label="Relacion con IETS"
          value={form.relation_iets}
          onChange={(e) => setForm({ ...form, relation_iets: e.target.value })}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Input
            label="Idioma"
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value })}
          />
          <Input
            label="Tipo de recurso"
            value={form.resource_type}
            onChange={(e) => setForm({ ...form, resource_type: e.target.value })}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Input
            label="Estado del enlace"
            value={form.link_status}
            onChange={(e) => setForm({ ...form, link_status: e.target.value })}
          />
          <Input
            label="Etiquetas (coma)"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginTop: 6 }}>
          <input
            type="checkbox"
            checked={form.scrape_enabled}
            onChange={(e) => setForm({ ...form, scrape_enabled: e.target.checked })}
            style={{ width: 18, height: 18 }}
          />
          Habilitar vigilancia (web scraping) de esta fuente
        </label>
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={doDelete}
        loading={deleting}
        title="Eliminar fuente"
        message={`Se eliminara "${confirmDel?.title}" y todos sus hallazgos asociados. Esta accion no se puede deshacer.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
