/**
 * 단일 플레이어의 곡 전환, pause/ended/error와 play Promise 경쟁을 검증한다.
 * FakeAudio의 이벤트와 지연 Promise를 직접 제어하여 실제 브라우저 타이밍에 의존하지 않고 늦은 응답을 재현한다.
 */
import { describe, expect, it } from 'vitest';
import { createAudioController, type AudioPort } from './controller';
import { trackFixture } from '../features/generation/test-fixtures';
import { audioTime } from './time';
import { FakeAudio } from './test-audio';

/** 각 사례에 독립된 API 대역과 상태 수명을 만들어 다른 테스트의 요청/상태가 섞이지 않게 한다. */
function setup() {
  const audio = new FakeAudio();
  const player = createAudioController(audio as unknown as AudioPort, 'http://127.0.0.1:5174/projects/demo');
  return { audio, player, track: trackFixture() };
}
const secondTrack = () => ({ ...trackFixture(), id: 'track-two', audioUrl: '/api/tracks/track-two/audio', downloadUrl: '/api/tracks/track-two/download', title: 'Second song' });
/** 테스트 대역의 재생 시작을 확정하여 이후 이름 변경/삭제가 재생 상태에 주는 영향을 검사한다. */
async function start(context: ReturnType<typeof setup>) {
  const pending = context.player.toggle(context.track);
  context.audio.ready(); context.audio.requests[0]!.resolve(); await pending;
}

