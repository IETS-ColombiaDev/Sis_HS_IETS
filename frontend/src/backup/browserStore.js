/**
 * Copia de la base guardada en IndexedDB del navegador.
 *
 * "current" es la copia vigente. Si el servidor cambia de epoch (Render borro
 * el disco) la copia anterior pasa a archive:<epoch> y no se pisa.
 */
const DB_NAME = "iets_hs_backup";
const STORE = "snapshots";
const CURRENT = "current";
const MAX_ARCHIVES = 5;
const META_KEY = "iets_hs_backup_meta";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador no permite guardar la copia local (IndexedDB)."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function complete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB abortó la transacción"));
  });
}

function asBlob(value) {
  if (!value) return null;
  if (value instanceof Blob) return value;
  if (value instanceof ArrayBuffer) return new Blob([value], { type: "application/gzip" });
  if (ArrayBuffer.isView(value)) {
    return new Blob([value.buffer], { type: "application/gzip" });
  }
  return null;
}

function normalize(row) {
  if (!row) return null;
  const blob = asBlob(row.blob);
  return blob ? { ...row, blob } : null;
}

function writeMeta(snapshot) {
  try {
    localStorage.setItem(
      META_KEY,
      JSON.stringify({
        epoch: snapshot.epoch || "",
        takenAt: snapshot.takenAt || "",
        size: snapshot.blob?.size || 0,
        rawSize: snapshot.rawSize || 0,
        email: snapshot.email || "",
      })
    );
  } catch {
    /* cuota o modo privado */
  }
}

export function readMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    await complete(tx);
    return result;
  } finally {
    db.close();
  }
}

export async function loadCurrent() {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      const row = await idbReq(tx.objectStore(STORE).get(CURRENT));
      await complete(tx);
      return normalize(row);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function listArchives() {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const keysReq = store.getAllKeys();
      const valuesReq = store.getAll();
      const [keys, values] = await Promise.all([idbReq(keysReq), idbReq(valuesReq)]);
      await complete(tx);
      return keys
        .map((k, i) => ({ key: k, ...values[i] }))
        .filter((r) => String(r.key).startsWith("archive:"))
        .map(({ blob, ...meta }) => ({ ...meta, size: asBlob(blob)?.size || 0 }))
        .sort((a, b) => String(b.takenAt || "").localeCompare(String(a.takenAt || "")));
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

export async function loadByKey(key) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await idbReq(tx.objectStore(STORE).get(key));
    await complete(tx);
    return normalize(row);
  } finally {
    db.close();
  }
}

/** Guarda la copia vigente. Si la anterior era de otra base, la archiva. */
export async function saveCurrent(snapshot) {
  const previous = await loadCurrent();
  const toStore = {
    ...snapshot,
    blob: asBlob(snapshot.blob),
  };
  await withStore("readwrite", (store) => {
    if (previous?.epoch && previous.epoch !== toStore.epoch && previous.blob) {
      store.put(previous, `archive:${previous.epoch}`);
    }
    store.put(toStore, CURRENT);
  });
  writeMeta(toStore);
  await pruneArchives();
}

async function pruneArchives() {
  const archives = await listArchives();
  const extra = archives.slice(MAX_ARCHIVES);
  if (!extra.length) return;
  await withStore("readwrite", (store) => {
    extra.forEach((a) => store.delete(a.key));
  });
}
