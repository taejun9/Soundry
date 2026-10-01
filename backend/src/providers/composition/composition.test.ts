/**
 * 자작 악보로 구조 검증과 로컬 DSP를 독립 검증한다. 실제 원격 작곡이나 주관적 청취 품질 검증은 아니다.
 * 잘못된 관계/과도한 발음량, 정확한 끝 길이, PCM 신호 수준·동역학·stereo, 재현성 및 취소 응답성을 확인한다.
 */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { GenerationInput } from '../../../../shared/contracts.js';
import { COMPOSITION_SCHEMA, CompositionError, parseComposition, renderComposition } from './index.js';
import type { Composition } from './index.js';
import { expandComposition } from './schema.js';
import type { Instrument, Note, Part } from './schema.js';

const input: GenerationInput = { prompt: '따뜻한 재즈 신스 연주곡 테스트', settings: { durationSeconds: 90 }, variationCount: 1 };
function note(beat: number, pitch: number, duration = 0.375, velocity = 0.7): Note { return { beat, pitch, duration, velocity }; }
/** Authored score used only for DSP tests; provider has no automatic fallback composition. */
// intro/verse/chorus/bridge/outro의 대비가 있는 합성 fixture다. duration/BPM에 맞춰 마지막 섹션을 계산한다.
function composition(duration = 90, bpm = 120): Composition {
  const total = Math.ceil(duration * bpm / 240), lengths = [4, 12, 12, 8, total - 36];
  let startBar = 0;
  const sections: Composition['sections'] = ['intro', 'verse', 'chorus', 'bridge', 'outro'].map((name, index) => {
    const section = { name: name as Composition['sections'][number]['name'], startBar, bars: lengths[index]! };
    startBar += section.bars;
    return section;
  });
  const parts: Part[] = [];
  for (const [index, section] of sections.entries()) {
    const common = { startBar: section.startBar, repeats: section.bars, transpose: 0 };
    parts.push({ ...common, instrument: 'piano', patternId: 'chords', gain: index === 2 ? 0.4 : 0.25, pan: -0.3 });
    parts.push({ ...common, instrument: 'bass', patternId: 'bass', gain: 0.55, pan: 0 });
    if (index !== 0) parts.push({ ...common, instrument: index === 3 ? 'bell' : 'synth', patternId: index === 2 ? 'hook' : 'melody', gain: 0.35, pan: 0.18 });
    if (index === 1 || index === 2) parts.push({ ...common, instrument: 'drums', patternId: 'kit', gain: 0.7, pan: 0 });
  }
  return {
    version: 1, bpm, genre: 'Jazz', mood: '따뜻한', seed: 'composition-signal-test',
    patterns: [
      { id: 'chords', bars: 1, notes: [0, 1, 2, 3].flatMap((beat) => [60, 64, 67].map((pitch) => note(beat, pitch, 0.8, 0.55))) },
      { id: 'bass', bars: 1, notes: [36, 43, 40, 47].map((pitch, beat) => note(beat, pitch, 0.85, 0.85)) },
      { id: 'melody', bars: 1, notes: [72, 74, 76, 79, 76, 74, 71, 67].map((pitch, index) => note(index / 2, pitch, 0.4)) },
      { id: 'hook', bars: 1, notes: [79, 76, 74, 72, 74, 76, 81, 79].map((pitch, index) => note(index / 2, pitch, 0.4, 0.8)) },
      { id: 'kit', bars: 1, notes: [note(0, 36), note(1, 38), note(2, 36), note(3, 38), ...Array.from({ length: 8 }, (_, index) => note(index / 2, 42, 0.0625, index % 2 ? 0.25 : 0.4))] },
    ], parts, sections,
  };
}
/** Synthetic ending case only: no production/user score is copied into this fixture. */
// 마지막 패턴이 곡 끝을 넘어가는 경우만 따로 만들어 정상적인 부분 마디 종료를 과도하게 거부하는 회귀를 잡는다.
function partialEnding(duration = 150): Composition {
  const score = composition(duration, 112);
  score.patterns.push({ id: 'ending_figure', bars: 4, notes: [60, 64, 67, 72].map((pitch, index) => note(index * 4, pitch, 1)) });
  for (const instrument of ['guitar', 'pad'] as const) {
    score.parts.push({ instrument, patternId: 'ending_figure', startBar: 68, repeats: 1, transpose: 0, gain: 0.25, pan: instrument === 'guitar' ? -0.3 : 0.3 });
  }
  return score;
}
function copy(): Composition { return structuredClone(composition()); }
// 테스트에서만 WAV를 메모리로 수집해 header/sample 통계를 독립적으로 계산한다.
async function collect(score: Composition, duration = 90): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of renderComposition(score, duration, new AbortController().signal)) chunks.push(chunk);
  return Buffer.concat(chunks);
}
function digest(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

// PCM16 bytes를 직접 읽어 peak/RMS/DC/stereo 차이와 1초 구간별 음량을 측정한다. renderer 내부 수치를 재사용하지 않는다.
function signalStats(bytes: Buffer) {
  let peak = 0, square = 0, difference = 0, mean = 0, clipped = 0;
  const frames = (bytes.length - 44) / 4, blockRms: number[] = [];
  for (let begin = 0; begin < frames; begin += 44_100) {
    let blockSquare = 0;
    const end = Math.min(frames, begin + 44_100);
    for (let frame = begin; frame < end; frame++) {
      const l = bytes.readInt16LE(44 + frame * 4) / 32_768, r = bytes.readInt16LE(46 + frame * 4) / 32_768;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
      blockSquare += l * l + r * r; difference += (l - r) ** 2; mean += l + r;
      if (Math.abs(l) >= 0.999 || Math.abs(r) >= 0.999) clipped++;
    }
    square += blockSquare;
    blockRms.push(Math.sqrt(blockSquare / ((end - begin) * 2)));
  }
  return { peak, rms: Math.sqrt(square / (frames * 2)), stereoDifference: Math.sqrt(difference / frames), mean: mean / (frames * 2), clipped, blockRms };
}

// 정상 객체를 하나씩 변형해 어느 제한이 깨졌는지 명확히 한다. getter 실행 여부도 검사해 검증 자체의 부작용을 막는다.
describe('bounded composition score', () => {
  it('exports strict schema without arbitrary extension fields and copies supported data', () => {
    expect(COMPOSITION_SCHEMA.additionalProperties).toBe(false);
    const score = copy(), parsed = parseComposition(score, input);
    expect(parsed).toEqual(score);
    expect(parsed).not.toBe(score);
    expect(parsed.patterns[0]).not.toBe(score.patterns[0]);
  });
  it.each([
    ['unknown field', (s: Composition) => Object.assign(s, { script: 'private content' })],
    ['non-finite BPM', (s: Composition) => { s.bpm = NaN; }],
    ['blank seed', (s: Composition) => { s.seed = ''; }],
    ['oversized seed', (s: Composition) => { s.seed = 's'.repeat(65); }],
    ['duplicate pattern ID', (s: Composition) => { s.patterns[1]!.id = s.patterns[0]!.id; }],
    ['unused pattern', (s: Composition) => { s.patterns.push({ id: 'unused', bars: 1, notes: [note(0, 60)] }); }],
    ['unknown pattern', (s: Composition) => { s.parts[0]!.patternId = 'absent'; }],
    ['invalid instrument', (s: Composition) => { Object.assign(s.parts[0]!, { instrument: 'shell' }); }],
    ['out of bounds MIDI', (s: Composition) => { s.patterns[0]!.notes[0]!.pitch = 97; }],
    ['negative time', (s: Composition) => { s.patterns[0]!.notes[0]!.beat = -1; }],
    ['crossing pattern end', (s: Composition) => { s.patterns[0]!.notes[0]!.duration = 8; }],
    ['out of bounds duration', (s: Composition) => { s.patterns[0]!.notes[0]!.duration = Infinity; }],
    ['zero velocity', (s: Composition) => { s.patterns[0]!.notes[0]!.velocity = 0; }],
    ['invalid gain', (s: Composition) => { s.parts[0]!.gain = 2; }],
    ['invalid pan', (s: Composition) => { s.parts[0]!.pan = -2; }],
    ['invalid repeat', (s: Composition) => { s.parts[0]!.repeats = 1000; }],
    ['part past ending', (s: Composition) => { s.parts[0]!.startBar = 45; }],
    ['invalid drum pitch', (s: Composition) => { s.patterns.at(-1)!.notes[0]!.pitch = 60; }],
    ['transposed drums', (s: Composition) => { s.parts.find((p) => p.instrument === 'drums')!.transpose = 1; }],
    ['duplicate part', (s: Composition) => { s.parts.push({ ...s.parts[0]! }); }],
    ['section gap', (s: Composition) => { s.sections[1]!.startBar++; }],
    ['section count mismatch', (s: Composition) => { s.sections.at(-1)!.bars--; }],
    ['missing bridge', (s: Composition) => { s.sections[3]!.name = 'verse'; }],
    ['no ending', (s: Composition) => { s.sections.at(-1)!.name = 'verse'; }],
  ])('rejects %s with a safe error', (_name, modify) => {
    const score = copy(); modify(score);
    expect(() => parseComposition(score, input)).toThrow(CompositionError);
    expect(() => parseComposition(score, input)).toThrow('CLI가 유효한 음악 악보를 작성하지 못했습니다.');
  });
  it('rejects instruction-like object accessors without executing them', () => {
    let accessed = false;
    const score = copy();
    Object.defineProperty(score, 'seed', { get() { accessed = true; return 'private'; }, enumerable: true });
    expect(() => parseComposition(score, input)).toThrow(CompositionError);
    expect(accessed).toBe(false);
  });
  it('rejects a fixed repeating orchestration and extended silence', () => {
    const score = copy();
    for (const part of score.parts) { part.startBar = 0; part.repeats = 45; }
    expect(() => parseComposition(score, input)).toThrow(CompositionError);
    const gap = copy(); gap.parts = gap.parts.filter((part) => part.startBar !== 16);
    expect(() => parseComposition(gap, input)).toThrow(CompositionError);
  });
  // 오디오 buffer를 만들기 전에 동시 발음량을 차단해야 메모리/CPU를 낭비하지 않는다.
  it('rejects excessive polyphony before allocating audio buffers', () => {
    const score = copy();
    for (let transpose = 1; transpose < 14; transpose++) score.parts.push({ ...score.parts[0]!, transpose });
    expect(() => parseComposition(score, input)).toThrow(CompositionError);
  });
  it('enforces requested musical settings and instrumental mode', () => {
    const score = copy();
    expect(parseComposition(score, { ...input, settings: { ...input.settings, bpm: 120, genre: 'Jazz', mood: '따뜻한', seed: score.seed } })).toEqual(score);
    for (const settings of [{ bpm: 121 }, { genre: 'Rock' }, { mood: 'dark' }, { seed: 'different' }, { mode: 'vocal' as const }, { durationSeconds: 89 }, { durationSeconds: 181 }]) {
      expect(() => parseComposition(score, { ...input, settings: { ...input.settings, ...settings } })).toThrow(CompositionError);
    }
  });
  // 끝 안에서 시작한 마지막 반복만 허용한다. 종료 이후에 새 반복을 추가하는 경우는 아래 별도 사례에서 거부한다.
  it.each([[68, 1], [64, 2], [66, 1]])('accepts the final partial pattern at bar %i with %i repetitions', (startBar, repeats) => {
    const score = partialEnding();
    for (const part of score.parts.filter((part) => part.patternId === 'ending_figure')) { part.startBar = startBar; part.repeats = repeats; }
    expect(parseComposition(score, { ...input, settings: { bpm: 112, durationSeconds: 150 } })).toEqual(score);
    expect(score.sections.reduce((sum, section) => sum + section.bars, 0)).toBe(70);
  });
  it.each([[68, 2], [66, 2], [70, 1], [68, 64]])('rejects a wholly out-of-range repetition at bar %i with count %i', (startBar, repeats) => {
    const score = partialEnding();
    Object.assign(score.parts.at(-1)!, { startBar, repeats });
    expect(() => parseComposition(score, { ...input, settings: { bpm: 112, durationSeconds: 150 } })).toThrow(CompositionError);
  });
  it('clips overhanging notes and releases, including a partial final bar', () => {
    for (const duration of [149, 150]) {
      const score = parseComposition(partialEnding(duration), { ...input, settings: { bpm: 112, durationSeconds: duration } });
      const events = expandComposition(score, duration);
      expect(events.every((event) => event.start < duration && event.start + event.length <= duration + 1e-9)).toBe(true);
      const endings = events.filter((event) => event.instrument === 'guitar' || event.instrument === 'pad');
      expect(endings).toHaveLength(4);
      expect(endings.map((event) => event.pitch)).toEqual([60, 60, 64, 64]);
    }
  });
  it('uses 150 seconds by default and accepts a full 180 second arrangement', () => {
    expect(parseComposition(composition(150), { ...input, settings: {} }).sections.at(-1)?.startBar).toBe(36);
    expect(parseComposition(composition(180), { ...input, settings: { durationSeconds: 180 } }).sections.at(-1)?.bars).toBe(54);
  });
});

// 포맷 성공만 보지 않고 정확한 요청 길이, 무음/클리핑/DC와 섹션별 강약도 실제 sample에서 확인한다.
describe('local musical WAV renderer', () => {
  it('renders an overhanging four-bar ending as exactly 150 seconds with its existing fade', async () => {
    const bytes = await collect(partialEnding(), 150);
    expect(bytes.length).toBe(26_460_044);
    expect(bytes.readUInt32LE(40) / bytes.readUInt32LE(28)).toBe(150);
    expect(bytes.readUInt16LE(20)).toBe(1);
    expect(bytes.readUInt16LE(22)).toBe(2);
    expect(bytes.readUInt32LE(24)).toBe(44_100);
    expect(bytes.readUInt16LE(34)).toBe(16);
    const stats = signalStats(bytes);
    expect(stats.peak).toBeLessThan(0.901);
    expect(stats.clipped).toBe(0);
    expect(stats.blockRms[148]).toBeGreaterThan(stats.blockRms[149]!);
    expect(stats.blockRms[149]).toBeGreaterThan(0.001);
    expect(Math.abs(bytes.readInt16LE(bytes.length - 4))).toBeLessThanOrEqual(1);
    expect(Math.abs(bytes.readInt16LE(bytes.length - 2))).toBeLessThanOrEqual(1);
  }, 30_000);
  it('renders a complete 150s stereo PCM16 WAV with clean levels, dynamics, and audible sections', async () => {
    const bytes = await collect(composition(150), 150);
    expect(bytes.length).toBe(44 + 150 * 44_100 * 4);
    expect(bytes.length).toBeLessThan(100 * 1024 * 1024);
    expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
    expect(bytes.subarray(8, 16).toString()).toBe('WAVEfmt ');
    expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8);
    expect(bytes.readUInt16LE(20)).toBe(1);
    expect(bytes.readUInt16LE(22)).toBe(2);
    expect(bytes.readUInt32LE(24)).toBe(44_100);
    expect(bytes.readUInt32LE(28)).toBe(176_400);
    expect(bytes.readUInt16LE(32)).toBe(4);
    expect(bytes.readUInt16LE(34)).toBe(16);
    expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
    const stats = signalStats(bytes);
    expect(stats.peak).toBeLessThan(0.901);
    expect(stats.rms).toBeGreaterThan(0.035);
    expect(stats.rms).toBeLessThan(0.141);
    expect(stats.clipped).toBe(0);
    expect(Math.abs(stats.mean)).toBeLessThan(0.001);
    expect(stats.stereoDifference).toBeGreaterThan(0.005);
    expect(Math.min(...stats.blockRms.slice(1, -1))).toBeGreaterThan(0.005);
    expect(Math.max(...stats.blockRms) / Math.min(...stats.blockRms.slice(1, -2))).toBeGreaterThan(1.4);
    expect(Math.abs(bytes.readInt16LE(bytes.length - 4))).toBeLessThanOrEqual(1);
    expect(Math.abs(bytes.readInt16LE(bytes.length - 2))).toBeLessThanOrEqual(1);
    // Different sections must have different musical content, not repeated WAV padding.
    expect(digest(bytes.subarray(44 + 10 * 176_400, 44 + 14 * 176_400))).not.toBe(digest(bytes.subarray(44 + 34 * 176_400, 44 + 38 * 176_400)));
  }, 30_000);
  // 같은 score/seed는 같은 SHA, 음표 또는 seed 변경은 다른 SHA여야 한다. LLM 작곡 결과 재현성을 뜻하지 않는다.
  it('is byte reproducible for the same score/seed and changes when notes or seed change', async () => {
    const a = await collect(copy()), b = await collect(copy());
    expect(digest(a)).toBe(digest(b));
    const different = copy(); different.seed = 'another-seed'; different.patterns[2]!.notes[0]!.pitch = 77;
    const c = await collect(different);
    expect(digest(a)).not.toBe(digest(c));
  }, 30_000);
  it.each(['guitar', 'strings', 'brass', 'organ', 'pad'] as Instrument[])('renders %s without clipping or a silent intro', async (instrument) => {
    const score = copy();
    for (const part of score.parts) if (part.instrument === 'piano') part.instrument = instrument;
    const bytes = await collect(score), stats = signalStats(bytes);
    expect(stats.peak).toBeLessThan(0.901);
    expect(stats.rms).toBeGreaterThan(0.03);
    expect(stats.blockRms[1]).toBeGreaterThan(0.005);
    expect(stats.clipped).toBe(0);
  }, 30_000);
  it('normalizes a quiet but valid score while preserving its relative arrangement dynamics', async () => {
    const score = copy();
    for (const part of score.parts) part.gain = 0.05;
    for (const pattern of score.patterns) for (const note of pattern.notes) note.velocity = 0.05;
    const stats = signalStats(await collect(score));
    expect(stats.rms).toBeGreaterThan(0.03);
    expect(stats.peak).toBeLessThan(0.901);
  }, 30_000);
  it('honors pre-abort without surfacing the private cancellation reason', async () => {
    const controller = new AbortController(); controller.abort(new Error('/private/auth-token'));
    await expect(renderComposition(copy(), 90, controller.signal)[Symbol.asyncIterator]().next()).rejects.toMatchObject({ name: 'AbortError', message: '음악 생성이 취소되었습니다.' });
  });
  // 렌더링 중 timer 기반 취소가 실행되어야 UI/API가 장시간 DSP 때문에 멈추지 않는다.
  it('yields the event loop and cancels during synthesis before producing WAV bytes', async () => {
    const controller = new AbortController(), reader = renderComposition(copy(), 90, controller.signal)[Symbol.asyncIterator]();
    const started = performance.now(), pending = reader.next();
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(performance.now() - started).toBeLessThan(1_000);
  });
  it('cancels during PCM consumption and prevents repeated consumption', async () => {
    const controller = new AbortController(), source = renderComposition(copy(), 90, controller.signal), reader = source[Symbol.asyncIterator]();
    expect((await reader.next()).value).toHaveLength(44);
    expect((await reader.next()).value).toHaveLength(4_096 * 4);
    controller.abort();
    await expect(reader.next()).rejects.toMatchObject({ name: 'AbortError' });
    await expect(source[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'COMPOSITION_STREAM_CONSUMED' });
  }, 30_000);
  // parse 이후 caller가 객체를 바꿔도 renderer 시작 시 재검증이 비용 제한을 지켜야 한다.
  it('defensively rejects a mutated score instead of rendering unbounded input', async () => {
    const score = copy(); score.parts[0]!.repeats = Infinity;
    await expect(renderComposition(score, 90, new AbortController().signal)[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'INVALID_COMPOSITION' });
  });
});
