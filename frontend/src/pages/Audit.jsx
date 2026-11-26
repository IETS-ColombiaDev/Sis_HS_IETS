import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import api, { apiError } from "../api/client";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import { GLOSSARY } from "../constants/glossary";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { Input, Select } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import Modal from "../components/Modal";
import InfoTip from "../components/InfoTip";
import { t, intlLocale } from "../i18n";

// Debe cubrir `audit.AUDITED_MODELS` mas los eventos de negocio. Una entidad
// ausente aqui se registra igual, pero no se puede filtrar desde la pantalla.
const ENTITY_LABELS = {
  users: t("Usuarios"),
  sources: t("Fuentes"),
  findings: t("Señales capturadas"),
  technologies: t("Tecnologías"),
  cycles: t("Ciclos"),
  cycle_technologies: t("Tecnología en ciclo"),
  priority_scores: t("Calificaciones P1-P6"),
  priority_criteria: t("Criterios de priorización"),
  clusters: t("Clústeres de salud"),
  tech_types: t("Tipologías tecnológicas"),
  methodology_params: t("Parámetros metodológicos"),
  recommendations: t("Recomendaciones"),
  auth: t("Autenticación"),
  notes: t("Notas"),
  submissions: t("Postulaciones"),
  ingest_jobs: t("Trabajos de ingesta"),
  scheduled_runs: t("Tareas programadas"),
  merge_proposals: t("Propuestas de fusión"),
  novelty_assessments: t("Verificaciones de novedad"),
  evaluation_docs: t("Informes de evaluación"),
  bulletins: t("Boletines"),
};

