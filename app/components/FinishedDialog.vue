<script setup lang="ts">
// Shown after every recording: offers a download, and shows (or fixes) the Google Drive upload.
// It stays open until closed, so you can sign in and download in either order.
const settings = useSettings();
const { ui, openSettings } = useUi();
const lib = useLibrary();
const uploads = useUploads();
const { hasToken, signIn } = useDrive();

const open = computed({
  get: () => !!ui.finished,
  set: (v) => { if (!v) ui.finished = null; }
});
const downloaded = ref(false);
const busy = ref(false);
watch(() => ui.finished, () => { downloaded.value = false; busy.value = false; });

const rec = computed(() => lib.recordings.value.find((r) => r.id === ui.finished?.id) || null);
const facts = computed(() => ui.finished ? fmtClock(ui.finished.ms) + " · " + fmtBytes(ui.finished.size) : "");

const drive = computed<{ text: string; label?: string; run?: () => unknown }>(() => {
  if (!settings.clientId) return { text: "This recording is saved on this device only. Set up Google Drive to have recordings upload automatically.", label: "Set up Google Drive", run: () => { open.value = false; openSettings(); } };
  const state = rec.value?.upload?.state;
  if (state === "done") return { text: "✓ It's in your Google Drive." };
  if (!settings.autoUpload && (state === "none" || !state)) return { text: "Automatic upload is off, so this recording is on this device only.", label: "Upload to Google Drive", run: () => uploads.queueUpload(ui.finished!.id) };
  if (!hasToken.value || state === "signin") return { text: "Google needs you to sign in again (it lasts about an hour) before this can upload.", label: "Sign in & upload", run: () => signIn() };
  return { text: "It's uploading to your Google Drive now. You can follow progress under Your recordings." };
});

async function runDrive() {
  busy.value = true;
  try { await drive.value.run?.(); } finally { busy.value = false; }
}

async function download() {
  if (!rec.value) return;
  await lib.download(rec.value);
  downloaded.value = true;
  if (!drive.value.label) setTimeout(() => { open.value = false; }, 1200);
}
</script>

<template>
  <BaseDialog v-model:open="open" aria-labelledby="doneH">
    <form method="dialog" class="dlg">
      <div class="dlg-head">
        <h2 id="doneH">Recording finished</h2>
        <span class="hint">{{ facts }}</span>
      </div>
      <p class="done-q">Do you also want to download a copy to this device?</p>
      <div class="account">
        <span>{{ drive.text }}</span>
        <div v-if="drive.label" class="account-actions">
          <button type="button" class="btn-small" :disabled="busy" @click="runDrive">{{ drive.label }}</button>
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn-ghost" @click="open = false">{{ downloaded ? "Close" : "No thanks" }}</button>
        <button type="button" class="btn-primary" :disabled="downloaded || !rec" @click="download">{{ downloaded ? "✓ Downloading" : "Download" }}</button>
      </div>
    </form>
  </BaseDialog>
</template>
