<script setup lang="ts">
const env = deviceEnv();
const settings = useSettings();
const { state, mics, listMics } = useRecorder();
const hint = sysAudioHint();
const canMp4 = !!supportedMime("mp4");
const canWebm = !!supportedMime("webm");

onMounted(listMics);
</script>

<template>
  <aside class="panel" aria-label="Recording settings">
    <div class="group">
      <h2>Audio sources</h2>
      <div>
        <div class="check"><input id="optSys" v-model="settings.sys" type="checkbox"><label for="optSys">Computer sound (everyone in the meeting)</label></div>
        <p class="hint">{{ hint }}</p>
      </div>
      <div class="check"><input id="optMic" v-model="settings.mic" type="checkbox"><label for="optMic">Microphone (your voice)</label></div>
      <div class="field">
        <label for="micSelect">Microphone device</label>
        <select id="micSelect" v-model="settings.micId" :disabled="!settings.mic">
          <option value="">System default microphone</option>
          <option v-for="m in mics" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </div>
      <div class="slider"><span>Sound</span><input v-model.number="settings.sysVol" type="range" min="0" max="150" aria-label="Computer sound volume"><output>{{ settings.sysVol }}%</output></div>
      <div class="slider"><span>Mic</span><input v-model.number="settings.micVol" type="range" min="0" max="200" aria-label="Microphone volume"><output>{{ settings.micVol }}%</output></div>
      <div class="meters">
        <div><div class="lbl"><span>Computer sound level</span><span>{{ state.sysState }}</span></div><div class="meter"><i :style="{ width: state.sysLevel + '%' }" /></div></div>
        <div><div class="lbl"><span>Mic level</span><span>{{ state.micState }}</span></div><div class="meter"><i :style="{ width: state.micLevel + '%' }" /></div></div>
      </div>
      <p class="hint">Wear headphones if you can. On speakers, your mic also picks up the meeting and voices can echo.</p>
    </div>

    <div class="group">
      <h2>Video</h2>
      <div class="row2">
        <div class="field">
          <label for="resSelect">Resolution</label>
          <select id="resSelect" v-model="settings.res">
            <option value="native">Screen native</option>
            <option value="1080">1080p</option>
            <option value="720">720p</option>
          </select>
        </div>
        <div class="field">
          <label for="fpsSelect">Frame rate</label>
          <select id="fpsSelect" v-model="settings.fps">
            <option value="15">15 fps</option>
            <option value="30">30 fps</option>
            <option value="60">60 fps</option>
          </select>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label for="fmtSelect">File format</label>
          <select id="fmtSelect" v-model="settings.fmt">
            <option value="auto">Auto</option>
            <option value="mp4" :disabled="!canMp4">MP4{{ canMp4 ? "" : " (not supported here)" }}</option>
            <option value="webm" :disabled="!canWebm">WebM{{ canWebm ? "" : " (not supported here)" }}</option>
          </select>
        </div>
        <div class="field">
          <label for="qualSelect">Quality</label>
          <select id="qualSelect" v-model="settings.qual">
            <option value="1500000">Small file (meetings)</option>
            <option value="4000000">Standard</option>
            <option value="10000000">High</option>
          </select>
        </div>
      </div>
      <p class="hint">A 3-second countdown runs before every recording. For long meetings, “Small file” keeps 4 hours to about 2.7 GB.</p>
      <div v-if="env.hasMini" class="check"><input id="optMiniAuto" v-model="settings.miniAuto" type="checkbox"><label for="optMiniAuto">Open pop-out controls when recording starts</label></div>
    </div>
  </aside>
</template>
