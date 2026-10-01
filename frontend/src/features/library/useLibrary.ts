import { onScopeDispose, ref } from 'vue';
import type { LibraryTrackSummary, TrackSummary } from '../../../../shared/contracts';
import { listFavorites } from '../../api/library';
import { errorMessage } from '../../api/client';

export function useLibrary(list = listFavorites) {
  const tracks = ref<LibraryTrackSummary[]>([]); const nextCursor = ref<string | null>(null);
  const loading = ref(false); const loadingMore = ref(false); const error = ref('');
  let active = true; let sequence = 0; let controller: AbortController | undefined;
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
