/* Screen + computer sound + microphone recording.
   Video is written to on-device storage every 2 seconds while recording, so even a 4-hour
   meeting never sits in memory and survives a crash. Nothing about Google sign-in can
   interrupt a recording: uploading only starts after you press Stop. */

export type Phase = "idle" | "countdown" | "recording" | "paused";

export interface LastCapture {
  surface: string;
  width?: number;
  height?: number;
  fps: number | null;
  sysAudio: boolean;
  mic: boolean;
  mime: string;
}

const state = reactive({
  phase: "idle" as Phase,
  countdown: 0,
  elapsedMs: 0,
  bytes: 0,
  sysState: "—",
  micState: "—",
  sysLevel: 0,
  micLevel: 0,
  last: null as LastCapture | null,
  preview: null as MediaStream | null,
  miniOpen: false
});
const mics = ref<{ id: string; label: string }[]>([]);

// Live objects that shouldn't be made reactive.
const s = {
  display: null as MediaStream | null,
  mic: null as MediaStream | null,
  ctx: null as AudioContext | null,
  recorder: null as MediaRecorder | null,
  unsaved: new Map<number, Blob>(),
  seq: 0,
  recId: "",
  writeChain: Promise.resolve() as Promise<unknown>,
  storageFailed: false,
  releaseLock: null as null | (() => void),
  wake: null as WakeLockSentinel | null,
  mini: null as Window | null,
  mime: "",
  ext: "webm",
  startedAt: 0,
  pausedTotal: 0,
  pausedAt: 0,
  tick: 0 as ReturnType<typeof setInterval> | 0,
  meterRaf: 0,
  sysGain: null as GainNode | null,
  micGain: null as GainNode | null,
  sysAnalyser: null as AnalyserNode | null,
  micAnalyser: null as AnalyserNode | null,
  stopping: false
};

export function isCapturing(): boolean {
  return !!s.display;
}

let initialised = false;

