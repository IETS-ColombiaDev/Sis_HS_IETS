import { Fragment, useCallback, useEffect, useState } from "react";
import api, { apiError } from "../api/client";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { Input, Select } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";

// Debe cubrir `audit.AUDITED_MODELS` mas los eventos de negocio. Una entidad
// ausente aqui se registra igual, pero no se puede filtrar desde la pantalla.
const ENTITY_LABELS = {
  users: "Usuarios",
  sources: "Fuentes",
  findings: "Senales capturadas",
  technologies: "Tecnologias",
  cycles: "Ciclos",
  cycle_technologies: "Tecnologia en ciclo",
  priority_scores: "Calificaciones P1-P6",
  priority_criteria: "Criterios de priorizacion",
  clusters: "Clusteres de salud",
  tech_types: "Tipologias tecnologicas",
  methodology_params: "Parametros metodologicos",
  recommendations: "Recomendaciones",
  auth: "Autenticacion",
};

const ACTION_TONE = {
  create: "priorizada",
  update: "asignada_a_ciclo",
  delete: "error",
};

const PAGE_SIZE = 50;

function ValueDiff({ oldValue, newValue }) {
  const keys = [...new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})])];
  if (keys.length === 0) return null;
  return (
    <table className="audit-diff">
      <tbody>
        {keys.map((key) => (
          <tr key={key}>
            <th>{key}</th>
            <td className="audit-diff-old">{format(oldValue?.[key])}</td>
            <td className="audit-diff-new">{format(newValue?.[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function format(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function Audit() {
  const [page, setPage] = useState({ items: [], total: 0, offset: 0 });
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState({ entity_type: "", action: "", user_email: "" });
  const [offset, setOffset] = useState(0);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset };
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v;
      });
      const { data } = await api.get("/audit", { params });
      setPage(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudo cargar la bitacora"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, offset]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/audit/actions")
      .then(({ data }) => setActions(data))
      .catch(() => {});
  }, []);

  const setFilter = (key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <PageHeader
        title="Bitacora de auditoria"
        subtitle="Registro inmutable y de solo insercion. Cada cambio guarda usuario, IP, fecha UTC y los valores antes y despues. El motor de base de datos rechaza cualquier intento de modificarla o borrarla."
      />

      <Card style={{ marginBottom: 18 }} padding={16}>
        <div className="audit-filters">
          <Select
            value={filters.entity_type}
            onChange={(e) => setFilter("entity_type", e.target.value)}
            style={{ marginBottom: 0 }}
          >
            <option value="">Todas las entidades</option>
            {Object.entries(ENTITY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={filters.action}
            onChange={(e) => setFilter("action", e.target.value)}
            style={{ marginBottom: 0 }}
          >
            <option value="">Todas las acciones</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Filtrar por correo del usuario..."
            value={filters.user_email}
            onChange={(e) => setFilter("user_email", e.target.value)}
            style={{ marginBottom: 0 }}
          />
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label="Cargando bitacora..." />
      ) : page.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗒️"
            title="Sin registros"
            message="No hay eventos que coincidan con los filtros aplicados."
          />
        </Card>
      ) : (
        <>
          <Card padding={0}>
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Fecha (UTC)</th>
                  <th>Usuario</th>
                  <th>Entidad</th>
                  <th>Accion</th>
                  <th>IP</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr>
                      <td className="audit-date">
                        {new Date(entry.occurred_at).toLocaleString()}
                      </td>
                      <td>
                        <div className="audit-user">{entry.user_email || "sistema"}</div>
                        {entry.user_role && (
                          <div className="audit-role">{entry.user_role.replace("_", " ")}</div>
                        )}
                      </td>
                      <td>
                        <div>{ENTITY_LABELS[entry.entity_type] || entry.entity_type}</div>
                        <div className="audit-entity-id">#{entry.entity_id}</div>
                      </td>
                      <td>
                        <Badge tone={ACTION_TONE[entry.action] || "info"}>{entry.action}</Badge>
                      </td>
                      <td className="audit-ip">{entry.ip_address || "—"}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        >
                          {expanded === entry.id ? "Ocultar" : "Ver cambios"}
                        </Button>
                      </td>
                    </tr>
                    {expanded === entry.id && (
                      <tr>
                        <td colSpan={6} className="audit-detail">
                          <div className="audit-detail-head">
                            <span>{entry.request_path || "Sin ruta"}</span>
                            <span>Peticion {entry.request_id || "—"}</span>
                          </div>
                          <div className="audit-diff-legend">
                            <span>Campo</span>
                            <span>Antes</span>
                            <span>Despues</span>
                          </div>
                          <ValueDiff oldValue={entry.old_value} newValue={entry.new_value} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="audit-pager">
            <span>
              {offset + 1} a {Math.min(offset + PAGE_SIZE, page.total)} de {page.total} registros
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Anteriores
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset + PAGE_SIZE >= page.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Siguientes
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
