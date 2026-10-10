const account = ref<DriveAccount | null>(null);
const tick = ref(0); // bumped to re-check token expiry

export function useDrive() {
  const settings = useSettings();
  const { notify, settingsError, openSettings, ui } = useUi();

  const hasToken = computed(() => { void tick.value; return drive.hasToken(); });

  function refresh() {
    account.value = drive.account();
    tick.value++;
  }

  async function prepare() {
    refresh();
    if (!settings.clientId) return;
    try { await drive.prepare(settings.clientId); }
    catch (e) { notify({ kind: "warn", title: "Google Drive isn't available.", body: (e as Error).message }); }
  }

  // Must run straight from a click, because Google's sign-in opens a pop-up.
  async function signIn(switchAccount = false): Promise<boolean> {
    ui.settingsError = "";
    if (!settings.clientId) { openSettings(); return false; }
    try {
      const acc = await drive.signIn(settings.clientId, settings.email, switchAccount);
      refresh();
      if (settings.email && acc.email && acc.email.toLowerCase() !== settings.email.toLowerCase()) {
        settingsError("Signed in as " + acc.email + ", which is different from the email in Settings. Recordings go to " + acc.email + "'s Google Drive.");
      }
      await useUploads().resumeAfterSignIn();
      return true;
    } catch (e) {
      settingsError((e as Error).message || String(e));
      return false;
    }
  }

  async function signOut() {
    try { await drive.signOut(); } catch (e) { settingsError((e as Error).message); }
    refresh();
  }

  return { account, hasToken, refresh, prepare, signIn, signOut };
}
