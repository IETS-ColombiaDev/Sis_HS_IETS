import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import api, { apiError, setToken } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../realtime/RealtimeContext";
import { useToast } from "../components/Toast";
import { listArchives, loadByKey, loadCurrent, readMeta, saveCurrent } from "./browserStore";

/**
 * Copia extra de la base en IndexedDB del administrador.
 *
 * El origen durable es Firestore (`hs_iets_db`). Esta copia del navegador es un
 * respaldo. Nunca se pisa una copia local de otra epoca con un servidor vacio.
 */
const BackupContext = createContext(null);

const CHECK_MS = 2 * 60 * 1000;
const MIN_EXPORT_GAP_MS = 60 * 1000;
const CHANGE_DEBOUNCE_MS = 12 * 1000;
const RESTORED_FLAG = "iets_hs_restored_at";

function ts(value) {
  const n = Date.parse(value || "");
  return Number.isNaN(n) ? 0 : n;
}

function shouldRestore(info, snap) {
  if (!snap?.blob || !snap.epoch || !snap.takenAt) return false;
  if (snap.epoch !== info.epoch) {
    return ts(info.epoch_created_at) > ts(snap.takenAt) && !info.has_user_work;
  }
  return Boolean(info.untouched_since_restore) && ts(snap.takenAt) > ts(info.restored_snapshot_taken_at);
}

