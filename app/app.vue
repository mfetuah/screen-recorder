<script setup lang="ts">
const env = deviceEnv();
const config = useRuntimeConfig();
const settings = useSettings();
const recorder = useRecorder();
const lib = useLibrary();
const driveState = useDrive();
const uploads = useUploads();
const { notify, openSettings } = useUi();

useHead({
  title: computed(() => recorder.state.phase === "idle" ? "Screenreel Recorder" : recorder.timeLabel.value + " · Screenreel")
});

onMounted(async () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(config.app.baseURL + "sw.js", { scope: config.app.baseURL }).catch(() => { /* offline support is optional */ });
  }
  window.addEventListener("online", () => uploads.runQueue());
  window.addEventListener("beforeunload", (e) => {
    if (recorder.state.phase !== "idle") { e.preventDefault(); e.returnValue = ""; }
  });
  setInterval(driveState.refresh, 60000); // keeps "signed in" vs "sign in again" current

  if (!env.canRecord && !env.isPhone) {
    notify({ kind: "warn", title: "This browser can't record the screen.", body: "Use desktop Chrome or Edge for screen and computer sound. You can still send existing videos to Google Drive from here." });
  }

  const shared = await lib.importInbox();
  const params = new URLSearchParams(location.search);
  if (params.has("shared") || params.has("share-error")) history.replaceState(null, "", location.pathname);

  let recovered = 0;
  try { recovered = await lib.recoverInterrupted(); }
  catch (e) { useUi().showError("Couldn't open on-device storage: " + (e as Error).message); }

  await lib.refresh();
  await driveState.prepare();

  if (shared) {
    notify({ kind: "info", title: shared === 1 ? "1 video received." : shared + " videos received.", body: settings.clientId ? "Uploading to Google Drive now." : "Connect Google Drive to upload it." });
  } else if (params.has("share-error")) {
    notify({ kind: "warn", title: "The shared video couldn't be saved.", body: "Try again, or use Send a recording to Google Drive." });
  } else if (recovered) {
    notify({
      kind: "info",
      title: recovered === 1 ? "1 recording was recovered." : recovered + " recordings were recovered.",
      body: (recovered === 1 ? "It was" : "They were") + " interrupted when the tab or browser closed during recording. Everything up to that moment was saved."
    });
  } else if (!settings.clientId && !readJSON<{ v: boolean }>("screenreel.dismissSetup").v) {
    notify({
      kind: "info", title: "Connect Google Drive", body: "so every recording uploads automatically and you can watch or download it anywhere.",
      action: { label: "Set up", run: openSettings },
      onDismiss: () => writeJSON("screenreel.dismissSetup", { v: true })
    });
  }
  uploads.runQueue();
});
</script>

<template>
  <div class="wrap">
    <AppHeader />
    <NoticeBanner />
    <PhoneGuide v-if="env.isPhone" />
    <div v-if="env.canRecord" class="main">
      <RecorderStage />
      <RecorderSettings />
    </div>
    <RecordingsList />
    <DeviceReport />
  </div>
  <DriveSettingsDialog />
  <FinishedDialog />
</template>
