<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import StudioIcon from './StudioIcon.vue';

const props = defineProps<{ title: string; busy?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleId = useId();
let returnFocus: HTMLElement | null = null;
let previousOverflow = '';

function dismiss() {
  if (!props.busy) emit('close');
}

function trapTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !dialog.value) return;
  const controls = [...dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')];
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); dialog.value.focus(); return; }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
    event.preventDefault(); first.focus();
  }
}

onMounted(async () => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.value?.showModal();
  await nextTick();
  dialog.value?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
});

onBeforeUnmount(() => {
  dialog.value?.close();
  document.body.style.overflow = previousOverflow;
  void nextTick(() => {
    if (returnFocus?.isConnected) returnFocus.focus();
    else document.querySelector<HTMLElement>('#main-content')?.focus();
  });
});
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="modal-dialog" :aria-labelledby="titleId" :aria-busy="busy" tabindex="-1" @cancel.prevent="dismiss" @keydown="trapTab">
      <header class="modal-heading"><h2 :id="titleId">{{ title }}</h2><button class="icon-button" type="button" aria-label="창 닫기" :disabled="busy" @click="dismiss"><StudioIcon name="close" /></button></header>
      <slot />
    </dialog>
  </Teleport>
</template>
