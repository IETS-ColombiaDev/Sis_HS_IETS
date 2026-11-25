import { useCallback, useEffect, useState } from "react";
import api, { apiError, setToken } from "../api/client";
import { useToast } from "./Toast";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";

const CONFIRM_WORD = "RESTAURAR";

const REASON_HELP = {
  actual: "La copia vigente: es la que se restaura sola al arrancar.",
  anterior: "La copia inmediatamente anterior a la vigente.",
  antes_despliegue: "Última copia hecha con la versión anterior del sistema, justo antes de un despliegue.",
  diaria: "Última copia de ese día.",
  otra_instancia: "La escribió otra instancia del servicio mientras esta corría (por ejemplo durante un redespliegue).",
  antes_restauracion: "Estado que había justo antes de una restauración manual: permite deshacerla.",
  manual: "Fijada a mano desde este panel.",
};

function fmtDate(value) {
  return value ? new Date(value).toLocaleString("es-CO") : "Sin fecha";
}

function fmtSize(bytes) {
  if (!bytes) return "";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countsLine(counts) {
  if (!counts || typeof counts !== "object") return "";
  const parts = [];
  if (counts.findings != null) parts.push(`${counts.findings} señales`);
  if (counts.technologies != null) parts.push(`${counts.technologies} tecnologías`);
  if (counts.sources != null) parts.push(`${counts.sources} fuentes`);
  if (counts.users != null) parts.push(`${counts.users} usuarios`);
  return parts.join(" · ");
}

/**
 * Puntos de recuperacion de la base en Firestore. Ademas de la copia vigente y
 * la anterior, el sistema conserva la ultima copia previa a cada despliegue, el
 * cierre de cada dia y el estado previo a cada restauracion. Desde aqui se puede
 * volver a cualquiera; el estado actual queda fijado antes, asi que se deshace.
 */
export default function RecoveryPoints({ disabled = false }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/backup/firebase/checkpoints");
      setData(res.data);
      setError("");
    } catch (e) {
      setError(apiError(e, "No se pudieron leer los puntos de recuperación"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pin = async () => {
    setWorking("pin");
    try {
      const res = await api.post("/backup/firebase/checkpoints/pin", null, { timeout: 240000 });
      if (!res.data?.ok) throw new Error(res.data?.detail || res.data?.reason || "Firestore no aceptó la copia");
      toast.success("Estado actual publicado; la copia anterior quedó fijada.");
      await load();
    } catch (e) {
      toast.error(apiError(e, e?.message || "No se pudo fijar el punto de recuperación"));
    } finally {
      setWorking("");
    }
  };

  const restore = async (item) => {
    const typed = window.prompt(
      `Se reemplazará toda la base por la copia del ${fmtDate(item.taken_at)}.\n` +
        "El estado actual quedará guardado como punto de recuperación, así que se puede deshacer.\n\n" +
        `Para continuar escriba ${CONFIRM_WORD}:`
    );
    if (typed == null) return;
    if (typed.trim().toUpperCase() !== CONFIRM_WORD) {
      toast.warning(`No se restauró: debía escribir ${CONFIRM_WORD}.`);
      return;
    }
    setWorking(item.gen);
    try {
      const res = await api.post(
        `/backup/firebase/checkpoints/${encodeURIComponent(item.gen)}/restore`,
        null,
        { params: { confirm: CONFIRM_WORD }, timeout: 300000 }
      );
      if (res.data?.access_token) setToken(res.data.access_token);
      window.location.reload();
    } catch (e) {
      toast.error(apiError(e, "No se pudo restaurar el punto de recuperación"));
      setWorking("");
    }
  };

  if (loading) return <p style={{ fontSize: 13, color: "#64748B", marginTop: 14 }}>Cargando puntos de recuperación...</p>;
  if (!data?.enabled) return null;

  const items = data.items || [];
  const retention = data.retention || {};

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #E2E8F0" }} data-testid="recovery-points">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Puntos de recuperación</div>
        <Button variant="secondary" size="sm" onClick={pin} loading={working === "pin"} disabled={disabled || Boolean(working)}>
          <Icon name="save" size={14} /> Fijar el estado actual
        </Button>
      </div>
      <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.6, margin: "6px 0 10px" }}>
        Copias que las publicaciones siguientes no borran. Se conservan las últimas{" "}
        {retention.antes_despliegue ?? 5} previas a un despliegue, el cierre de los últimos{" "}
        {retention.diaria ?? 7} días y el estado previo a cada restauración. Antes de restaurar, el
        estado actual queda guardado.
      </p>
      {error ? (
        <div role="alert" className="login-notice login-notice-error" style={{ marginBottom: 10 }}>{error}</div>
      ) : null}
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: "#64748B" }}>Aún no hay copias en Firestore.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((item) => (
            <li
              key={`${item.reason}-${item.gen}`}
              style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid #F1F5F9", fontSize: 13 }}
            >
              <span style={{ minWidth: 170 }} title={REASON_HELP[item.reason] || ""}>
                <Badge tone={item.current ? "ok" : "default"}>{item.label || item.reason}</Badge>
              </span>
              <span style={{ minWidth: 150, fontWeight: 600 }}>{fmtDate(item.taken_at)}</span>
              <span style={{ color: "#64748B", flex: 1, minWidth: 180 }}>
                {[fmtSize(item.raw_size), item.code ? `versión ${item.code}` : "", countsLine(item.counts)].filter(Boolean).join(" · ")}
              </span>
              {item.current ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restore(item)}
                  loading={working === item.gen}
                  disabled={disabled || Boolean(working)}
                  aria-label={`Restaurar la copia del ${fmtDate(item.taken_at)}`}
                >
                  Restaurar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
