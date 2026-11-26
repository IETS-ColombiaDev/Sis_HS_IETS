import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { apiError } from "../api/client";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import InfoTip from "../components/InfoTip";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import ModuleHeader from "../components/ModuleHeader";
import { GLOSSARY } from "../constants/glossary";
import { t, ts, intlLocale } from "../i18n";

const KIND_LABEL = {
  new_phase3_colombia: t("Ensayo fase III en el país"),
  phase_change_high_budget: t("Cambio de fase · alto riesgo presupuestal"),
  clinical_phase_change_high_budget: t("Cambio de fase clínica · alto riesgo presupuestal"),
};

/**
 * Alertas tempranas (RF20): bandeja del usuario y suscripcion por cluster. Si
 * el IETS configura SMTP, cada alerta tambien sale por correo (P4-2).
 */
export default function Alerts() {
  const toast = useToast();
  const { version } = useRealtime();
  const [items, setItems] = useState([]);
  const [subs, setSubs] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [channels, setChannels] = useState(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([
        api.get("/alerts", { params: onlyUnread ? { unread: true } : {} }),
        api.get("/alerts/subscriptions"),
      ]);
      setItems(a.data);
      setSubs(s.data);
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudieron cargar las alertas")));
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, [toast, onlyUnread]);

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

  const mark = async (id) => {
    try {
      await api.post(`/alerts/${id}/read`);
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo marcar la alerta")));
    }
  };

  const markAll = async () => {
    setBusy("all-read");
    try {
      const { data } = await api.post("/alerts/read-all");
      toast.success(data.updated ? t("{n} alerta(s) marcadas como leídas.", { n: data.updated }) : t("No había alertas sin leer."));
      await load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudieron marcar las alertas")));
    } finally {
      setBusy("");
    }
  };

  const unread = items.filter((a) => !a.read_at).length;

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
        <ul className="fa-sub-list">
          {clusters.map((c) => {
            const on = Boolean(subFor(c.id)?.enabled);
            return (
              <li key={c.id}>
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
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{t("Bandeja · {n} sin leer", { n: unread })}</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" variant="secondary" onClick={() => setOnlyUnread((v) => !v)}>
            {onlyUnread ? t("Ver todas") : t("Solo sin leer")}
          </Button>
          <HintButton
            size="sm"
            variant="outline"
            onClick={markAll}
            loading={busy === "all-read"}
            disabled={unread === 0}
            disabledHint={t("No hay alertas sin leer.")}
          >
            {t("Marcar todas como leídas")}
          </HintButton>
        </div>
      </div>

      {loading ? (
        <LoadingBlock label={t("Cargando alertas...")} />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔔"
            title={onlyUnread ? t("Sin alertas por leer") : t("Sin alertas")}
            message={
              activeCount
                ? t("Cuando se dispare una regla sobre los clústeres que sigue, el aviso aparecerá aquí.")
                : t("Suscríbase a uno o varios clústeres para empezar a recibir avisos.")
            }
          />
        </Card>
      ) : (
        items.map((a) => (
          <Card key={a.id} style={{ marginBottom: 12 }}>
            <div className={`fa-alert-card${a.read_at ? "" : " is-unread"}`} style={{ paddingLeft: a.read_at ? 0 : 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ overflowWrap: "anywhere" }}>{ts(a.title)}</strong>
                <Badge tone={a.read_at ? "default" : "info"}>{KIND_LABEL[a.kind] || a.kind}</Badge>
              </div>
              <p>{ts(a.body)}</p>
              <div className="fa-alert-meta">
                {new Date(a.created_at).toLocaleString(intlLocale())}
                {a.cluster_id && clusterName[a.cluster_id] ? ` · ${clusterName[a.cluster_id]}` : ""}
                {a.read_at ? " · " + t("leída {date}", { date: new Date(a.read_at).toLocaleDateString(intlLocale()) }) : ""}
              </div>
              {!a.read_at && (
                <Button size="sm" variant="secondary" onClick={() => mark(a.id)} style={{ marginTop: 8 }}>
                  {t("Marcar leída")}
                </Button>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
