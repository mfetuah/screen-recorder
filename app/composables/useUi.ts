export interface Notice {
  kind: "info" | "warn";
  title: string;
  body: string;
  action?: { label: string; run: () => void };
  onDismiss?: () => void;
}

export interface FinishedRecording { id: string; name: string; ms: number; size: number }

// Page-level UI state shared between components: banners, dialogs and the recorder's error line.
const ui = reactive({
  notice: null as Notice | null,
  error: "",
  settingsOpen: false,
  settingsError: "",
  finished: null as FinishedRecording | null
});

export function useUi() {
  return {
    ui,
    notify(notice: Notice) { ui.notice = notice; },
    showError(msg: string) { ui.error = msg; },
    openSettings() { ui.settingsError = ""; ui.settingsOpen = true; },
    settingsError(msg: string) { ui.settingsError = msg; ui.settingsOpen = true; }
  };
}
