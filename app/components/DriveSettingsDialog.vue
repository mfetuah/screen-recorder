<script setup lang="ts">
const settings = useSettings();
const { ui } = useUi();
const { account, hasToken, prepare, signIn, signOut } = useDrive();

// The client ID is only saved once it looks valid.
const clientInput = ref(settings.clientId);
watch(() => ui.settingsOpen, (open) => { if (open) clientInput.value = settings.clientId; });

function saveClient() {
  const v = clientInput.value.trim();
  if (v && !GOOGLE_CLIENT_ID.test(v)) {
    ui.settingsError = "That doesn't look like a Google client ID. It ends in .apps.googleusercontent.com.";
    return;
  }
  ui.settingsError = "";
  settings.clientId = v;
  prepare();
}

function saveFolder(e: Event) {
  settings.folder = (e.target as HTMLInputElement).value.trim() || "Screenreel Recordings";
}

const accountText = computed(() => {
  if (!settings.clientId) return "Add your Google client ID above, then sign in.";
  if (!account.value) return "Not signed in";
  return "Signed in as " + (account.value.email || account.value.name) +
    (hasToken.value ? "" : ". Google sign-ins last about an hour; you'll be asked again when something needs uploading.");
});
const signInLabel = computed(() => !account.value ? "Sign in to Google Drive" : hasToken.value ? "Switch account" : "Sign in again");
</script>

<template>
  <BaseDialog v-model:open="ui.settingsOpen" aria-labelledby="settingsH">
    <form method="dialog" class="dlg">
      <div class="dlg-head">
        <h2 id="settingsH">Google Drive</h2>
        <button class="btn-icon" value="close" aria-label="Close">✕</button>
      </div>
      <p class="hint">Recordings upload to the Google Drive of the Google account you sign in with. Google requires you to sign in; an email address on its own can't receive uploads.</p>
      <div class="field">
        <label for="setEmail">Google account email</label>
        <input id="setEmail" v-model.lazy.trim="settings.email" type="email" autocomplete="email" placeholder="you@gmail.com">
      </div>
      <div class="field">
        <label for="setClient">Google client ID</label>
        <input
          id="setClient" v-model="clientInput" type="text" spellcheck="false" autocomplete="off"
          placeholder="1234567890-abc123.apps.googleusercontent.com" @change="saveClient"
        >
        <p class="hint">A one-time setup in the free Google Cloud console. The steps are in the project's README, under “Connect Google Drive”.</p>
      </div>
      <div class="field">
        <label for="setFolder">Google Drive folder</label>
        <input id="setFolder" :value="settings.folder" type="text" placeholder="Screenreel Recordings" @change="saveFolder">
      </div>
      <div class="check"><input id="setAuto" v-model="settings.autoUpload" type="checkbox"><label for="setAuto">Upload every recording automatically</label></div>
      <div class="check"><input id="setRemove" v-model="settings.removeLocal" type="checkbox"><label for="setRemove">Free up space on this device after a recording is safely in Google Drive</label></div>
      <div class="account">
        <span>{{ accountText }}</span>
        <div class="account-actions">
          <button type="button" class="btn-primary" :disabled="!settings.clientId" @click="signIn(!!account && hasToken)">{{ signInLabel }}</button>
          <button v-if="account" type="button" class="btn-small btn-ghost" @click="signOut">Sign out</button>
        </div>
      </div>
      <p v-if="ui.settingsError" class="err">{{ ui.settingsError }}</p>
      <div class="dlg-foot">
        <button value="close" class="btn-primary">Done</button>
      </div>
    </form>
  </BaseDialog>
</template>
