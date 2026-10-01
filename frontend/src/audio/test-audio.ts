/**
 * 브라우저 미디어의 비동기 경계를 재현하는 테스트 전용 대역. 실제 음원이나 네트워크를 사용하지 않는다.
 * play 완료·실패와 metadata/event 시점을 테스트가 직접 결정하여 재생 경쟁을 결정적으로 검증한다.
 */
import { vi } from 'vitest';

/** play가 실제로 언제 끝나는지 테스트가 결정하도록 resolve/reject를 외부로 제공한다. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
export class FakeAudio extends EventTarget {
  src = ''; currentSrc = ''; currentTime = 0; duration = NaN; volume = 1;
  paused = true; ended = false; readyState = 0; preload = '';
  error: { code: number } | null = null;
  requests: ReturnType<typeof deferred>[] = [];
  load = vi.fn(() => { this.currentSrc = ''; this.currentTime = 0; this.duration = NaN; this.readyState = 0; this.ended = false; this.error = null; });
  pause = vi.fn(() => { this.paused = true; this.emit('pause'); });
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  play = vi.fn(() => { this.paused = false; const pending = deferred(); this.requests.push(pending); return pending.promise; });
  emit(name: string) { this.dispatchEvent(new Event(name)); }
  ready(duration = 8) { this.currentSrc = this.src; this.duration = duration; this.readyState = 4; this.emit('loadedmetadata'); }
}
