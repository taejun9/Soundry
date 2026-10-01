import { readonly, reactive } from 'vue';
import type { TrackSummary } from '../../../shared/contracts';
import { hasLocalTrackUrls } from './track-urls';

export type AudioPort = Pick<HTMLAudioElement, 'src' | 'currentSrc' | 'currentTime' | 'duration' | 'volume' | 'paused' | 'ended' | 'readyState' | 'error' | 'preload' | 'play' | 'pause' | 'load' | 'removeAttribute' | 'addEventListener' | 'removeEventListener'>;

/** One media element for the app. Navigation never creates another player. */
export function createAudioController(audio: AudioPort, baseUrl: string) {
  const state = reactive({ track: null as TrackSummary | null, playing: false, loading: false, ended: false, currentTime: 0, duration: null as number | null, volume: 0.8, error: '' });
  audio.preload = 'metadata';
  audio.volume = state.volume;
  let sourceVersion = 0;
  let playVersion = 0;
  let wantedPlayback = false;
  let disposed = false;
  let expectedSource = '';
  let removeListeners = () => {};

  function syncTime() {
    state.duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    state.currentTime = Number.isFinite(audio.currentTime) ? Math.max(0, Math.min(audio.currentTime, state.duration ?? Infinity)) : 0;
  }
  function bindSource(version: number) {
    const valid = (allowEmptySource = false) => !disposed && version === sourceVersion && audio.src === expectedSource && (audio.currentSrc === expectedSource || (allowEmptySource && !audio.currentSrc));
    const handlers: Record<string, () => void> = {
      loadedmetadata: () => { if (valid() && audio.readyState >= 1) syncTime(); },
      durationchange: () => { if (valid() && audio.readyState >= 1) syncTime(); },
      timeupdate: () => { if (valid() && audio.readyState >= 1) syncTime(); },
      playing: () => {
        if (!valid() || !wantedPlayback || audio.paused || audio.ended || audio.readyState < 2) return;
        state.playing = true; state.loading = false; state.error = '';
      },
      pause: () => { if (valid() && audio.paused) { wantedPlayback = false; playVersion++; state.playing = false; state.loading = false; } },
      waiting: () => { if (valid() && wantedPlayback && !audio.paused && !audio.ended) state.loading = true; },
      ended: () => {
        if (!valid() || !audio.ended) return;
        wantedPlayback = false; playVersion++;
        state.playing = false; state.loading = false; state.ended = true; syncTime();
      },
      error: () => {
        if (!valid(true) || !audio.error) return;
        wantedPlayback = false; playVersion++;
        state.playing = false; state.loading = false;
        state.error = audio.error.code === 2 ? '음원을 불러오지 못했어요. 서버 연결을 확인하고 다시 재생해 주세요.'
          : audio.error.code === 3 ? '음원을 재생할 수 없어요. 파일 상태를 확인해 주세요.'
            : '음원 파일이 없거나 지원하지 않는 형식입니다. 이력을 새로고침하거나 다시 재생해 주세요.';
        audio.pause();
      },
    };
    for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler);
    removeListeners = () => { for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler); };
  }
  function resetSource() {
    sourceVersion++; playVersion++; wantedPlayback = false;
    removeListeners(); removeListeners = () => {};
    audio.pause(); audio.removeAttribute('src'); audio.load();
    expectedSource = '';
    state.playing = false; state.loading = false; state.ended = false; state.currentTime = 0; state.duration = null; state.error = '';
  }
  function select(track: TrackSummary) {
    resetSource();
    state.track = { ...track };
    expectedSource = new URL(track.audioUrl, baseUrl).href;
    audio.src = expectedSource;
    // load() resets old media tasks and aborts old play promises before a new request.
    audio.load();
    bindSource(sourceVersion);
  }
  async function resume() {
    if (disposed || !state.track) return;
    if (state.error) select(state.track);
    else if (audio.ended) audio.currentTime = 0;
    const version = sourceVersion;
    const request = ++playVersion;
    wantedPlayback = true; state.loading = true; state.ended = false; state.error = '';
    try {
      await audio.play();
      if (disposed || version !== sourceVersion || request !== playVersion || !wantedPlayback) return;
      state.playing = !audio.paused && !audio.ended;
      state.loading = false;
    } catch (error) {
      if (disposed || version !== sourceVersion || request !== playVersion || !wantedPlayback) return;
      wantedPlayback = false; state.playing = false; state.loading = false;
      const name = error instanceof Error ? error.name : '';
      state.error = name === 'NotAllowedError' ? '브라우저가 재생을 막았어요. 재생 버튼을 다시 눌러 주세요.'
        : name === 'NotSupportedError' ? '음원 파일이 없거나 재생할 수 없는 형식입니다.'
          : '재생을 시작하지 못했어요. 서버 연결을 확인하고 다시 눌러 주세요.';
    }
  }
  function pause() {
    if (disposed) return;
    playVersion++; wantedPlayback = false;
    audio.pause(); state.playing = false; state.loading = false;
  }
  async function toggle(track?: TrackSummary) {
    if (disposed) return;
    if (track) {
      if (!hasLocalTrackUrls(track)) { state.error = '이 음원의 로컬 주소를 확인하지 못했어요. 이력을 새로고침해 주세요.'; return; }
      if (state.track?.id !== track.id || state.track.audioUrl !== track.audioUrl) { select(track); await resume(); return; }
      state.track = { ...track };
    }
    if (wantedPlayback) pause(); else await resume();
  }
  function seek(seconds: number) {
    if (disposed || !state.track || state.duration === null || audio.readyState < 1 || !Number.isFinite(seconds)) return;
    try {
      audio.currentTime = Math.min(state.duration, Math.max(0, seconds)); state.currentTime = audio.currentTime;
      if (state.currentTime < state.duration) state.ended = false;
    }
    catch { state.error = '재생 위치를 바꾸지 못했어요. 음원을 다시 불러와 주세요.'; }
  }
  function setVolume(value: number) {
    if (disposed || !Number.isFinite(value)) return;
    state.volume = Math.max(0, Math.min(1, value)); audio.volume = state.volume;
  }
  function clear() { if (!disposed) { resetSource(); state.track = null; } }
  function clearProject(id: string) { if (state.track?.projectId === id) clear(); }
  function clearTrack(id: string) { if (state.track?.id === id) clear(); }
  function dispose() { if (!disposed) { clear(); disposed = true; } }
  return { state: readonly(state), toggle, pause, seek, setVolume, clear, clearProject, clearTrack, dispose };
}
export type AudioController = ReturnType<typeof createAudioController>;
