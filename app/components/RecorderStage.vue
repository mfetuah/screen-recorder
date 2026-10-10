<script setup lang="ts">
const env = deviceEnv();
const { state, timeLabel, start, stop, togglePause, openMini } = useRecorder();
const { ui } = useUi();

const video = ref<HTMLVideoElement>();
watch(() => state.preview, (stream) => {
  const v = video.value;
  if (!v) return;
  v.srcObject = stream;
  if (stream) v.play().catch(() => {});
});

const capturing = computed(() => state.phase === "recording" || state.phase === "paused");
const timer = computed(() => state.phase === "countdown" ? timeLabel.value : fmtClock(state.elapsedMs, true));
const size = computed(() => state.bytes ? fmtBytes(state.bytes) : "");
</script>

<template>
  <div>
    <div class="stage">
      <video v-show="state.preview" ref="video" muted playsinline />
      <div v-if="!state.preview" class="empty">
        <div>
          <b>Ready to record</b>
          <p>Press Record and pick <strong>Entire screen</strong> to capture your meeting app, with <strong>Also share system audio</strong> ticked so you hear everyone.</p>
        </div>
      </div>
      <div v-if="capturing" class="overlay-time">{{ timeLabel }}</div>
      <div v-if="state.phase === 'countdown' && state.countdown" class="countdown">{{ state.countdown }}</div>
    </div>
    <div class="transport">
      <div class="timer"><span>{{ timer }}</span><small>{{ size }}</small></div>
      <button
        v-if="env.hasMini && capturing && !state.miniOpen" type="button"
        title="Small always-on-top controls you can keep over your meeting" @click="openMini"
      >
        Pop-out controls
      </button>
      <button type="button" class="btn-rec" :disabled="state.phase !== 'idle'" @click="start">Record</button>
      <button type="button" :disabled="!capturing" @click="togglePause">{{ state.phase === "paused" ? "Resume" : "Pause" }}</button>
      <button type="button" class="btn-stop" :disabled="state.phase === 'idle'" @click="stop">Stop</button>
    </div>
    <p v-if="ui.error" class="err" role="alert">{{ ui.error }}</p>
  </div>
</template>
