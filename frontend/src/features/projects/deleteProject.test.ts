import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioController, type AudioPort } from '../../audio/controller';
import { FakeAudio } from '../../audio/test-audio';
import { trackFixture } from '../generation/test-fixtures';
import { deleteProjectWithPlayback } from './deleteProject';

const players: ReturnType<typeof createAudioController>[] = [];
afterEach(() => { players.splice(0).forEach(player => player.dispose()); vi.unstubAllGlobals(); });
async function playing() {
  const audio = new FakeAudio();
  const player = createAudioController(audio as unknown as AudioPort, 'http://127.0.0.1:5174');
  players.push(player);
  const pending = player.toggle(trackFixture()); audio.ready(); audio.requests[0]!.resolve(); await pending;
  return { audio, player };
}
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
