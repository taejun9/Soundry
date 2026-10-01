<script setup lang="ts">
import { nextTick, onMounted, ref, useId, watch } from 'vue';
import type { DeleteResult, TrackSummary } from '../../../../shared/contracts';
import ModalDialog from '../../components/ModalDialog.vue';
import { useAudioPlayer } from '../../audio/context';
import { useTrackDialog } from './useTrackDialog';
const props = defineProps<{ mode: 'rename' | 'delete'; track: TrackSummary; afterDeleteFocus?: () => HTMLElement | null }>();
const emit = defineEmits<{ close: []; saved: [track: TrackSummary]; deleted: [track: TrackSummary, result: DeleteResult] }>();
const { detail, title, loading, busy, error, fieldError, load, save, remove } = useTrackDialog(props.track.id, props.track.projectId, useAudioPlayer());
let deletionConfirmed = false;
const preferredReturnFocus = () => deletionConfirmed ? props.afterDeleteFocus?.() ?? null : null;
const id = useId(); const input = ref<HTMLInputElement>();
async function submit() {
  if (props.mode === 'delete') { const result = await remove(); if (result) { deletionConfirmed = true; emit('deleted', props.track, result); } }
  else { const result = await save(); if (result) emit('saved', result); else if (fieldError.value) { await nextTick(); input.value?.focus(); } }
}
watch(detail, async value => { if (value && props.mode === 'rename') { await nextTick(); input.value?.focus(); } });
onMounted(() => { void load(); });
</script>
<template>
  <ModalDialog :title="mode === 'rename' ? '음원 이름 변경' : '음원 삭제'" :busy="busy" :preferred-return-focus="preferredReturnFocus" @close="emit('close')">
    <p v-if="loading" class="modal-copy" role="status">현재 음원 정보를 확인하고 있어요.</p>
    <div v-if="error" class="error-banner" role="alert"><p>{{ error }}</p><button v-if="!detail" type="button" class="button button-secondary" :disabled="loading" @click="load">다시 확인</button></div>
    <form novalidate @submit.prevent="submit">
      <template v-if="mode === 'delete'"><p class="modal-copy"><strong class="break-name">{{ detail?.title ?? track.title }}</strong> 음원을 삭제할까요?</p><div class="delete-scope"><p>이 음원 1곡과 원본 파일을 삭제합니다. 생성 이력과 프롬프트, 같은 작업의 다른 음원은 유지됩니다.</p><p>삭제를 확정하면 이 음원의 재생을 먼저 멈춥니다. 삭제 후에는 되돌릴 수 없습니다.</p></div></template>
      <template v-else><p class="modal-copy">표시 이름과 다운로드 파일 이름을 바꿉니다. 원본 음원은 그대로 유지됩니다.</p><label class="field-label" :for="id">음원 이름</label><input :id="id" ref="input" v-model="title" class="text-input" maxlength="120" :disabled="loading || busy || !detail" :aria-invalid="Boolean(fieldError)" :aria-describedby="`${id}-error`" data-initial-focus @input="fieldError = ''" /><p :id="`${id}-error`" class="field-error" role="status">{{ fieldError }}</p></template>
      <div class="modal-actions"><button type="button" class="button button-secondary" :disabled="busy" :data-initial-focus="mode === 'delete' ? '' : undefined" @click="emit('close')">취소</button><button type="submit" class="button" :class="mode === 'delete' ? 'button-danger' : 'button-primary'" :disabled="loading || busy || !detail">{{ busy ? '처리 중…' : mode === 'delete' ? '음원 삭제' : '이름 저장' }}</button></div>
    </form>
  </ModalDialog>
</template>
