import { useCallback, useEffect, useMemo, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { Card, SectionTitle } from "./Card";
import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import { Input } from "./Field";
import { LoadingBlock } from "./Spinner";
import { PERM } from "../constants/methodology";

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
      toast.error(apiError(e, "No se pudieron cargar los parametros metodologicos"));
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
      toast.error("El valor no puede quedar vacio");
      return;
    }
    setSavingKey(param.key);
    try {
      const { data } = await api.put(`/methodology/params/${param.key}`, { value });
      setParams((prev) => prev.map((p) => (p.key === data.key ? data : p)));
      toast.success(`${param.key} actualizado a ${data.value}`);
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar el parametro"));
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
      toast.error(apiError(e, "No se pudo actualizar el catalogo"));
    }
  };

  const dirty = useMemo(
    () => params.filter((p) => String(draft[p.key] ?? "") !== String(p.value)).map((p) => p.key),
    [params, draft]
  );

  if (loading) return <LoadingBlock label="Cargando parametros metodologicos..." />;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <SectionTitle
          right={<Badge tone={editable ? "info" : "default"}>{editable ? "Editable" : "Solo lectura"}</Badge>}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="sliders" size={18} /> Parametros metodologicos
          </span>
        </SectionTitle>

        <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 16 }}>
          Umbrales que gobiernan calculos oficiales. Se aplican de inmediato a los ciclos abiertos;
          los ciclos cerrados conservan congelado el resultado que obtuvieron bajo los valores anteriores.
          Cada cambio queda registrado en la bitacora con autor y valor previo.
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
                <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3 }}>{p.description}</div>
              </div>
              <Input
                value={draft[p.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                disabled={!editable}
                inputMode={p.value_type === "int" ? "numeric" : "text"}
                style={{ marginBottom: 0, textAlign: "center", fontWeight: 700 }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => saveParam(p)}
                loading={savingKey === p.key}
                disabled={!editable || !dirty.includes(p.key)}
              >
                Guardar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="dash-grid">
        <CatalogCard
          title="Clusteres de salud"
          hint="Taxonomia obligatoria de la especificacion. Desactivar un cluster lo retira de las nuevas clasificaciones sin alterar las tecnologias que ya lo tienen."
          items={clusters}
          editable={editable}
          onToggle={(item) => toggleCatalog("cluster", item)}
        />
        <CatalogCard
          title="Tipologias tecnologicas"
          hint="Las siete tipologias de la especificacion. Los cuatro tipos heredados se mapean automaticamente."
          items={types}
          editable={editable}
          onToggle={(item) => toggleCatalog("type", item)}
        />
      </div>

      <Card>
        <SectionTitle right={<Badge tone="info">{`v${criteria[0]?.version ?? 1}`}</Badge>}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="list" size={18} /> Matriz oficial de priorizacion
          </span>
        </SectionTitle>

        <p style={{ fontSize: 13, color: "#64748B", marginTop: -6, marginBottom: 16 }}>
          Los enunciados se almacenan versionados, no como literales en codigo: un ajuste del Manual
          Metodologico no obliga a desplegar, y cada calificacion emitida conserva la version bajo la
          que se respondio.
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
                  {c.auto_prefill && " · con sugerencia automatica"}
                  {c.source_reference && ` · ${c.source_reference}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CatalogCard({ title, hint, items, editable, onToggle }) {
  const active = items.filter((i) => i.is_active).length;
  return (
    <Card>
      <SectionTitle right={<Badge tone="info">{`${active} de ${items.length} activos`}</Badge>}>
        {title}
      </SectionTitle>
      <p style={{ fontSize: 12.5, color: "#64748B", marginTop: -6, marginBottom: 14 }}>{hint}</p>

      <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => (
          <div
            key={item.id}
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
            <Tooltip text={item.is_active ? "Retirar de nuevas clasificaciones" : "Volver a habilitar"}>
              <Button
                size="sm"
                variant={item.is_active ? "secondary" : "success"}
                onClick={() => onToggle(item)}
                disabled={!editable}
              >
                {item.is_active ? "Desactivar" : "Activar"}
              </Button>
            </Tooltip>
          </div>
        ))}
      </div>
    </Card>
  );
}
