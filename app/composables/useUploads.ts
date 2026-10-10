/* Google Drive upload queue. One recording at a time, oldest first. Nothing uploads while a
   recording is running, so the meeting keeps the whole connection. */

let busy = false;
let again = false;

export function useUploads() {
  const settings = useSettings();
  const lib = useLibrary();

  async function runQueue() {
    if (!settings.clientId || !navigator.onLine) return;
    if (isCapturing()) return; // the recorder runs the queue again when you press Stop
    if (busy) { again = true; return; }
    busy = true;
    again = false;
    try {
      const work = async () => {
        const list = (await recordingsDb.all()).filter((r) => r.status === "saved" && r.upload &&
          (["pending", "uploading", "signin"].includes(r.upload.state) || (r.upload.state === "error" && r.upload.retryable))).reverse();
        for (const rec of list) {
          if (!navigator.onLine || isCapturing()) break;
          if ((await uploadOne(rec)) === "signin") break;
        }
      };
      // One tab uploads at a time, so two open copies of the app don't send the same file twice.
      if (navigator.locks) await navigator.locks.request("screenreel-upload", { ifAvailable: true }, async (lock) => { if (lock) await work(); });
      else await work();
    } catch {
      /* individual failures are recorded on each recording */
    } finally {
      busy = false;
      if (again) runQueue();
    }
  }

  async function queueUpload(id: string) {
    await lib.patch(id, (r) => ({ upload: { ...r.upload, state: "pending", error: "" } }));
    runQueue();
  }

  async function uploadOne(rec: Recording): Promise<"ok" | "skip" | "signin" | "error"> {
    const blob = await lib.blobFor(rec);
    if (!blob) return "skip";
    lib.setProgress(rec.id, 0);
    await lib.patch(rec.id, (r) => ({ upload: { ...r.upload, state: "uploading", error: "" } }));
    try {
      const item = await drive.upload({
        folder: settings.folder, name: rec.name, mime: rec.mime, blob,
        session: rec.upload?.session,
        hold: isCapturing,
        onSession: (session) => { recordingsDb.update(rec.id, (r) => ({ upload: { ...r.upload, session } })).catch(() => {}); },
        onProgress: (f) => lib.setProgress(rec.id, f)
      });
      if (item.size && Number(item.size) !== blob.size) {
        throw new DriveError("Google Drive received " + fmtBytes(Number(item.size)) + " but the recording is " + fmtBytes(blob.size) + ".");
      }
      await lib.patch(rec.id, {
        upload: { state: "done", webUrl: item.webViewLink || "https://drive.google.com/file/d/" + item.id + "/view", itemId: item.id, uploadedAt: Date.now() }
      });
      // Imported videos are still in the phone's gallery, so their local copy is always released.
      if (settings.removeLocal || rec.source === "imported") await lib.releaseLocal(rec.id);
      return "ok";
    } catch (e) {
      const err = e as DriveError;
      if (err?.code === "signin") {
        await markSignInNeeded();
        return "signin";
      }
      await lib.patch(rec.id, (r) => ({
        upload: { state: "error", error: err?.message || String(e), retryable: !!err?.retryable || !navigator.onLine, session: r.upload?.session }
      }));
      return "error";
    }
  }

  async function markSignInNeeded() {
    const list = (await recordingsDb.all()).filter((r) => ["pending", "uploading"].includes(r.upload?.state));
    for (const r of list) await lib.patch(r.id, (cur) => ({ upload: { ...cur.upload, state: "signin" } }));
  }

  async function resumeAfterSignIn() {
    const list = (await recordingsDb.all()).filter((r) => r.upload?.state === "signin");
    for (const r of list) await lib.patch(r.id, (cur) => ({ upload: { ...cur.upload, state: "pending" } }));
    runQueue();
  }

  return { runQueue, queueUpload, resumeAfterSignIn };
}
