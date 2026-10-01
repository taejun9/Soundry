<script setup lang="ts">
import type { GenerationSummary, TrackSummary } from '../../../../shared/contracts';
import StudioIcon from '../../components/StudioIcon.vue';
import FavoriteButton from '../tracks/FavoriteButton.vue';
import { providerResultLabel } from './provider-display';
import { isPending } from './useGenerations';
import { useAudioPlayer } from '../../audio/context';

const player = useAudioPlayer();

defineProps<{
  jobs: GenerationSummary[]; loading: boolean; loadingMore: boolean; nextCursor: string | null;
  syncError: string; retrySeconds: number; pendingCount: number; retryDisabled: boolean;
  favoritePending: Set<string>; favoriteErrors: Record<string, string>;
  cancelling: Set<string>; actionErrors: Record<string, string>;
}>();
const emit = defineEmits<{ refresh: []; more: []; cancel: [id: string]; retry: [job: GenerationSummary]; edit: [mode: 'rename' | 'delete', track: TrackSummary]; favorite: [track: TrackSummary] }>();
const dateFormat = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function statusLabel(job: GenerationSummary) {
  if (job.status === 'processing') {
    if (job.stage === 'saving') return '음원 저장 중';
    if (job.stage === 'generating') return job.provider === 'mock' ? '데모 음원 불러오는 중' : job.provider === 'cli' ? 'AI 작곡 · 로컬 합성 중' : '음악 생성 중';
    return '준비 중';
  }
  return { queued: '순서 기다리는 중', completed: '완료', failed: '실패', cancelled: '취소됨' }[job.status];
}
function duration(seconds: number | null) {
  if (seconds === null) return '길이 미확인';
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
const settingLabels: Record<string, string> = { mode: '음악 유형', genre: '장르', mood: '분위기', bpm: 'BPM', durationSeconds: '요청 길이(초)', seed: '시드' };
function settingValue(key: string, value: string | number | undefined) { return key === 'mode' ? (value === 'instrumental' ? '연주곡' : '보컬 포함') : value ?? ''; }
</script>

<template>
  <section class="panel generation-history" aria-labelledby="history-title">
    <div class="section-heading"><h2 id="history-title">생성 이력</h2><button type="button" class="icon-button" aria-label="생성 이력 새로고침" :disabled="loading || loadingMore" @click="emit('refresh')"><StudioIcon name="refresh" /></button></div>
    <p class="history-status" role="status">{{ pendingCount ? `${pendingCount}개 작업 처리 중 · 다른 화면으로 이동해도 계속 처리됩니다.` : `불러온 작업 ${jobs.length}개` }}</p>
    <div v-if="syncError" class="error-banner history-error" role="alert"><p>{{ syncError }}</p><p>화면의 연결 문제는 작업 실패와 다릅니다. {{ retrySeconds }}초 간격으로 다시 확인합니다.</p><button type="button" class="button button-secondary" :disabled="loading" @click="emit('refresh')">지금 다시 조회</button></div>
    <div v-if="loading && jobs.length === 0" class="empty-state" role="status"><span class="loading-spinner" aria-hidden="true"></span><p>저장된 생성 이력을 불러오고 있어요.</p></div>
    <div v-else-if="!syncError && jobs.length === 0" class="empty-state"><span class="empty-icon"><StudioIcon name="note" /></span><h3>첫 번째 곡을 만들어 보세요</h3><p>음악 아이디어와 공급자 안내를 확인하고<br />생성 버튼을 눌러 작업을 시작하세요.</p><span class="availability-note">진행 상황과 완성된 음원이 여기에 표시됩니다.</span></div>
    <ol v-if="jobs.length" class="generation-list">
      <li v-for="job in jobs" :id="`generation-${job.id}`" :key="job.id" class="generation-card" tabindex="-1">
        <div class="generation-heading"><span class="job-status" :data-status="job.status" role="status"><span v-if="isPending(job)" class="job-dot" aria-hidden="true"></span>{{ statusLabel(job) }}</span><time :datetime="job.createdAt">{{ dateFormat.format(new Date(job.createdAt)) }}</time></div>
        <p class="generation-source">{{ providerResultLabel(job.provider) }}<span v-if="job.model"> · {{ job.model }}</span> · {{ job.variationCount }}곡 요청</p>
        <details class="generation-prompt"><summary>요청한 프롬프트<StudioIcon name="chevron" /></summary><p>{{ job.prompt }}</p><dl v-if="Object.keys(job.settings).length" class="requested-settings"><div v-for="(value, key) in job.settings" :key="key"><dt>{{ settingLabels[key] }}</dt><dd>{{ settingValue(key, value) }}</dd></div></dl><p v-if="job.sourceGenerationId" class="source-note">이전 작업의 입력으로 새로 요청한 작업입니다.</p></details>
        <p v-if="job.status === 'failed'" class="job-error" role="alert">{{ job.errorMessage ?? '작업을 완료하지 못했어요. 새 작업으로 다시 시도할 수 있습니다.' }}</p>
        <p v-else-if="job.status === 'cancelled'" class="job-hint">취소된 이력은 보존됩니다. 다시 시도하면 새 작업을 만듭니다.</p>
        <p v-if="job.status === 'completed' && job.provider === 'mock'" class="mock-result-note">고정된 8초 데모입니다. 프롬프트로 새로 작곡한 음악이 아닙니다.</p>
        <p v-if="job.status === 'completed' && job.provider === 'cli'" class="mock-result-note">Codex CLI가 작곡한 악보를 이 컴퓨터에서 합성한 연주곡입니다.</p>
        <ul v-if="job.tracks.length" class="result-tracks">
          <li v-for="track in job.tracks" :key="track.id" class="result-track" :class="{ 'is-current': player.state.track?.id === track.id }"><button type="button" class="track-play" :class="{ 'is-current': player.state.track?.id === track.id }" :aria-label="`${track.title} ${player.state.track?.id === track.id && (player.state.playing || player.state.loading) ? '일시 정지' : '재생'}`" :aria-pressed="player.state.track?.id === track.id && (player.state.playing || player.state.loading)" @click="player.toggle(track)"><StudioIcon :name="player.state.track?.id === track.id && (player.state.playing || player.state.loading) ? 'pause' : 'play'" /></button><div class="track-copy"><h3>{{ track.title }}</h3><p>{{ duration(track.durationSeconds) }} · {{ track.mimeType === 'audio/wav' ? 'WAV' : track.mimeType }} · {{ providerResultLabel(track.provider) }}</p><p v-if="track.bpm !== null || track.genre"><span v-if="track.bpm !== null">{{ track.bpm }} BPM</span><span v-if="track.genre"> {{ track.genre }}</span></p></div><a class="track-download icon-button" :href="track.downloadUrl" download :aria-label="`${track.title} 원본 다운로드`" title="원본 다운로드"><StudioIcon name="download" /></a><div class="track-edit-actions"><FavoriteButton :title="track.title" :favorite="track.favorite" :pending="favoritePending.has(track.id)" @toggle="emit('favorite', track)" /><button type="button" :disabled="favoritePending.has(track.id)" :aria-label="`${track.title} 이름 변경`" @click="emit('edit', 'rename', track)"><StudioIcon name="edit" />이름 변경</button><button type="button" :disabled="favoritePending.has(track.id)" :aria-label="`${track.title} 삭제`" @click="emit('edit', 'delete', track)"><StudioIcon name="trash" />삭제</button></div><p v-if="favoriteErrors[track.id]" class="job-error track-favorite-error" role="alert">{{ favoriteErrors[track.id] }}</p></li>
        </ul>
        <p v-if="job.status === 'completed' && !job.tracks.length" class="job-hint">이 작업의 음원은 모두 삭제되었습니다. 프롬프트와 생성 이력은 보관됩니다.</p>
        <div class="generation-actions"><button v-if="isPending(job)" type="button" class="button button-secondary" :disabled="cancelling.has(job.id)" @click="emit('cancel', job.id)">{{ cancelling.has(job.id) ? '취소 확인 중…' : '작업 취소' }}</button><button v-else type="button" class="button button-secondary" :disabled="retryDisabled" @click="emit('retry', job)"><StudioIcon name="refresh" />{{ job.status === 'completed' ? '입력 가져와 다시 만들기' : '입력 확인 후 재시도' }}</button></div>
        <p v-if="actionErrors[job.id]" class="job-error" role="alert">{{ actionErrors[job.id] }}</p>
      </li>
    </ol>
    <div v-if="nextCursor" class="load-more"><button type="button" class="button button-secondary" :disabled="loading || loadingMore" @click="emit('more')">{{ loadingMore ? '불러오는 중…' : '이전 작업 더 보기' }}</button></div>
    <p class="history-footnote">음원은 이 컴퓨터에 저장됩니다. 다운로드 버튼으로 원본 파일을 저장할 수 있어요.</p>
  </section>
</template>