const ACTION_TONE = {
  create: "priorizada",
  update: "asignada_a_ciclo",
  delete: "error",
};

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { entity_type: "", entity_id: "", action: "", user_email: "", since: "", until: "" };

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
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function Audit() {
  const [page, setPage] = useState({ items: [], total: 0, offset: 0 });
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [emailDraft, setEmailDraft] = useState("");
  const [entities, setEntities] = useState([]);
  const [offset, setOffset] = useState(0);
  const [trail, setTrail] = useState(null);
  const debounce = useRef(null);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset };
      Object.entries(filters).forEach(([k, v]) => {
        if (!v) return;
        if (k === "since") params.since = `${v}T00:00:00`;
        else if (k === "until") params.until = `${v}T23:59:59`;
        else params[k] = v;
      });
      const { data } = await api.get("/audit", { params });
      setPage(data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cargar la bitácora")));
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
    api
      .get("/audit/entities")
      .then(({ data }) => setEntities(data))
      .catch(() => {});
  }, []);

  // El correo filtra al dejar de escribir, no en cada tecla.
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setFilters((prev) => (prev.user_email === emailDraft.trim() ? prev : { ...prev, user_email: emailDraft.trim() }));
      setOffset(0);
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [emailDraft]);

  const openTrail = async (entry) => {
    setTrail({ entry, items: null });
    try {
      const { data } = await api.get(`/audit/entity/${encodeURIComponent(entry.entity_type)}/${encodeURIComponent(entry.entity_id)}`);
      setTrail({ entry, items: data });
    } catch (e) {
      toast.error(apiError(e, t("No se pudo reconstruir la vida de la entidad")));
      setTrail(null);
    }
  };

  const entityOptions = [...new Set([...Object.keys(ENTITY_LABELS), ...entities])];
  const hasFilters = Object.values(filters).some(Boolean);

  const setFilter = (key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      <PageHeader
        title={t("Bitácora de auditoría")}
        titleHint={GLOSSARY.bitacora}
        subtitle={t("Registro inmutable y de solo inserción. Cada cambio guarda usuario, IP, fecha UTC y los valores antes y después. El motor de base de datos rechaza cualquier intento de modificarla o borrarla.")}
      />

      <Card style={{ marginBottom: 18 }} padding={16}>
        <div className="audit-filters" style={{ flexWrap: "wrap" }}>
          <Select
            id="audit-entity"
            label={t("Entidad")}
            aria-label={t("Filtrar por entidad")}
            hint={GLOSSARY.fb_audit_entidad}
            value={filters.entity_type}
            onChange={(e) => setFilter("entity_type", e.target.value)}
            style={{ marginBottom: 0 }}
          >
            <option value="">{t("Todas las entidades")}</option>
            {entityOptions.map((code) => (
              <option key={code} value={code}>
                {ENTITY_LABELS[code] || code}
              </option>
            ))}
          </Select>
          <Input
            id="audit-entity-id"
            label={t("Id")}
            aria-label={t("Identificador de la entidad")}
            placeholder={t("Id de la entidad (ej. 42)")}
            value={filters.entity_id}
            onChange={(e) => setFilter("entity_id", e.target.value.trim())}
            style={{ marginBottom: 0 }}
          />
          <Select
            id="audit-action"
            label={t("Acción")}
            hint={GLOSSARY.fb_audit_accion}
            aria-label={t("Filtrar por acción")}
            value={filters.action}
            onChange={(e) => setFilter("action", e.target.value)}
            style={{ marginBottom: 0 }}
          >
            <option value="">{t("Todas las acciones")}</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Input
            id="audit-email"
            label={t("Usuario")}
            aria-label={t("Filtrar por correo")}
            placeholder={t("Filtrar por correo del usuario...")}
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            style={{ marginBottom: 0 }}
          />
          <Input id="audit-since" label={t("Desde")} aria-label={t("Desde")} type="date" value={filters.since} onChange={(e) => setFilter("since", e.target.value)} style={{ marginBottom: 0 }} />
          <Input id="audit-until" label={t("Hasta")} aria-label={t("Hasta")} type="date" value={filters.until} onChange={(e) => setFilter("until", e.target.value)} style={{ marginBottom: 0 }} />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setEmailDraft(""); setOffset(0); }}>
              {t("Limpiar filtros")}
            </Button>
          )}
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label={t("Cargando bitácora...")} />
      ) : page.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗒️"
            title={t("Sin registros")}
            message={t("No hay eventos que coincidan con los filtros aplicados.")}
          />
        </Card>
      ) : (
        <>
          <Card padding={0}>
            <div style={{ overflowX: "auto" }}>
            <table className="audit-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>{t("Fecha")}</th>
                  <th>{t("Usuario")}</th>
                  <th>{t("Entidad")} <InfoTip text={GLOSSARY.fb_audit_entidad} /></th>
                  <th>{t("Acción")} <InfoTip text={GLOSSARY.fb_audit_accion} /></th>
                  <th>IP <InfoTip text={GLOSSARY.fb_audit_ip} /></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr>
                      <td className="audit-date">
                        {new Date(entry.occurred_at).toLocaleString(intlLocale())}
                      </td>
                      <td>
                        <div className="audit-user">{entry.user_email || t("sistema")}</div>
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
                      <td className="audit-ip">{entry.ip_address || "-"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                        >
                          {expanded === entry.id ? t("Ocultar") : t("Ver cambios")}
                        </Button>
                        <Button variant="ghost" size="sm" title={GLOSSARY.fb_audit_vida} onClick={() => openTrail(entry)}>
                          {t("Vida")}
                        </Button>
                      </td>
                    </tr>
                    {expanded === entry.id && (
                      <tr>
                        <td colSpan={6} className="audit-detail">
                          <div className="audit-detail-head">
                            <span>{entry.request_path || t("Sin ruta")}</span>
                            <span>{t("Petición {id}", { id: entry.request_id || "-" })}</span>
                          </div>
                          <div className="audit-diff-legend">
                            <span>{t("Campo")}</span>
                            <span>{t("Antes")}</span>
                            <span>{t("Después")}</span>
                          </div>
                          <ValueDiff oldValue={entry.old_value} newValue={entry.new_value} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
          </Card>

          <div className="audit-pager">
            <span>
              {t("{desde} a {hasta} de {total} registros", {
                desde: offset + 1,
                hasta: Math.min(offset + PAGE_SIZE, page.total),
                total: page.total,
              })}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t("Anteriores")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset + PAGE_SIZE >= page.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t("Siguientes")}
              </Button>
            </div>
          </div>
        </>
      )}
      <Modal
        open={!!trail}
        onClose={() => setTrail(null)}
        title={
          trail
            ? t("Vida de {entidad} #{id}", {
                entidad: ENTITY_LABELS[trail.entry.entity_type] || trail.entry.entity_type,
                id: trail.entry.entity_id,
              })
            : ""
        }
        width={720}
      >
        {trail && !trail.items && <LoadingBlock label={t("Reconstruyendo la historia...")} />}
        {trail?.items && (
          <>
            <p style={{ fontSize: 13, color: "#64748B", marginTop: 0 }}>{GLOSSARY.fb_audit_vida} {t("{n} evento(s).", { n: trail.items.length })}</p>
            <ol className="fb-trail" data-testid="audit-trail">
              {trail.items.map((ev) => (
                <li key={ev.id}>
                  <div>
                    <strong>{ev.action}</strong> · {new Date(ev.occurred_at).toLocaleString(intlLocale())} · {ev.user_email || t("proceso interno")}
                  </div>
                  <ValueDiff oldValue={ev.old_value} newValue={ev.new_value} />
                </li>
              ))}
            </ol>
          </>
        )}
      </Modal>
    </div>
  );
}
