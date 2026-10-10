/* On-device storage (IndexedDB).
   A recording is a metadata row plus ordered chunks of video. Chunks are written while
   recording, so a long meeting is already on disk if the tab, browser or laptop dies. */

export type UploadStateName = "none" | "pending" | "uploading" | "done" | "signin" | "error";

export interface DriveSession { url: string; expires: number }

export interface UploadInfo {
  state: UploadStateName;
  error?: string;
  retryable?: boolean;
  session?: DriveSession | null;
  webUrl?: string;
  itemId?: string;
  uploadedAt?: number;
}

export interface Recording {
  id: string;
  name: string;
  mime: string;
  createdAt: number;
  status: "recording" | "saved";
  size: number;
  durationMs: number | null;
  width?: number;
  height?: number;
  audio?: string;
  source: "screen" | "imported";
  upload: UploadInfo;
  recovered?: boolean;
  incomplete?: boolean;
  memOnly?: boolean;      // video only held in memory (picked from the phone's gallery)
  localRemoved?: boolean; // video data dropped after it reached Google Drive
}

const DB_NAME = "screenreel";
const DB_VERSION = 1;
const MAX = Number.MAX_SAFE_INTEGER;
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("recordings")) db.createObjectStore("recordings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: ["recId", "seq"] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

const done = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const finished = (t: IDBTransaction) => new Promise<void>((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = () => reject(t.error);
  t.onabort = () => reject(t.error || new Error("Storage write was aborted"));
});

async function os(name: string, mode: IDBTransactionMode) {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

const chunkRange = (id: string) => IDBKeyRange.bound([id, 0], [id, MAX]);

export const recordingsDb = {
  newId(): string {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  },

  async put(rec: Recording): Promise<Recording> {
    await done((await os("recordings", "readwrite")).put(rec));
    return rec;
  },

  async get(id: string): Promise<Recording | undefined> {
    return done((await os("recordings", "readonly")).get(id));
  },

  async all(): Promise<Recording[]> {
    const list: Recording[] = await done((await os("recordings", "readonly")).getAll());
    return list.sort((a, b) => b.createdAt - a.createdAt);
  },

  // Read-modify-write in one transaction. `patch` is an object or a function of the current row.
  async update(id: string, patch: Partial<Recording> | ((r: Recording) => Partial<Recording>)): Promise<Recording | null> {
    const db = await open();
    const t = db.transaction("recordings", "readwrite");
    const store = t.objectStore("recordings");
    let rec: Recording | null = null;
    store.get(id).onsuccess = (e) => {
      rec = (e.target as IDBRequest<Recording>).result || null;
      if (!rec) return;
      Object.assign(rec, typeof patch === "function" ? patch(rec) : patch);
      store.put(rec);
    };
    await finished(t);
    return rec;
  },

  async addChunk(recId: string, seq: number, data: Blob): Promise<void> {
    await done((await os("chunks", "readwrite")).put({ recId, seq, data }));
  },

  async chunks(recId: string): Promise<Blob[]> {
    const rows: { data: Blob }[] = await done((await os("chunks", "readonly")).getAll(chunkRange(recId)));
    return rows.map((r) => r.data);
  },

  async blob(rec: Recording): Promise<Blob> {
    const parts = await recordingsDb.chunks(rec.id);
    return new Blob(parts, { type: (rec.mime || "video/webm").split(";")[0] });
  },

  // Removes the video data but keeps the row (used after a recording is safely in Google Drive).
  async dropChunks(id: string): Promise<void> {
    const db = await open();
    const t = db.transaction("chunks", "readwrite");
    t.objectStore("chunks").delete(chunkRange(id));
    await finished(t);
  },

  async remove(id: string): Promise<void> {
    const db = await open();
    const t = db.transaction(["recordings", "chunks"], "readwrite");
    t.objectStore("recordings").delete(id);
    t.objectStore("chunks").delete(chunkRange(id));
    await finished(t);
  }
};
