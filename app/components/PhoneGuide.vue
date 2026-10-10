<script setup lang="ts">
// Phone browsers can't capture the screen, so this guides the phone's own recorder and handles uploads.
const env = deviceEnv();
const lib = useLibrary();

const steps = env.isIOS ? [
  "Open <b>Settings → Control Center</b> and add <b>Screen Recording</b> if it isn't there yet.",
  "Swipe down from the top-right corner, <b>press and hold</b> the record button, turn <b>Microphone</b> on, then tap <b>Start Recording</b>.",
  "Switch to Google Meet, Zoom or Teams and have your meeting. When it's over, tap the red indicator at the top and stop recording.",
  "Come back here, tap <b>Send a recording to Google Drive</b> and pick the video from Photos."
] : [
  "Swipe down twice from the top of the screen and tap <b>Screen recorder</b> (or <b>Screen record</b>). If it's missing, tap the pencil icon to add it.",
  "Set sound to <b>Media sounds and mic</b> (Samsung) or <b>Device audio and microphone</b> (Pixel and most others), then start.",
  "Switch to Google Meet, Zoom or Teams and have your meeting. Stop recording from the notification panel when it's over.",
  "Come back here and tap <b>Send a recording to Google Drive</b>, or open the video in Gallery or Photos, tap <b>Share</b> and choose <b>Screenreel</b>."
];
const warning = env.isIOS
  ? "Do a 1-minute test call first. During calls, iPhone sometimes leaves other people's voices out of screen recordings. If that happens, use the meeting app's own Record feature."
  : "Do a 1-minute test call first. Some phones and meeting apps block other people's voices from screen recordings. If that happens, use the meeting app's own Record feature.";
const tip = env.standalone ? "" : env.isIOS
  ? "Tip: tap Share → Add to Home Screen to open Screenreel like an app."
  : "Tip: in the browser menu, tap Install app (or Add to Home screen). Screenreel then appears in your Share menu.";

function picked(e: Event) {
  const input = e.target as HTMLInputElement;
  lib.importFiles([...(input.files || [])]);
  input.value = "";
}
</script>

<template>
  <section class="section phone" aria-labelledby="phoneH">
    <h2 id="phoneH">Record a meeting on this phone</h2>
    <p class="lead">Phone browsers don't let web pages record the screen. Your phone's built-in screen recorder does it instead, and Screenreel sends the video to Google Drive.</p>
    <ol class="steps">
      <!-- Static, trusted step text with <b> for emphasis. -->
      <li v-for="(step, i) in steps" :key="i" v-html="step" />
      <li><span class="warn">{{ warning }}</span></li>
    </ol>
    <div class="phone-actions">
      <label class="btn-primary file-btn">
        <input type="file" accept="video/*" multiple @change="picked">
        Send a recording to Google Drive
      </label>
      <span v-if="tip" class="hint">{{ tip }}</span>
    </div>
  </section>
</template>
