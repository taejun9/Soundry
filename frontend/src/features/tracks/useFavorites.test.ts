/**
 * 즐겨찾기의 중복 클릭·서로 다른 음원 동시 변경·응답 유실을 검증한다.
 * 서버 확정 전에는 원본 상태를 바꾸지 않고 재생을 유지하며 오래된 재조회가 새 오류를 지우지 않게 한다.
 */
import { effectScope, type EffectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrackDetail } from '../../../../shared/contracts';
import { ApiError } from '../../api/client';
import { createAudioController, type AudioPort } from '../../audio/controller';
import { FakeAudio } from '../../audio/test-audio';
import { trackFixture } from '../generation/test-fixtures';
import { useFavorites } from './useFavorites';
import { useGenerations } from '../generation/useGenerations';
import * as generationApi from '../../api/generations';
import { jobFixture } from '../generation/test-fixtures';
/** 서버가 돌려주는 요청 설정과 실제 음원 정보를 별도로 가진 상세 응답을 만든다. */
function detail(favorite = true): TrackDetail { return { ...trackFixture(), favorite, requestedSettings: {}, requestedVariationCount: 1 }; }
/** 응답 완료 순서를 테스트가 제어하여 늦은 응답과 화면 이탈 경쟁을 재현한다. */
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
const scopes: EffectScope[] = []; const players: ReturnType<typeof createAudioController>[] = [];
// 전역 대역·scope·미디어 자원은 해당 테스트의 정리 훅에서 복구해 다음 사례를 오염시키지 않는다.
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); players.splice(0).forEach(player => player.dispose()); });
/** 각 사례에 독립된 API 대역과 상태 수명을 만들어 다른 테스트의 요청/상태가 섞이지 않게 한다. */
function setup() {
  const audio = new FakeAudio(); const player = createAudioController(audio as unknown as AudioPort, 'http://127.0.0.1:5174'); players.push(player);
  const update = vi.fn().mockResolvedValue(detail()); const saved = vi.fn();
  const scope = effectScope(); scopes.push(scope); const state = scope.run(() => useFavorites(saved, player, update))!;
  return { audio, player, update, saved, scope, state };
}

