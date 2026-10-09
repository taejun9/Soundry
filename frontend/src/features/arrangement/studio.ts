import type { Arrangement, ArrangementClip } from '../../../../shared/contracts';

export function snapTime(seconds: number, bpm: number, beats: number): number {
  const step = beats * 60 / bpm;
  return step > 0 && Number.isFinite(step) ? Math.round(seconds / step) * step : seconds;
}
export function beatPosition(seconds: number, bpm: number): string {
  const beat = Math.max(0, seconds) * bpm / 60;
  return `${Math.floor(beat / 4) + 1}.${Math.floor(beat % 4) + 1}.${Math.floor((beat % 1) * 4) + 1}`;
}
/** Looping source offsets define the loop region; splitting requires disabling the loop first. */
export function splitClip(clip: ArrangementClip, at: number, id: string): [ArrangementClip, ArrangementClip] | null {
  const left = at - clip.start;
  const right = clip.duration - left;
  if (clip.loop || !Number.isFinite(at) || left < 0.05 || right < 0.05) return null;
  return [
    { ...clip, duration: left, fadeIn: Math.min(clip.fadeIn ?? 0, left), fadeOut: 0 },
    { ...clip, id, start: at, offset: clip.offset + left, duration: right, fadeIn: 0, fadeOut: Math.min(clip.fadeOut ?? 0, right) },
  ];
}
/** Bounded independent snapshots; truncates the redo branch after a new edit. */
export class ArrangementHistory {
  private states: string[] = [];
  private index = -1;
  constructor(private readonly limit = 50) {}
  reset(value: Arrangement) { this.states = [JSON.stringify(value)]; this.index = 0; }
  record(value: Arrangement) {
    const state = JSON.stringify(value);
    if (this.states[this.index] === state) return;
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(state);
    if (this.states.length > this.limit + 1) this.states.shift();
    this.index = this.states.length - 1;
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.states.length - 1; }
  undo(): Arrangement | null { return this.canUndo ? JSON.parse(this.states[--this.index]!) as Arrangement : null; }
  redo(): Arrangement | null { return this.canRedo ? JSON.parse(this.states[++this.index]!) as Arrangement : null; }
}

export function launcherArrangement(value: Arrangement, scene: number, clipId?: string): Arrangement {
  return { ...value, lanes: value.lanes.map(lane => ({ ...lane, clips: lane.clips
    .filter((clip, index) => clipId ? clip.id === clipId : index === scene)
    .map(clip => ({ ...clip, start: 0 })) })) };
}
