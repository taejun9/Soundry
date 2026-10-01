import { effectScope, type EffectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackDetail } from '../../../../shared/contracts';
import * as trackApi from '../../api/tracks';
import { ApiError } from '../../api/client';
import { createAudioController, type AudioPort } from '../../audio/controller';
import { FakeAudio } from '../../audio/test-audio';
import { trackFixture } from '../generation/test-fixtures';
import { useTrackDialog } from './useTrackDialog';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
const scopes: EffectScope[] = []; const players: ReturnType<typeof createAudioController>[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); players.splice(0).forEach(player => player.dispose()); });
function detail(): TrackDetail { return { ...trackFixture(), requestedSettings: { mode: 'instrumental' }, requestedVariationCount: 2 }; }
function setup() {
  const audio = new FakeAudio(); const player = createAudioController(audio as unknown as AudioPort, 'http://127.0.0.1:5174'); players.push(player);
  const api = { ...trackApi, getTrack: vi.fn().mockResolvedValue(detail()), updateTrack: vi.fn().mockResolvedValue({ ...detail(), title: 'New name' }), deleteTrack: vi.fn().mockResolvedValue({ deleted: true, cleanupPending: false }) };
  const scope = effectScope(); scopes.push(scope);
  const dialog = scope.run(() => useTrackDialog('track-one', 'project-one', player, api))!;
  return { audio, player, api, scope, dialog };
}
async function start(context: ReturnType<typeof setup>) { const promise = context.player.toggle(trackFixture()); context.audio.ready(); context.audio.requests[0]!.resolve(); await promise; }

describe('track editing lifecycle', () => {
  it('renames the playing track without reloading, pausing or changing its playback position', async () => {
    const context = setup(); await start(context); await context.dialog.load();
    const { audio, dialog, player, api } = context;
    audio.currentTime = 3; audio.emit('timeupdate'); const loads = audio.load.mock.calls.length;
    dialog.title.value = '  New name  ';
    await dialog.save();
    expect(api.updateTrack.mock.calls[0]?.[2]).toEqual({ title: 'New name' });
    expect(player.state.track?.title).toBe('New name');
    expect(player.state.track?.audioUrl).toBe(trackFixture().audioUrl);
    expect(player.state.currentTime).toBe(3); expect(player.state.playing).toBe(true);
    expect(audio.load).toHaveBeenCalledTimes(loads);
  });

  it.each(['   ', 'x'.repeat(121), 'bad\0name'])('rejects an invalid rename before sending the mutation', async title => {
    const { dialog, api } = setup(); await dialog.load(); dialog.title.value = title;
    await dialog.save(); expect(dialog.fieldError.value).not.toBe(''); expect(api.updateTrack).not.toHaveBeenCalled();
  });

  it('does not stop playback when opening the dialog and stops before DELETE even if its response is lost', async () => {
    const context = setup(); await start(context); await context.dialog.load();
    const { api, audio, player, dialog } = context;
    expect(player.state.playing).toBe(true);
    const pending = deferred<{ deleted: true; cleanupPending: boolean }>();
    api.deleteTrack.mockImplementationOnce(() => { expect(audio.paused).toBe(true); expect(audio.src).toBe(''); return pending.promise; });
    const deletion = dialog.remove(); expect(player.state.track).toBeNull();
    pending.reject(new ApiError('lost response', 0, 'NETWORK_ERROR')); await deletion;
    expect(dialog.error.value).toContain('반영 여부'); expect(player.state.track).toBeNull();
  });

  it('keeps deletion cleanup when the dialog unmounts while DELETE is pending', async () => {
    const context = setup(); await start(context); await context.dialog.load();
    const pending = deferred<{ deleted: true; cleanupPending: boolean }>(); context.api.deleteTrack.mockReturnValueOnce(pending.promise);
    const deletion = context.dialog.remove(); context.scope.stop();
    expect(context.api.deleteTrack.mock.calls[0]?.[1].aborted).toBe(true);
    pending.resolve({ deleted: true, cleanupPending: false });
    expect(await deletion).toBeUndefined(); expect(context.player.state.track).toBeNull(); expect(context.audio.paused).toBe(true);
  });

  it('does not rename a playing track from a late response after the dialog has left its route', async () => {
    const context = setup(); await start(context); await context.dialog.load();
    const pending = deferred<TrackDetail>(); context.api.updateTrack.mockReturnValueOnce(pending.promise);
    context.dialog.title.value = 'New name'; const saving = context.dialog.save(); context.scope.stop();
    pending.resolve({ ...detail(), title: 'New name' }); expect(await saving).toBeUndefined();
    expect(context.player.state.track?.title).toBe(trackFixture().title);
  });

  it('ignores stale detail responses and never mutates state after disposal', async () => {
    const { dialog, api, scope } = setup();
    const old = deferred<TrackDetail>(); api.getTrack.mockReturnValueOnce(old.promise);
    const first = dialog.load(); await dialog.load();
    old.resolve({ ...detail(), title: 'Old snapshot' }); await first;
    expect(dialog.title.value).toBe(detail().title);
    const leaving = deferred<TrackDetail>(); api.getTrack.mockReturnValueOnce(leaving.promise);
    const loading = dialog.load(); scope.stop(); leaving.resolve({ ...detail(), title: 'After unmount' }); await loading;
    expect(dialog.title.value).toBe(detail().title);
  });
});
