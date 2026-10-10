/* Google Drive upload.
   Sign-in uses Google Identity Services: a short pop-up hands back an access token that lasts
   about an hour. After the first time it closes on its own without asking anything.
   Files go up through resumable uploads in 8 MB pieces, so a long meeting survives a dropped
   connection and continues where it stopped. Pieces don't need the token, so an upload that
   outlasts the hour keeps going. */
import type { DriveSession } from "./recordingsDb";

interface TokenResponse { access_token?: string; expires_in?: number | string; error?: string; error_description?: string }
interface TokenClient { requestAccessToken(opts?: { prompt?: string; login_hint?: string }): void }
interface GoogleOAuth {
  initTokenClient(cfg: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string }) => void;
  }): TokenClient;
  hasGrantedAllScopes(r: TokenResponse, scope: string): boolean;
  revoke(token: string, done: () => void): void;
}
declare global {
  interface Window { google?: { accounts?: { oauth2?: GoogleOAuth } } }
}

export interface DriveAccount { email: string; name: string }
export interface DriveFile { id: string; name: string; size?: string; webViewLink?: string }

export class DriveError extends Error {
  code?: string;
  retryable?: boolean;
  constructor(message: string, opts: { code?: string; retryable?: boolean } = {}) {
    super(message);
    this.code = opts.code;
    this.retryable = opts.retryable;
  }
}

const SCOPE = "https://www.googleapis.com/auth/drive.file"; // only files this app creates
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const PIECE = 256 * 1024 * 32; // 8 MiB; Drive requires multiples of 256 KiB
const GIS_SRC = "https://accounts.google.com/gsi/client";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const K_TOKEN = "screenreel.gtoken";
const K_ACCOUNT = "screenreel.gaccount";
const K_FOLDER = "screenreel.gfolder";

let gisLoading: Promise<void> | null = null;
let client: TokenClient | null = null;
let clientFor = "";
let pending: { resolve: (a: DriveAccount) => void; reject: (e: Error) => void } | null = null;

const oauth = () => window.google?.accounts?.oauth2;

function loadGis(): Promise<void> {
  if (oauth()) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoading = null; reject(new Error("Couldn't load Google sign-in. Check your internet connection.")); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

function read<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
}
function write(k: string, v: unknown) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ }
}

const signInError = (msg?: string) => new DriveError(msg || "Sign in to Google Drive to upload.", { code: "signin" });

function settle(ok: true, v: DriveAccount): void;
function settle(ok: false, v: Error): void;
function settle(ok: boolean, v: DriveAccount | Error) {
  const p = pending;
  pending = null;
  if (!p) return;
  if (ok) p.resolve(v as DriveAccount);
  else p.reject(v as Error);
}

async function onToken(resp: TokenResponse) {
  if (resp.error || !resp.access_token) {
    settle(false, new Error(resp.error === "access_denied" ? "Google sign-in was declined." : "Google sign-in failed: " + (resp.error_description || resp.error)));
    return;
  }
  if (!oauth()!.hasGrantedAllScopes(resp, SCOPE)) {
    settle(false, new Error("Screenreel needs permission to add files to your Google Drive. Sign in again and tick that box."));
    return;
  }
  write(K_TOKEN, { token: resp.access_token, expires: Date.now() + Number(resp.expires_in || 3600) * 1000 });
  let account: DriveAccount = { email: "", name: "" };
  try {
    const r = await fetch(API + "/about?fields=user(emailAddress,displayName)", { headers: { Authorization: "Bearer " + resp.access_token } });
    const user = r.ok ? ((await r.json()).user || {}) : {};
    account = { email: user.emailAddress || "", name: user.displayName || "" };
  } catch { /* the account name is only for display */ }
  write(K_ACCOUNT, account);
  settle(true, account);
}

