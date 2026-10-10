<script setup lang="ts">
const props = defineProps<{ rec: Recording }>();
const settings = useSettings();
const lib = useLibrary();
const uploads = useUploads();
const driveState = useDrive();
const { openSettings } = useUi();

const url = computed(() => lib.urls.get(props.rec.id) || null);
const upload = computed<UploadInfo>(() =>
  !settings.clientId && props.rec.upload?.state !== "done" ? { state: "none" } : (props.rec.upload || { state: "none" }));
const percent = computed(() => Math.round((lib.progress.get(props.rec.id) || 0) * 100));

const facts = computed(() => [
  new Date(props.rec.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
  props.rec.durationMs ? fmtClock(props.rec.durationMs) : null,
  props.rec.size ? fmtBytes(props.rec.size) : null,
  props.rec.width && props.rec.height ? props.rec.width + "×" + props.rec.height : null,
  props.rec.audio || null,
  props.rec.recovered ? "recovered" : null
].filter(Boolean) as string[]);

const status = computed(() => {
  const u = upload.value;
  switch (u.state) {
    case "done": return { cls: "ok", text: "✓ In Google Drive" };
    case "pending": return { cls: "", text: navigator.onLine ? "Waiting to upload…" : "Will upload when you're back online" };
    case "uploading": return { cls: "", text: "Uploading to Google Drive… " + percent.value + "%" };
    case "signin": return { cls: "warn", text: "Sign in to Google Drive to upload" };
    case "error": return { cls: "err", text: "Upload failed: " + (u.error || "unknown error") };
    default: return { cls: "", text: settings.clientId ? "Not uploaded" : "Saved on this device only" };
  }
});

// One extra action next to Download, depending on where the upload stands.
const action = computed<{ label: string; run: () => void } | null>(() => {
  const u = upload.value;
  if (u.state === "signin") return { label: "Sign in", run: () => driveState.signIn() };
  if (u.state !== "error" && !(u.state === "none" && url.value)) return null;
  if (!settings.clientId) return { label: "Set up Google Drive", run: openSettings };
  if (url.value) return { label: u.state === "error" ? "Retry" : "Upload to Google Drive", run: () => uploads.queueUpload(props.rec.id) };
  return null;
});

const armed = ref(false);
let disarm: ReturnType<typeof setTimeout> | undefined;
function del() {
  if (!armed.value) {
    armed.value = true;
    disarm = setTimeout(() => { armed.value = false; }, 4000);
    return;
  }
  clearTimeout(disarm);
  lib.remove(props.rec.id);
}

// WebM files from MediaRecorder lack a duration; seeking to the end once makes the scrubber work.
function fixDuration(e: Event) {
  const v = e.target as HTMLVideoElement;
  if (v.duration === Infinity || Number.isNaN(v.duration)) {
    v.currentTime = 1e101;
    v.addEventListener("timeupdate", function back() { v.removeEventListener("timeupdate", back); v.currentTime = 0; });
  }
}
</script>

<template>
  <article class="take">
    <video v-if="url" :src="url" controls preload="metadata" playsinline @loadedmetadata.once="fixDuration" />
    <div v-else class="novideo">{{ rec.upload?.state === "done" ? "Stored in Google Drive" : "Video not on this device" }}</div>
    <div class="meta">
      <div class="name">{{ rec.name }}</div>
      <div class="facts"><span v-for="f in facts" :key="f">{{ f }}</span></div>
      <div class="cloud" :class="status.cls">
        <span>{{ status.text }}</span>
        <div v-if="upload.state === 'uploading'" class="meter"><i :style="{ width: percent + '%' }" /></div>
      </div>
      <div class="actions">
        <a v-if="url" class="btn dl" :href="url" :download="rec.name">Download</a>
        <a v-if="upload.state === 'done' && upload.webUrl" class="btn" :href="upload.webUrl" target="_blank" rel="noopener">Open in Google Drive</a>
        <button v-if="action" type="button" class="btn-small" @click="action.run">{{ action.label }}</button>
        <button type="button" class="btn-small btn-ghost" @click="del">
          {{ armed ? (upload.state === "done" ? "Remove from this device? (Google Drive keeps it)" : "Click again to delete") : "Delete" }}
        </button>
      </div>
    </div>
  </article>
</template>
