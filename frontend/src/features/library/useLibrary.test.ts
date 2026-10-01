import { effectScope, type EffectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTrackSummary, Page } from '../../../../shared/contracts';
import { trackFixture } from '../generation/test-fixtures';
import { useLibrary } from './useLibrary';
import { useFavorites } from '../tracks/useFavorites';
import { ApiError } from '../../api/client';
function track(id = 'track-one'): LibraryTrackSummary { return { ...trackFixture(), id, favorite: true, projectName: 'Studio project', audioUrl: `/api/tracks/${id}/audio`, downloadUrl: `/api/tracks/${id}/download` }; }
function deferred() { let resolve!: (value: Page<LibraryTrackSummary>) => void; const promise = new Promise<Page<LibraryTrackSummary>>(done => { resolve = done; }); return { promise, resolve }; }
const scopes: EffectScope[] = [];
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));
function setup() { const list = vi.fn().mockResolvedValue({ items: [track()], nextCursor: null }); const scope = effectScope(); scopes.push(scope); const state = scope.run(() => useLibrary(list))!; return { list, scope, state }; }

describe('favorite library state', () => {
  it('appends stable cursor pages without duplicate track IDs', async () => {
    const { list, state } = setup();
    list.mockResolvedValueOnce({ items: [track()], nextCursor: 'older' }).mockResolvedValueOnce({ items: [track(), track('track-two')], nextCursor: null });
    await state.refresh(); await state.more();
    expect(list.mock.calls.map(call => call[0])).toEqual([null, 'older']);
    expect(state.tracks.value.map(item => item.id)).toEqual(['track-one', 'track-two']); expect(state.nextCursor.value).toBeNull();
  });

  it.each(['rename', 'unfavorite', 'delete'] as const)('does not let an old refresh undo a confirmed %s', async action => {
    const { list, state } = setup(); await state.refresh(); const oldPage = deferred(); list.mockReturnValueOnce(oldPage.promise);
    const refreshing = state.refresh();
    const changed = { ...track(), title: 'New name', favorite: action !== 'unfavorite' };
    state.changeTrack(changed, action === 'delete'); expect(list.mock.calls[1]?.[1].aborted).toBe(true);
    oldPage.resolve({ items: [track()], nextCursor: 'stale' }); await refreshing;
    expect(state.tracks.value.map(item => item.title)).toEqual(action === 'rename' ? ['New name'] : []);
    expect(state.nextCursor.value).toBeNull(); expect(state.loading.value).toBe(false);
    if (action === 'rename') expect(state.tracks.value[0]?.projectName).toBe('Studio project');
  });

  it('loads remaining favorites when the last item on a partial page is removed', async () => {
    const { list, state } = setup();
    list.mockResolvedValueOnce({ items: [track()], nextCursor: 'older' }); await state.refresh();
    const remaining = deferred(); list.mockReturnValueOnce(remaining.promise);
    state.changeTrack({ ...track(), favorite: false });
    expect(list.mock.calls[1]?.[0]).toBeNull(); expect(state.loading.value).toBe(true);
    remaining.resolve({ items: [track('remaining')], nextCursor: null }); await Promise.resolve(); await Promise.resolve();
    expect(state.tracks.value[0]?.id).toBe('remaining'); expect(state.nextCursor.value).toBeNull();
  });

  it('starts an error retry from the first page even with a remaining cursor', async () => {
    const { list, state } = setup(); list.mockResolvedValueOnce({ items: [track()], nextCursor: 'older' }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ items: [], nextCursor: null });
    await state.refresh(); await state.refresh(); expect(state.error.value).not.toBe(''); await state.refresh();
    expect(list.mock.calls.map(call => call[0])).toEqual([null, null, null]); expect(state.tracks.value).toEqual([]); expect(state.error.value).toBe('');
  });

  it('ignores responses after navigating away and aborts the read', async () => {
    const { list, state, scope } = setup(); const page = deferred(); list.mockReturnValueOnce(page.promise);
    const loading = state.refresh(); scope.stop(); expect(list.mock.calls[0]?.[1].aborted).toBe(true);
    page.resolve({ items: [track()], nextCursor: null }); await loading; expect(state.tracks.value).toEqual([]);
  });
  it('clears an uncertain unfavorite error when a fresh complete list confirms the track is absent', async () => {
    const { list, state, scope } = setup(); await state.refresh();
    const update = vi.fn().mockRejectedValue(new ApiError('response lost after removal was saved', 0, 'NETWORK_ERROR'));
    const favorites = scope.run(() => useFavorites(state.changeTrack, { updateTrack: vi.fn() }, update))!;
    await favorites.toggle(track());
    expect(favorites.errors.value['track-one']).toBeTruthy(); expect(state.tracks.value).toHaveLength(1);
    list.mockResolvedValueOnce({ items: [], nextCursor: null });
    const confirm = favorites.beginConfirmation(); const page = await state.refresh();
    if (page) confirm(page, state.nextCursor.value === null);
    expect(state.tracks.value).toEqual([]); expect(favorites.errors.value['track-one']).toBeUndefined();
  });

});
