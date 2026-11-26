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
import { forgetScreeningThreshold } from "../scan/useScreeningThreshold";
import { PARAM_GROUPS, PARAM_INFO as PARAM_INFO_ORDER, paramInfo } from "../constants/paramInfo";
import { t, tr, ts } from "../i18n";

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
  const [paramQuery, setParamQuery] = useState("");
  const [itemModal, setItemModal] = useState(null); // { kind, item|null }
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [itemError, setItemError] = useState("");
  const [itemSaving, setItemSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c, ty, cr] = await Promise.all([
        api.get("/methodology/params"),
        api.get("/clusters", { params: { include_inactive: true } }),
        api.get("/tech-types", { params: { include_inactive: true } }),
        api.get("/priority/criteria"),
      ]);
      setParams(p.data);
      setClusters(c.data);
      setTypes(ty.data);
      setCriteria(cr.data);
      setDraft(Object.fromEntries(p.data.map((x) => [x.key, x.value])));
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron cargar los parámetros metodológicos")));
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
      toast.error(t("El valor no puede quedar vacío"));
      return;
    }
    setSavingKey(param.key);
    try {
      const { data } = await api.put(`/methodology/params/${param.key}`, { value });
      setParams((prev) => prev.map((p) => (p.key === data.key ? data : p)));
      if (param.key === "screening.queue_threshold") forgetScreeningThreshold();
      toast.success(
        param.key.startsWith("screening.")
          ? t("{name}: {value}. Se recalculó el cribado de todas las señales.", { name: paramInfo(param.key).title || param.key, value: data.value })
          : t("{name} actualizado a {value}", { name: paramInfo(param.key).title || param.key, value: data.value })
      );
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar el parámetro")));
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
      toast.success(data.is_active ? t("{name}: activado", { name: ts(data.name) }) : t("{name}: desactivado", { name: ts(data.name) }));
    } catch (e) {
      toast.error(apiError(e, t("No se pudo actualizar el catálogo")));
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
      setItemError(t("El nombre es obligatorio."));
      return;
    }
    if (!item && !/^[a-z0-9][a-z0-9_]{1,59}$/.test(itemForm.code.trim())) {
      setItemError(t("El código debe tener entre 2 y 60 caracteres: minúsculas, números y guion bajo."));
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
        toast.success(t("{name} actualizado", { name: ts(data.name) }));
      } else {
        const { data } = await api.post(`/${pathFor(kind)}`, { ...payload, code: itemForm.code.trim() });
        setter((prev) => [...prev, data]);
        toast.success(t("{name} creado", { name: ts(data.name) }));
      }
      setItemModal(null);
    } catch (e) {
      setItemError(apiError(e, t("No se pudo guardar")));
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
      toast.success(t("{name} eliminado", { name: ts(item.name) }));
      setConfirmDel(null);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo eliminar")));
      setConfirmDel(null);
    } finally {
      setDeleting(false);
    }
  };

  const dirty = useMemo(
    () => params.filter((p) => String(draft[p.key] ?? "") !== String(p.value)).map((p) => p.key),
    [params, draft]
  );

  const savedValues = useMemo(() => Object.fromEntries(params.map((p) => [p.key, p.value])), [params]);

  // Parámetros agrupados por módulo, con búsqueda por nombre, explicación u origen.
  const groupedParams = useMemo(() => {
    const q = paramQuery.trim().toLowerCase();
    const match = (p) => {
      if (!q) return true;
      const info = paramInfo(p.key);
      return [p.key, p.description, info.title, info.help, info.origin].some((text) => (text || "").toLowerCase().includes(q));
    };
    const byGroup = {};
    params.filter(match).forEach((p) => {
      const g = paramInfo(p.key).group;
      (byGroup[g] = byGroup[g] || []).push(p);
    });
    const order = Object.keys(PARAM_INFO_ORDER);
    return PARAM_GROUPS.filter((g) => byGroup[g.id]?.length).map((g) => {
      const items = byGroup[g.id].sort((a, b) => (order.indexOf(a.key) + 1 || 999) - (order.indexOf(b.key) + 1 || 999));
      // Si todo el grupo comparte el mismo origen, se explica una vez arriba y no en cada fila.
      const origins = [...new Set(items.map((p) => paramInfo(p.key).origin).filter(Boolean))];
      const shared = origins.length === 1 && items.length > 1 ? origins[0] : "";
      return { ...g, items, sharedOrigin: shared };
    });
  }, [params, paramQuery]);

  if (loading) return <LoadingBlock label={t("Cargando parámetros metodológicos...")} />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <SectionTitle
          right={<Badge tone={editable ? "info" : "default"}>{editable ? t("Editable") : t("Solo lectura")}</Badge>}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="sliders" size={18} /> {t("Parámetros del sistema")}
          </span>
        </SectionTitle>

        <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 12 }}>
          {tr(
            "Todo umbral, peso o tope que gobierna un cálculo se ajusta aquí, sin desplegar. Cada parámetro dice qué hace y <b>de dónde sale su valor</b>: la especificación técnica SI EAA, una decisión de la coordinación metodológica (las abiertas se marcan) o un valor técnico del sistema. Los cambios se aplican de inmediato; los ciclos cerrados conservan el resultado que obtuvieron. Cada cambio queda en la bitácora con autor y valor previo.",
            null,
            { b: (c) => <strong>{c}</strong> }
          )}
        </p>

        <div className="param-filter">
          <Input
            aria-label={t("Buscar parámetro")}
            placeholder={t("Buscar parámetro (p. ej. cribado, fuente, ciclo)…")}
            value={paramQuery}
            onChange={(e) => setParamQuery(e.target.value)}
            style={{ marginBottom: 0 }}
          />
        </div>

        {groupedParams.map((group) => (
          <section key={group.id} className="param-group" aria-labelledby={`param-group-${group.id}`}>
            <h4 id={`param-group-${group.id}`} className="param-group-title">
              <Icon name={group.icon} size={16} /> {group.title}
            </h4>
            {group.intro && <p className="param-group-intro">{group.intro}</p>}
            {group.sharedOrigin && (
              <p className="param-group-origin">
                <strong>{t("De dónde salen estos valores:")}</strong> {group.sharedOrigin}
              </p>
            )}
            {group.id === "screening" && <ScreeningFormula values={draft} saved={savedValues} />}
            <div style={{ display: "grid", gap: 10 }}>
              {group.items.map((p) => {
                const info = paramInfo(p.key);
                const isDirty = dirty.includes(p.key);
                return (
                  <div key={p.key} className={`param-row${isDirty ? " param-row--dirty" : ""}`}>
                    <div style={{ minWidth: 0 }}>
                      <div className="param-row-title">
                        {info.title || ts(p.description) || p.key}
                        {isDirty && <span className="param-dirty">{t("Sin guardar")}</span>}
                      </div>
                      {(info.help || (info.title && p.description)) && <p className="param-row-help">{info.help || ts(p.description)}</p>}
                      {info.origin && info.origin !== group.sharedOrigin && (
                        <p className="param-row-origin">
                          <strong>{t("De dónde sale:")}</strong> {info.origin}
                        </p>
                      )}
                      <code className="param-row-key">{p.key}</code>
                    </div>
                    <Input
                      aria-label={t("Valor de {name}", { name: info.title || p.key })}
                      value={draft[p.key] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                      disabled={!editable}
                      inputMode={p.value_type === "int" ? "numeric" : "text"}
                      style={{ marginBottom: 0, textAlign: info.text ? "left" : "center", fontWeight: info.text ? 500 : 700 }}
                    />
                    <HintButton
                      size="sm"
                      variant="secondary"
                      onClick={() => saveParam(p)}
                      loading={savingKey === p.key}
                      disabled={!editable || !isDirty}
                      hint={t("Guardar el nuevo valor. Queda en la bitácora.")}
                      disabledHint={!editable ? t("Solo el superadministrador cambia parámetros (permiso catalog:write).") : t("Cambie el valor para poder guardarlo.")}
                    >
                      {t("Guardar")}
                    </HintButton>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {groupedParams.length === 0 && <p className="muted">{t("Ningún parámetro coincide con la búsqueda.")}</p>}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="dash-grid">
        <CatalogCard
          title={t("Clústeres de salud")}
          hint={t("Taxonomía obligatoria de la especificación. Desactivar un clúster lo retira de las nuevas clasificaciones sin alterar las tecnologías que ya lo tienen.")}
          items={clusters}
          editable={editable}
          onToggle={(item) => toggleCatalog("cluster", item)}
          onCreate={() => openItem("cluster")}
          onEdit={(item) => openItem("cluster", item)}
          onDelete={(item) => setConfirmDel({ kind: "cluster", item })}
        />
        <CatalogCard
          title={t("Tipologías tecnológicas")}
          hint={t("Las siete tipologías de la especificación. Los cuatro tipos heredados se mapean automáticamente.")}
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
            <Icon name="list" size={18} /> {t("Matriz oficial de priorización")}
          </span>
        </SectionTitle>

        <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 16 }}>
          {t("Los enunciados se almacenan versionados, no como literales en código: un ajuste del Manual Metodológico no obliga a desplegar, y cada calificación emitida conserva la versión bajo la que se respondió.")}
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
                <div style={{ fontSize: 13, color: "#0F172A" }}>{ts(c.prompt)}</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                  {t("Califica: {scope}", { scope: ts(c.role_scope) })}
                  {c.auto_prefill && ` · ${t("con sugerencia automática")}`}
                  {c.source_reference && ` · ${ts(c.source_reference)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Modal
        open={!!itemModal}
        onClose={() => setItemModal(null)}
        title={
          itemModal?.kind === "cluster"
            ? itemModal?.item ? t("Editar clúster de salud") : t("Nuevo clúster de salud")
            : itemModal?.item ? t("Editar tipología tecnológica") : t("Nuevo tipología tecnológica")
        }
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setItemModal(null)} disabled={itemSaving}>{t("Cancelar")}</Button>
            <Button onClick={saveItem} loading={itemSaving}>{t("Guardar")}</Button>
          </>
        }
      >
        {itemError && <p className="public-submit-error" role="alert">{itemError}</p>}
        <Input
          id="catalog-code"
          label={t("Código")}
          hint={GLOSSARY.fb_cluster_codigo}
          required
          value={itemForm.code}
          disabled={Boolean(itemModal?.item)}
          onChange={(e) => setItemForm({ ...itemForm, code: e.target.value.toLowerCase() })}
          placeholder={t("ej. enf_respiratorias")}
        />
        <Input id="catalog-name" label={t("Nombre")} required value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
        <Textarea id="catalog-description" label={t("Descripción")} rows={2} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
        <Input id="catalog-keywords" label={t("Palabras clave")} hint={GLOSSARY.fb_palabras_clave} value={itemForm.keywords} onChange={(e) => setItemForm({ ...itemForm, keywords: e.target.value })} placeholder={t("asma, epoc, respiratorio")} />
        <Input id="catalog-order" label={t("Orden")} hint={t("Posición en las listas: menor aparece primero.")} type="number" value={itemForm.sort_order} onChange={(e) => setItemForm({ ...itemForm, sort_order: e.target.value })} style={{ maxWidth: 140 }} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={deleteItem}
        loading={deleting}
        title={t("Eliminar del catálogo")}
        message={t('Se eliminará "{name}". Solo es posible si fue agregado localmente y ninguna tecnología lo usa; si no, desactívelo.', { name: ts(confirmDel?.item?.name) })}
        confirmLabel={t("Eliminar")}
      />
    </div>
  );
}

function CatalogCard({ title, hint, items, editable, onToggle, onCreate, onEdit, onDelete }) {
  const active = items.filter((i) => i.is_active).length;
  const readOnly = t("Solo el superadministrador edita los catálogos (permiso catalog:write).");
  return (
    <Card>
      <SectionTitle
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge tone="info">{t("{n} de {total} activos", { n: active, total: items.length })}</Badge>
            {onCreate && (
              <HintButton size="sm" variant="outline" disabled={!editable} disabledHint={readOnly} hint={t("Agregar un elemento al catálogo")} onClick={onCreate}>
                {t("+ Agregar")}
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
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{ts(item.name)}</div>
              <code style={{ fontSize: 11, color: "#94A3B8" }}>{item.code}</code>
            </div>
            {onEdit && (
              <HintButton size="sm" variant="ghost" disabled={!editable} disabledHint={readOnly} hint={t("Editar nombre, descripción y palabras clave")} onClick={() => onEdit(item)} aria-label={t("Editar {name}", { name: ts(item.name) })}>
                {t("Editar")}
              </HintButton>
            )}
            <HintButton
              size="sm"
              variant={item.is_active ? "secondary" : "success"}
              onClick={() => onToggle(item)}
              disabled={!editable}
              disabledHint={readOnly}
              hint={item.is_active ? t("Retirar de nuevas clasificaciones sin tocar las tecnologías que ya lo tienen") : t("Volver a habilitar")}
            >
              {item.is_active ? t("Desactivar") : t("Activar")}
            </HintButton>
            {onDelete && (
              <HintButton size="sm" variant="ghost" style={{ color: editable ? "#DC2626" : undefined }} disabled={!editable} disabledHint={readOnly} hint={t("Eliminar: solo lo agregado localmente y sin uso")} onClick={() => onDelete(item)} aria-label={t("Eliminar {name}", { name: ts(item.name) })}>
                ✕
              </HintButton>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}


/** Fórmula del cribado con los valores vigentes (y los que se están editando). */
function ScreeningFormula({ values, saved }) {
  const v = (k) => values[`screening.${k}`] ?? saved[`screening.${k}`] ?? "";
  const n = (k) => Number(v(k)) || 0;
  const horizon = Math.max(n("points_inminente"), n("points_transicional"), n("points_emergente"));
  const max = horizon + n("points_tech_type") + Math.max(n("points_regulatory"), n("points_trial")) + n("points_area") + n("points_summary") + n("points_identified");
  const rows = [
    [t("Horizonte"), t("inminente +{inminente} · transicional +{transicional} · emergente +{emergente}", { inminente: v("points_inminente"), transicional: v("points_transicional"), emergente: v("points_emergente") })],
    [t("Tipo de tecnología"), t("+{points} si es {types}", { points: v("points_tech_type"), types: v("tech_types").split(",").map((s) => s.trim()).filter(Boolean).join(", ") })],
    [t("Madurez"), t("+{regulatory} si menciona hito regulatorio o fase III; si no, +{trial} si menciona fase II o ensayo", { regulatory: v("points_regulatory"), trial: v("points_trial") })],
    [t("Área terapéutica"), t("+{points} si la tiene", { points: v("points_area") })],
    [t("Resumen"), t("+{points} si tiene {chars} caracteres o más", { points: v("points_summary"), chars: v("summary_min_chars") })],
    [t("Tecnología identificada"), t("+{points} si está aparte del título", { points: v("points_identified") })],
  ];
  return (
    <div className="screening-formula" data-testid="screening-formula">
      <div className="screening-formula-head">
        <strong>{t("Cómo se calcula hoy")}</strong>
        <span className="muted">
          {max > 100
            ? t("Máximo alcanzable: {n} de 100 (las reglas suman {max}; se corta en 100) · destaque desde {threshold}", { n: Math.min(100, max), max, threshold: v("queue_threshold") })
            : t("Máximo alcanzable: {n} de 100 · destaque desde {threshold}", { n: Math.min(100, max), threshold: v("queue_threshold") })}
        </span>
      </div>
      <ul>
        {rows.map(([label, text]) => (
          <li key={label}>
            <strong>{label}:</strong> {text}
          </li>
        ))}
      </ul>
      <p className="muted" style={{ margin: 0 }}>
        {t("En la bandeja el orden suma además el bono de corroboración. El cribado no es el %P: la priorización oficial es la matriz P1-P6.")}
      </p>
    </div>
  );
}