describe('single element audio lifecycle', () => {
  it('waits for a user play request and real metadata instead of inventing duration', async () => {
    const { audio, player, track } = setup();
    expect(audio.play).not.toHaveBeenCalled();
    const pending = player.toggle(track);
    expect(player.state.playing).toBe(false);
    expect(player.state.loading).toBe(true);
    expect(player.state.duration).toBeNull();
    audio.ready(7.25); audio.requests[0]!.resolve(); await pending;
    expect(player.state.playing).toBe(true);
    expect(player.state.duration).toBe(7.25);
    audio.currentTime = 2.5; audio.emit('timeupdate');
    expect(player.state.currentTime).toBe(2.5);
    player.dispose();
  });

  it.each(['resolve', 'reject'] as const)('ignores a late old-source play %s after another song starts', async (ending) => {
    const { audio, player, track } = setup();
    const first = player.toggle(track); audio.ready();
    const second = player.toggle(secondTrack()); audio.ready(11);
    audio.requests[1]!.resolve(); await second;
    if (ending === 'resolve') audio.requests[0]!.resolve(); else audio.requests[0]!.reject(new Error('old failure'));
    await first;
    expect(player.state.track?.id).toBe('track-two');
    expect(player.state.playing).toBe(true);
    expect(player.state.duration).toBe(11);
    expect(player.state.error).toBe('');
    expect(audio.paused).toBe(false);
    player.dispose();
  });

  it('keeps an explicit pause while its unresolved play promise finishes', async () => {
    const { audio, player, track } = setup();
    const pending = player.toggle(track); audio.ready();
    await player.toggle(track);
    audio.requests[0]!.resolve(); await pending;
    expect(audio.paused).toBe(true);
    expect(player.state.ended).toBe(false);
    expect(player.state.playing).toBe(false);
    expect(player.state.loading).toBe(false);
    expect(player.state.error).toBe('');
    player.dispose();
  });

  it('does not let stale time/error/end/pause events overwrite the selected source', async () => {
    const { audio, player, track } = setup();
    const first = player.toggle(track); audio.ready(); audio.requests[0]!.resolve(); await first;
    const oldSource = audio.src;
    const second = player.toggle(secondTrack());
    audio.currentSrc = oldSource; audio.duration = 88; audio.currentTime = 77; audio.readyState = 4; audio.ended = true; audio.error = { code: 3 };
    for (const event of ['loadedmetadata', 'timeupdate', 'ended', 'error', 'pause']) audio.emit(event);
    expect(player.state.duration).toBeNull();
    expect(player.state.currentTime).toBe(0);
    expect(player.state.error).toBe('');
    audio.error = null; audio.ended = false; audio.currentTime = 0; audio.ready(9); audio.requests[1]!.resolve(); await second;
    audio.emit('ended'); audio.emit('pause'); audio.emit('error');
    expect(player.state.playing).toBe(true);
    expect(player.state.error).toBe('');
    player.dispose();
  });

  it('stops on a real ended event, does not autoplay another track, and replays from zero', async () => {
    const context = setup(); await start(context);
    const { audio, player } = context;
    audio.currentTime = 8; audio.ended = true; audio.paused = true; audio.emit('ended');
    expect(player.state.playing).toBe(false);
    expect(player.state.currentTime).toBe(8);
    expect(player.state.ended).toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(1);
    const replay = player.toggle();
    expect(audio.currentTime).toBe(0);
    expect(player.state.ended).toBe(false);
    audio.ended = false; audio.requests[1]!.resolve(); await replay;
    expect(player.state.playing).toBe(true);
    player.dispose();
  });

  it('clears the completed status when seeking back from the end without resuming playback', async () => {
    const context = setup(); await start(context);
    const { audio, player } = context;
    audio.currentTime = 8; audio.ended = true; audio.paused = true; audio.emit('ended');
    expect(player.state.ended).toBe(true);
    player.seek(2);
    expect(player.state.currentTime).toBe(2);
    expect(player.state.ended).toBe(false);
    expect(player.state.playing).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(1);
    player.dispose();
  });

  it('handles rejected browser playback and retries only after another user action', async () => {
    const { audio, player, track } = setup();
    const pending = player.toggle(track);
    audio.requests[0]!.reject(new DOMException('blocked', 'NotAllowedError')); await pending;
    expect(player.state.error).toContain('브라우저');
    expect(player.state.loading).toBe(false);
    expect(player.state.playing).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(1);
    const retry = player.toggle(); audio.ready(); audio.requests[1]!.resolve(); await retry;
    expect(player.state.error).toBe('');
    expect(player.state.playing).toBe(true);
    player.dispose();
  });

  it('handles a missing source error even when currentSrc is empty and prevents stale play success', async () => {
    const { audio, player, track } = setup();
    const pending = player.toggle(track);
    audio.error = { code: 4 }; audio.emit('error');
    expect(player.state.error).toContain('음원 파일');
    audio.requests[0]!.resolve(); await pending;
    expect(player.state.playing).toBe(false);
    expect(player.state.error).toContain('음원 파일');
    player.dispose();
  });

  it('bounds seek and volume and keeps unknown media duration unseekable', async () => {
    const { audio, player, track } = setup();
    const pending = player.toggle(track);
    player.seek(3); expect(audio.currentTime).toBe(0);
    audio.ready(Infinity); player.seek(3); expect(player.state.duration).toBeNull(); expect(audio.currentTime).toBe(0);
    audio.ready(8); audio.requests[0]!.resolve(); await pending;
    player.seek(100); expect(audio.currentTime).toBe(8);
    player.seek(-1); expect(audio.currentTime).toBe(0);
    player.seek(NaN); expect(audio.currentTime).toBe(0);
    player.setVolume(1.5); expect(audio.volume).toBe(1);
    player.setVolume(-1); expect(audio.volume).toBe(0);
    player.setVolume(NaN); expect(audio.volume).toBe(0);
    player.dispose();
  });

  it('clears deleted project audio and prevents in-flight playback or events from restoring it', async () => {
    const { audio, player, track } = setup();
    const pending = player.toggle(track); audio.ready();
    player.clearProject('another-project'); expect(player.state.track?.id).toBe(track.id);
    player.clearProject(track.projectId);
    expect(audio.src).toBe(''); expect(audio.paused).toBe(true);
    audio.requests[0]!.resolve(); await pending;
    audio.ready(99); audio.currentTime = 7; audio.emit('timeupdate');
    expect(player.state.track).toBeNull(); expect(player.state.duration).toBeNull(); expect(player.state.currentTime).toBe(0);
    player.dispose();
  });

  it('rejects remote or mismatched media URLs without sending a browser media request', async () => {
    const { audio, player, track } = setup();
    await player.toggle({ ...track, audioUrl: 'https://provider.invalid/private.wav' });
    expect(audio.src).toBe(''); expect(audio.play).not.toHaveBeenCalled();
    await player.toggle({ ...track, downloadUrl: '/api/tracks/someone-else/download' });
    expect(audio.play).not.toHaveBeenCalled();
    player.dispose();
  });

  it('formats elapsed and unknown time without pretending unknown means zero duration', () => {
    expect(audioTime(null)).toBe('—:—'); expect(audioTime(Infinity)).toBe('—:—');
    expect(audioTime(91.9)).toBe('1:31'); expect(audioTime(0)).toBe('0:00');
  });
});