export function useRecorder() {
  const settings = useSettings();
  const { showError } = useUi();
  const lib = useLibrary();
  const env = deviceEnv();

  if (!initialised) {
    initialised = true;
    effectScope(true).run(() => {
      watch(() => settings.sysVol, (v) => { if (s.sysGain) s.sysGain.gain.value = v / 100; });
      watch(() => settings.micVol, (v) => { if (s.micGain) s.micGain.gain.value = v / 100; });
      watch(() => state.phase, (p) => {
        const b = s.mini?.document.getElementById("p");
        if (b) b.textContent = p === "paused" ? "Resume" : "Pause";
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && s.recorder && (!s.wake || s.wake.released)) holdWakeLock();
    });
    navigator.mediaDevices?.addEventListener?.("devicechange", listMics);
  }

  async function start() {
    showError("");
    const fps = Number(settings.fps);
    const video: MediaTrackConstraints = { frameRate: { ideal: fps, max: fps } };
    if (settings.res !== "native") {
      const h = Number(settings.res);
      video.height = { ideal: h, max: h };
      video.width = { ideal: Math.round(h * 16 / 9), max: Math.round(h * 16 / 9) };
    }
    const wantSys = settings.sys;
    const opts: Record<string, unknown> = {
      video,
      audio: wantSys ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false } : false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      monitorTypeSurfaces: "include"
    };
    if (wantSys) opts.systemAudio = "include";

    state.phase = "countdown";
    state.countdown = 0;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia(opts as DisplayMediaStreamOptions);
      if ((state.phase as Phase) === "idle") { display.getTracks().forEach((t) => t.stop()); return; } // Stop was pressed meanwhile
      s.display = display;
    } catch (err) {
      state.phase = "idle";
      const e = err as DOMException;
      showError(e?.name === "NotAllowedError"
        ? "Screen sharing was cancelled or blocked. Press Record and choose a screen, window or tab to share."
        : "Couldn't start screen capture: " + (e?.message || String(err)));
      return;
    }
    if (settings.miniAuto) openMini();
    if (settings.mic) s.mic = await openMic(settings.micId);
    if (!s.display) return; // stopped while the microphone was being opened

    const vTrack = s.display.getVideoTracks()[0]!;
    vTrack.addEventListener("ended", () => stop());
    const sysTracks = s.display.getAudioTracks();

    const tracks: MediaStreamTrack[] = [vTrack];
    if (sysTracks.length || s.mic) {
      s.ctx = new AudioContext();
      const dest = s.ctx.createMediaStreamDestination();
      if (sysTracks.length) {
        const src = s.ctx.createMediaStreamSource(new MediaStream(sysTracks));
        s.sysGain = s.ctx.createGain(); s.sysGain.gain.value = settings.sysVol / 100;
        s.sysAnalyser = s.ctx.createAnalyser(); s.sysAnalyser.fftSize = 512;
        src.connect(s.sysGain); s.sysGain.connect(dest); s.sysGain.connect(s.sysAnalyser);
      }
      if (s.mic) {
        const src = s.ctx.createMediaStreamSource(s.mic);
        s.micGain = s.ctx.createGain(); s.micGain.gain.value = settings.micVol / 100;
        s.micAnalyser = s.ctx.createAnalyser(); s.micAnalyser.fftSize = 512;
        src.connect(s.micGain); s.micGain.connect(dest); s.micGain.connect(s.micAnalyser);
      }
      tracks.push(dest.stream.getAudioTracks()[0]!);
    }

    state.sysState = sysTracks.length ? "Captured" : (wantSys ? "Not shared" : "Off");
    state.micState = s.mic ? "Captured" : (settings.mic ? "Unavailable" : "Off");
    if (wantSys && !sysTracks.length) {
      const hint = sysAudioHint();
      showError("Computer sound was not shared, so other people in the meeting won't be heard. Stop, press Record again, and " + hint.charAt(0).toLowerCase() + hint.slice(1));
    }

    state.preview = markRaw(s.display);
    startMeters();

    const fmt = settings.fmt as "auto" | VideoFormat;
    s.mime = fmt === "auto" ? (supportedMime("mp4") || supportedMime("webm")) : supportedMime(fmt);
    s.ext = s.mime.startsWith("video/mp4") ? "mp4" : "webm";

    const cur = vTrack.getSettings();
    state.last = {
      surface: (cur as MediaTrackSettings & { displaySurface?: string }).displaySurface || "unknown",
      width: cur.width, height: cur.height, fps: cur.frameRate ? Math.round(cur.frameRate) : null,
      sysAudio: sysTracks.length > 0, mic: !!s.mic, mime: s.mime || "(browser default)"
    };

    // Always a 3-second countdown, shown on the stage, the pop-out controls and the tab title.
    if (!(await countdown(3))) return;
    beginRecorder(new MediaStream(tracks));
  }

  async function openMic(deviceId: string): Promise<MediaStream | null> {
    const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const attempts: MediaTrackConstraints[] = deviceId ? [{ ...base, deviceId: { exact: deviceId } }, base] : [base];
    let lastErr: DOMException | null = null;
    for (const audio of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio });
        listMics();
        return stream;
      } catch (err) {
        lastErr = err as DOMException;
        if (lastErr?.name === "NotAllowedError") break; // permission denied; the default mic won't work either
      }
    }
    showError("Microphone not available (" + (lastErr?.name || "error") + "). Recording continues without it. Check the browser's microphone permission for this page.");
    return null;
  }

  function countdown(n: number): Promise<boolean> {
    return new Promise((resolve) => {
      state.countdown = n;
      paintMini();
      const t = setInterval(() => {
        if (!s.display) { clearInterval(t); state.countdown = 0; resolve(false); return; }
        state.countdown -= 1;
        paintMini();
        if (state.countdown <= 0) { clearInterval(t); resolve(true); }
      }, 1000);
    });
  }

  function beginRecorder(stream: MediaStream) {
    const opts: MediaRecorderOptions = { videoBitsPerSecond: Number(settings.qual), audioBitsPerSecond: 128000 };
    if (s.mime) opts.mimeType = s.mime;
    try {
      s.recorder = new MediaRecorder(stream, opts);
    } catch {
      try {
        delete opts.mimeType;
        s.recorder = new MediaRecorder(stream, opts);
        s.mime = s.recorder.mimeType;
        s.ext = /mp4/.test(s.mime) ? "mp4" : "webm";
      } catch (err2) {
        showError("This browser couldn't start the recorder: " + (err2 as Error).message);
        cleanup();
        return;
      }
    }

    // The on-device entry is written first in the chain, so every chunk lands after it.
    // A chunk is held in `unsaved` only until it's on disk (or for good if storage fails).
    s.recId = recordingsDb.newId();
    s.unsaved = new Map();
    s.seq = 0;
    s.storageFailed = false;
    state.bytes = 0;
    const recId = s.recId;
    const unsaved = s.unsaved;
    const last = state.last;
    s.writeChain = recordingsDb.put({
      id: recId, name: "screen-recording-" + stamp() + "." + s.ext, mime: s.mime || s.recorder.mimeType || "video/webm",
      createdAt: Date.now(), status: "recording", size: 0, durationMs: 0, width: last?.width, height: last?.height,
      audio: audioLabel(last), source: "screen", upload: { state: "none" }
    }).catch(() => {
      s.storageFailed = true;
      showError("This device's storage isn't available, so the recording is kept in memory only. Don't close this page until it has been downloaded or uploaded.");
    });
    holdRecordingLock(recId);
    navigator.storage?.persist?.().catch(() => {});

    s.recorder.ondataavailable = (e) => {
      if (!e.data?.size) return;
      state.bytes += e.data.size;
      const seq = s.seq++;
      unsaved.set(seq, e.data);
      s.writeChain = s.writeChain.then(async () => {
        if (s.storageFailed) return;
        await recordingsDb.addChunk(recId, seq, e.data);
        unsaved.delete(seq);
      }).catch((err) => {
        if (s.storageFailed) return;
        s.storageFailed = true;
        showError("This device ran out of storage space (" + (err?.name || "error") + "). Recording continues in memory; don't close this page until it has been downloaded or uploaded.");
      });
    };
    s.recorder.onstop = finish;
    s.recorder.onerror = (e) => showError("Recording error: " + ((e as Event & { error?: Error }).error?.message || "unknown"));
    s.recorder.start(2000);
    s.startedAt = performance.now();
    s.pausedTotal = 0;
    s.pausedAt = 0;
    s.tick = setInterval(updateTimer, 250);
    state.phase = "recording";
    updateTimer();
    holdWakeLock();
  }

  function togglePause() {
    if (!s.recorder) return;
    if (s.recorder.state === "recording") {
      s.recorder.pause();
      s.pausedAt = performance.now();
      state.phase = "paused";
    } else if (s.recorder.state === "paused") {
      s.recorder.resume();
      s.pausedTotal += performance.now() - s.pausedAt;
      s.pausedAt = 0;
      state.phase = "recording";
    }
    updateTimer();
  }

  function stop() {
    if (s.stopping) return;
    if (s.recorder && s.recorder.state !== "inactive") {
      s.stopping = true;
      s.recorder.stop(); // finish() runs on the stop event
    } else {
      cleanup(); // stopped during the countdown or before recording began
    }
  }

  async function finish() {
    const ms = elapsedMs();
    const id = s.recId;
    const type = (s.mime || s.recorder?.mimeType || "video/webm").split(";")[0]!;
    const writes = s.writeChain;
    const release = s.releaseLock;
    const unsaved = s.unsaved;
    const last = state.last;
    cleanup();

    await writes;
    s.storageFailed = false;
    // Whatever reached the disk, followed by anything that couldn't be written, in order.
    const tail = [...unsaved.keys()].sort((a, b) => a - b).map((k) => unsaved.get(k)!);
    let stored: Blob[] = [];
    try { stored = await recordingsDb.chunks(id); } catch { /* storage unavailable; tail holds everything */ }
    const blob = new Blob([...stored, ...tail], { type });
    const storedOk = tail.length === 0;
    if (!storedOk) lib.keepInMemory(id, blob);

    const patch: Partial<Recording> = {
      status: "saved", size: blob.size, durationMs: ms, incomplete: !storedOk,
      upload: { state: settings.autoUpload && settings.clientId ? "pending" : "none" }
    };
    let name = "screen-recording-" + stamp() + "." + (type === "video/mp4" ? "mp4" : "webm");
    try {
      const existing = await recordingsDb.get(id);
      if (existing) {
        name = existing.name;
        await recordingsDb.update(id, patch);
      } else {
        await recordingsDb.put({ id, name, mime: type, createdAt: Date.now(), source: "screen", audio: audioLabel(last), ...patch } as Recording);
      }
    } catch {
      showError("The recording finished but couldn't be saved on this device. Download it now from Your recordings.");
      lib.addMemoryOnly({ id, name, mime: type, createdAt: Date.now(), source: "screen", audio: audioLabel(last), ...patch } as Recording, blob);
    }
    release?.();
    await lib.refresh();
    useUploads().runQueue();
    useUi().ui.finished = { id, name, ms, size: blob.size };
    try { window.focus(); } catch { /* not allowed */ }
  }

  function cleanup() {
    if (s.tick) clearInterval(s.tick);
    cancelAnimationFrame(s.meterRaf);
    [s.display, s.mic].forEach((st) => st?.getTracks().forEach((t) => t.stop()));
    s.ctx?.close().catch(() => {});
    try { s.mini?.close(); } catch { /* already closed */ }
    s.wake?.release().catch(() => {});
    if (s.releaseLock && !s.recorder) s.releaseLock();
    Object.assign(s, {
      display: null, mic: null, ctx: null, recorder: null, unsaved: new Map(), sysGain: null, micGain: null,
      sysAnalyser: null, micAnalyser: null, stopping: false, mini: null, wake: null, releaseLock: null,
      writeChain: Promise.resolve(), startedAt: 0, pausedAt: 0, pausedTotal: 0, tick: 0, meterRaf: 0
    });
    Object.assign(state, { phase: "idle", countdown: 0, elapsedMs: 0, bytes: 0, sysLevel: 0, micLevel: 0, preview: null, miniOpen: false });
  }

  // Holding a Web Lock marks this recording as live, so another tab won't "recover" it mid-meeting.
  function holdRecordingLock(id: string) {
    navigator.locks?.request(lib.LOCK_PREFIX + id, () => new Promise<void>((resolve) => { s.releaseLock = resolve; })).catch(() => {});
  }

  async function holdWakeLock() {
    try { if ("wakeLock" in navigator) s.wake = await navigator.wakeLock.request("screen"); }
    catch { /* not allowed right now; recording still works */ }
  }

  // Small always-on-top window (Chrome/Edge) with the timer, Pause and Stop.
  async function openMini() {
    if (!env.hasMini || s.mini) return;
    try {
      const pip = (window as Window & { documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Window> } }).documentPictureInPicture!;
      const w = await pip.requestWindow({ width: 300, height: 96 });
      s.mini = w;
      state.miniOpen = true;
      const d = w.document;
      const st = d.createElement("style");
      st.textContent = "html,body{margin:0;height:100%;background:#131923;color:#fff;font:600 14px system-ui,sans-serif}" +
        "body{display:flex;align-items:center;gap:8px;padding:0 12px;box-sizing:border-box}" +
        "#t{font:700 18px ui-monospace,Consolas,monospace;margin-right:auto;font-variant-numeric:tabular-nums;color:#ff5a5f}" +
        "button{font:inherit;border:1px solid #3a4456;background:#1d2430;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer}" +
        "#x{background:#d6343a;border-color:#d6343a}";
      d.head.appendChild(st);
      d.title = "Screenreel";
      const t = d.createElement("span"); t.id = "t";
      const p = d.createElement("button"); p.id = "p"; p.textContent = state.phase === "paused" ? "Resume" : "Pause";
      const x = d.createElement("button"); x.id = "x"; x.textContent = "Stop";
      p.addEventListener("click", togglePause);
      x.addEventListener("click", stop);
      d.body.append(t, p, x);
      w.addEventListener("pagehide", () => { if (s.mini === w) { s.mini = null; state.miniOpen = false; } });
      paintMini();
    } catch {
      // Chrome only opens it straight after a click; the Pop-out button stays available.
    }
  }

  function paintMini() {
    const t = s.mini?.document.getElementById("t");
    if (t) t.textContent = timeLabel.value;
  }

  function startMeters() {
    const bufA = new Uint8Array(512);
    const bufB = new Uint8Array(512);
    const level = (an: AnalyserNode | null, buf: Uint8Array<ArrayBuffer>) => {
      if (!an) return 0;
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) { const d = Math.abs(buf[i]! - 128); if (d > peak) peak = d; }
      return Math.min(100, (peak / 128) * 140);
    };
    const loop = () => {
      state.sysLevel = level(s.sysAnalyser, bufA);
      state.micLevel = level(s.micAnalyser, bufB);
      s.meterRaf = requestAnimationFrame(loop);
    };
    loop();
  }

  function elapsedMs() {
    if (!s.startedAt) return 0;
    const pausedNow = s.pausedAt ? performance.now() - s.pausedAt : 0;
    return performance.now() - s.startedAt - s.pausedTotal - pausedNow;
  }

  function updateTimer() {
    state.elapsedMs = elapsedMs();
    paintMini();
  }

  async function listMics() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
      mics.value = devs
        .filter((d) => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
        .map((d, i) => ({ id: d.deviceId, label: d.label || "Microphone " + (i + 1) }));
    } catch { /* device list is optional */ }
  }

  return { state, mics, timeLabel, start, stop, togglePause, openMini, listMics };
}

// "Starting in 3", "● 00:12", "❚❚ 00:12"
const timeLabel = computed(() => {
  if (state.phase === "countdown") return state.countdown ? "Starting in " + state.countdown : "Choose a screen…";
  if (state.phase === "idle") return "";
  return (state.phase === "paused" ? "❚❚ " : "● ") + fmtClock(state.elapsedMs);
});

function audioLabel(last: LastCapture | null): string {
  if (!last) return "no audio";
  return [last.sysAudio ? "computer sound" : null, last.mic ? "mic" : null].filter(Boolean).join(" + ") || "no audio";
}
