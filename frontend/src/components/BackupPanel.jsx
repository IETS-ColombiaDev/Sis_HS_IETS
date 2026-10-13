import { useState } from "react";
import { useBackup } from "../backup/BackupContext";
import { useToast } from "./Toast";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";

function fmtSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString("es-CO") : "—";
}

const STATUS = {
  idle: { tone: "ok", label: "Al día" },
  saving: { tone: "warning", label: "Guardando…" },
  restoring: { tone: "warning", label: "Restaurando…" },
  error: { tone: "error", label: "Con error" },
};

export default function BackupPanel() {
  const backup = useBackup();
  const toast = useToast();
  const [working, setWorking] = useState(false);

  if (!backup.enabled) return null;
  if (!backup.supported) {
    return (
      <Card>
        <SectionTitle>Copia en este navegador</SectionTitle>
        <p style={{ color: "#64748B", fontSize: 13.5 }}>
          El servidor usa una base PostgreSQL persistente: no hace falta guardar copia en el navegador.
        </p>
      </Card>
    );
  }

  const st = STATUS[backup.status] || STATUS.idle;
  const run = async (fn, okMsg) => {
    setWorking(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error(e?.message || "No se pudo completar la acción");
    } finally {
      setWorking(false);
    }
  };

  const confirmRestore = (key, takenAt) => {
    const ok = window.confirm(
      `Se reemplazará toda la base del servidor por la copia del ${fmtDate(takenAt)}. ` +
        "Lo registrado en el servidor después de esa fecha se perderá. ¿Continuar?"
    );
    if (ok) run(() => backup.restoreFrom(key));
  };

  return (
    <Card data-testid="browser-backup-panel">
      <SectionTitle>Copia en este navegador</SectionTitle>
      <p style={{ color: "#475569", fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
        Este navegador guarda una copia comprimida de toda la base (fuentes, hallazgos, ciclos, usuarios y
        configuración) y la actualiza al trabajar. Si Render borra el disco, al volver a ingresar se restaura
        sola. Una copia de otra base nunca se pisa con un servidor vacío.
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Badge tone={st.tone}>{st.label}</Badge>
        <span style={{ fontSize: 13.5 }}>
          Última copia: <strong>{fmtDate(backup.current?.takenAt)}</strong>
        </span>
        <span style={{ fontSize: 13.5, color: "#64748B" }}>
          {backup.current ? `${fmtSize(backup.current.size)} comprimida · ${fmtSize(backup.current.rawSize)} de base` : "Sin copia todavía"}
        </span>
      </div>
      {backup.status === "error" && backup.message && (
        <div role="alert" className="login-notice login-notice-error" style={{ marginBottom: 12 }}>
          {backup.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={() => run(backup.saveNow, "Copia actualizada en este navegador.")} loading={working && backup.status === "saving"} disabled={working}>
          <Icon name="save" size={16} /> Guardar copia ahora
        </Button>
        <Button variant="secondary" onClick={() => run(backup.download)} disabled={working || !backup.current}>
          <Icon name="doc" size={16} /> Descargar copia (.db.gz)
        </Button>
        <Button variant="outline" onClick={() => confirmRestore("current", backup.current?.takenAt)} disabled={working || !backup.current}>
          <Icon name="refresh" size={16} /> Restaurar esta copia en el servidor
        </Button>
      </div>

      {backup.archives?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Copias de bases anteriores</div>
          {backup.archives.map((a) => (
            <div key={a.key} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: "1px solid #E2E8F0" }}>
              <span>{fmtDate(a.takenAt)}</span>
              <span style={{ color: "#64748B" }}>{fmtSize(a.size)}</span>
              <Button variant="outline" onClick={() => confirmRestore(a.key, a.takenAt)} disabled={working}>
                Restaurar
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
