import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/Card";
import { GLOSSARY } from "../constants/glossary";
import Badge from "../components/Badge";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Icon from "../components/Icon";
import { Input, Select } from "../components/Field";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import Modal from "../components/Modal";
import InfoTip from "../components/InfoTip";
import { downloadFromApi } from "../utils/download";
import { fmtDateTime, t, ts, intlLocale } from "../i18n";
import "./audit.css";

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

const PAGE_SIZES = [25, 50, 100, 200];
const EMPTY_FILTERS = { entity_type: "", entity_id: "", action: "", user_email: "", since: "", until: "", request_id: "", q: "" };
// Nombre de cada filtro en la dirección de la página (enlace directo).
const URL_KEYS = { entity_type: "entidad", entity_id: "id", action: "accion", user_email: "usuario", since: "desde", until: "hasta", request_id: "peticion", q: "q" };

function isoDay(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function entityName(entry) {
  return ENTITY_LABELS[entry.entity_type] || ts(entry.entity_label) || entry.entity_type;
}

function format(value) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") {
    // Lo corto en una línea; lo largo, con sangría para poder leerlo.
    const flat = JSON.stringify(value);
    return flat.length <= 80 ? flat : JSON.stringify(value, null, 1);
  }
  return String(value);
}

function ValueDiff({ oldValue, newValue }) {
  const keys = [...new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})])];
  if (keys.length === 0) return <p className="au-nodiff">{t("Este registro no guarda valores: solo deja constancia de la acción.")}</p>;
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

