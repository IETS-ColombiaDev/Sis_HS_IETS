import { useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
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
  const { refreshStatus } = useAuth();
  const toast = useToast();
  const [working, setWorking] = useState(false);

  if (!backup.enabled) return null;

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

  const fb = backup.firebase;
  const pushFirebase = () =>
    run(async () => {
      const { data } = await api.post("/backup/firebase/push");
      if (!data?.ok) throw new Error(data?.reason || "Firestore no aceptó la copia");
      await backup.refreshFirebase?.();
      await refreshStatus?.();
    }, "Base publicada en Firebase.");

  const pullFirebase = () => {
    const ok = window.confirm(
      "Se reemplazará toda la base del servidor por la copia publicada en Firebase. " +
        "Lo registrado aquí después de esa publicación se perderá. ¿Continuar?"
    );
    if (!ok) return;
    run(async () => {
      const { data } = await api.post("/backup/firebase/pull");
      if (!data?.ok) throw new Error(data?.reason || "No se pudo leer Firestore");
      if (data.restored) {
        window.location.reload();
        return;
      }
      await backup.refreshFirebase?.();
      toast.success(data.kept_local ? "El servidor ya tenía el trabajo más reciente." : "Firebase no tiene copia todavía.");
    });
  };

  const firebaseCard = (
    <Card data-testid="firebase-db-panel">
      <SectionTitle>Base en Firebase</SectionTitle>
      <p style={{ color: "#475569", fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
        Este proyecto tiene su propio espacio en Firestore: colección <strong>hs_iets_db</strong>,
        aparte del directorio RRHH. SQLite solo es el motor local; al arrancar se restaura y
        cada cambio se publica. El disco de Render puede borrarse sin perder el trabajo.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Badge tone={fb?.enabled ? (fb?.synced ? "ok" : fb?.error ? "error" : "warning") : "default"}>
          {fb?.enabled ? (fb?.synced ? "Sincronizada" : fb?.error ? "Con error" : "Pendiente") : "Sin credencial"}
        </Badge>
        <span style={{ fontSize: 13.5 }}>
          Última publicación: <strong>{fmtDate(fb?.taken_at)}</strong>
        </span>
        <span style={{ fontSize: 13.5, color: "#64748B" }}>
          {fb?.collection || "hs_iets_db"}
          {fb?.database ? ` · ${fb.database}` : ""}
          {fb?.gzip_size ? ` · ${fmtSize(fb.gzip_size)}` : ""}
          {fb?.project_id ? ` · ${fb.project_id}` : ""}
        </span>
      </div>
      {fb?.error ? (
        <div role="alert" className="login-notice login-notice-error" style={{ marginBottom: 12 }}>
          {fb.error}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={pushFirebase} loading={working} disabled={working || !fb?.configured}>
          <Icon name="save" size={16} /> Publicar ahora en Firebase
        </Button>
        <Button variant="outline" onClick={pullFirebase} disabled={working || !fb?.configured}>
          <Icon name="refresh" size={16} /> Restaurar desde Firebase
        </Button>
      </div>
      {!fb?.configured ? (
        <p style={{ fontSize: 13, color: "#92400E", marginTop: 10 }}>
          Defina <code>FIREBASE_SERVICE_ACCOUNT_KEY</code> en el servidor. La persistencia usa la base
          nombrada <code>hs-iets</code>, no la base <code>(default)</code> del directorio RRHH.
        </p>
      ) : null}
    </Card>
  );

  if (!backup.supported) {
    return (
      <>
        {firebaseCard}
        <Card>
          <SectionTitle>Copia en este navegador</SectionTitle>
          <p style={{ color: "#64748B", fontSize: 13.5 }}>
            El servidor usa una base PostgreSQL persistente: no hace falta guardar copia en el navegador.
          </p>
        </Card>
      </>
    );
  }

  const st = STATUS[backup.status] || STATUS.idle;
  const confirmRestore = (key, takenAt) => {
    const ok = window.confirm(
      `Se reemplazará toda la base del servidor por la copia del ${fmtDate(takenAt)}. ` +
        "Lo registrado en el servidor después de esa fecha se perderá. ¿Continuar?"
    );
    if (ok) run(() => backup.restoreFrom(key));
  };

  return (
    <>
    {firebaseCard}
    <Card data-testid="browser-backup-panel">
      <SectionTitle>Copia de respaldo en este navegador</SectionTitle>
      <p style={{ color: "#475569", fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
        Copia extra en este navegador. La fuente de verdad es Firebase; esto sirve si hay que
        recuperar un momento anterior sin tocar Firestore.
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
    </>
  );
}
