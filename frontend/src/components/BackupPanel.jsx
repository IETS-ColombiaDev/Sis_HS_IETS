import { useState } from "react";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useBackup } from "../backup/BackupContext";
import { useToast } from "./Toast";
import { Card, SectionTitle } from "./Card";
import Button from "./Button";
import Badge from "./Badge";
import Icon from "./Icon";
import RecoveryPoints from "./RecoveryPoints";
import { t, tr, ts, intlLocale } from "../i18n";

function fmtSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString(intlLocale()) : t("Sin fecha");
}

const STATUS = {
  idle: { tone: "ok", label: t("Al día") },
  saving: { tone: "warning", label: t("Guardando…") },
  restoring: { tone: "warning", label: t("Restaurando…") },
  error: { tone: "error", label: t("Con error") },
};

const PUSH_REASONS = {
  shrink_guard: t("Copia bloqueada: la base del servidor es mucho menor que la guardada en Firebase. No se sobrescribió."),
  count_guard: t("Copia bloqueada: la base del servidor tiene menos datos que la guardada en Firebase. No se sobrescribió."),
  pull_pending: t("Aún no se pudo leer Firebase; la copia queda en pausa y se reintenta sola."),
  busy: t("Hay otra copia en curso. Intente de nuevo en un momento."),
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
      toast.error(ts(e?.message) || t("No se pudo completar la acción"));
    } finally {
      setWorking(false);
    }
  };

  const fb = backup.firebase;
  const pushFirebase = () =>
    run(async () => {
      const { data } = await api.post("/backup/firebase/push");
      if (!data?.ok) {
        await backup.refreshFirebase?.();
        throw new Error(PUSH_REASONS[data?.reason] || ts(data?.reason) || t("Firestore no aceptó la copia"));
      }
      await backup.refreshFirebase?.();
      await refreshStatus?.();
    }, t("Base publicada en Firebase."));

  // Una guarda bloqueo la copia y el superadministrador decide que la base del
  // servidor es la correcta. La copia guardada queda como punto de recuperacion.
  const overrideFirebase = () => {
    const typed = window.prompt(
      t("La base del servidor tiene menos datos que la copia guardada en Firebase.") + "\n" +
        t("Si publica de todos modos, la copia guardada queda como punto de recuperación y se puede restaurar.") + "\n\n" +
        t("Para continuar escriba PUBLICAR:")
    );
    if (typed == null) return;
    if (typed.trim().toUpperCase() !== "PUBLICAR") {
      toast.warning(t("No se publicó: debía escribir PUBLICAR."));
      return;
    }
    run(async () => {
      const { data } = await api.post("/backup/firebase/push", null, { params: { override: true }, timeout: 240000 });
      await backup.refreshFirebase?.();
      if (!data?.ok) throw new Error(PUSH_REASONS[data?.reason] || ts(data?.reason) || t("Firestore no aceptó la copia"));
    }, t("Base publicada. La copia anterior quedó como punto de recuperación."));
  };

  const pullFirebase = () => {
    const ok = window.confirm(
      t("Se reemplazará toda la base del servidor por la copia publicada en Firebase. Lo registrado aquí después de esa publicación se perderá. ¿Continuar?")
    );
    if (!ok) return;
    run(async () => {
      const { data } = await api.post("/backup/firebase/pull");
      if (!data?.ok) throw new Error(ts(data?.reason) || t("No se pudo leer Firestore"));
      if (data.restored) {
        window.location.reload();
        return;
      }
      await backup.refreshFirebase?.();
      toast.success(data.kept_local ? t("El servidor ya tenía el trabajo más reciente.") : t("Firebase no tiene copia todavía."));
    });
  };

  const firebaseCard = (
    <Card data-testid="firebase-db-panel">
      <SectionTitle>{t("Base en Firebase")}</SectionTitle>
      <p style={{ color: "#475569", fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
        {tr(
          "Este proyecto tiene su propio espacio en Firestore: colección <b>hs_iets_db</b>, aparte del directorio RRHH. SQLite solo es el motor local; al arrancar se restaura y cada cambio se publica. El disco de Render puede borrarse sin perder el trabajo. Una base con menos datos que la guardada nunca la sobrescribe.",
          null,
          { b: (c) => <strong>{c}</strong> }
        )}
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Badge tone={fb?.enabled ? (fb?.synced ? "ok" : fb?.error ? "error" : "warning") : "default"}>
          {fb?.enabled ? (fb?.synced ? t("Sincronizada") : fb?.error ? t("Con error") : t("Pendiente")) : t("Sin credencial")}
        </Badge>
        <span style={{ fontSize: 13.5 }}>
          {tr("Última publicación: <b>{date}</b>", { date: fmtDate(fb?.taken_at) }, { b: (c) => <strong>{c}</strong> })}
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
          {ts(fb.error)}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={pushFirebase} loading={working} disabled={working || !fb?.configured}>
          <Icon name="save" size={16} /> {t("Publicar ahora en Firebase")}
        </Button>
        <Button variant="outline" onClick={pullFirebase} disabled={working || !fb?.configured}>
          <Icon name="refresh" size={16} /> {t("Restaurar desde Firebase")}
        </Button>
        {fb?.blocked_shrink ? (
          <Button variant="outline" onClick={overrideFirebase} disabled={working} data-testid="firebase-override">
            {t("Publicar de todos modos")}
          </Button>
        ) : null}
      </div>
      {fb?.enabled ? <RecoveryPoints disabled={working} /> : null}
      {!fb?.configured ? (
        <p style={{ fontSize: 13, color: "#92400E", marginTop: 10 }}>
          {tr(
            "Defina <c>FIREBASE_SERVICE_ACCOUNT_KEY</c> en el servidor. La copia vive en la colección exclusiva <c>hs_iets_db</c>, aparte de la colección de usuarios del directorio RRHH.",
            null,
            { c: (c) => <code>{c}</code> }
          )}
        </p>
      ) : null}
    </Card>
  );

  if (!backup.supported) {
    return (
      <>
        {firebaseCard}
        <Card>
          <SectionTitle>{t("Copia en este navegador")}</SectionTitle>
          <p style={{ color: "#64748B", fontSize: 13.5 }}>
            {t("El servidor usa una base PostgreSQL persistente: no hace falta guardar copia en el navegador.")}
          </p>
        </Card>
      </>
    );
  }

  const st = STATUS[backup.status] || STATUS.idle;
  const confirmRestore = (key, takenAt) => {
    const ok = window.confirm(
      t("Se reemplazará toda la base del servidor por la copia del {date}. Lo registrado en el servidor después de esa fecha se perderá. ¿Continuar?", { date: fmtDate(takenAt) })
    );
    if (ok) run(() => backup.restoreFrom(key));
  };

  return (
    <>
    {firebaseCard}
    <Card data-testid="browser-backup-panel">
      <SectionTitle>{t("Copia de respaldo en este navegador")}</SectionTitle>
      <p style={{ color: "#475569", fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
        {t("Copia extra en este navegador. La fuente de verdad es Firebase; esto sirve si hay que recuperar un momento anterior sin tocar Firestore.")}
      </p>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Badge tone={st.tone}>{st.label}</Badge>
        <span style={{ fontSize: 13.5 }}>
          {tr("Última copia: <b>{date}</b>", { date: fmtDate(backup.current?.takenAt) }, { b: (c) => <strong>{c}</strong> })}
        </span>
        <span style={{ fontSize: 13.5, color: "#64748B" }}>
          {backup.current ? t("{size} comprimida · {raw} de base", { size: fmtSize(backup.current.size), raw: fmtSize(backup.current.rawSize) }) : t("Sin copia todavía")}
        </span>
      </div>
      {backup.status === "error" && backup.message && (
        <div role="alert" className="login-notice login-notice-error" style={{ marginBottom: 12 }}>
          {backup.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={() => run(backup.saveNow, t("Copia actualizada en este navegador."))} loading={working && backup.status === "saving"} disabled={working}>
          <Icon name="save" size={16} /> {t("Guardar copia ahora")}
        </Button>
        <Button variant="secondary" onClick={() => run(backup.download)} disabled={working || !backup.current}>
          <Icon name="doc" size={16} /> {t("Descargar copia (.db.gz)")}
        </Button>
        <Button variant="outline" onClick={() => confirmRestore("current", backup.current?.takenAt)} disabled={working || !backup.current}>
          <Icon name="refresh" size={16} /> {t("Restaurar esta copia en el servidor")}
        </Button>
      </div>

      {backup.archives?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t("Copias de bases anteriores")}</div>
          {backup.archives.map((a) => (
            <div key={a.key} style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, padding: "6px 0", borderTop: "1px solid #E2E8F0" }}>
              <span>{fmtDate(a.takenAt)}</span>
              <span style={{ color: "#64748B" }}>{fmtSize(a.size)}</span>
              <Button variant="outline" onClick={() => confirmRestore(a.key, a.takenAt)} disabled={working}>
                {t("Restaurar")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
    </>
  );
}
