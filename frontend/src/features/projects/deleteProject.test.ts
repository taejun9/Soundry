/**
 * 삭제를 확인한 프로젝트의 재생이 DELETE 전부터 정지하는지 검증한다.
 * 응답 지연·유실·화면 이탈을 주입해 삭제 후 재생이 부활하지 않으며 다른 프로젝트 재생은 유지되는지 확인한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioController, type AudioPort } from '../../audio/controller';
import { FakeAudio } from '../../audio/test-audio';
import { trackFixture } from '../generation/test-fixtures';
import { deleteProjectWithPlayback } from './deleteProject';

const players: ReturnType<typeof createAudioController>[] = [];
// 전역 대역·scope·미디어 자원은 해당 테스트의 정리 훅에서 복구해 다음 사례를 오염시키지 않는다.
afterEach(() => { players.splice(0).forEach(player => player.dispose()); vi.unstubAllGlobals(); });
/** play Promise와 metadata를 명시적으로 완료해 삭제 전에 실제 controller가 재생 상태가 되게 한다. */
async function playing() {
  const audio = new FakeAudio();
  const player = createAudioController(audio as unknown as AudioPort, 'http://127.0.0.1:5174');
  players.push(player);
  const pending = player.toggle(trackFixture()); audio.ready(); audio.requests[0]!.resolve(); await pending;
  return { audio, player };
}
/** 삭제 성공과 파일 정리 완료를 명시하는 정상 API 응답 대역이다. */
function response() { return new Response(JSON.stringify({ deleted: true, cleanupPending: false }), { headers: { 'Content-Type': 'application/json' } }); }

describe('confirmed project deletion playback boundary', () => {
  it('clears the selected project before DELETE is dispatched and remains clear while the response is pending', async () => {
    const { audio, player } = await playing();
    let finish!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => {
      expect(audio.paused).toBe(true);
      expect(audio.src).toBe('');
      expect(player.state.track).toBeNull();
      return new Promise<Response>(resolve => { finish = resolve; });
    }));
    const deleting = deleteProjectWithPlayback('project-one', new AbortController().signal, player);
    expect(player.state.playing).toBe(false);
    finish(response());
    await expect(deleting).resolves.toEqual({ deleted: true, cleanupPending: false });
    expect(player.state.track).toBeNull();
  });

  it('keeps playback cleared when the server response is lost', async () => {
    const { audio, player } = await playing();
    let lose!: (error: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, reject) => { lose = reject; })));
    const deleting = deleteProjectWithPlayback('project-one', new AbortController().signal, player);
    expect(audio.src).toBe('');
    lose(new TypeError('network lost after server deletion'));
    await expect(deleting).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(audio.paused).toBe(true);
    expect(player.state.track).toBeNull();
  });

  it('keeps playback cleared when dialog unmount aborts an in-flight DELETE response', async () => {
    const { audio, player } = await playing();
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('dialog unmounted', 'AbortError')), { once: true });
    })));
    const deleting = deleteProjectWithPlayback('project-one', controller.signal, player);
    controller.abort();
    await expect(deleting).rejects.toMatchObject({ name: 'AbortError' });
    expect(audio.src).toBe('');
    expect(audio.paused).toBe(true);
    expect(player.state.track).toBeNull();
  });

  it('preserves a different project playing throughout deletion', async () => {
    const { audio, player } = await playing();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    await deleteProjectWithPlayback('another-project', new AbortController().signal, player);
    expect(player.state.track?.id).toBe('track-one');
    expect(player.state.playing).toBe(true);
    expect(audio.paused).toBe(false);
  });
});
