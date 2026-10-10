<script setup lang="ts">
const env = deviceEnv();
const settings = useSettings();
const { state } = useRecorder();
const { account } = useDrive();
const copied = ref(false);

type Row = [string, string, ("yes" | "no")?];
const yn = (label: string, ok: boolean): Row => [label, ok ? "Yes" : "No", ok ? "yes" : "no"];

const rows = computed<Row[]>(() => {
  const out: Row[] = [
    ["Browser", env.browser],
    ["Operating system", env.os],
    yn("Screen capture available", env.canRecord),
    yn("Can save MP4", !!supportedMime("mp4")),
    yn("Can save WebM", !!supportedMime("webm")),
    yn("Secure page (needed for capture)", window.isSecureContext),
    yn("Pop-out controls", env.hasMini),
    yn("Opened as installed app", env.standalone),
    ["Google Drive", settings.clientId ? (account.value ? "Signed in as " + (account.value.email || account.value.name) : "Set up, not signed in") : "Not set up"]
  ];
  const last = state.last;
  if (last) {
    const surf = ({ monitor: "Entire screen", window: "Window", browser: "Browser tab" } as Record<string, string>)[last.surface] || last.surface;
    out.push(
      ["Last recording: shared", surf],
      ["Last recording: size", last.width && last.height ? last.width + "×" + last.height + (last.fps ? " @ " + last.fps + " fps" : "") : "unknown"],
      yn("Last recording: computer sound", last.sysAudio),
      yn("Last recording: microphone", last.mic),
      ["Last recording: format", last.mime]
    );
  } else {
    out.push(["Last recording", "None yet. Make a short test recording to fill this in."]);
  }
  return out;
});

async function copy() {
  const text = "Screenreel test report\n" + rows.value.map(([k, v]) => k + ": " + v).join("\n");
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 1800);
}
</script>

<template>
  <section class="section">
    <details>
      <summary>Device test report</summary>
      <p class="hint">Use this when testing on different laptops and phones. It shows what this browser supports and what the last recording actually captured.</p>
      <div class="diag">
        <table>
          <tbody>
            <tr v-for="[k, v, cls] in rows" :key="k"><td>{{ k }}</td><td :class="cls">{{ v }}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="diag-actions">
        <button type="button" class="btn-small" @click="copy">Copy report</button>
        <span v-if="copied" class="toast">Copied</span>
      </div>
    </details>
  </section>
</template>