export function BackupProvider({ children }) {
  const { user, can } = useAuth();
  const { version } = useRealtime();
  const toast = useToast();
  const enabled = Boolean(user) && can("config:manage");

  const [state, setState] = useState({
    status: "idle",
    current: readMeta(),
    archives: [],
    supported: true,
    message: "",
    firebase: null,
  });
  const busy = useRef(false);
  const lastExport = useRef(0);
  const triedRestore = useRef(false);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const refreshLocal = useCallback(async (extra = {}) => {
    const current = await loadCurrent();
    const archives = await listArchives();
    setState((s) => ({
      ...s,
      ...extra,
      current: current
        ? { epoch: current.epoch, takenAt: current.takenAt, size: current.blob?.size || 0, rawSize: current.rawSize || 0 }
        : readMeta(),
      archives,
    }));
  }, []);

  const exportNow = useCallback(async (info) => {
    const res = await api.get("/backup/export", { responseType: "blob", timeout: 180000 });
    const headers = res.headers || {};
    const snapshot = {
      blob: res.data,
      epoch: headers["x-backup-epoch"] || info?.epoch || "",
      fingerprint: headers["x-backup-fingerprint"] || info?.fingerprint || "",
      takenAt: headers["x-backup-taken-at"] || new Date().toISOString(),
      rawSize: Number(headers["x-backup-raw-size"] || 0),
      email: user?.email || "",
    };
    await saveCurrent(snapshot);
    lastExport.current = Date.now();
    return snapshot;
  }, [user]);

  const restoreBlob = useCallback(async (blob, { force = false } = {}) => {
    const { data } = await api.post(`/backup/restore${force ? "?force=true" : ""}`, blob, {
      headers: { "Content-Type": "application/octet-stream" },
      transformRequest: [(d) => d],
      timeout: 240000,
    });
    if (data.access_token) setToken(data.access_token);
    sessionStorage.setItem(RESTORED_FLAG, data.snapshot_taken_at || new Date().toISOString());
    window.location.reload();
    return data;
  }, []);

  const sync = useCallback(async ({ manual = false } = {}) => {
    if (!enabled || busy.current) return;
    busy.current = true;
    try {
      const { data: info } = await api.get("/backup/info");
      if (!info.supported) {
        setState((s) => ({ ...s, supported: false, status: "idle", firebase: info.firebase || null }));
        return;
      }
      setState((s) => ({ ...s, firebase: info.firebase || null }));
      const snap = await loadCurrent();
      if (!triedRestore.current) {
        let candidate = shouldRestore(info, snap) ? snap : null;
        if (!candidate) {
          const archives = await listArchives();
          for (const a of archives) {
            const full = await loadByKey(a.key);
            if (shouldRestore(info, full)) {
              candidate = full;
              break;
            }
          }
        }
        if (candidate) {
          triedRestore.current = true;
          setState((s) => ({ ...s, status: "restoring", message: "" }));
          try {
            await restoreBlob(candidate.blob);
            return;
          } catch (e) {
            if (e?.response?.status !== 409) {
              setState((s) => ({ ...s, status: "error", message: apiError(e, "No se pudo restaurar la copia") }));
              return;
            }
          }
        }
      }
      triedRestore.current = true;

      const sameEpoch = Boolean(snap?.epoch && snap.epoch === info.epoch);
      const noSnap = !snap?.blob;
      // Nunca pisar una copia de OTRA base con lo que hay ahora en el servidor:
      // si Render arranco vacio, esa copia es el trabajo del usuario.
      const mayExport = manual || noSnap || sameEpoch;
      if (!mayExport) {
        await refreshLocal({ status: "idle", message: "" });
        return;
      }
      const stale = noSnap || snap.fingerprint !== info.fingerprint || snap.epoch !== info.epoch;
      if (!stale) {
        await refreshLocal({ status: "idle", message: "" });
        return;
      }
      if (!manual && lastExport.current && Date.now() - lastExport.current < MIN_EXPORT_GAP_MS) {
        return;
      }
      setState((s) => ({ ...s, status: "saving", message: "" }));
      await exportNow(info);
      await refreshLocal({ status: "idle", message: "" });
    } catch (e) {
      setState((s) => ({ ...s, status: "error", message: apiError(e, "No se pudo guardar la copia local") }));
    } finally {
      busy.current = false;
    }
  }, [enabled, exportNow, refreshLocal, restoreBlob]);

  useEffect(() => {
    const restoredAt = sessionStorage.getItem(RESTORED_FLAG);
    if (restoredAt && user) {
      sessionStorage.removeItem(RESTORED_FLAG);
      toastRef.current.success(
        `El servidor se reinició sin datos y se restauraron desde este navegador (copia del ${new Date(restoredAt).toLocaleString("es-CO")}).`
      );
    }
  }, [user]);

  useEffect(() => {
    if (!enabled) return undefined;
    refreshLocal();
    sync();
    const timer = setInterval(() => sync(), CHECK_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") sync();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [enabled, refreshLocal, sync]);

  const firstVersion = useRef(true);
  useEffect(() => {
    if (!enabled || !version) return undefined;
    if (firstVersion.current) {
      firstVersion.current = false;
      return undefined;
    }
    const t = setTimeout(() => sync(), CHANGE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [enabled, version, sync]);

  const saveNow = useCallback(() => sync({ manual: true }), [sync]);

  const download = useCallback(async () => {
    const snap = await loadCurrent();
    if (!snap?.blob) throw new Error("Aún no hay copia guardada en este navegador.");
    const url = URL.createObjectURL(snap.blob);
    const a = document.createElement("a");
    const stamp = (snap.takenAt || new Date().toISOString()).slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `iets_horizonte-${stamp}.db.gz`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, []);

  const restoreFrom = useCallback(async (key = "current") => {
    const snap = await loadByKey(key);
    if (!snap?.blob) throw new Error("No hay copia para restaurar.");
    setState((s) => ({ ...s, status: "restoring", message: "" }));
    try {
      return await restoreBlob(snap.blob, { force: true });
    } catch (e) {
      setState((s) => ({ ...s, status: "error", message: apiError(e, "No se pudo restaurar la copia") }));
      throw e;
    }
  }, [restoreBlob]);

  const refreshFirebase = useCallback(async () => {
    const { data: info } = await api.get("/backup/info");
    setState((s) => ({
      ...s,
      firebase: info.firebase || null,
      supported: info.supported !== false,
    }));
  }, []);

  const value = { enabled, ...state, saveNow, download, restoreFrom, refreshFirebase };
  return <BackupContext.Provider value={value}>{children}</BackupContext.Provider>;
}

export function useBackup() {
  return useContext(BackupContext) || { enabled: false };
}
