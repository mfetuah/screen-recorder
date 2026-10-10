<script setup lang="ts">
const env = deviceEnv();
const settings = useSettings();
const { state } = useRecorder();
const { recordings } = useLibrary();
const { account } = useDrive();
const { openSettings } = useUi();

const cloud = computed(() => {
  if (!settings.clientId) return { dot: "", text: "Google Drive: not set up" };
  const list = recordings.value;
  if (!account.value || list.some((r) => r.upload?.state === "signin")) return { dot: "warn", text: "Google Drive: sign in" };
  const waiting = list.some((r) => ["pending", "uploading"].includes(r.upload?.state));
  if (!waiting) return { dot: "ok", text: "Google Drive: connected" };
  return { dot: "ok", text: state.phase === "idle" ? "Google Drive: uploading…" : "Google Drive: uploads after recording" };
});

const status = computed(() => {
  switch (state.phase) {
    case "countdown": return { cls: "paused", text: "Starting…" };
    case "recording": return { cls: "rec", text: "Recording" };
    case "paused": return { cls: "paused", text: "Paused" };
    default: return env.canRecord ? { cls: "ready", text: "Ready" } : { cls: "", text: env.isPhone ? "Phone mode" : "Not supported" };
  }
});
</script>

<template>
  <header>
    <div class="brand"><span class="brand-mark" aria-hidden="true" /><h1>Screenreel</h1></div>
    <div class="header-actions">
      <button class="chip" type="button" @click="openSettings">
        <span class="cloud-dot" :class="cloud.dot" />{{ cloud.text }}
      </button>
      <span class="pill" :class="status.cls"><span class="dot" />{{ status.text }}</span>
      <button class="btn-icon" type="button" aria-label="Settings" title="Settings" @click="openSettings">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)" /></svg>
      </button>
    </div>
  </header>
</template>
