/**
 * 전역 즐겨찾기 목록의 조회·페이지 추가·확정된 음원 변경을 관리한다.
 * 서버 응답의 순서를 보존하고 삭제/즐겨찾기 해제 후 늦은 조회가 항목을 되살리지 못하게 한다.
 */
import { onScopeDispose, ref } from 'vue';
import type { LibraryTrackSummary, TrackSummary } from '../../../../shared/contracts';
import { listFavorites } from '../../api/library';
import { errorMessage } from '../../api/client';

export function useLibrary(list = listFavorites) {
  const tracks = ref<LibraryTrackSummary[]>([]); const nextCursor = ref<string | null>(null);
  const loading = ref(false); const loadingMore = ref(false); const error = ref('');
  let active = true; let sequence = 0; let controller: AbortController | undefined;
  /** 전체 새로고침과 페이지 추가의 로딩 상태를 분리하고 같은 track ID는 하나만 남긴다. */
  async function load(append = false) {
    if (!active || (append && (loading.value || loadingMore.value || !nextCursor.value))) return;
    controller?.abort(); controller = new AbortController();
    const current = ++sequence; const signal = controller.signal;
    loading.value = !append; loadingMore.value = append; error.value = '';
    try {
      const page = await list(append ? nextCursor.value : null, signal);
      if (!active || current !== sequence) return;
      tracks.value = append ? [...new Map([...tracks.value, ...page.items].map(track => [track.id, track])).values()] : page.items;
      nextCursor.value = page.nextCursor;
      return page.items;
    } catch (reason) { if (active && current === sequence && !signal.aborted) error.value = errorMessage(reason); }
    finally { if (active && current === sequence) { loading.value = false; loadingMore.value = false; } }
  }
  /** 확정된 쓰기를 먼저 반영하고 읽기를 무효화한다. 해제/삭제로 비었지만 cursor가 남으면 첫 페이지를 다시 읽는다. */
  function changeTrack(track: TrackSummary, deleted = false) {
    if (!active) return;
    sequence++; controller?.abort(); loading.value = false; loadingMore.value = false;
    tracks.value = tracks.value.flatMap(old => old.id !== track.id ? [old] : deleted || !track.favorite ? [] : [{ ...old, ...track }]);
    // A removed page can be empty while older favorites still exist.
    if (!tracks.value.length && nextCursor.value) void load();
  }
  onScopeDispose(() => { active = false; sequence++; controller?.abort(); });
  return { tracks, nextCursor, loading, loadingMore, error, refresh: () => load(), more: () => load(true), changeTrack };
}
