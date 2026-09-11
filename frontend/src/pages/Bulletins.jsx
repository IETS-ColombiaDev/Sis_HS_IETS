import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useCycle } from "../cycle/CycleContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { Card } from "../components/Card";
import Button from "../components/Button";
import HintButton from "../components/HintButton";
import Badge from "../components/Badge";
import ConfirmDialog from "../components/ConfirmDialog";
import InfoTip from "../components/InfoTip";
import EmptyState from "../components/EmptyState";
import { LoadingBlock } from "../components/Spinner";
import ModuleHeader from "../components/ModuleHeader";
import { PERM } from "../constants/methodology";
import { GLOSSARY } from "../constants/glossary";

const BULLETIN_STATUS = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pendiente de aprobación",
  publicado: "Publicado",
};

function BulletinKpis({ body }) {
  const funnel = body?.funnel || {};
  const items = [
    { label: "Asignadas", value: funnel.captured ?? funnel.assigned ?? 0, hint: GLOSSARY.capturadas },
    { label: "Filtradas", value: funnel.filtered ?? 0, hint: GLOSSARY.filtradas },
    { label: "Priorizadas", value: funnel.prioritized ?? body?.prioritized ?? 0, hint: GLOSSARY.priorizadas },
    { label: "Publicadas", value: funnel.published ?? body?.published ?? 0, hint: GLOSSARY.publicadas },
  ];
  return (
    <div className="bulletin-kpis">
      {items.map((item) => (
        <div key={item.label} className="bulletin-kpi">
          <b>{item.value}</b>
          <span className="term-label">
            {item.label}
            <InfoTip text={item.hint} label={`Qué cuenta ${item.label}`} />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Bulletins() {
  const { cycleId, cycle, isHistoric } = useCycle();
  const { can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [publishing, setPublishing] = useState(null);
  const canWrite = can(PERM.CYCLE_WRITE);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/bulletins", { params: cycleId ? { cycle_id: cycleId } : {} });
      setItems(data);
    } catch (e) {
      toast.error(apiError(e, "No se pudieron cargar los boletines"));
    } finally {
      setLoading(false);
    }
  }, [cycleId, toast]);

  useEffect(() => {
    load();
  }, [load, version]);

  const compile = async () => {
    setBusy("compile");
    try {
      await api.post(`/bulletins/compile/${cycleId}`);
      toast.success("Boletín compilado con las cifras actuales. Queda pendiente de aprobación.");
      load();
    } catch (e) {
      toast.error(apiError(e, "No se pudo compilar"));
    } finally {
      setBusy("");
    }
  };

  const approve = async (id, publish) => {
    setBusy(`${publish ? "pub" : "apr"}-${id}`);
    try {
      await api.post(`/bulletins/${id}/approve`, { publish });
      toast.success(publish ? "Boletín publicado." : "Boletín aprobado. Ya se puede publicar.");
      setPublishing(null);
      load();
    } catch (e) {
      toast.error(apiError(e, "La decisión fue rechazada"));
    } finally {
      setBusy("");
    }
  };

  const exportHtml = async (b) => {
    try {
      const { data } = await api.get(`/bulletins/${b.id}/export`, { responseType: "blob" });
      const win = window.open(URL.createObjectURL(data), "_blank", "noopener");
      if (!win) toast.info("Si no se abrió una pestaña nueva, permita las ventanas emergentes para este sitio.");
    } catch (e) {
      toast.error(apiError(e, "No se pudo abrir el boletín"));
    }
  };

  const hasOpenDraft = items.some((b) => b.status !== "publicado");

  return (
    <div>
      <ModuleHeader
        step="diseminacion"
        title="Boletines del ciclo"
        titleHint={GLOSSARY.boletin}
        purpose={
          cycle
            ? `Fase 4 · ${cycle.code}. Resumen ejecutivo epidemiológico y financiero para publicar después de la aprobación del líder.`
            : "Fase 4 · Resumen ejecutivo para publicar después de la aprobación."
        }
        actions={
          canWrite && cycleId ? (
            <HintButton
              onClick={compile}
              loading={busy === "compile"}
              disabled={isHistoric}
              disabledHint="El ciclo histórico no produce boletines."
              hint={
                hasOpenDraft
                  ? `${GLOSSARY.fa_compilar_boletin} Actualiza el borrador pendiente.`
                  : GLOSSARY.fa_compilar_boletin
              }
              data-testid="bulletin-compile"
            >
              {hasOpenDraft ? "Recompilar desde el ciclo" : "Compilar desde el ciclo"}
            </HintButton>
          ) : null
        }
      />
      {loading ? (
        <LoadingBlock label="Cargando boletines..." />
      ) : !cycleId ? (
        <Card>
          <EmptyState
            icon="🗓️"
            title="Seleccione un ciclo"
            message="Cada boletín resume un ciclo. Elija uno en la cabecera."
            action={<Button onClick={() => navigate("/ciclos")}>Ir a ciclos</Button>}
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="📰"
            title="Sin boletines"
            message={
              canWrite
                ? "Se compila automáticamente al cerrar el ciclo, o pulse Compilar desde el ciclo."
                : "Se compila automáticamente al cerrar el ciclo. Un evaluador técnico o el superadministrador lo aprueba y publica."
            }
          />
        </Card>
      ) : (
        items.map((b) => (
          <Card key={b.id} style={{ marginBottom: 16 }}>
            <div className="bulletin-card-head" data-testid={`bulletin-${b.id}`}>
              <div style={{ minWidth: 0 }}>
                <p className="iets-dossier-kicker">Boletín epidemiológico y financiero</p>
                <h3 style={{ overflowWrap: "anywhere" }}>{b.title}</h3>
                <p className="bulletin-card-meta">
                  Compilado {b.body?.compiled_on || "—"}
                  {b.compiled_by ? ` por ${b.compiled_by}` : ""}
                  {b.approved_by ? ` · Aprobado por ${b.approved_by}` : ""}
                  {b.published_at ? ` · Publicado ${new Date(b.published_at).toLocaleDateString("es-CO")}` : ""}
                </p>
              </div>
              <Badge tone={b.status === "publicado" ? "ok" : "warning"}>
                {BULLETIN_STATUS[b.status] || b.status}
              </Badge>
            </div>
            <BulletinKpis body={b.body} />
            {(b.body?.by_cluster || []).length > 0 && (
              <ul className="bulletin-clusters">
                {b.body.by_cluster.map((row) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="eval-actions">
              {canWrite && b.status !== "publicado" && (
                <>
                  <HintButton
                    variant="secondary"
                    onClick={() => approve(b.id, false)}
                    loading={busy === `apr-${b.id}`}
                    disabled={Boolean(b.approved_by)}
                    disabledHint={`Ya aprobado por ${b.approved_by}. Si recompila, la aprobación se anula.`}
                    hint={GLOSSARY.fa_aprobar_boletin}
                    data-testid={`bulletin-approve-${b.id}`}
                  >
                    Aprobar
                  </HintButton>
                  <HintButton
                    variant="success"
                    onClick={() => setPublishing(b)}
                    disabled={!b.approved_by}
                    disabledHint="Requiere la aprobación del líder antes de publicarse (RF19)."
                    hint={GLOSSARY.fa_publicar_boletin}
                    data-testid={`bulletin-publish-${b.id}`}
                  >
                    Publicar
                  </HintButton>
                </>
              )}
              <HintButton
                variant="outline"
                onClick={() => exportHtml(b)}
                hint="Abre la versión ejecutiva imprimible. Use Imprimir > Guardar como PDF para distribuirla."
                data-testid={`bulletin-export-${b.id}`}
              >
                Ver HTML ejecutivo
              </HintButton>
            </div>
          </Card>
        ))
      )}

      <ConfirmDialog
        open={Boolean(publishing)}
        onClose={() => setPublishing(null)}
        onConfirm={() => approve(publishing.id, true)}
        loading={Boolean(publishing) && busy === `pub-${publishing?.id}`}
        title="Publicar boletín"
        confirmVariant="success"
        confirmLabel="Publicar"
        message={`Se publicará "${publishing?.title || ""}" con las cifras aprobadas. La publicación no se deshace.`}
      />
    </div>
  );
}
