import { vi } from 'vitest';

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
