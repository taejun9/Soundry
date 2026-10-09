import type { Arrangement, ArrangementClip } from '../../../../shared/contracts';
import { assertMixDuration, audibleClips, clipPlayback } from './arrangement';

/** Clip-relative fade envelope, including resumed playback within a fade. */
export function fadeAt(clip: ArrangementClip, elapsed: number): number {
  const fadeIn = clip.fadeIn ?? 0, fadeOut = clip.fadeOut ?? 0;
  return Math.max(0, Math.min(1, fadeIn > 0 ? elapsed / fadeIn : 1,
    fadeOut > 0 ? (clip.duration - elapsed) / fadeOut : 1));
}
export function validateMix(value: Arrangement, buffers: ReadonlyMap<string, AudioBuffer>): void {
  assertMixDuration(value.duration);
  if (!Number.isFinite(value.bpm ?? 120) || (value.bpm ?? 120) < 30 || (value.bpm ?? 120) > 300) throw new Error('MIX_SETTINGS');
  const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
  if (!inRange(value.masterVolume ?? 0.7, 0, 1)) throw new Error('MIX_SETTINGS');
  const clips = audibleClips(value);
  const ids = [...new Set(clips.map(c => c.trackId))];
  if (ids.length > 8 || ids.reduce((sum, id) => sum + (buffers.get(id)?.duration ?? 601), 0) > 600.01) throw new Error('PREVIEW_SIZE');
  for (const lane of value.lanes) {
    if (!inRange(lane.volume ?? 1, 0, 1) || !inRange(lane.pan ?? 0, -1, 1) ||
        !inRange(lane.lowpassHz ?? 20000, 40, 20000) || !inRange(lane.delaySeconds ?? 0, 0, 2) ||
        !inRange(lane.delayWet ?? 0, 0, 1)) throw new Error('MIX_SETTINGS');
  }
  for (const c of clips) {
    const b = buffers.get(c.trackId);
    if (!b || ![c.start, c.offset, c.duration, c.volume].every(Number.isFinite) ||
      c.start < 0 || c.offset < 0 || c.duration < 0.05 || c.start + c.duration > value.duration + 0.000001 ||
      !inRange(c.volume, 0, 1) || c.offset >= b.duration || (!c.loop && c.offset + c.duration > b.duration + 0.001) ||
      !inRange(c.fadeIn ?? 0, 0, c.duration) || !inRange(c.fadeOut ?? 0, 0, c.duration) ||
      (c.fadeIn ?? 0) + (c.fadeOut ?? 0) > c.duration) throw new Error('SOURCE_RANGE');
  }
}
/** The same graph is used for live preview and OfflineAudioContext export. No source bytes change. */
export function scheduleMix(ctx: BaseAudioContext, value: Arrangement, buffers: ReadonlyMap<string, AudioBuffer>, at = 0, base = 0): () => void {
  validateMix(value, buffers);
  const sources: AudioBufferSourceNode[] = [], nodes: AudioNode[] = [];
  const create = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
  const master = create(ctx.createGain()); master.gain.value = value.masterVolume ?? 0.7;
  const limiter = create(ctx.createDynamicsCompressor()); master.connect(limiter); limiter.connect(ctx.destination);
  const release = () => {
    for (const node of sources) { try { node.stop(); } catch { /* Already ended. */ } }
    for (const node of nodes) node.disconnect();
  };
  try {
    const active = new Set(audibleClips(value).map(c => c.id));
    for (const lane of value.lanes) {
      const clips = lane.clips.filter(c => active.has(c.id));
      if (!clips.length) continue;
      const gain = create(ctx.createGain()); gain.gain.value = lane.volume ?? 1;
      const pan = create(ctx.createStereoPanner()); pan.pan.value = lane.pan ?? 0;
      gain.connect(pan); pan.connect(master);
      const filter = lane.lowpassHz === undefined ? null : create(ctx.createBiquadFilter());
      if (filter) { filter.type = 'lowpass'; filter.frequency.value = lane.lowpassHz!; filter.Q.value = 0.707; filter.connect(gain); }
      const bus = create(ctx.createGain()); bus.connect(gain);
      if (filter) { filter.disconnect(); filter.connect(bus); }
      const input = filter ?? bus;
      if ((lane.delayWet ?? 0) > 0 && (lane.delaySeconds ?? 0) > 0) {
        const delay = create(ctx.createDelay(2)); delay.delayTime.value = lane.delaySeconds!;
        const wet = create(ctx.createGain()); wet.gain.value = lane.delayWet!;
        bus.connect(delay); delay.connect(wet); wet.connect(gain);
      }
      for (const c of clips) {
        const timing = clipPlayback(c, at);
        if (timing.duration <= 0) continue;
        const buffer = buffers.get(c.trackId)!;
        const source = create(ctx.createBufferSource()); sources.push(source);
        source.buffer = buffer; source.loop = c.loop; source.loopStart = c.offset; source.loopEnd = buffer.duration;
        const envelope = create(ctx.createGain()); source.connect(envelope); envelope.connect(input);
        const start = base + timing.delay;
        envelope.gain.setValueAtTime(c.volume * fadeAt(c, timing.elapsed), start);
        const points = [c.fadeIn ?? 0, c.duration - (c.fadeOut ?? 0), c.duration];
        for (const point of [...new Set(points)].sort((a,b) => a-b)) {
          if (point > timing.elapsed) envelope.gain.linearRampToValueAtTime(c.volume * fadeAt(c, point), start + point - timing.elapsed);
        }
        const offset = c.loop ? c.offset + timing.elapsed % (buffer.duration - c.offset) : c.offset + timing.elapsed;
        source.start(start, offset, timing.duration);
      }
    }
    return release;
  } catch (error) { release(); throw error; }
}
/** Only attenuate a finished mix to leave -1 dBFS sample-peak headroom. */
export function exportHeadroom(buffer: AudioBuffer): { peakDbfs: number | null; attenuationDb: number } {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const samples = buffer.getChannelData(c);
    for (const sample of samples) { if (!Number.isFinite(sample)) throw new Error('NONFINITE_AUDIO'); peak = Math.max(peak, Math.abs(sample)); }
  }
  const gain = peak > Math.pow(10, -1 / 20) ? Math.pow(10, -1 / 20) / peak : 1;
  if (gain < 1) for (let c = 0; c < buffer.numberOfChannels; c++) {
    const samples = buffer.getChannelData(c); for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! * gain;
  }
  return { peakDbfs: peak > 0 ? 20 * Math.log10(peak * gain) : null, attenuationDb: 20 * Math.log10(gain) };
}
