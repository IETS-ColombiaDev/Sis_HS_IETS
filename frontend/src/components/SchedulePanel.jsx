import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "./Toast";
import { Card, SectionTitle } from "./Card";
import Badge from "./Badge";
import Button from "./Button";
import HintButton from "./HintButton";
import InfoTip, { TermLabel } from "./InfoTip";
import DataTable from "./DataTable";
import { Input } from "./Field";
import { LoadingBlock } from "./Spinner";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";
import { t, tr, ts, intlLocale } from "../i18n";

const RUN_LABELS = { en_curso: t("En curso"), ok: t("Ok"), parcial: t("Parcial"), error: t("Error"), sin_trabajo: t("Sin trabajo") };
const RUN_TONE = { ok: "success", parcial: "warning", error: "danger", sin_trabajo: "viewer", en_curso: "info" };
const TASK_META = {
  vigilancia: {
    enabledKey: "scan_enabled",
    hoursKey: "scan_interval_hours",
    hint: GLOSSARY.fb_programada,
    hoursHint: GLOSSARY.fb_intervalo_vigilancia,
    permission: PERM.SCAN_RUN,
  },
  duplicados: {
    enabledKey: "dedup_enabled",
    hoursKey: "dedup_interval_hours",
    hint: GLOSSARY.fb_barrido_duplicados,
    hoursHint: t("Cada cuántas horas se compara el ciclo activo en busca de duplicados. Una vez al día suele bastar."),
    permission: PERM.SCREENING_WRITE,
  },
};

function when(iso) {
  return iso ? new Date(iso).toLocaleString(intlLocale()) : "-";
}

/** Proxima ejecucion; si ya vencio, corre en la siguiente vuelta del worker. */
function nextRun(iso) {
  if (!iso) return "-";
  return new Date(iso).getTime() <= Date.now() ? t("En la próxima vuelta del worker") : when(iso);
}

/**
 * Tareas programadas del worker (P0-4 vigilancia, P1-4 duplicados): interruptor,
 * intervalo, proxima ejecucion, "Ejecutar ahora" y registro de ejecucion.
 */