describe('favorite mutation lifecycle', () => {
  it('blocks duplicate clicks and publishes only the server-confirmed favorite state', async () => {
    const { update, saved, state } = setup(); const pending = deferred<TrackDetail>(); update.mockReturnValueOnce(pending.promise);
    const original = trackFixture(); const sending = state.toggle(original); await state.toggle(original);
    expect(update).toHaveBeenCalledTimes(1); expect(update.mock.calls[0]?.[2]).toEqual({ favorite: true });
    expect(state.pending.value.has(original.id)).toBe(true); expect(original.favorite).toBe(false); expect(saved).not.toHaveBeenCalled();
    pending.resolve(detail()); await sending;
    expect(saved).toHaveBeenCalledWith(detail()); expect(state.pending.value.has(original.id)).toBe(false);
  });

  it('removes a favorite without pausing or reloading its playing audio', async () => {
    const { audio, player, update, state, saved } = setup(); const original = detail();
    const playing = player.toggle(original); audio.ready(); audio.requests[0]!.resolve(); await playing;
    audio.currentTime = 3; audio.emit('timeupdate'); const loads = audio.load.mock.calls.length;
    update.mockResolvedValueOnce(detail(false)); await state.toggle(original);
    expect(saved).toHaveBeenCalledWith(detail(false)); expect(player.state.track?.favorite).toBe(false);
    expect(player.state.playing).toBe(true); expect(audio.paused).toBe(false); expect(player.state.currentTime).toBe(3); expect(audio.load).toHaveBeenCalledTimes(loads);
  });

  it('reports an uncertain mutation without changing local state or automatically retrying', async () => {
    const { update, state, saved } = setup(); update.mockRejectedValueOnce(new ApiError('lost response', 0, 'NETWORK_ERROR'));
    const original = trackFixture(); await state.toggle(original);
    expect(saved).not.toHaveBeenCalled(); expect(original.favorite).toBe(false); expect(state.errors.value[original.id]).toContain('새로고침'); expect(update).toHaveBeenCalledTimes(1);
    await state.toggle(original); expect(update.mock.calls[1]?.[2]).toEqual({ favorite: true }); expect(state.errors.value[original.id]).toBeUndefined();
  });

  it('aborts pending mutations and ignores a response after leaving the view', async () => {
    const { update, saved, scope, state } = setup(); const pending = deferred<TrackDetail>(); update.mockReturnValueOnce(pending.promise);
    const sending = state.toggle(trackFixture()); scope.stop(); expect(update.mock.calls[0]?.[3].aborted).toBe(true);
    pending.resolve(detail()); await sending; expect(saved).not.toHaveBeenCalled();
  });

  it('keeps concurrent mutations of different tracks independent', async () => {
    const { update, state, saved } = setup(); const first = deferred<TrackDetail>(); const second = deferred<TrackDetail>();
    const other = { ...detail(), id: 'track-two' };
    update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = state.toggle(trackFixture()); const b = state.toggle(other);
    first.reject(new ApiError('missing', 404, 'NOT_FOUND')); await a;
    second.resolve({ ...other, favorite: false }); await b;
    expect(saved).toHaveBeenCalledTimes(1); expect(saved).toHaveBeenCalledWith({ ...other, favorite: false });
    expect(state.errors.value['track-one']).toBe('missing'); expect(state.errors.value['track-two']).toBeUndefined(); expect(state.pending.value.size).toBe(0);
  });
  it('clears only errors whose track state was confirmed by a successful fresh read', async () => {
    const { update, state } = setup();
    update.mockRejectedValueOnce(new ApiError('response lost after commit', 0, 'NETWORK_ERROR'));
    await state.toggle(trackFixture()); expect(state.errors.value['track-one']).toBeTruthy();
    const confirm = state.beginConfirmation();
    confirm([{ ...detail(), id: 'unrelated-track' }]);
    expect(state.errors.value['track-one']).toBeTruthy();
    confirm([detail()]);
    expect(state.errors.value['track-one']).toBeUndefined(); expect(state.pending.value.size).toBe(0);
  });

  it('preserves a newer mutation error when an older read finishes later', async () => {
    const { update, state } = setup();
    update.mockRejectedValue(new ApiError('lost response', 0, 'NETWORK_ERROR'));
    await state.toggle(trackFixture());
    const confirmOldRead = state.beginConfirmation();
    await state.toggle(trackFixture());
    confirmOldRead([detail()]);
    expect(state.errors.value['track-one']).toBeTruthy();
    state.beginConfirmation()([detail()]);
    expect(state.errors.value['track-one']).toBeUndefined();
  });

  it('recovers a committed favorite with a lost PATCH response through project history refresh', async () => {
    const { state, scope, update } = setup();
    const api = { ...generationApi, listGenerations: vi.fn().mockResolvedValueOnce({ items: [jobFixture({ status: 'completed', tracks: [trackFixture()] })], nextCursor: null }).mockResolvedValueOnce({ items: [jobFixture({ status: 'completed', tracks: [detail()] })], nextCursor: null }) };
    const history = scope.run(() => useGenerations('project-one', vi.fn(), api))!;
    await history.refresh();
    update.mockRejectedValueOnce(new ApiError('response lost after favorite was saved', 0, 'NETWORK_ERROR'));
    await state.toggle(trackFixture()); expect(state.errors.value['track-one']).toBeTruthy();
    const confirm = state.beginConfirmation(); const page = await history.refresh();
    if (page) confirm(page.flatMap(job => job.tracks));
    expect(history.jobs.value[0]?.tracks[0]?.favorite).toBe(true);
    expect(state.errors.value['track-one']).toBeUndefined(); expect(state.pending.value.size).toBe(0);
  });

});
