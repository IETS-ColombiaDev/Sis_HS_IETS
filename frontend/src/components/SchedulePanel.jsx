import { useCallback, useEffect, useState } from "react";
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

const RUN_LABELS = { en_curso: "En curso", ok: "Ok", parcial: "Parcial", error: "Error", sin_trabajo: "Sin trabajo" };
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
    hoursHint: "Cada cuántas horas se compara el ciclo activo en busca de duplicados. Una vez al día suele bastar.",
    permission: PERM.SCREENING_WRITE,
  },
};

function when(iso) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

/** Proxima ejecucion; si ya vencio, corre en la siguiente vuelta del worker. */
function nextRun(iso) {
  if (!iso) return "—";
  return new Date(iso).getTime() <= Date.now() ? "En la próxima vuelta del worker" : when(iso);
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
      toast.error(apiError(e, "No se pudo cargar la programación"));
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
        toast.error("Cada intervalo debe ser un número entero de horas entre 1 y 720.");
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
      toast.success("Programación guardada. El worker la aplica en su próxima vuelta.");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo guardar la programación"));
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (task) => {
    setRunningTask(task);
    try {
      const { data: run } = await api.post(`/config/schedule/${task}/run`);
      if (run.status === "error") toast.error(run.message);
      else toast.success(run.message || "Tarea ejecutada");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo ejecutar la tarea"));
    } finally {
      setRunningTask("");
    }
  };

  if (!data) return <LoadingBlock label="Cargando tareas programadas..." />;

  return (
    <div style={{ display: "grid", gap: 16 }} data-testid="schedule-panel">
      {!data.worker_enabled && (
        <div className="fb-public-note">
          El worker está deshabilitado en este servidor (INGEST_WORKER_ENABLED=false): las tareas no correrán solas. Puede ejecutarlas a mano con
          "Ejecutar ahora".
        </div>
      )}
      <div className="fb-schedule-grid">
        {data.tasks.map((t) => {
          const meta = TASK_META[t.task];
          const canRun = can(meta.permission);
          return (
            <Card key={t.task} padding={18} className="fb-schedule-card">
              <h4>
                {t.label} <InfoTip text={meta.hint} label={`Qué es ${t.label}`} />
              </h4>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={Boolean(draft[meta.enabledKey])}
                  disabled={!editable}
                  onChange={(e) => setDraft({ ...draft, [meta.enabledKey]: e.target.checked })}
                  aria-label={`Activar ${t.label}`}
                />
                Activa
              </label>
              <Input
                id={`hours-${t.task}`}
                label="Intervalo (horas)"
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
                <dt>Próxima</dt>
                <dd>{t.enabled ? nextRun(t.next_run_at) : "Apagada"}</dd>
                <dt>Última</dt>
                <dd>
                  {t.last_run ? (
                    <>
                      <Badge tone={RUN_TONE[t.last_run.status]}>{RUN_LABELS[t.last_run.status] || t.last_run.status}</Badge> {when(t.last_run.started_at)}
                    </>
                  ) : (
                    "Aún no ha corrido"
                  )}
                </dd>
              </dl>
              {t.last_run?.message && <p style={{ fontSize: 12.5, color: "#64748B", marginTop: 0 }}>{t.last_run.message}</p>}
              <HintButton
                size="sm"
                variant="outline"
                loading={runningTask === t.task}
                disabled={!canRun}
                hint="Ejecutarla ahora, fuera de su horario. Queda registrada como manual."
                disabledHint={`Su perfil no tiene el permiso ${meta.permission} para ejecutar esta tarea.`}
                onClick={() => runNow(t.task)}
              >
                Ejecutar ahora
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
          hint="Guardar interruptores e intervalos"
          disabledHint={!editable ? "Solo el superadministrador cambia la programación (permiso config:manage)." : "No hay cambios por guardar."}
        >
          Guardar programación
        </HintButton>
        <span style={{ fontSize: 12.5, color: "#64748B" }}>
          <TermLabel tip={GLOSSARY.fb_worker}>Worker</TermLabel>: {data.worker_running ? "en marcha" : data.worker_enabled ? "detenido" : "deshabilitado"} · revisa cada{" "}
          {data.worker_interval_seconds} s
        </span>
      </div>

      <Card padding={0}>
        <div style={{ padding: "18px 18px 0" }}>
          <SectionTitle hint={GLOSSARY.fb_registro_ejecucion} right={<Button size="sm" variant="ghost" onClick={load}>Actualizar</Button>}>
            Registro de ejecución
          </SectionTitle>
        </div>
        <DataTable
          stack
          minWidth={820}
          emptyMessage="Aún no hay ejecuciones registradas."
          columns={[
            { key: "task", width: 170, label: "Tarea", render: (r) => r.label },
            { key: "status", width: 110, label: "Resultado", render: (r) => <Badge tone={RUN_TONE[r.status]}>{RUN_LABELS[r.status] || r.status}</Badge> },
            { key: "origin", width: 120, label: "Origen", render: (r) => (r.origin === "manual" ? `Manual · ${r.triggered_by}` : "Programada") },
            { key: "started", width: 170, label: "Inicio", render: (r) => when(r.started_at) },
            {
              key: "items",
              width: 130,
              label: "Nuevas / detectadas",
              tip: <InfoTip text="Vigilancia: señales nuevas / registros leídos. Duplicados: propuestas nuevas / pares sobre el umbral." />,
              render: (r) => `${r.items_new} / ${r.items_found}${r.jobs_pending ? ` (${r.jobs_pending} en cola)` : ""}`,
            },
            { key: "msg", label: "Detalle", render: (r) => <span style={{ fontSize: 12.5 }}>{r.message}</span> },
          ]}
          rows={runs.map((r) => ({ key: r.id, data: r }))}
        />
      </Card>
    </div>
  );
}
