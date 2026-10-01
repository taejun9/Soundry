<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DeleteResult, GenerationSummary, TrackSummary } from '../../../../shared/contracts';
import GenerationComposer from './GenerationComposer.vue';
import GenerationHistory from './GenerationHistory.vue';
import PromptHistory from './PromptHistory.vue';
import TrackDialog from '../tracks/TrackDialog.vue';
import { useGenerations } from './useGenerations';
import type { ReusableGeneration } from './composer-input';
import { errorMessage } from '../../api/client';
import { useFavorites } from '../tracks/useFavorites';
import { useAudioPlayer } from '../../audio/context';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ projectChanged: [] }>();
const available = ref(false); const historyRevision = ref(0);
const composer = ref<InstanceType<typeof GenerationComposer>>();
const trackDialog = ref<{ mode: 'rename' | 'delete'; track: TrackSummary } | null>(null);
const actionNotice = ref(''); const actionError = ref(''); const revealingId = ref('');
let active = true;
function changed() { historyRevision.value++; emit('projectChanged'); }
const { jobs, nextCursor, loading, loadingMore, syncError, retrySeconds, pendingCount, submitting, submitError, uncertain, notice, cancelling, actionErrors, refresh, loadMore, submit, confirmSubmission, cancel, changeTrack, revealGeneration } = useGenerations(props.projectId, changed);
const { pending: favoritePending, errors: favoriteErrors, toggle: toggleFavorite, beginConfirmation } = useFavorites(track => { changeTrack(track); actionNotice.value = track.favorite ? '즐겨찾기에 추가했어요. 보관함에서 모아 들을 수 있습니다.' : '즐겨찾기를 해제했어요. 음원은 이 프로젝트에 그대로 남습니다.'; changed(); }, useAudioPlayer());
async function refreshHistory() { const confirm = beginConfirmation(); const page = await refresh(); if (page) confirm(page.flatMap(job => job.tracks)); }
async function moreHistory() { const confirm = beginConfirmation(); const page = await loadMore(); if (page) confirm(page.flatMap(job => job.tracks)); }
function reuse(item: ReusableGeneration) { composer.value?.reuse(item); }
function regenerate(job: GenerationSummary) { reuse({ generationId: job.id, prompt: job.prompt, settings: job.settings, variationCount: job.variationCount }); }
function edit(mode: 'rename' | 'delete', track: TrackSummary) { if (favoritePending.value.has(track.id)) return; actionNotice.value = ''; actionError.value = ''; trackDialog.value = { mode, track }; }
function saved(track: TrackSummary) { trackDialog.value = null; changeTrack(track); actionNotice.value = '음원 이름을 저장했어요. 원본 파일은 그대로 유지됩니다.'; changed(); }
function deleted(track: TrackSummary, result: DeleteResult) { trackDialog.value = null; changeTrack(track, true); actionNotice.value = result.cleanupPending ? '음원은 삭제되었습니다. 일부 파일 정리는 다음 서버 시작 때 다시 시도합니다.' : '음원을 삭제했어요. 프롬프트와 생성 이력은 유지됩니다.'; changed(); }
async function reveal(id: string) {
  if (revealingId.value) return;
  revealingId.value = id; actionError.value = '';
  try {
    if (!await revealGeneration(id) || !active) return;
    await nextTick(); if (!active) return;
    const element = document.getElementById(`generation-${id}`);
    element?.focus({ preventScroll: true }); element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (reason) { if (active) actionError.value = errorMessage(reason); }
  finally { if (active) revealingId.value = ''; }
}
onMounted(() => { void refreshHistory(); });
onBeforeUnmount(() => { active = false; });
</script>

<template>
  <p v-if="notice" class="notice-banner" role="status">{{ notice }}</p>
  <p v-if="actionNotice" class="notice-banner" role="status">{{ actionNotice }}</p>
  <p v-if="actionError" class="error-banner" role="alert">{{ actionError }}</p>
  <div v-if="uncertain && !submitting" class="uncertain-submission" role="alert"><h2>이전 요청의 접수 여부를 확인해 주세요</h2><p>응답을 받지 못해도 서버가 작업을 접수했을 수 있어요. 아래 버튼은 원래 입력과 같은 요청 번호로 접수를 확인합니다. 지금 수정 중인 내용은 전송하지 않습니다.</p><details><summary>확인할 원래 프롬프트</summary><p>{{ uncertain.prompt }}</p><p>{{ uncertain.variationCount }}곡 요청</p></details><button class="button button-primary" type="button" @click="confirmSubmission">같은 요청으로 접수 확인</button></div>
  <p v-if="submitError" class="error-banner" role="alert">{{ submitError }}</p>
  <div class="workspace-grid job-workspace-grid">
    <div class="workspace-write-column"><GenerationComposer ref="composer" :project-id="projectId" :submitting="submitting" :blocked="Boolean(uncertain)" @submit="submit" @availability="available = $event" /><PromptHistory :project-id="projectId" :refresh-key="historyRevision" :reuse-disabled="!available || submitting || Boolean(uncertain)" :revealing-id="revealingId" @reuse="reuse" @reveal="reveal" /></div>
    <GenerationHistory :jobs="jobs" :loading="loading" :loading-more="loadingMore" :next-cursor="nextCursor" :sync-error="syncError" :retry-seconds="retrySeconds" :pending-count="pendingCount" :retry-disabled="!available || submitting || Boolean(uncertain)" :favorite-pending="favoritePending" :favorite-errors="favoriteErrors" :cancelling="cancelling" :action-errors="actionErrors" @refresh="refreshHistory" @more="moreHistory" @cancel="cancel" @retry="regenerate" @edit="edit" @favorite="toggleFavorite" />
  </div>
  <TrackDialog v-if="trackDialog" :key="`${trackDialog.mode}-${trackDialog.track.id}`" :mode="trackDialog.mode" :track="trackDialog.track" @close="trackDialog = null" @saved="saved" @deleted="deleted" />
</template>
