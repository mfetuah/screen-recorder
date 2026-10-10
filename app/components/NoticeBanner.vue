<script setup lang="ts">
const { ui } = useUi();

function act() {
  const action = ui.notice?.action;
  ui.notice = null;
  action?.run();
}
function dismiss() {
  const done = ui.notice?.onDismiss;
  ui.notice = null;
  done?.();
}
</script>

<template>
  <div v-if="ui.notice" class="banner" :class="{ info: ui.notice.kind === 'info' }">
    <span class="grow"><strong>{{ ui.notice.title }}</strong> {{ ui.notice.body }}</span>
    <button v-if="ui.notice.action" type="button" class="btn-small btn-primary" @click="act">{{ ui.notice.action.label }}</button>
    <button type="button" class="btn-small btn-ghost" @click="dismiss">Dismiss</button>
  </div>
</template>
