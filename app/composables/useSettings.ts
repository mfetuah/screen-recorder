export interface Settings {
  email: string;
  clientId: string;
  folder: string;
  autoUpload: boolean;
  removeLocal: boolean;
  sys: boolean;
  mic: boolean;
  micId: string;
  sysVol: number;
  micVol: number;
  res: string;
  fps: string;
  fmt: string;
  qual: string;
  miniAuto: boolean;
}

export const GOOGLE_CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;
const KEY = "screenreel.settings";
let shared: Settings | null = null;

// One settings object for the whole app, saved to this browser whenever it changes.
export function useSettings(): Settings {
  if (shared) return shared;
  const cfg = useRuntimeConfig().public;
  const fromBuild = String(cfg.googleClientId || "");
  const s = reactive<Settings>({
    email: String(cfg.googleEmail || ""),
    clientId: fromBuild,
    folder: String(cfg.driveFolder || "Screenreel Recordings"),
    autoUpload: true,
    removeLocal: false,
    sys: true,
    mic: true,
    micId: "",
    sysVol: 100,
    micVol: 100,
    res: "1080",
    fps: "30",
    fmt: "auto",
    qual: "4000000",
    miniAuto: true,
    ...readJSON<Settings>(KEY)
  });
  if (!s.clientId || !GOOGLE_CLIENT_ID.test(s.clientId)) s.clientId = fromBuild;
  // Detached scope: the auto-save keeps running whichever component asked first.
  effectScope(true).run(() => watch(() => ({ ...s }), (v) => writeJSON(KEY, v), { deep: true }));
  shared = s;
  return s;
}
