<script setup lang="ts">
/**
 * 한 프로젝트의 작성·생성 이력·프롬프트 이력·음원 편집을 조합한다.
 * 확정된 변경을 관련 목록에 전달하고 프로젝트 요약 갱신을 상위 Workspace에 요청한다.
 */
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
/** 작업/음원 변경으로 프롬프트의 남은 곡 수와 프로젝트 요약을 다시 읽게 한다. */
function changed() { historyRevision.value++; emit('projectChanged'); }
const { jobs, nextCursor, loading, loadingMore, syncError, retrySeconds, pendingCount, submitting, submitError, uncertain, notice, cancelling, actionErrors, refresh, loadMore, submit, confirmSubmission, cancel, changeTrack, revealGeneration } = useGenerations(props.projectId, changed);
const { pending: favoritePending, errors: favoriteErrors, toggle: toggleFavorite, beginConfirmation } = useFavorites(track => { changeTrack(track); actionNotice.value = track.favorite ? '즐겨찾기에 추가했어요. 보관함에서 모아 들을 수 있습니다.' : '즐겨찾기를 해제했어요. 음원은 이 프로젝트에 그대로 남습니다.'; changed(); }, useAudioPlayer());
/** 재조회 이전 오류 버전을 잡은 뒤 실제 반환된 음원만 즐겨찾기 확인 결과로 사용한다. */
async function refreshHistory() { const confirm = beginConfirmation(); const page = await refresh(); if (page) confirm(page.flatMap(job => job.tracks)); }
/** 추가 페이지에서 확인된 항목의 오류만 해소한다. 전체 목록 완료로 취급하지 않는다. */
async function moreHistory() { const confirm = beginConfirmation(); const page = await loadMore(); if (page) confirm(page.flatMap(job => job.tracks)); }
/** 재사용 확인과 폼 복원 책임을 작성 컴포넌트에 전달한다. */
function reuse(item: ReusableGeneration) { composer.value?.reuse(item); }
/** 완료/실패/취소 작업의 입력을 폼으로 가져온다. 실제 새 요청은 생성 버튼에서 시작한다. */
function regenerate(job: GenerationSummary) { reuse({ generationId: job.id, prompt: job.prompt, settings: job.settings, variationCount: job.variationCount }); }
/** 즐겨찾기 쓰기 중에는 같은 음원의 편집을 겹치지 않게 한다. */
function edit(mode: 'rename' | 'delete', track: TrackSummary) { if (favoritePending.value.has(track.id)) return; actionNotice.value = ''; actionError.value = ''; trackDialog.value = { mode, track }; }
/** 이름 변경의 확정값을 기존 작업 음원에 반영하고 관련 요약을 갱신한다. */
function saved(track: TrackSummary) { trackDialog.value = null; changeTrack(track); actionNotice.value = '음원 이름을 저장했어요. 원본 파일은 그대로 유지됩니다.'; changed(); }
/** 삭제한 음원만 제거한다. 작업 입력/이력은 유지하고 파일 정리 지연 여부를 안내한다. */
function deleted(track: TrackSummary, result: DeleteResult) { trackDialog.value = null; changeTrack(track, true); actionNotice.value = result.cleanupPending ? '음원은 삭제되었습니다. 일부 파일 정리는 다음 서버 시작 때 다시 시도합니다.' : '음원을 삭제했어요. 프롬프트와 생성 이력은 유지됩니다.'; changed(); }
/** 필요한 과거 작업을 읽고 DOM 반영 후 카드로 이동한다. 화면 이탈 뒤에는 포커스를 바꾸지 않는다. */
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
  <!-- 접수 불확실 상태는 원래 입력을 보여주고 같은 요청 확인만 허용한다. 새 초안이 실수로 재전송되지 않는다. -->
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
