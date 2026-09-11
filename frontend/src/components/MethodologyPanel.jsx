import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { Card, SectionTitle } from "./Card";
import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import HintButton from "./HintButton";
import InfoTip from "./InfoTip";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { Input, Textarea } from "./Field";
import { LoadingBlock } from "./Spinner";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";

const EMPTY_ITEM = { code: "", name: "", description: "", keywords: "", sort_order: 0 };

/**
 * Gobierno metodologico: umbrales, taxonomias y enunciados de la matriz.
 *
 * La especificacion advierte que clusteres, tipologias y umbrales pueden variar
 * tras la referenciacion, por lo que viven en base de datos. Este panel es la
 * puerta para que la coordinacion metodologica los ajuste sin desplegar y sin
 * pedirle a nadie que llame la API a mano. Todo cambio queda en la bitacora.
 */
export default function MethodologyPanel() {
  const toast = useToast();
  const { can } = useAuth();
  const editable = can(PERM.CATALOG_WRITE);

  const [loading, setLoading] = useState(true);
  const [params, setParams] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [types, setTypes] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [draft, setDraft] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [itemModal, setItemModal] = useState(null); // { kind, item|null }
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [itemError, setItemError] = useState("");
  const [itemSaving, setItemSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c, t, cr] = await Promise.all([
        api.get("/methodology/params"),
        api.get("/clusters", { params: { include_inactive: true } }),
        api.get("/tech-types", { params: { include_inactive: true } }),
        api.get("/priority/criteria"),
      ]);
      setParams(p.data);
      setClusters(c.data);
      setTypes(t.data);
      setCriteria(cr.data);
      setDraft(Object.fromEntries(p.data.map((x) => [x.key, x.value])));
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar los parámetros metodológicos"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveParam = async (param) => {
    const value = String(draft[param.key] ?? "").trim();
    if (!value) {
      toast.error("El valor no puede quedar vacío");
      return;
    }
    setSavingKey(param.key);
    try {
      const { data } = await api.put(`/methodology/params/${param.key}`, { value });
      setParams((prev) => prev.map((p) => (p.key === data.key ? data : p)));
      toast.success(`${param.key} actualizado a ${data.value}`);
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar el parámetro"));
      setDraft((d) => ({ ...d, [param.key]: param.value }));
    } finally {
      setSavingKey("");
    }
  };

  const toggleCatalog = async (kind, item) => {
    const path = kind === "cluster" ? "clusters" : "tech-types";
    try {
      const { data } = await api.put(`/${path}/${item.id}`, { is_active: !item.is_active });
      const setter = kind === "cluster" ? setClusters : setTypes;
      setter((prev) => prev.map((x) => (x.id === data.id ? data : x)));
      toast.success(`${data.name}: ${data.is_active ? "activado" : "desactivado"}`);
    } catch (e) {
      toast.error(apiError(e, "No se pudo actualizar el catálogo"));
    }
  };

  const pathFor = (kind) => (kind === "cluster" ? "clusters" : "tech-types");

  const openItem = (kind, item = null) => {
    setItemError("");
    setItemForm(
      item
        ? { code: item.code, name: item.name, description: item.description || "", keywords: (item.keywords || []).join(", "), sort_order: item.sort_order || 0 }
        : EMPTY_ITEM
    );
    setItemModal({ kind, item });
  };

  const saveItem = async () => {
    setItemError("");
    const { kind, item } = itemModal;
    if (!itemForm.name.trim()) {
      setItemError("El nombre es obligatorio.");
      return;
    }
    if (!item && !/^[a-z0-9][a-z0-9_]{1,59}$/.test(itemForm.code.trim())) {
      setItemError("El código debe tener entre 2 y 60 caracteres: minúsculas, números y guion bajo.");
      return;
    }
    const payload = {
      name: itemForm.name.trim(),
      description: itemForm.description,
      keywords: itemForm.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      sort_order: Number(itemForm.sort_order) || 0,
    };
    setItemSaving(true);
    try {
      const setter = kind === "cluster" ? setClusters : setTypes;
      if (item) {
        const { data } = await api.put(`/${pathFor(kind)}/${item.id}`, payload);
        setter((prev) => prev.map((x) => (x.id === data.id ? data : x)));
        toast.success(`${data.name} actualizado`);
      } else {
        const { data } = await api.post(`/${pathFor(kind)}`, { ...payload, code: itemForm.code.trim() });
        setter((prev) => [...prev, data]);
        toast.success(`${data.name} creado`);
      }
      setItemModal(null);
    } catch (e) {
      setItemError(apiError(e, "No se pudo guardar"));
    } finally {
      setItemSaving(false);
    }
  };

  const deleteItem = async () => {
    const { kind, item } = confirmDel;
    setDeleting(true);
    try {
      await api.delete(`/${pathFor(kind)}/${item.id}`);
      const setter = kind === "cluster" ? setClusters : setTypes;
      setter((prev) => prev.filter((x) => x.id !== item.id));
      toast.success(`${item.name} eliminado`);
      setConfirmDel(null);
    } catch (e) {
      toast.error(apiError(e, "No se pudo eliminar"));
      setConfirmDel(null);
    } finally {
      setDeleting(false);
    }
  };

  const dirty = useMemo(
    () => params.filter((p) => String(draft[p.key] ?? "") !== String(p.value)).map((p) => p.key),
    [params, draft]
  );

  if (loading) return <LoadingBlock label="Cargando parámetros metodológicos..." />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <SectionTitle
          right={<Badge tone={editable ? "info" : "default"}>{editable ? "Editable" : "Solo lectura"}</Badge>}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="sliders" size={18} /> Parámetros metodológicos
          </span>
        </SectionTitle>

        <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 16 }}>
          Umbrales que gobiernan cálculos oficiales. Se aplican de inmediato a los ciclos abiertos;
          los ciclos cerrados conservan congelado el resultado que obtuvieron bajo los valores anteriores.
          Cada cambio queda registrado en la bitácora con autor y valor previo.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {params.map((p) => (
            <div
              key={p.key}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 120px auto",
                gap: 12,
                alignItems: "center",
                padding: "10px 12px",
                background: dirty.includes(p.key) ? "#FFFBEB" : "#F8FAFC",
                border: `1px solid ${dirty.includes(p.key) ? "#FDE68A" : "#E2E8F0"}`,
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <code style={{ fontSize: 12.5, fontWeight: 700, color: "#0F172A" }}>{p.key}</code>
                <InfoTip text={`${p.description || ""} ${GLOSSARY.fb_param}`.trim()} label={`Qué es ${p.key}`} />
                <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3 }}>{p.description}</div>
              </div>
              <Input
                aria-label={`Valor de ${p.key}`}
                value={draft[p.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                disabled={!editable}
                inputMode={p.value_type === "int" ? "numeric" : "text"}
                style={{ marginBottom: 0, textAlign: "center", fontWeight: 700 }}
              />
              <HintButton
                size="sm"
                variant="secondary"
                onClick={() => saveParam(p)}
                loading={savingKey === p.key}
                disabled={!editable || !dirty.includes(p.key)}
                hint="Guardar el nuevo valor. Queda en la bitácora."
                disabledHint={!editable ? "Solo el superadministrador cambia parámetros (permiso catalog:write)." : "Cambie el valor para poder guardarlo."}
              >
                Guardar
              </HintButton>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="dash-grid">
        <CatalogCard
          title="Clústeres de salud"
          hint="Taxonomía obligatoria de la especificación. Desactivar un clúster lo retira de las nuevas clasificaciones sin alterar las tecnologías que ya lo tienen."
          items={clusters}
          editable={editable}
          onToggle={(item) => toggleCatalog("cluster", item)}
          onCreate={() => openItem("cluster")}
          onEdit={(item) => openItem("cluster", item)}
          onDelete={(item) => setConfirmDel({ kind: "cluster", item })}
        />
        <CatalogCard
          title="Tipologías tecnológicas"
          hint="Las siete tipologías de la especificación. Los cuatro tipos heredados se mapean automáticamente."
          items={types}
          editable={editable}
          onToggle={(item) => toggleCatalog("type", item)}
          onCreate={() => openItem("type")}
          onEdit={(item) => openItem("type", item)}
          onDelete={(item) => setConfirmDel({ kind: "type", item })}
        />
      </div>

      <Card>
        <SectionTitle right={<Badge tone="info">{`v${criteria[0]?.version ?? 1}`}</Badge>}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="list" size={18} /> Matriz oficial de priorización
          </span>
        </SectionTitle>

        <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 16 }}>
          Los enunciados se almacenan versionados, no como literales en código: un ajuste del Manual
          Metodológico no obliga a desplegar, y cada calificación emitida conserva la versión bajo la
          que se respondió.
        </p>

        <div style={{ display: "grid", gap: 8 }}>
          {criteria.map((c) => (
            <div
              key={c.code}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "10px 12px",
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
              }}
            >
              <Badge tone="info" style={{ minWidth: 34, textAlign: "center" }}>
                {c.code}
              </Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: "#0F172A" }}>{c.prompt}</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                  Califica: {c.role_scope}
                  {c.auto_prefill && " · con sugerencia automática"}
                  {c.source_reference && ` · ${c.source_reference}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Modal
        open={!!itemModal}
        onClose={() => setItemModal(null)}
        title={`${itemModal?.item ? "Editar" : "Nuevo"} ${itemModal?.kind === "cluster" ? "clúster de salud" : "tipología tecnológica"}`}
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setItemModal(null)} disabled={itemSaving}>Cancelar</Button>
            <Button onClick={saveItem} loading={itemSaving}>Guardar</Button>
          </>
        }
      >
        {itemError && <p className="public-submit-error" role="alert">{itemError}</p>}
        <Input
          id="catalog-code"
          label="Código"
          hint={GLOSSARY.fb_cluster_codigo}
          required
          value={itemForm.code}
          disabled={Boolean(itemModal?.item)}
          onChange={(e) => setItemForm({ ...itemForm, code: e.target.value.toLowerCase() })}
          placeholder="ej. enf_respiratorias"
        />
        <Input id="catalog-name" label="Nombre" required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
        <Textarea id="catalog-description" label="Descripción" rows={2} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
        <Input id="catalog-keywords" label="Palabras clave" hint={GLOSSARY.fb_palabras_clave} value={itemForm.keywords} onChange={(e) => setItemForm({ ...itemForm, keywords: e.target.value })} placeholder="asma, epoc, respiratorio" />
        <Input id="catalog-order" label="Orden" hint="Posición en las listas: menor aparece primero." type="number" value={itemForm.sort_order} onChange={(e) => setItemForm({ ...itemForm, sort_order: e.target.value })} style={{ maxWidth: 140 }} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={deleteItem}
        loading={deleting}
        title="Eliminar del catálogo"
        message={`Se eliminará "${confirmDel?.item?.name}". Solo es posible si fue agregado localmente y ninguna tecnología lo usa; si no, desactívelo.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}

