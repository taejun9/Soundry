/**
 * 앱 전체에서 하나의 HTMLAudioElement를 제어하는 상태 머신. 화면은 읽기 전용 state와 명령만 사용한다.
 * 곡 전환과 play Promise의 수명을 따로 추적해 늦은 이벤트나 성공 응답이 현재 재생 의도를 되돌리지 못하게 한다.
 */
import { readonly, reactive } from 'vue';
import type { TrackSummary } from '../../../shared/contracts';
import { hasLocalTrackUrls } from './track-urls';

export type AudioPort = Pick<HTMLAudioElement, 'src' | 'currentSrc' | 'currentTime' | 'duration' | 'volume' | 'paused' | 'ended' | 'readyState' | 'error' | 'preload' | 'play' | 'pause' | 'load' | 'removeAttribute' | 'addEventListener' | 'removeEventListener'>;

/** One media element for the app. Navigation never creates another player. */
export function createAudioController(audio: AudioPort, baseUrl: string) {
  const state = reactive({ track: null as TrackSummary | null, playing: false, loading: false, ended: false, currentTime: 0, duration: null as number | null, volume: 0.8, error: '' });
  audio.preload = 'metadata';
  audio.volume = state.volume;
  // sourceVersion은 곡 교체, playVersion은 같은 곡에서 재생/정지 의도의 변경을 구분한다.
  let sourceVersion = 0;
  let playVersion = 0;
  // 브라우저 이벤트보다 사용자의 최신 재생 의도를 우선한다. loading 중 다시 누른 정지도 반영한다.
  let wantedPlayback = false;
  let disposed = false;
  let expectedSource = '';
  let removeListeners = () => {};

  /** 브라우저가 보고한 실제 길이를 사용한다. 미확인/무한 길이는 null이고 현재 위치는 유효 범위로 제한한다. */
  function syncTime() {
    state.duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    state.currentTime = Number.isFinite(audio.currentTime) ? Math.max(0, Math.min(audio.currentTime, state.duration ?? Infinity)) : 0;
  }
  /** 현재 source 버전에 이벤트를 묶는다. 이전 곡의 이벤트와 아직 준비되지 않은 미디어 이벤트는 버린다. */
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
  /** 이벤트를 분리하고 두 버전을 올린 뒤 media를 비워 이전 play Promise와 재생 상태를 모두 무효화한다. */
  function resetSource() {
    sourceVersion++; playVersion++; wantedPlayback = false;
    removeListeners(); removeListeners = () => {};
    audio.pause(); audio.removeAttribute('src'); audio.load();
    expectedSource = '';
    state.playing = false; state.loading = false; state.ended = false; state.currentTime = 0; state.duration = null; state.error = '';
  }
  /** 검증된 곡을 선택하고 절대 URL로 정규화해 브라우저 src/currentSrc 비교 기준을 맞춘다. */
  function select(track: TrackSummary) {
    resetSource();
    state.track = { ...track };
    expectedSource = new URL(track.audioUrl, baseUrl).href;
    audio.src = expectedSource;
    // load() resets old media tasks and aborts old play promises before a new request.
    audio.load();
    bindSource(sourceVersion);
  }
  /** 사용자의 현재 재생 요청만 완료할 수 있다. 곡 전환·정지·삭제 뒤 돌아온 Promise는 UI 상태를 바꾸지 않는다. */
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
  /** pause 이벤트를 기다리기 전에 재생 의도를 취소하므로 아직 진행 중인 play 성공도 무효가 된다. */
  function pause() {
    if (disposed) return;
    playVersion++; wantedPlayback = false;
    audio.pause(); state.playing = false; state.loading = false;
  }
  /** 외부/다른 음원 URL을 먼저 차단한다. 같은 곡의 metadata 갱신은 source를 다시 로드하지 않는다. */
  async function toggle(track?: TrackSummary) {
    if (disposed) return;
    if (track) {
      if (!hasLocalTrackUrls(track)) { state.error = '이 음원의 로컬 주소를 확인하지 못했어요. 이력을 새로고침해 주세요.'; return; }
      if (state.track?.id !== track.id || state.track.audioUrl !== track.audioUrl) { select(track); await resume(); return; }
      state.track = { ...track };
    }
    if (wantedPlayback) pause(); else await resume();
  }
  /** metadata가 준비된 유한 길이 음원만 탐색한다. 위치 변경은 자동 재생 명령을 발생시키지 않는다. */
  function seek(seconds: number) {
    if (disposed || !state.track || state.duration === null || audio.readyState < 1 || !Number.isFinite(seconds)) return;
    try {
      audio.currentTime = Math.min(state.duration, Math.max(0, seconds)); state.currentTime = audio.currentTime;
      if (state.currentTime < state.duration) state.ended = false;
    }
    catch { state.error = '재생 위치를 바꾸지 못했어요. 음원을 다시 불러와 주세요.'; }
  }
  /** HTMLAudioElement가 허용하는 0–1 범위로 제한하며 NaN/Infinity 입력은 무시한다. */
  function setVolume(value: number) {
    if (disposed || !Number.isFinite(value)) return;
    state.volume = Math.max(0, Math.min(1, value)); audio.volume = state.volume;
  }
  /** 현재 선택과 미디어 자원을 함께 비워 삭제 또는 사용자 비우기 뒤 재생이 되살아나지 않게 한다. */
  function clear() { if (!disposed) { resetSource(); state.track = null; } }
  /** 같은 음원의 제목/favorite 등 표시값만 교체하여 재생 위치와 source를 보존한다. */
  function updateTrack(track: TrackSummary) {
    if (!disposed && state.track?.id === track.id && state.track.projectId === track.projectId && hasLocalTrackUrls(track)) state.track = { ...track };
  }
  /** 삭제 대상 프로젝트의 곡을 듣고 있을 때만 비운다. 다른 프로젝트 재생은 유지한다. */
  function clearProject(id: string) { if (state.track?.projectId === id) clear(); }
  /** 단일 음원 삭제에서는 현재 선택 ID가 일치할 때만 정리한다. */
  function clearTrack(id: string) { if (state.track?.id === id) clear(); }
  /** App 해제 시 한 번만 정리하고 이후 명령·이벤트를 차단한다. */
  function dispose() { if (!disposed) { clear(); disposed = true; } }
  return { state: readonly(state), toggle, pause, seek, setVolume, clear, clearProject, clearTrack, updateTrack, dispose };
}
export type AudioController = ReturnType<typeof createAudioController>;