export default function SchedulePanel() {
  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const editable = can(PERM.CONFIG_MANAGE);

  const [data, setData] = useState(null);
  const [runs, setRuns] = useState([]);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [runningTask, setRunningTask] = useState("");
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.get("/config/schedule"), api.get("/config/schedule/runs", { params: { limit: 25 } })]);
      setData(s.data);
      setRuns(r.data);
      setDraft({
        scan_enabled: s.data.scan_enabled,
        scan_interval_hours: String(s.data.scan_interval_hours),
        dedup_enabled: s.data.dedup_enabled,
        dedup_interval_hours: String(s.data.dedup_interval_hours),
      });
    } catch (e) {
      if (firstLoad.current) toast.error(apiError(e, t("No se pudo cargar la programación")));
    } finally {
      firstLoad.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const dirty =
    data &&
    (draft.scan_enabled !== data.scan_enabled ||
      Number(draft.scan_interval_hours) !== data.scan_interval_hours ||
      draft.dedup_enabled !== data.dedup_enabled ||
      Number(draft.dedup_interval_hours) !== data.dedup_interval_hours);

  const save = async () => {
    for (const key of ["scan_interval_hours", "dedup_interval_hours"]) {
      const n = Number(draft[key]);
      if (!Number.isInteger(n) || n < 1 || n > 720) {
        toast.error(t("Cada intervalo debe ser un número entero de horas entre 1 y 720."));
        return;
      }
    }
    setSaving(true);
    try {
      await api.put("/config/schedule", {
        scan_enabled: draft.scan_enabled,
        scan_interval_hours: Number(draft.scan_interval_hours),
        dedup_enabled: draft.dedup_enabled,
        dedup_interval_hours: Number(draft.dedup_interval_hours),
      });
      toast.success(t("Programación guardada. El worker la aplica en su próxima vuelta."));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo guardar la programación")));
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (task) => {
    setRunningTask(task);
    try {
      const { data: run } = await api.post(`/config/schedule/${task}/run`);
      if (run.status === "error") toast.error(ts(run.message));
      else toast.success(ts(run.message) || t("Tarea ejecutada"));
      load();
    } catch (e) {
      toast.error(apiError(e, t("No se pudo ejecutar la tarea")));
    } finally {
      setRunningTask("");
    }
  };

  if (!data) return <LoadingBlock label={t("Cargando tareas programadas...")} />;

  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="schedule-panel">
      {!data.worker_enabled && (
        <div className="fb-public-note">
          {t('El worker está deshabilitado en este servidor (INGEST_WORKER_ENABLED=false): las tareas no correrán solas. Puede ejecutarlas a mano con "Ejecutar ahora".')}
        </div>
      )}
      <div className="fb-schedule-grid">
        {data.tasks.map((item) => {
          const meta = TASK_META[item.task];
          const canRun = can(meta.permission);
          return (
            <Card key={item.task} padding={18} className="fb-schedule-card">
              <h4>
                {ts(item.label)} <InfoTip text={meta.hint} label={t("Qué es {tarea}", { tarea: ts(item.label) })} />
              </h4>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={Boolean(draft[meta.enabledKey])}
                  disabled={!editable}
                  onChange={(e) => setDraft({ ...draft, [meta.enabledKey]: e.target.checked })}
                  aria-label={t("Activar {tarea}", { tarea: ts(item.label) })}
                />
                {t("Activa")}
              </label>
              <Input
                id={`hours-${item.task}`}
                label={t("Intervalo (horas)")}
                hint={meta.hoursHint}
                type="number"
                min={1}
                max={720}
                value={draft[meta.hoursKey] ?? ""}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, [meta.hoursKey]: e.target.value })}
                style={{ maxWidth: 160 }}
              />
              <dl className="fb-schedule-meta">
                <dt>{t("Próxima")}</dt>
                <dd>{item.enabled ? nextRun(item.next_run_at) : t("Apagada")}</dd>
                <dt>{t("Última")}</dt>
                <dd>
                  {item.last_run ? (
                    <>
                      <Badge tone={RUN_TONE[item.last_run.status]}>{RUN_LABELS[item.last_run.status] || item.last_run.status}</Badge> {when(item.last_run.started_at)}
                    </>
                  ) : (
                    t("Aún no ha corrido")
                  )}
                </dd>
              </dl>
              {item.last_run?.message && <p style={{ fontSize: 12.5, color: "#64748B", marginTop: 0 }}>{ts(item.last_run.message)}</p>}
              <HintButton
                size="sm"
                variant="outline"
                loading={runningTask === item.task}
                disabled={!canRun}
                hint={t("Ejecutarla ahora, fuera de su horario. Queda registrada como manual.")}
                disabledHint={t("Su perfil no tiene el permiso {permiso} para ejecutar esta tarea.", { permiso: meta.permission })}
                onClick={() => runNow(item.task)}
              >
                {t("Ejecutar ahora")}
              </HintButton>
            </Card>
          );
        })}
      </div>
      <div className="fb-toolbar">
        <HintButton
          onClick={save}
          loading={saving}
          disabled={!editable || !dirty}
          hint={t("Guardar interruptores e intervalos")}
          disabledHint={!editable ? t("Solo el superadministrador cambia la programación (permiso config:manage).") : t("No hay cambios por guardar.")}
        >
          {t("Guardar programación")}
        </HintButton>
        <span style={{ fontSize: 12.5, color: "#64748B" }}>
          {tr(
            "<w>Worker</w>: {estado} · revisa cada {n} s",
            { estado: data.worker_running ? t("en marcha") : data.worker_enabled ? t("detenido") : t("deshabilitado"), n: data.worker_interval_seconds },
            { w: (c) => <TermLabel tip={GLOSSARY.fb_worker}>{c}</TermLabel> }
          )}
        </span>
      </div>

      <Card padding={0}>
        <div style={{ padding: "18px 18px 0" }}>
          <SectionTitle hint={GLOSSARY.fb_registro_ejecucion} right={<Button size="sm" variant="ghost" onClick={load}>{t("Actualizar")}</Button>}>
            {t("Registro de ejecución")}
          </SectionTitle>
        </div>
        <DataTable
          stack
          minWidth={820}
          emptyMessage={t("Aún no hay ejecuciones registradas.")}
          columns={[
            { key: "task", width: 170, label: t("Tarea"), render: (r) => ts(r.label) },
            { key: "status", width: 110, label: t("Resultado"), render: (r) => <Badge tone={RUN_TONE[r.status]}>{RUN_LABELS[r.status] || r.status}</Badge> },
            { key: "origin", width: 120, label: t("Origen"), render: (r) => (r.origin === "manual" ? `${t("Manual")} · ${r.triggered_by}` : t("Programada")) },
            { key: "started", width: 170, label: t("Inicio##hora"), render: (r) => when(r.started_at) },
            {
              key: "items",
              width: 130,
              label: t("Nuevas / detectadas"),
              tip: <InfoTip text={t("Vigilancia: señales nuevas / registros leídos. Duplicados: propuestas nuevas / pares sobre el umbral.")} />,
              render: (r) => `${r.items_new} / ${r.items_found}${r.jobs_pending ? ` ${t("({n} en cola)", { n: r.jobs_pending })}` : ""}`,
            },
            { key: "msg", label: t("Detalle"), render: (r) => <span style={{ fontSize: 12.5 }}>{ts(r.message)}</span> },
          ]}
          rows={runs.map((r) => ({ key: r.id, data: r }))}
        />
      </Card>
    </div>
  );
}
