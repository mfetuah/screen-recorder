<script setup lang="ts">
// A native <dialog> shown as a modal while `open` is true. Closing it (Esc, a
// method="dialog" button) sets `open` back to false.
const open = defineModel<boolean>("open", { required: true });
const el = ref<HTMLDialogElement>();

function sync() {
  const d = el.value;
  if (!d) return;
  if (open.value && !d.open) d.showModal();
  else if (!open.value && d.open) d.close();
}
watch(open, sync, { flush: "post" });
onMounted(sync);
</script>

<template>
  <dialog ref="el" @close="open = false">
    <slot />
  </dialog>
</template>
