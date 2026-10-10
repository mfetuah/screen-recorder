/* The list of recordings on this device, their playable video URLs and upload progress. */

const recordings = ref<Recording[]>([]);
const memoryOnly = ref<Recording[]>([]); // takes the device had no room to store at all
const urls = reactive(new Map<string, string>());
const progress = reactive(new Map<string, number>());
const storageInfo = ref("");
// Video held in memory: picked files (the original stays in the phone's gallery), and takes
// that couldn't be fully written to storage.
const memBlobs = new Map<string, Blob>();
const loading = new Map<string, Promise<void>>();

const INBOX = "screenreel-inbox";
const LOCK_PREFIX = "screenreel-rec-";

export function useLibrary() {
  const settings = useSettings();
  const all = computed(() => [...memoryOnly.value, ...recordings.value]);

  async function refresh() {
    let list: Recording[] = [];
    try { list = (await recordingsDb.all()).filter((r) => r.status === "saved"); }
    catch { /* storage unavailable; memory-only entries still show */ }
    const keep = new Set([...list, ...memoryOnly.value].map((r) => r.id));
    for (const [id, url] of urls) {
      if (!keep.has(id)) { URL.revokeObjectURL(url); urls.delete(id); }
    }
    recordings.value = list;
    await Promise.all(list.map(ensureUrl));
    updateStorageInfo();
  }

  function ensureUrl(rec: Recording): Promise<void> {
    if (urls.has(rec.id)) return Promise.resolve();
    if (!memBlobs.has(rec.id) && (rec.localRemoved || rec.memOnly)) return Promise.resolve();
    let p = loading.get(rec.id);
    if (!p) {
      p = (async () => {
        const blob = memBlobs.get(rec.id) || await recordingsDb.blob(rec);
        if (blob.size && !urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(blob));
      })().catch(() => {}).finally(() => loading.delete(rec.id));
      loading.set(rec.id, p);
    }
    return p;
  }

  async function blobFor(rec: Recording): Promise<Blob | null> {
    const mem = memBlobs.get(rec.id);
    if (mem) return mem;
    if (rec.localRemoved || rec.memOnly) return null;
    return recordingsDb.blob(rec);
  }

  async function patch(id: string, change: Partial<Recording> | ((r: Recording) => Partial<Recording>)) {
    const rec = await recordingsDb.update(id, change);
    if (!rec) return null;
    const i = recordings.value.findIndex((r) => r.id === id);
    if (i >= 0) recordings.value.splice(i, 1, rec);
    else if (rec.status === "saved") await refresh();
    return rec;
  }

  function setProgress(id: string, fraction: number) {
    progress.set(id, fraction);
  }

  async function releaseLocal(id: string) {
    memBlobs.delete(id);
    await recordingsDb.dropChunks(id);
    const url = urls.get(id);
    if (url) { URL.revokeObjectURL(url); urls.delete(id); }
    await patch(id, { localRemoved: true });
  }

  async function remove(id: string) {
    const url = urls.get(id);
    if (url) { URL.revokeObjectURL(url); urls.delete(id); }
    memBlobs.delete(id);
    memoryOnly.value = memoryOnly.value.filter((r) => r.id !== id);
    recordings.value = recordings.value.filter((r) => r.id !== id);
    try { await recordingsDb.remove(id); } catch { /* already gone */ }
    updateStorageInfo();
  }

  function keepInMemory(id: string, blob: Blob) {
    memBlobs.set(id, blob);
  }

  // Used only when device storage failed completely, so the take can still be downloaded.
  function addMemoryOnly(rec: Recording, blob: Blob) {
    memBlobs.set(rec.id, blob);
    urls.set(rec.id, URL.createObjectURL(blob));
    memoryOnly.value = [rec, ...memoryOnly.value];
  }

  async function download(rec: Recording) {
    let url = urls.get(rec.id);
    if (!url) {
      const blob = await blobFor(rec);
      if (!blob) return;
      url = URL.createObjectURL(blob);
      urls.set(rec.id, url);
    }
    saveBlob(url, rec.name);
  }

  // Phones: videos picked from the gallery. Kept in memory only, since the original stays on the phone.
  async function importFiles(files: File[]) {
    if (!files.length) return;
    for (const f of files) {
      const id = recordingsDb.newId();
      memBlobs.set(id, f);
      await recordingsDb.put({
        id, name: f.name || "phone-recording-" + stamp() + ".mp4", mime: f.type || "video/mp4",
        createdAt: f.lastModified || Date.now(), status: "saved", size: f.size, durationMs: null,
        source: "imported", memOnly: true, upload: { state: settings.clientId ? "pending" : "none" }
      });
    }
    await refresh();
    if (!settings.clientId) useUi().openSettings();
    else useUploads().runQueue();
  }

  // Android "Share → Screenreel": the service worker parks shared videos in a cache; move them in.
  async function importInbox(): Promise<number> {
    if (!("caches" in window)) return 0;
    let n = 0;
    try {
      const cache = await caches.open(INBOX);
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        if (!res) continue;
        const blob = await res.blob();
        const id = recordingsDb.newId();
        await recordingsDb.addChunk(id, 0, blob);
        await recordingsDb.put({
          id, name: decodeURIComponent(res.headers.get("X-Name") || "") || "shared-video-" + stamp() + ".mp4",
          mime: blob.type || "video/mp4", createdAt: Number(res.headers.get("X-Created")) || Date.now(),
          status: "saved", size: blob.size, durationMs: null, source: "imported", upload: { state: "pending" }
        });
        await cache.delete(req);
        n++;
      }
    } catch { /* nothing shared, or caches unavailable */ }
    return n;
  }

  // Finalises recordings whose tab or browser closed mid-recording. Returns how many were saved.
  async function recoverInterrupted(): Promise<number> {
    const list = await recordingsDb.all();
    const live = new Set<string>();
    try {
      const q = await navigator.locks?.query();
      q?.held?.forEach((l) => l.name && live.add(l.name));
    } catch { /* lock query unsupported */ }
    let n = 0;
    for (const r of list) {
      if (r.status === "recording" && !live.has(LOCK_PREFIX + r.id)) {
        const blob = await recordingsDb.blob(r);
        if (!blob.size) { await recordingsDb.remove(r.id); continue; }
        await recordingsDb.update(r.id, {
          status: "saved", size: blob.size, recovered: true,
          upload: { state: settings.autoUpload && settings.clientId ? "pending" : "none" }
        });
        n++;
      } else if (r.memOnly && !memBlobs.has(r.id) && !["done", "error"].includes(r.upload?.state)) {
        await recordingsDb.update(r.id, {
          upload: { state: "error", error: "The page closed before this upload finished. Pick the video again with Send a recording to Google Drive." }
        });
      }
    }
    return n;
  }

  async function updateStorageInfo() {
    try {
      const est = await navigator.storage.estimate();
      storageInfo.value = "Using " + fmtBytes(est.usage || 0) + " of about " + fmtBytes(est.quota || 0) + " on this device";
    } catch { storageInfo.value = ""; }
  }

  return {
    recordings: all, urls, progress, storageInfo,
    refresh, patch, setProgress, blobFor, releaseLocal, remove, keepInMemory, addMemoryOnly, download,
    importFiles, importInbox, recoverInterrupted, LOCK_PREFIX
  };
}
