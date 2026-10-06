import { describe, expect, it } from 'vitest';
import type { ArrangementClip } from '../../../../shared/contracts';
import { audibleClips, clipPlayback, pcmWav, timelineDuration, assertMixDuration } from './arrangement';
const clip: ArrangementClip = {
  id: 'clip',
  trackId: 'track',
  label: 'A',
  start: 10,
  offset: 2,
  duration: 30,
  volume: 1,
  loop: false,
};
describe('layered arrangement transport and WAV export', () => {
  it('bounds timeline allocation during numeric editing and rejects unsupported render lengths', () => {
    expect(timelineDuration(999999)).toBe(600);
    expect(timelineDuration(-1)).toBe(1);
    expect(timelineDuration(NaN)).toBe(180);
    for (const value of [0, -1, NaN, Infinity, 601, 999999]) expect(() => assertMixDuration(value)).toThrow('MIX_DURATION');
    expect(() => assertMixDuration(600)).not.toThrow();
  });

  it('aligns future and already-started clips relative to the transport position', () => {
    expect(clipPlayback(clip, 5)).toEqual({ delay: 5, elapsed: 0, duration: 30 });
    expect(clipPlayback(clip, 20)).toEqual({ delay: 0, elapsed: 10, duration: 20 });
    expect(clipPlayback(clip, 50).duration).toBeLessThanOrEqual(0);
  });
  it('omits muted lanes and zero-volume clips from the mixed signal', () => {
    expect(
      audibleClips({
        duration: 60,
        lanes: [
          { id: 'a', name: 'A', muted: false, clips: [clip, { ...clip, id: 'silent', volume: 0 }] },
          { id: 'b', name: 'B', muted: true, clips: [{ ...clip, id: 'muted' }] },
        ],
      }),
    ).toEqual([clip]);
  });
  it('exports interleaved stereo PCM16 with a real WAV header and saturates overflow samples', async () => {
    const buffer = {
      length: 3,
      sampleRate: 44100,
      getChannelData: (channel: number) => new Float32Array(channel === 0 ? [-2, 0, 2] : [0.5, -0.5, 0]),
    } as AudioBuffer;
    const bytes = await pcmWav(buffer).arrayBuffer();
    const view = new DataView(bytes);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(48);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(12);
    expect([0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      -32768, 16384, 0, -16384, 32767, 0,
    ]);
  });
});