/** Registros por día del filtro (hasta 14 días). */
function DayBars({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="au-days" role="img" aria-label={t("Registros por día")} data-testid="audit-days">
      {days.map((d) => {
        const date = new Date(`${d.date}T12:00:00`);
        return (
          <div key={d.date} className="au-day" title={`${date.toLocaleDateString(intlLocale(), { weekday: "long", day: "numeric", month: "short" })}: ${d.count}`}>
            <span className="au-day-track">
              <i style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }} />
            </span>
            <span className="au-day-label">{date.getDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Audit() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = useMemo(() => {
    const out = { ...EMPTY_FILTERS };
    Object.entries(URL_KEYS).forEach(([key, name]) => {
      out[key] = searchParams.get(name) || "";
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [page, setPage] = useState({ items: [], total: 0, offset: 0 });
  const [summary, setSummary] = useState(null);
  const [catalog, setCatalog] = useState({ actions: [], entities: [] });
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState(initial);
  const [emailDraft, setEmailDraft] = useState(initial.user_email);
  const [textDraft, setTextDraft] = useState(initial.q);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [trail, setTrail] = useState(null);
  const [exporting, setExporting] = useState(false);
  const debounce = useRef(null);
  const toast = useToast();

  const apiParams = useMemo(() => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (!v) return;
      if (k === "since") params.since = `${v}T00:00:00`;
      else if (k === "until") params.until = `${v}T23:59:59`;
      else params[k] = v;
    });
    return params;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, sum] = await Promise.all([
        api.get("/audit", { params: { ...apiParams, limit: pageSize, offset } }),
        api.get("/audit/summary", { params: apiParams }).catch(() => null),
      ]);
      setPage(data);
      if (sum) setSummary(sum.data);
    } catch (e) {
      toast.error(apiError(e, t("No se pudo cargar la bitácora")));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiParams, offset, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  // Los filtros viajan en la dirección: el enlace abre la misma consulta.
  useEffect(() => {
    const next = new URLSearchParams();
    Object.entries(URL_KEYS).forEach(([key, name]) => {
      if (filters[key]) next.set(name, filters[key]);
    });
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    api
      .get("/audit/catalog")
      .then(({ data }) => setCatalog(data))
      .catch(() => {});
    api
      .get("/audit/integrity")
      .then(({ data }) => setIntegrity(data))
      .catch(() => setIntegrity(null));
  }, []);

  // El correo y el texto filtran al dejar de escribir, no en cada tecla.
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setFilters((prev) => {
        const email = emailDraft.trim();
        const q = textDraft.trim();
        if (prev.user_email === email && prev.q === q) return prev;
        setOffset(0);
        return { ...prev, user_email: email, q };
      });
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [emailDraft, textDraft]);

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

  const entityCodes = [...new Set([...Object.keys(ENTITY_LABELS), ...catalog.entities.map((e) => e.code)])];
  const entityCount = Object.fromEntries(catalog.entities.map((e) => [e.code, e.count]));
  const entityServerLabel = Object.fromEntries(catalog.entities.map((e) => [e.code, e.label]));
  const hasFilters = Object.values(filters).some(Boolean);

  const setFilter = (key, value) => {
    setOffset(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setEmailDraft("");
    setTextDraft("");
    setOffset(0);
  };

  const setRange = (days) => {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - (days - 1));
    setOffset(0);
    setFilters((prev) => ({ ...prev, since: isoDay(from), until: isoDay(today) }));
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await downloadFromApi(api, "/audit/export", "bitacora_auditoria.csv", { params: apiParams });
      const total = Number(res.headers?.["x-total-count"]);
      if (Number.isFinite(total) && total > 10000) {
        toast.warning(t("El filtro tiene {total} registros: se descargaron los 10.000 más recientes. Acote las fechas para bajar el resto.", { total }));
      } else {
        toast.success(t("Bitácora descargada. La descarga quedó registrada."));
      }
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descargar la bitácora")));
    } finally {
      setExporting(false);
    }
  };

  const topAction = summary?.by_action?.[0];
  const topUser = summary?.by_user?.[0];

  return (
    <div>
      <PageHeader
        title={t("Bitácora de auditoría")}
        titleHint={GLOSSARY.bitacora}
        subtitle={t("Registro inmutable y de solo inserción. Cada cambio guarda usuario, IP, fecha UTC y los valores antes y después. El motor de base de datos rechaza cualquier intento de modificarla o borrarla.")}
        actions={
          <HintButton
            variant="secondary"
            onClick={exportCsv}
            loading={exporting}
            disabled={!page.total}
            disabledHint={t("No hay registros para descargar.")}
            hint={t("Descarga en CSV los registros del filtro actual (hasta 10.000). La descarga queda en la bitácora.")}
            data-testid="audit-export"
          >
            <Icon name="doc" size={16} /> {t("Descargar CSV")}
          </HintButton>
        }
      />

      {integrity && (
        <div className={`fa-notice ${integrity.protected ? "fa-notice--ok" : "fa-notice--warn"} au-integrity`} data-testid="audit-integrity">
          <Icon name={integrity.protected ? "shield" : "alert"} size={16} />
          <div>
            <strong>
              {integrity.protected
                ? t("Protección verificada: la base de datos no permite modificar ni borrar la bitácora.")
                : t("Atención: no se pudo confirmar que la base de datos impida modificar o borrar la bitácora.")}
            </strong>
            <div style={{ marginTop: 2 }}>
              {ts(integrity.detail)}{" "}
              {integrity.first_at
                ? t("{n} registros desde el {fecha}.", { n: integrity.total, fecha: fmtDateTime(integrity.first_at) })
                : t("Aún no hay registros.")}
              {!integrity.protected && " " + t("Avise al equipo técnico.")}
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="au-tiles" data-testid="audit-tiles">
          <div className="au-tile">
            <span>{hasFilters ? t("Registros del filtro") : t("Registros en total")}</span>
            <strong data-testid="audit-total">{summary.total}</strong>
            <em>{summary.last_at ? t("El más reciente: {fecha}", { fecha: fmtDateTime(summary.last_at) }) : t("Sin registros")}</em>
          </div>
          <div className="au-tile">
            <span>{t("Personas")}</span>
            <strong>{summary.users}</strong>
            <em>{topUser ? t("Más activa: {persona} ({n})", { persona: topUser.label === "sistema" ? t("sistema") : topUser.label, n: topUser.count }) : t("Sin actividad")}</em>
          </div>
          <div className="au-tile">
            <span>{t("Acción más frecuente")}</span>
            <strong className="au-tile-text">{topAction ? ts(topAction.label) : "-"}</strong>
            <em>{topAction ? t("{n} veces", { n: topAction.count }) : ""}</em>
          </div>
          <div className="au-tile">
            <span>{t("Últimos días con registros")}</span>
            {summary.by_day.length ? <DayBars days={summary.by_day} /> : <em>{t("Sin registros")}</em>}
          </div>
        </div>
      )}

      <Card style={{ marginBottom: 18 }} padding={16}>
        <div className="au-quick">
          <Input
            id="audit-text"
            label={t("Buscar")}
            aria-label={t("Buscar en la bitácora")}
            placeholder={t("Texto en el usuario, la acción, la ruta o los valores guardados")}
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            style={{ marginBottom: 0 }}
          />
          <div className="au-ranges" role="group" aria-label={t("Rango de fechas rápido")}>
            <Button size="sm" variant="outline" onClick={() => setRange(1)} data-testid="audit-range-1">{t("Hoy")}</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(7)} data-testid="audit-range-7">{t("7 días")}</Button>
            <Button size="sm" variant="outline" onClick={() => setRange(30)}>{t("30 días")}</Button>
          </div>
        </div>
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
            {entityCodes.map((code) => (
              <option key={code} value={code}>
                {ENTITY_LABELS[code] || ts(entityServerLabel[code]) || code}
                {entityCount[code] ? ` (${entityCount[code]})` : ""}
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
            {catalog.actions.map((a) => (
              <option key={a.code} value={a.code}>
                {ts(a.label)} · {a.code} ({a.count})
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
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t("Limpiar filtros")}
            </Button>
          )}
        </div>
        {filters.request_id && (
          <p className="au-request" data-testid="audit-request">
            {t("Mostrando todos los registros de una misma operación (petición {id}).", { id: filters.request_id })}{" "}
            <button type="button" className="au-link" onClick={() => setFilter("request_id", "")}>
              {t("Quitar")}
            </button>
          </p>
        )}
      </Card>

      {loading ? (
        <LoadingBlock label={t("Cargando bitácora...")} />
      ) : page.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="🗒️"
            title={t("Sin registros")}
            message={t("No hay eventos que coincidan con los filtros aplicados.")}
            action={hasFilters ? <Button variant="outline" onClick={clearFilters}>{t("Limpiar filtros")}</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <Card padding={0}>
            <div style={{ overflowX: "auto" }}>
            <table className="audit-table" style={{ minWidth: 820 }}>
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
                      <td className="audit-date">{fmtDateTime(entry.occurred_at)}</td>
                      <td>
                        <div className="audit-user">{entry.user_email || t("sistema")}</div>
                        {entry.user_role && (
                          <div className="audit-role">{entry.user_role.replace("_", " ")}</div>
                        )}
                      </td>
                      <td>
                        <div>{entityName(entry)}</div>
                        <div className="audit-entity-id">#{entry.entity_id}</div>
                      </td>
                      <td>
                        {entry.action_label && entry.action_label !== entry.action && (
                          <div className="au-action-label">{ts(entry.action_label)}</div>
                        )}
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
                            <span>
                              {t("Petición {id}", { id: entry.request_id || "-" })}
                              {entry.request_id && filters.request_id !== entry.request_id && (
                                <>
                                  {" · "}
                                  <button type="button" className="au-link" onClick={() => setFilter("request_id", entry.request_id)} data-testid={`audit-operation-${entry.id}`}>
                                    {t("Ver toda la operación")}
                                  </button>
                                </>
                              )}
                            </span>
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
                hasta: Math.min(offset + pageSize, page.total),
                total: page.total,
              })}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="filter-select"
                aria-label={t("Registros por página")}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setOffset(0);
                }}
                data-testid="audit-page-size"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{t("{n} por página", { n })}</option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
              >
                {t("Anteriores")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset + pageSize >= page.total}
                onClick={() => setOffset(offset + pageSize)}
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
                entidad: entityName(trail.entry),
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
                    <strong>{ev.action}</strong>
                    {ev.action_label && ev.action_label !== ev.action ? ` (${ts(ev.action_label)})` : ""} · {fmtDateTime(ev.occurred_at)} · {ev.user_email || t("proceso interno")}
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