function CatalogCard({ title, hint, items, editable, onToggle, onCreate, onEdit, onDelete }) {
  const active = items.filter((i) => i.is_active).length;
  const readOnly = "Solo el superadministrador edita los catálogos (permiso catalog:write).";
  return (
    <Card>
      <SectionTitle
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge tone="info">{`${active} de ${items.length} activos`}</Badge>
            {onCreate && (
              <HintButton size="sm" variant="outline" disabled={!editable} disabledHint={readOnly} hint="Agregar un elemento al catálogo" onClick={onCreate}>
                + Agregar
              </HintButton>
            )}
          </div>
        }
      >
        {title}
      </SectionTitle>
      <p style={{ fontSize: 12.5, color: "#64748B", marginTop: -6, marginBottom: 14 }}>{hint}</p>

      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <div
            key={item.id}
            data-testid={`catalog-item-${item.code}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #E2E8F0",
              background: item.is_active ? "#fff" : "#F8FAFC",
              opacity: item.is_active ? 1 : 0.6,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{item.name}</div>
              <code style={{ fontSize: 11, color: "#94A3B8" }}>{item.code}</code>
            </div>
            {onEdit && (
              <HintButton size="sm" variant="ghost" disabled={!editable} disabledHint={readOnly} hint="Editar nombre, descripción y palabras clave" onClick={() => onEdit(item)} aria-label={`Editar ${item.name}`}>
                Editar
              </HintButton>
            )}
            <HintButton
              size="sm"
              variant={item.is_active ? "secondary" : "success"}
              onClick={() => onToggle(item)}
              disabled={!editable}
              disabledHint={readOnly}
              hint={item.is_active ? "Retirar de nuevas clasificaciones sin tocar las tecnologías que ya lo tienen" : "Volver a habilitar"}
            >
              {item.is_active ? "Desactivar" : "Activar"}
            </HintButton>
            {onDelete && (
              <HintButton size="sm" variant="ghost" style={{ color: editable ? "#DC2626" : undefined }} disabled={!editable} disabledHint={readOnly} hint="Eliminar: solo lo agregado localmente y sin uso" onClick={() => onDelete(item)} aria-label={`Eliminar ${item.name}`}>
                ✕
              </HintButton>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