export const drive = {
  // Load Google's sign-in script early so the sign-in pop-up opens straight from a click.
  async prepare(clientId: string): Promise<void> {
    if (!clientId) throw signInError("Add your Google client ID in Settings to connect Google Drive.");
    await loadGis();
    if (client && clientFor === clientId) return;
    client = oauth()!.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: onToken,
      error_callback: (err) => {
        const type = err?.type || "unknown";
        settle(false, new DriveError(
          type === "popup_closed" ? "Sign-in was cancelled."
            : type === "popup_failed_to_open" ? "The sign-in window was blocked. Allow pop-ups for this site, then try again."
            : "Google sign-in failed (" + type + ").",
          { code: type }));
      }
    });
    clientFor = clientId;
  },

  // The signed-in account, or null. Remembered until sign-out, even after the token expires.
  account(): DriveAccount | null {
    const a = read<DriveAccount>(K_ACCOUNT);
    return a && (a.email || a.name) ? a : null;
  },

  hasToken(): boolean {
    const t = read<{ expires: number }>(K_TOKEN);
    return !!(t && t.expires > Date.now() + 60000);
  },

  // Must be called from a click; browsers block pop-ups that don't follow one.
  async signIn(clientId: string, email: string, switchAccount = false): Promise<DriveAccount> {
    await drive.prepare(clientId);
    if (pending) settle(false, new Error("Sign-in was restarted."));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      const hint = email || drive.account()?.email;
      const req: { prompt: string; login_hint?: string } = { prompt: switchAccount ? "select_account" : "" };
      if (hint && !switchAccount) req.login_hint = hint;
      client!.requestAccessToken(req);
    });
  },

  async signOut(): Promise<void> {
    const t = read<{ token: string }>(K_TOKEN);
    write(K_TOKEN, null);
    write(K_ACCOUNT, null);
    write(K_FOLDER, null);
    const o = oauth();
    if (t && o) await new Promise<void>((r) => o.revoke(t.token, r));
  },

  token(): string {
    const t = read<{ token: string; expires: number }>(K_TOKEN);
    if (t && t.expires > Date.now() + 60000) return t.token;
    throw signInError(drive.account() ? "Your Google sign-in has expired (it lasts about an hour). Sign in again to continue uploading." : undefined);
  },

  /* Uploads `blob` as `name` into `folder` (created if missing). Pass `session` from a previous
     attempt to resume. `onSession` receives the session to remember, or null to discard it.
     `hold` pauses between pieces while it returns true (e.g. while a new recording runs). */
  async upload(opts: {
    folder: string;
    name: string;
    mime: string;
    blob: Blob;
    session?: DriveSession | null;
    onSession?: (s: DriveSession | null) => void;
    onProgress?: (fraction: number) => void;
    hold?: () => boolean;
  }): Promise<DriveFile> {
    const { folder, name, blob, session, onSession, onProgress, hold } = opts;
    const total = blob.size;
    if (!total) throw new DriveError("This recording is empty, so there is nothing to upload.");
    const type = (opts.mime || blob.type || "video/mp4").split(";")[0]!;

    let url: string | null = null;
    let offset = 0;
    if (session?.url && session.expires > Date.now() + 60000) {
      try {
        const r = await fetch(session.url, { method: "PUT", headers: { "Content-Range": "bytes */" + total } });
        if (r.status === 200 || r.status === 201) {
          onSession?.(null);
          return r.json();
        }
        if (r.status === 308) {
          url = session.url;
          offset = rangeEnd(r, 0);
        }
      } catch { /* start a fresh session below */ }
    }

    if (!url) {
      const tok = drive.token();
      const parent = await ensureFolder(tok, folder);
      const meta: { name: string; mimeType: string; parents?: string[] } = { name, mimeType: type };
      if (parent) meta.parents = [parent];
      const r = await fetch(UPLOAD + "?uploadType=resumable&fields=id,name,size,webViewLink", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + tok,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": type,
          "X-Upload-Content-Length": String(total)
        },
        body: JSON.stringify(meta)
      });
      if (!r.ok) throw await apiError(r);
      url = r.headers.get("Location");
      if (!url) throw new DriveError("Google Drive didn't return an upload address.");
      offset = 0;
      onSession?.({ url, expires: Date.now() + 6 * 864e5 }); // Drive keeps sessions for a week
    }

    onProgress?.(offset / total);
    while (offset < total) {
      while (hold?.()) await wait(3000);
      const end = Math.min(offset + PIECE, total);
      const r = await putPiece(url, blob.slice(offset, end), offset, end - 1, total);
      if (r.status === 200 || r.status === 201) {
        onProgress?.(1);
        onSession?.(null);
        return r.json();
      }
      if (r.status === 308) {
        offset = rangeEnd(r, end);
        onProgress?.(offset / total);
        continue;
      }
      if (r.status === 404 || r.status === 410) {
        onSession?.(null);
        throw new DriveError("The upload session expired. It will start again.", { retryable: true });
      }
      throw await apiError(r);
    }
    throw new DriveError("Upload ended without Google Drive confirming the file.");
  }
};

