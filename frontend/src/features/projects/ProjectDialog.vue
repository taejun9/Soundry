<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from 'vue';
import type { DeleteResult, ProjectSummary } from '../../../../shared/contracts';
import { createProject, renameProject } from '../../api/projects';
import { errorMessage } from '../../api/client';
import ModalDialog from '../../components/ModalDialog.vue';
import { useAudioPlayer } from '../../audio/context';
import { deleteProjectWithPlayback } from './deleteProject';

const player = useAudioPlayer();

const props = defineProps<{ mode: 'create' | 'rename' | 'delete'; project?: ProjectSummary }>();
const emit = defineEmits<{ close: []; saved: [project: ProjectSummary]; deleted: [result: DeleteResult] }>();
const name = ref(props.project?.name ?? '');
const busy = ref(false);
const error = ref('');
const fieldError = ref('');
const fieldId = useId();
const title = computed(() => ({ create: '새 프로젝트', rename: '프로젝트 이름 변경', delete: '프로젝트 삭제' })[props.mode]);
const action = computed(() => ({ create: '프로젝트 만들기', rename: '이름 저장', delete: '프로젝트 삭제' })[props.mode]);
const controller = new AbortController();
let active = true;

async function submit() {
  if (busy.value) return;
  error.value = '';
  fieldError.value = '';
  const trimmed = name.value.trim();
  if (props.mode !== 'delete' && (trimmed.length < 1 || trimmed.length > 120)) {
    fieldError.value = '프로젝트 이름은 공백을 제외하고 1–120자로 입력해 주세요.';
    document.getElementById(fieldId)?.focus();
    return;
  }
  busy.value = true;
  try {
    if (props.mode === 'delete' && props.project) {
      const result = await deleteProjectWithPlayback(props.project.id, controller.signal, player);
      if (active) emit('deleted', result);
    } else {
      const project = props.mode === 'rename' && props.project
        ? await renameProject(props.project.id, trimmed, controller.signal)
        : await createProject(trimmed, controller.signal);
      if (active) emit('saved', project);
    }
  } catch (reason) {
    if (active) error.value = errorMessage(reason);
  } finally {
    if (active) busy.value = false;
  }
}

onBeforeUnmount(() => { active = false; controller.abort(); });
</script>

<template>
  <ModalDialog :title="title" :busy="busy" @close="emit('close')">
    <form novalidate @submit.prevent="submit">
      <template v-if="mode === 'delete'">
        <p class="modal-copy"><strong class="break-name">{{ project?.name }}</strong> 프로젝트를 삭제할까요?</p>
        <div class="delete-scope"><p>이 프로젝트의 생성 이력과 음원 <strong>{{ project?.trackCount ?? 0 }}곡</strong>이 함께 삭제됩니다.</p><p>삭제 후에는 되돌릴 수 없습니다.</p></div>
      </template>
      <template v-else>
        <p class="modal-copy">{{ mode === 'create' ? '새로운 사운드를 담을 공간에 이름을 붙여주세요.' : '프로젝트의 이름을 바꿉니다. 음원과 이력은 유지됩니다.' }}</p>
        <label class="field-label" :for="fieldId">프로젝트 이름</label>
        <input :id="fieldId" v-model="name" class="text-input" type="text" maxlength="120" autocomplete="off" :disabled="busy" :aria-invalid="Boolean(fieldError)" :aria-describedby="`${fieldId}-help ${fieldId}-error`" data-initial-focus placeholder="예: 비 오는 밤의 비트" @input="fieldError = ''" />
        <div class="input-caption"><span :id="`${fieldId}-help`">앞뒤 공백을 제외한 1–120자</span><span>{{ name.trim().length }} / 120</span></div>
        <p :id="`${fieldId}-error`" class="field-error" aria-live="polite">{{ fieldError }}</p>
      </template>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <p v-if="busy" class="sr-only" role="status">요청을 처리하고 있습니다.</p>
      <div class="modal-actions"><button class="button button-secondary" type="button" :disabled="busy" :data-initial-focus="mode === 'delete' ? '' : undefined" @click="emit('close')">취소</button><button type="submit" class="button" :class="mode === 'delete' ? 'button-danger' : 'button-primary'" :disabled="busy">{{ busy ? '처리 중…' : action }}</button></div>
    </form>
  </ModalDialog>
</template>
