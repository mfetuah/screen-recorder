<script setup lang="ts">
const { recordings, storageInfo } = useLibrary();
</script>

<template>
  <section class="section" aria-labelledby="takesH">
    <div class="section-head">
      <h2 id="takesH">Your recordings</h2>
      <span class="hint">{{ storageInfo }}</span>
    </div>
    <p v-if="!recordings.length" class="no-takes">
      No recordings yet. Recordings are saved on this device while they record, and go to Google Drive when they finish.
    </p>
    <div class="takes">
      <RecordingCard v-for="rec in recordings" :key="rec.id" :rec="rec" />
    </div>
  </section>
</template>
