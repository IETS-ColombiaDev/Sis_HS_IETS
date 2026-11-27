import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiError } from "../api/client";
import { downloadFromApi } from "../utils/download";
import { PAGE_LABEL, PAGE_PATH, pageForStatus } from "../utils/techLink";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import Icon from "../components/Icon";
import InfoTip from "../components/InfoTip";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import { fmtDateTime, t, ts, intlLocale } from "../i18n";
import "./prioritization.css";
import "./alerts.css";

const PAGE_SIZE = 30;

const KIND_ICON = {
  new_phase3_colombia: "globe",
  phase_change_high_budget: "layers",
  clinical_phase_change_high_budget: "pulse",
  vigilancia_programada: "radar",
  duplicados_propuestos: "filter",
};

const LINK_LABEL = {
  "/vigilancia": t("Ir a Vigilancia"),
  "/filtrado": t("Ir a Filtrado y depuración"),
};

// El servidor puede enviar la fecha sin zona (UTC): se lee igual que `fmtDateTime`.
function toDate(value) {
  if (value instanceof Date) return value;
  const naive = typeof value === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value);
  return new Date(naive ? `${value.replace(" ", "T")}Z` : value);
}

function dayKey(value) {
  const d = toDate(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(value) {
  const d = toDate(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return t("Hoy");
  if (dayKey(d) === dayKey(yesterday)) return t("Ayer");
  return d.toLocaleDateString(intlLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/**
 * Alertas tempranas (RF20): bandeja del usuario y suscripcion por cluster. Si
 * el IETS configura SMTP, cada alerta tambien sale por correo (P4-2).
 */
export default function Alerts() {
  const toast = useToast();
  const { version } = useRealtime();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [rules, setRules] = useState(null);
  const [subs, setSubs] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [channels, setChannels] = useState(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [kind, setKind] = useState("");
  const [clusterFilter, setClusterFilter] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [clearing, setClearing] = useState(false);
  const firstLoad = useRef(true);

  // La búsqueda espera a que la persona deje de escribir.
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const filters = useMemo(
    () => ({
      unread: onlyUnread || undefined,
      kind: kind || undefined,
      cluster_id: clusterFilter || undefined,
      q: query || undefined,
    }),
    [onlyUnread, kind, clusterFilter, query]
  );
  const filtered = Boolean(kind || clusterFilter || query);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filters]);

  const load = useCallback(async () => {
    try {
      const [a, s, sum] = await Promise.all([
        api.get("/alerts", { params: { ...filters, limit } }),
        api.get("/alerts/subscriptions"),
        api.get("/alerts/summary"),
      ]);
      setItems(a.data);
      const header = Number(a.headers?.["x-total-count"]);
      setTotal(Number.isFinite(header) && header >= a.data.length ? header : a.data.length);
      setSubs(s.data);
      setSummary(sum.data);
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudieron cargar las alertas")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, [toast, filters, limit]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    api
      .get("/clusters")
      .then(({ data }) => setClusters(Array.isArray(data) ? data : []))
      .catch(() => {});
    api
      .get("/alerts/channels")
      .then(({ data }) => setChannels(data))
      .catch(() => setChannels(null));
    api
      .get("/alerts/rules")
      .then(({ data }) => setRules(Array.isArray(data) ? data : []))
      .catch(() => setRules([]));
  }, []);

  const subFor = useCallback(
    (clusterId) => subs.find((s) => (s.cluster_id ?? null) === clusterId) || null,
    [subs]
  );
  const allSub = subFor(null);
  const allOn = Boolean(allSub?.enabled);
  const activeCount = subs.filter((s) => s.enabled).length;
  const clusterName = useMemo(() => Object.fromEntries(clusters.map((c) => [c.id, ts(c.name)])), [clusters]);

  const setSubscription = async (clusterId, enabled) => {
    const key = `sub-${clusterId ?? "all"}`;
    setBusy(key);
    try {
      await api.post("/alerts/subscriptions", { cluster_id: clusterId, enabled });
      const name = clusterId ? clusterName[clusterId] || clusterId : "";
      toast.success(
        enabled
          ? clusterId
            ? t("Suscrito a las alertas del clúster {name}.", { name })
            : t("Suscrito a las alertas de todos los clústeres.")
          : clusterId
            ? t("Ya no recibirá alertas del clúster {name}.", { name })
            : t("Ya no recibirá alertas de todos los clústeres.")
      );
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo actualizar la suscripción")));
    } finally {
      setBusy("");
    }
  };

  const mark = async (alert, read) => {
    try {
      await api.post(`/alerts/${alert.id}/${read ? "read" : "unread"}`);
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo marcar la alerta")));
    }
  };

  const remove = async (alert) => {
    try {
      await api.delete(`/alerts/${alert.id}`);
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo quitar la alerta")));
    }
  };

  const markAll = async () => {
    setBusy("all-read");
    try {
      const { data } = await api.post("/alerts/read-all", null, {
        params: { kind: filters.kind, cluster_id: filters.cluster_id, q: filters.q },
      });
      toast.success(data.updated ? t("{n} alerta(s) marcadas como leídas.", { n: data.updated }) : t("No había alertas sin leer."));
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron marcar las alertas")));
    } finally {
      setBusy("");
    }
  };

  const clearRead = async () => {
    setBusy("clear");
    try {
      const { data } = await api.post("/alerts/clear-read");
      toast.success(t("{n} alerta(s) leídas quitadas de la bandeja.", { n: data.deleted }));
      setClearing(false);
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron quitar las alertas leídas")));
    } finally {
      setBusy("");
    }
  };

  const exportCsv = async () => {
    setBusy("export");
    try {
      await downloadFromApi(api, "/alerts/export", "alertas_tempranas.csv", { params: filters });
    } catch (e) {
      toast.error(apiError(e, t("No se pudo descargar la bandeja")));
    } finally {
      setBusy("");
    }
  };

  const clearFilters = () => {
    setKind("");
    setClusterFilter("");
    setSearch("");
    setOnlyUnread(false);
  };

  const unread = summary?.unread ?? items.filter((a) => !a.read_at).length;
  const readCount = (summary?.total ?? 0) - (summary?.unread ?? 0);
  const unreadShown = items.filter((a) => !a.read_at).length;
  const kinds = summary?.by_kind || [];

  // Agrupa por día, conservando el orden que trae el servidor.
  const groups = useMemo(() => {
    const out = [];
    items.forEach((a) => {
      const key = dayKey(a.created_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(a);
      else out.push({ key, label: dayLabel(a.created_at), items: [a] });
    });
    return out;
  }, [items]);

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title={t("Alertas tempranas")}
        titleHint={GLOSSARY.alertas}
        purpose={t("Avisos operativos: nuevos ensayos fase III en el país y cambios de fase en tecnologías de alto impacto presupuestal.")}
        actions={
          <HintButton
            onClick={() => setSubscription(null, !allOn)}
            loading={busy === "sub-all"}
            variant={allOn ? "secondary" : "primary"}
            hint={allOn ? t("Deja de recibir las alertas de todos los clústeres.") : t("Recibe las alertas de todos los clústeres.")}
            data-testid="alerts-toggle-all"
          >
            {allOn ? t("Cancelar suscripción general") : t("Suscribirme a todo")}
          </HintButton>
        }
      />

      <div className="al-tiles" data-testid="alerts-tiles">
        <div className={`al-tile${unread ? " is-hot" : ""}`} data-testid="alerts-tile-unread">
          <span>{t("Sin leer")}</span>
          <strong>{unread}</strong>
          <em>{t("de {n} en la bandeja", { n: summary?.total ?? items.length })}</em>
        </div>
        <div className="al-tile">
          <span>{t("Última alerta")}</span>
          <strong className="al-tile-text">{summary?.last_at ? fmtDateTime(summary.last_at) : t("Ninguna todavía")}</strong>
          <em>{kinds[0] ? t("Tipo más frecuente sin leer: {tipo}", { tipo: ts(kinds[0].label) }) : t("Aún no ha recibido alertas")}</em>
        </div>
        <div className={`al-tile${activeCount ? "" : " is-off"}`}>
          <span>{t("Suscripciones")}</span>
          <strong>{allOn ? t("Todos los clústeres") : activeCount}</strong>
          <em>{activeCount ? t("Recibe avisos de lo que sigue") : t("Sin suscripciones: no recibe alertas por clúster")}</em>
        </div>
        <div className="al-tile">
          <span>{t("Canales")}</span>
          <strong className="al-tile-text">{channels?.email ? t("Bandeja y correo") : t("Solo bandeja")}</strong>
          <em>{channels?.email ? channels.email_to : t("El correo no está configurado en el servidor")}</em>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }} className="term-label">
          {t("Mis suscripciones")}
          <InfoTip text={GLOSSARY.fa_suscripcion} label={t("Cómo funcionan las suscripciones")} />
        </h3>
        <p className="muted-note" data-testid="alerts-channel">
          <span className="term-label">
            {channels?.email
              ? t("Canales: bandeja de la plataforma y correo a {email}.", { email: channels.email_to })
              : t("Canal: bandeja de la plataforma. El correo se activa cuando el IETS configure el servidor SMTP.")}
            <InfoTip text={GLOSSARY.fa_canal_correo} label={t("Canal de correo")} />
          </span>
        </p>
        <p className="eval-complete" data-testid="alerts-sub-count">
          {t("{n} suscripción(es) activa(s)", { n: activeCount })}
          {allOn ? " · " + t("incluye todos los clústeres") : ""}
        </p>
        <ul className="fa-sub-list al-sub-list">
          {clusters.map((c) => {
            const on = Boolean(subFor(c.id)?.enabled);
            return (
              <li key={c.id} className={on || allOn ? "is-on" : ""}>
                <span>
                  {ts(c.name)}
                  {on && <Badge tone="ok" style={{ marginLeft: 8 }}>{t("Suscrito")}</Badge>}
                </span>
                <HintButton
                  size="sm"
                  variant={on ? "ghost" : "outline"}
                  loading={busy === `sub-${c.id}`}
                  disabled={allOn && !on}
                  disabledHint={t("Ya recibe las alertas de todos los clústeres. Cancele la suscripción general para elegir por clúster.")}
                  onClick={() => setSubscription(c.id, !on)}
                  data-testid={`alerts-sub-${c.id}`}
                >
                  {on ? t("Cancelar##suscripción") : t("Suscribirme")}
                </HintButton>
              </li>
            );
          })}
        </ul>

        <details className="prio-history-fold al-rules">
          <summary data-testid="alerts-rules-toggle">
            <Icon name="info" size={14} /> {t("Qué dispara cada alerta")}
            <span>{t("Las reglas vigentes y cuántas recibió en los últimos 30 días")}</span>
          </summary>
          {rules == null ? (
            <p className="prio-history-empty">{t("Cargando las reglas...")}</p>
          ) : (
            <ul className="al-rule-list" data-testid="alerts-rules">
              {rules.map((r) => (
                <li key={r.kind}>
                  <span className="al-kind-icon" aria-hidden="true">
                    <Icon name={KIND_ICON[r.kind] || "info"} size={14} />
                  </span>
                  <div>
                    <strong>{ts(r.label)}</strong>
                    <p>{ts(r.when)}</p>
                    <p className="al-rule-scope">{ts(r.scope)}</p>
                  </div>
                  <em>{t("{n} en 30 días", { n: r.last_30_days })}</em>
                </li>
              ))}
            </ul>
          )}
        </details>
      </Card>

      <Card padding={16} style={{ marginBottom: 12 }}>
        <div className="al-inbox-head">
          <h3 style={{ margin: 0 }}>{t("Bandeja · {n} sin leer", { n: unread })}</h3>
          <div className="al-inbox-actions">
            <Button size="sm" variant="secondary" onClick={() => setOnlyUnread((v) => !v)}>
              {onlyUnread ? t("Ver todas") : t("Solo sin leer")}
            </Button>
            <HintButton
              size="sm"
              variant="outline"
              onClick={markAll}
              loading={busy === "all-read"}
              disabled={filtered ? unreadShown === 0 : unread === 0}
              disabledHint={t("No hay alertas sin leer.")}
              hint={filtered ? t("Marca como leídas solo las del filtro actual.") : undefined}
            >
              {t("Marcar todas como leídas")}
            </HintButton>
            <HintButton
              size="sm"
              variant="ghost"
              onClick={() => setClearing(true)}
              disabled={readCount <= 0}
              disabledHint={t("No hay alertas leídas para quitar.")}
              hint={t("Quita de la bandeja las alertas que ya leyó. Las sin leer se conservan.")}
              data-testid="alerts-clear-read"
            >
              {t("Quitar las leídas")}
            </HintButton>
            <HintButton
              size="sm"
              variant="ghost"
              onClick={exportCsv}
              loading={busy === "export"}
              disabled={items.length === 0}
              disabledHint={t("No hay alertas para descargar.")}
              data-testid="alerts-export"
            >
              {t("Exportar CSV")}
            </HintButton>
          </div>
        </div>
        <div className="fb-toolbar al-filters">
          <input
            className="filter-input"
            style={{ flex: 1, minWidth: 180 }}
            placeholder={t("Buscar en las alertas...")}
            aria-label={t("Buscar alerta")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="alerts-search"
          />
          <select
            className="filter-input al-select"
            aria-label={t("Filtrar por tipo de alerta")}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            data-testid="alerts-kind"
          >
            <option value="">{t("Todos los tipos")}</option>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {ts(k.label)} ({k.total})
              </option>
            ))}
          </select>
          <select
            className="filter-input al-select"
            aria-label={t("Filtrar por clúster")}
            value={clusterFilter}
            onChange={(e) => setClusterFilter(e.target.value)}
            data-testid="alerts-cluster"
          >
            <option value="">{t("Todos los clústeres")}</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {ts(c.name)}
              </option>
            ))}
          </select>
          {(filtered || onlyUnread) && (
            <Button size="sm" variant="ghost" onClick={clearFilters} data-testid="alerts-clear-filters">
              {t("Quitar filtros")}
            </Button>
          )}
        </div>
      </Card>

      {loading ? (
        <LoadingBlock label={t("Cargando alertas...")} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔔"
            title={filtered ? t("Ninguna alerta coincide con el filtro") : onlyUnread ? t("Sin alertas por leer") : t("Sin alertas")}
            message={
              filtered
                ? t("Cambie el tipo, el clúster o el texto de búsqueda.")
                : activeCount
                ? t("Cuando se dispare una regla sobre los clústeres que sigue, el aviso aparecerá aquí.")
                : t("Suscríbase a uno o varios clústeres para empezar a recibir avisos.")
            }
            action={
              filtered ? (
                <Button variant="outline" onClick={clearFilters}>
                  {t("Quitar filtros")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.key} className="al-day">
              <h4>{group.label}</h4>
              {group.items.map((a) => {
                const page = a.technology_id ? pageForStatus(a.technology_status) : null;
                return (
                  <Card key={a.id} padding={14} style={{ marginBottom: 10 }}>
                    <div className={`fa-alert-card al-card${a.read_at ? "" : " is-unread"}`} data-testid={`alert-${a.id}`}>
                      <span className={`al-kind-icon kind-${a.kind}`} aria-hidden="true">
                        <Icon name={KIND_ICON[a.kind] || "info"} size={15} />
                      </span>
                      <div className="al-card-body">
                        <div className="al-card-top">
                          <strong style={{ overflowWrap: "anywhere" }}>{ts(a.title)}</strong>
                          <Badge tone={a.read_at ? "default" : "info"}>{ts(a.kind_label) || a.kind}</Badge>
                        </div>
                        {a.body && <p>{ts(a.body)}</p>}
                        <div className="fa-alert-meta">
                          {fmtDateTime(a.created_at)}
                          {a.cluster_name ? ` · ${ts(a.cluster_name)}` : ""}
                          {a.read_at ? " · " + t("leída {date}", { date: toDate(a.read_at).toLocaleDateString(intlLocale()) }) : ""}
                        </div>
                        <div className="al-card-actions">
                          {page && (
                            <Link className="al-link" to={`${PAGE_PATH[page]}?tecnologia=${a.technology_id}`} data-testid={`alert-open-${a.id}`}>
                              <Icon name="external" size={13} /> {t("Abrir en {pantalla}", { pantalla: PAGE_LABEL[page] })}
                            </Link>
                          )}
                          {!page && a.link && (
                            <Link className="al-link" to={a.link}>
                              <Icon name="external" size={13} /> {LINK_LABEL[a.link] || t("Abrir")}
                            </Link>
                          )}
                          {a.read_at ? (
                            <Button size="sm" variant="ghost" onClick={() => mark(a, false)} data-testid={`alert-unread-${a.id}`}>
                              {t("Marcar sin leer")}
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => mark(a, true)} data-testid={`alert-read-${a.id}`}>
                              {t("Marcar leída")}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => remove(a)} aria-label={t("Quitar esta alerta de la bandeja")} data-testid={`alert-delete-${a.id}`}>
                            <Icon name="trash" size={13} /> {t("Quitar")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </section>
          ))}
          <p className="al-count" data-testid="alerts-count">
            {t("Mostrando {n} de {total}", { n: items.length, total })}
          </p>
          {items.length < total && (
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <Button variant="outline" onClick={() => setLimit((n) => Math.min(200, n + PAGE_SIZE))} disabled={limit >= 200} data-testid="alerts-more">
                {limit >= 200 ? t("Use los filtros para ver alertas más antiguas") : t("Ver más")}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={clearing}
        onClose={() => setClearing(false)}
        onConfirm={clearRead}
        loading={busy === "clear"}
        title={t("Quitar las alertas leídas")}
        confirmLabel={t("Quitar las leídas")}
        message={t("Se quitarán de su bandeja {n} alerta(s) ya leídas. Las sin leer se conservan. No afecta la bandeja de otras personas.", { n: Math.max(0, readCount) })}
      />
    </div>
  );
}
