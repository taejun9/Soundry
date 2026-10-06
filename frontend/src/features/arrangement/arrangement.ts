import type { Arrangement, ArrangementClip } from '../../../../shared/contracts';
export function audibleClips(arrangement: Arrangement): ArrangementClip[] {
  return arrangement.lanes
    .filter((l) => !l.muted)
    .flatMap((l) => l.clips)
    .filter((c) => c.volume > 0);
}
export function clipPlayback(c: ArrangementClip, position: number) {
  const elapsed = Math.max(0, position - c.start);
  return { delay: Math.max(0, c.start - position), elapsed, duration: c.duration - elapsed };
}
export function pcmWav(buffer: AudioBuffer): Blob {
  const size = buffer.length * 4;
  const bytes = new ArrayBuffer(44 + size);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + size, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, size, true);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) {
      const value = Math.max(-1, Math.min(1, samples[i]!));
      view.setInt16(44 + i * 4 + channel * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

// Number inputs may temporarily contain empty or out-of-range values while typing.
export function timelineDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(600, value)) : 180;
}
export function assertMixDuration(value: number): void {
  if (!Number.isFinite(value) || value < 1 || value > 600) throw new Error('MIX_DURATION');
}