// Finds or creates the destination folder. With the drive.file permission the app only sees
// folders it made itself, so the id is remembered and re-checked.
async function ensureFolder(tok: string, folderName: string): Promise<string | null> {
  const name = String(folderName || "").trim();
  if (!name) return null;
  const auth = { Authorization: "Bearer " + tok };
  const saved = read<{ name: string; id: string }>(K_FOLDER);
  if (saved && saved.name === name && saved.id) {
    const r = await fetch(API + "/files/" + encodeURIComponent(saved.id) + "?fields=id,trashed", { headers: auth });
    if (r.ok && !(await r.json()).trashed) return saved.id;
  }
  const q = "name = '" + name.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "' and mimeType = '" + FOLDER_MIME + "' and trashed = false";
  const found = await fetch(API + "/files?fields=files(id)&pageSize=1&q=" + encodeURIComponent(q), { headers: auth });
  if (!found.ok) throw await apiError(found);
  let id: string | undefined = ((await found.json()).files || [])[0]?.id;
  if (!id) {
    const made = await fetch(API + "/files?fields=id", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME })
    });
    if (!made.ok) throw await apiError(made);
    id = (await made.json()).id;
  }
  write(K_FOLDER, { name, id });
  return id || null;
}

// A 308 reply's Range header says how much Drive has; without one, use the fallback.
function rangeEnd(r: Response, fallback: number): number {
  const m = r.headers.get("Range")?.match(/bytes=0-(\d+)/);
  return m ? Number(m[1]) + 1 : fallback;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function putPiece(url: string, body: Blob, start: number, end: number, total: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      // No Authorization header: the upload address carries its own credentials.
      const r = await fetch(url, { method: "PUT", headers: { "Content-Range": `bytes ${start}-${end}/${total}` }, body });
      if ((r.status >= 500 || r.status === 429) && attempt < 5) {
        const ra = Number(r.headers.get("Retry-After"));
        await wait(ra > 0 ? ra * 1000 : 1500 * 2 ** attempt);
        continue;
      }
      return r;
    } catch {
      if (attempt >= 5) throw new DriveError("Lost the connection while uploading. It will continue when you're back online.", { retryable: true });
      await wait(1500 * 2 ** attempt);
    }
  }
}

async function apiError(r: Response): Promise<DriveError> {
  let msg = "Google Drive returned " + r.status;
  let reason = "";
  try {
    const j = await r.json();
    if (j?.error) {
      if (j.error.message) msg += ": " + j.error.message;
      reason = j.error.errors?.[0]?.reason || "";
    }
  } catch { /* not JSON */ }
  const err = new DriveError(msg, { retryable: r.status >= 500 || r.status === 429 || /rateLimitExceeded|userRateLimitExceeded/.test(reason) });
  if (r.status === 401) { err.code = "signin"; err.message = "Your Google sign-in has expired. Sign in again to continue uploading."; }
  if (reason === "storageQuotaExceeded") err.message = "Your Google Drive is full. Free up space, then press Retry.";
  if (reason === "accessNotConfigured") err.message = "The Google Drive API isn't turned on for your Google Cloud project. See the README, step 2.";
  return err;
}
