<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { DeleteResult, TrackSummary } from '../../../../shared/contracts';
import StudioIcon from '../../components/StudioIcon.vue';
import { restoreRemovedControlFocus } from '../../components/removal-focus';
import FavoriteButton from '../tracks/FavoriteButton.vue';
import TrackDialog from '../tracks/TrackDialog.vue';
import { useAudioPlayer } from '../../audio/context';
import { audioTime } from '../../audio/time';
import { useFavorites } from '../tracks/useFavorites';
import { useLibrary } from './useLibrary';

const player = useAudioPlayer();
const { tracks, nextCursor, loading, loadingMore, error, refresh, more, changeTrack } = useLibrary();
const dialog = ref<{ mode: 'rename' | 'delete'; track: TrackSummary } | null>(null);
const notice = ref(''); const heading = ref<HTMLElement>();
const dateFormat = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
const { pending, errors: favoriteErrors, toggle, beginConfirmation } = useFavorites(track => {
  const focused = document.activeElement;
  const focusInRemovedCard = focused instanceof HTMLElement && focused.closest('[data-library-track-id]')?.getAttribute('data-library-track-id') === track.id;
  changeTrack(track);
  notice.value = track.favorite ? '즐겨찾기에 추가했어요.' : '즐겨찾기를 해제했어요. 재생 중인 음악은 계속 들을 수 있습니다.';
  // The activated button is removed with its card; keep keyboard focus in the list.
  if (!track.favorite && focusInRemovedCard) void restoreRemovedControlFocus(focused, () => heading.value ?? null);
}, player);
async function refreshLibrary() { const confirm = beginConfirmation(); const page = await refresh(); if (page) confirm(page, nextCursor.value === null); }
async function moreLibrary() { const confirm = beginConfirmation(); const page = await more(); if (page) confirm(page); }
function edit(mode: 'rename' | 'delete', track: TrackSummary) { if (pending.value.has(track.id)) return; notice.value = ''; dialog.value = { mode, track }; }
function saved(track: TrackSummary) { dialog.value = null; changeTrack(track); notice.value = '음원 이름을 저장했어요.'; }
function deleted(track: TrackSummary, result: DeleteResult) { dialog.value = null; changeTrack(track, true); notice.value = result.cleanupPending ? '음원은 삭제되었습니다. 일부 파일 정리는 다음 서버 시작 때 다시 시도합니다.' : '음원을 삭제했어요. 생성 이력과 프롬프트는 유지됩니다.'; }
onMounted(() => { void refreshLibrary(); });
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow accent-text">KEEP WHAT MOVES YOU</p><h1>나의 보관함</h1><p class="page-description">여러 프로젝트에서 골라둔 음악을 한곳에서 듣고 정리하세요.</p></div><RouterLink to="/" class="button button-secondary">프로젝트 둘러보기<StudioIcon name="arrow" /></RouterLink></section>
  <p v-if="notice" class="notice-banner" role="status">{{ notice }}</p>
  <section class="panel library-panel" aria-labelledby="library-title" :aria-busy="loading || loadingMore">
    <div class="section-heading"><h2 id="library-title" ref="heading" class="library-title" tabindex="-1">즐겨찾는 음악 <span v-if="tracks.length" class="project-count">{{ tracks.length }}곡{{ nextCursor ? ' 불러옴' : '' }}</span></h2><button type="button" class="text-link" :disabled="loading || loadingMore" @click="refreshLibrary"><StudioIcon name="refresh" />새로고침</button></div>
    <p class="library-description">하트로 보관한 음원만 표시합니다. 즐겨찾기를 해제해도 원본 음원은 프로젝트에 남습니다.</p>
    <div v-if="error" class="error-banner" role="alert"><p>{{ error }}</p><button type="button" class="button button-secondary" :disabled="loading || loadingMore" @click="refreshLibrary">다시 불러오기</button></div>
    <div v-if="loading && !tracks.length" class="empty-state" role="status"><span class="loading-spinner" aria-hidden="true"></span><p>보관한 음악을 불러오고 있어요.</p></div>
    <div v-else-if="!tracks.length && !error && !nextCursor" class="empty-state"><span class="empty-icon"><StudioIcon name="heart" /></span><h3>다시 듣고 싶은 사운드를 모아보세요</h3><p>프로젝트의 음원 카드에서 하트를 누르면<br />이곳에서 한 번에 찾아 들을 수 있어요.</p><RouterLink to="/" class="button button-secondary">프로젝트에서 음악 고르기<StudioIcon name="arrow" /></RouterLink></div>
    <ul v-if="tracks.length" class="library-track-list" aria-label="즐겨찾는 음원">
      <li v-for="track in tracks" :key="track.id" :data-library-track-id="track.id" class="library-track" :class="{ 'is-current': player.state.track?.id === track.id }">
        <RouterLink :to="`/projects/${track.projectId}`" class="library-project"><StudioIcon name="folder" /><span>{{ track.projectName }}</span><StudioIcon name="arrow" /></RouterLink>
        <div class="library-track-main"><button type="button" class="track-play" :class="{ 'is-current': player.state.track?.id === track.id }" :aria-label="`${track.title} ${player.state.track?.id === track.id && (player.state.playing || player.state.loading) ? '일시 정지' : '재생'}`" :aria-pressed="player.state.track?.id === track.id && (player.state.playing || player.state.loading)" @click="player.toggle(track)"><StudioIcon :name="player.state.track?.id === track.id && (player.state.playing || player.state.loading) ? 'pause' : 'play'" /></button><div class="library-track-copy"><h3>{{ track.title }}</h3><p>{{ track.provider === 'mock' ? 'Mock · 고정 데모' : track.provider }}<span v-if="track.model"> · {{ track.model }}</span></p></div><a class="track-download icon-button" :href="track.downloadUrl" download :aria-label="`${track.title} 원본 다운로드`" title="원본 다운로드"><StudioIcon name="download" /></a></div>
        <dl class="library-metadata"><div><dt>길이</dt><dd>{{ track.durationSeconds === null ? '미확인' : audioTime(track.durationSeconds) }}</dd></div><div><dt>BPM</dt><dd>{{ track.bpm ?? '미확인' }}</dd></div><div><dt>장르</dt><dd>{{ track.genre?.trim() || '미확인' }}</dd></div><div><dt>생성일</dt><dd><time :datetime="track.createdAt">{{ dateFormat.format(new Date(track.createdAt)) }}</time></dd></div></dl>
        <div class="track-edit-actions library-track-actions"><FavoriteButton :title="track.title" :favorite="track.favorite" :pending="pending.has(track.id)" @toggle="toggle(track)" /><button type="button" :disabled="pending.has(track.id)" :aria-label="`${track.title} 이름 변경`" @click="edit('rename', track)"><StudioIcon name="edit" />이름 변경</button><button type="button" :disabled="pending.has(track.id)" :aria-label="`${track.title} 삭제`" @click="edit('delete', track)"><StudioIcon name="trash" />삭제</button></div>
        <p v-if="favoriteErrors[track.id]" class="job-error" role="alert">{{ favoriteErrors[track.id] }}</p>
      </li>
    </ul>
    <p v-if="loading && tracks.length" class="list-status" role="status">최신 보관함을 확인하고 있어요.</p>
    <div v-if="nextCursor" class="load-more"><button type="button" class="button button-secondary" :disabled="loading || loadingMore" @click="moreLibrary">{{ loadingMore ? '불러오는 중…' : '음원 더 보기' }}</button></div>
  </section>
  <TrackDialog v-if="dialog" :key="`${dialog.mode}-${dialog.track.id}`" :mode="dialog.mode" :track="dialog.track" :after-delete-focus="() => heading ?? null" @close="dialog = null" @saved="saved" @deleted="deleted" />
</template>
