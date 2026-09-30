<script setup lang="ts">
import { onMounted, ref } from 'vue';
import GenerationComposer from './GenerationComposer.vue';
import GenerationHistory from './GenerationHistory.vue';
import { useGenerations } from './useGenerations';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ projectChanged: [] }>();
const available = ref(false);
const { jobs, nextCursor, loading, loadingMore, syncError, retrySeconds, pendingCount, submitting, submitError, uncertain, notice, cancelling, actionErrors, refresh, loadMore, submit, confirmSubmission, cancel, retry } = useGenerations(props.projectId, () => emit('projectChanged'));
onMounted(() => { void refresh(); });
</script>

<template>
  <p v-if="notice" class="notice-banner" role="status">{{ notice }}</p>
  <div v-if="uncertain && !submitting" class="uncertain-submission" role="alert"><h2>이전 요청의 접수 여부를 확인해 주세요</h2><p>응답을 받지 못해도 서버가 작업을 접수했을 수 있어요. 아래 버튼은 원래 입력과 같은 요청 번호로 접수를 확인합니다. 지금 수정 중인 내용은 전송하지 않습니다.</p><details><summary>확인할 원래 프롬프트</summary><p>{{ uncertain.prompt }}</p><p>{{ uncertain.variationCount }}곡 요청</p></details><button class="button button-primary" type="button" @click="confirmSubmission">같은 요청으로 접수 확인</button></div>
  <p v-if="submitError" class="error-banner" role="alert">{{ submitError }}</p>
  <div class="workspace-grid job-workspace-grid">
    <GenerationComposer :project-id="projectId" :submitting="submitting" :blocked="Boolean(uncertain)" @submit="submit" @availability="available = $event" />
    <GenerationHistory :jobs="jobs" :loading="loading" :loading-more="loadingMore" :next-cursor="nextCursor" :sync-error="syncError" :retry-seconds="retrySeconds" :pending-count="pendingCount" :retry-disabled="!available || submitting || Boolean(uncertain)" :cancelling="cancelling" :action-errors="actionErrors" @refresh="refresh" @more="loadMore" @cancel="cancel" @retry="retry" />
  </div>
</template>
