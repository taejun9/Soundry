<script setup lang="ts">
/**
 * 편집·삭제·덮어쓰기 확인에서 공유하는 네이티브 dialog 래퍼.
 * 배경 스크롤, 초기 포커스, Tab 순환, 닫힌 뒤 포커스 복원을 한곳에서 책임진다.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import StudioIcon from './StudioIcon.vue';
import { restoreDialogFocus } from './dialog-focus';

const props = defineProps<{ title: string; busy?: boolean; preferredReturnFocus?: () => HTMLElement | null }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleId = useId();
let returnFocus: HTMLElement | null = null;
let previousOverflow = '';

/** 처리 중에는 Escape와 닫기 버튼 모두 같은 busy 정책을 따른다. */
function dismiss() {
  if (!props.busy) emit('close');
}

/** 활성 조작의 처음/끝에서 Tab을 순환시킨다. 모두 비활성이면 dialog 자체에 포커스를 유지한다. */
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

// dialog를 top layer에 올린 뒤 렌더링된 초기 조작에 포커스를 준다.
onMounted(async () => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.value?.showModal();
  await nextTick();
  dialog.value?.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
});

// 원래 body 스크롤을 돌려놓고 DOM 제거 후 살아 있는 복귀 대상 하나를 선택한다.
onBeforeUnmount(() => {
  dialog.value?.close();
  document.body.style.overflow = previousOverflow;
  void restoreDialogFocus(returnFocus, props.preferredReturnFocus, () => document.querySelector<HTMLElement>('#main-content'));
});
</script>

<template>
  <!-- body로 이동시켜 부모 레이아웃의 clipping을 피하고 네이티브 모달과 제목 연결을 유지한다. -->
  <Teleport to="body">
    <dialog ref="dialog" class="modal-dialog" :aria-labelledby="titleId" :aria-busy="busy" tabindex="-1" @cancel.prevent="dismiss" @keydown="trapTab">
      <header class="modal-heading"><h2 :id="titleId">{{ title }}</h2><button class="icon-button" type="button" aria-label="창 닫기" :disabled="busy" @click="dismiss"><StudioIcon name="close" /></button></header>
      <slot />
    </dialog>
  </Teleport>
</template>
