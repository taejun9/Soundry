/**
 * 모델이 작성하는 악보의 JSON schema와 독립적인 런타임 검증기다.
 * 구조뿐 아니라 마디 배치·음악적 다양성·음표 수·동시 발음·총 합성량을 제한해 무한/과도한 합성을 방지한다.
 */
import type { GenerationInput } from '../../../../shared/contracts.js';

export const INSTRUMENTS = ['drums', 'bass', 'synth', 'piano', 'guitar', 'strings', 'brass', 'organ', 'bell', 'pad'] as const;
export type Instrument = typeof INSTRUMENTS[number];
export const SECTION_NAMES = ['intro', 'verse', 'chorus', 'bridge', 'outro'] as const;
// 시간 단위는 4/4의 4분음표 beat이며 pitch는 MIDI 번호다. pattern 시간은 상대값, part/section은 전체 곡의 마디 위치다.
export interface Note { beat: number; duration: number; pitch: number; velocity: number }
export interface Pattern { id: string; bars: number; notes: Note[] }
export interface Part { instrument: Instrument; patternId: string; startBar: number; repeats: number; transpose: number; gain: number; pan: number }
export interface Section { name: typeof SECTION_NAMES[number]; startBar: number; bars: number }
export interface Composition { version: 1; bpm: number; genre: string; mood: string; seed: string; patterns: Pattern[]; parts: Part[]; sections: Section[] }
export class CompositionError extends Error {
  constructor(readonly code: 'INVALID_COMPOSITION' | 'RENDER_FAILED' | 'COMPOSITION_STREAM_CONSUMED' = 'INVALID_COMPOSITION') {
    super(code === 'INVALID_COMPOSITION' ? 'CLI가 유효한 음악 악보를 작성하지 못했습니다.' : '로컬 음악 렌더링을 완료하지 못했습니다.');
    this.name = 'CompositionError';
  }
}

const number = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum });
const integer = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
const string = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const array = (items: unknown, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems });

/** No optional unbounded text, paths, URLs, executable code, or opaque extension fields. */
// 모델 출력 제약은 모든 속성을 필수로 하고 추가 키를 금지한다. schema 통과를 신뢰하지 않고 아래에서 관계까지 재검증한다.
export const COMPOSITION_SCHEMA = object({
  version: { type: 'integer', const: 1 }, bpm: number(40, 220), genre: string(80), mood: string(80), seed: string(64),
  patterns: array(object({
    id: { ...string(24), pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$' }, bars: integer(1, 8),
    notes: array(object({ beat: number(0, 31.9375), duration: number(0.0625, 16), pitch: integer(24, 96), velocity: number(0.05, 1) }), 1, 128),
  }), 4, 32),
  parts: array(object({
    instrument: { type: 'string', enum: INSTRUMENTS }, patternId: string(24), startBar: integer(0, 164),
    repeats: integer(1, 64), transpose: integer(-24, 24), gain: number(0.05, 1), pan: number(-1, 1),
  }), 6, 96),
  sections: array(object({ name: { type: 'string', enum: SECTION_NAMES }, startBar: integer(0, 164), bars: integer(1, 64) }), 5, 12),
});

// 모델에 제공하는 작곡 지침은 실행 코드가 아니다. 독창적 편곡과 정확한 종료를 요청하되 실제 허용 여부는 검증기가 결정한다.
export const COMPOSITION_INSTRUCTIONS = `Compose an ORIGINAL, expressive instrumental score, not code, shell commands, prose, or audio URLs. Return only the JSON object matching the provided schema. Do not copy an existing tune. The app synthesizes the notes locally; it has no sample library, vocals or lyrics.
All music uses 4/4: beat=quarter note, each bar=4 beats, MIDI pitch (60=middle C). Choose exact bpm 40..220; obey an explicit requested bpm, genre, mood and seed verbatim. Otherwise choose these to fit the prompt. Seed is an arbitrary short string, not executable content. Duration comes from the request, default 150 seconds. If computedConstraints.requiredTotalBars is supplied, use that app-calculated value as TOTAL BARS without recalculating it; otherwise TOTAL BARS MUST EQUAL ceil(durationSeconds*bpm/240). Sections must be contiguous from bar 0 and sum to that exact count; the last bar may be faded partway to end at the requested duration. Start with intro, end with outro, and include verse, chorus and bridge (ambient/classical may interpret these as contrasting textures, theme, development, return, coda). Five to twelve sections; each section 1..64 bars. Arrange a completed piece with at least three distinct section orchestrations, contrasting dynamics, breaks, fills, melodic development, a climactic return and a deliberate ending. Do not simply repeat one short loop over the entire track.
Use 4..32 reusable patterns of 1..8 bars, each with 1..128 notes. IDs are unique ASCII identifiers. Note beat is relative to its pattern and beat+duration must fit the pattern's bars*4. Overlapping notes create chords; durations 0.0625..16 beats; velocities 0.05..1. Use at least six different melodic MIDI pitches overall, at least 24 written melodic notes, at least two melodic instruments, and at least four distinct melodic patterns. Every pattern must be used. Create original chord progressions, bass voice leading, memorable melody motifs and developed answers; varying velocity, rests, register and note length matters. For longer harmonic progressions split into multiple 4/8-bar patterns. Avoid a metronomic repeating arpeggio as the only musical development.
Parts place patterns on the complete timeline. A part has instrument, patternId, startBar (zero based), repeats (integer), transpose (semitones), gain 0.05..1, pan -1..1. Every part must start before the requested ending. Its final repetition must also start inside the timeline: startBar+pattern.bars*(repeats-1)<TOTAL BARS. Only that final repetition may extend beyond TOTAL BARS; the local renderer clips its remaining notes and releases at the exact requested duration. Never add a repetition that starts at or after TOTAL BARS. Parts can overlap for ensemble layers; divide repetitions at section boundaries to change orchestration/dynamics. Use 6..96 parts, 48..16,000 expanded notes within the requested duration, at most 48 simultaneous sounding notes, and at most 6,000 summed sounding seconds across all notes (including natural percussion tails and instrument releases, clipped at the requested ending); avoid duplicate parts and excessively dense sustained chords. Leave no silent gap of more than two bars or 5 seconds. Do not place parts after the requested ending.
Instrument timbres: drums (synthesized kit), bass (warm sub with harmonics), synth (rounded detuned lead), piano (decaying hammer harmonics), guitar (plucked harmonics), strings (slow bowed ensemble), brass (rounded sustained horns), organ (additive drawbars), bell (bright inharmonic decay), pad (soft evolving texture). Use suitable combinations for the requested genre, not every instrument. Keep bass centered with gain around 0.35..0.65, chords spread around +/-0.2..0.6 at gain 0.2..0.5, lead nearer center, percussion around 0.4..0.7. Avoid high-register bass or chords crowded into the bass register.
Drum pitch map ONLY: 36 kick, 38 snare, 39 clap, 42 closed hi-hat, 46 open hi-hat, 45 low tom, 48 high tom, 49 crash, 51 ride, 37 rim, 54 shaker. Drums require transpose=0. Kick/snare around velocity 0.7..1, hats/shaker around 0.15..0.6 with accents. Drum duration is a notated gate; synthesized percussion has natural decay. Vary fills and density across sections; use swing/syncopation/triplets through fractional beat positions where stylistically appropriate. Non-drum pitches plus transpose must stay 24..108.
Genre guidance: hip-hop/trap use syncopated low bass, swung/sparse snares and changing hat subdivisions; R&B uses extended chords and smooth voice leading; pop/rock uses a memorable contrasting hook and a stronger chorus; funk uses short syncopated guitar/keys and bass; jazz uses seventh/ninth voicings, swing and melodic variation; house/techno uses steady low kick with evolving chords/ostinato and breakdown/rebuild; D&B uses broken fast drums with half-time bass phrasing; ambient/cinematic/classical prioritize voice leading, texture and larger dynamic development; folk uses plucked phrases; Latin uses syncopated percussion and offbeat accompaniment; reggae/dub uses offbeat short chords, spacious bass and gaps. These are compositional directions, not permission to use a fixed preset composition.`;

function fail(): never { throw new CompositionError(); }
// 일반 데이터 객체만 받고 getter/setter와 예상 밖 prototype을 거부해 내부 호출도 접근 부작용 없이 검사한다.
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail();
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail();
  const entries = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(entries).length !== keys.length || keys.some((key) => !Object.hasOwn(entries, key)) || Object.values(entries).some((entry) => !('value' in entry))) fail();
  return value as Record<string, unknown>;
}
function n(value: unknown, min: number, max: number, whole = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (whole && !Number.isInteger(value))) fail();
  return value;
}
function s(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value !== value.trim() || Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fail();
  return value;
}
// 배열 길이뿐 아니라 sparse slot/추가 속성도 거부한다. 이후 순회에서 누락 항목이 자동 생략되는 것을 방지한다.
function list(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || Object.keys(value).length !== value.length) fail();
  return value;
}
const drumPitches = new Set([36, 38, 39, 42, 46, 45, 48, 49, 51, 37, 54]);
export function durationFor(input: GenerationInput): number {
  return n(input.settings.durationSeconds ?? 150, 90, 180);
}

/** Copy only bounded musical fields. Never interpolate untrusted values into an error. */
// 지원한 필드만 새 객체로 복사한다. 명시한 BPM/genre/mood/seed가 모델 출력에서 임의로 달라지면 실패한다.
export function parseComposition(value: unknown, input: GenerationInput): Composition {
  const raw = record(value, ['version', 'bpm', 'genre', 'mood', 'seed', 'patterns', 'parts', 'sections']);
  if (raw.version !== 1 || (input.settings.mode !== undefined && input.settings.mode !== 'instrumental')) fail();
  const bpm = n(raw.bpm, 40, 220), genre = s(raw.genre, 80), mood = s(raw.mood, 80), seed = s(raw.seed, 64);
  const duration = durationFor(input), totalBars = Math.ceil(duration * bpm / 240);
  for (const key of ['bpm', 'genre', 'mood', 'seed'] as const) {
    if (input.settings[key] !== undefined && input.settings[key] !== raw[key]) fail();
  }
  const patterns: Pattern[] = list(raw.patterns, 4, 32).map((v) => {
    const p = record(v, ['id', 'bars', 'notes']), id = s(p.id, 24), bars = n(p.bars, 1, 8, true);
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/u.test(id)) fail();
    const notes = list(p.notes, 1, 128).map((v) => {
      const note = record(v, ['beat', 'duration', 'pitch', 'velocity']);
      const beat = n(note.beat, 0, 31.9375), duration = n(note.duration, 0.0625, 16);
      if (beat + duration > bars * 4 + 1e-8) fail();
      return { beat, duration, pitch: n(note.pitch, 24, 96, true), velocity: n(note.velocity, 0.05, 1) };
    });
    return { id, bars, notes };
  });
  const byId = new Map(patterns.map((p) => [p.id, p]));
  if (byId.size !== patterns.length) fail();
  const parts: Part[] = list(raw.parts, 6, 96).map((v) => {
    const p = record(v, ['instrument', 'patternId', 'startBar', 'repeats', 'transpose', 'gain', 'pan']);
    if (!INSTRUMENTS.includes(p.instrument as Instrument)) fail();
    const part: Part = { instrument: p.instrument as Instrument, patternId: s(p.patternId, 24), startBar: n(p.startBar, 0, 164, true), repeats: n(p.repeats, 1, 64, true), transpose: n(p.transpose, -24, 24, true), gain: n(p.gain, 0.05, 1), pan: n(p.pan, -1, 1) };
    const pattern = byId.get(part.patternId);
    // A final partial pattern is playable; a wholly out-of-range repetition is not.
    if (!pattern || part.startBar + pattern.bars * (part.repeats - 1) >= totalBars || part.startBar * 240 / bpm >= duration) fail();
    if (part.instrument === 'drums' && (part.transpose !== 0 || pattern.notes.some((note) => !drumPitches.has(note.pitch)))) fail();
    if (part.instrument !== 'drums' && pattern.notes.some((note) => note.pitch + part.transpose < 24 || note.pitch + part.transpose > 108)) fail();
    return part;
  });
  if (new Set(parts.map((p) => JSON.stringify(p))).size !== parts.length || new Set(parts.map((p) => p.patternId)).size !== patterns.length) fail();
  // 여러 악기·패턴·음높이 및 작성 음표 수를 확인한다. 단일 짧은 반복을 풍부한 완성곡으로 오인하지 않게 하는 최소 구조 조건이다.
  const melodic = parts.filter((p) => p.instrument !== 'drums');
  const melodicPatterns = new Set(melodic.map((p) => p.patternId));
  const pitches = new Set(melodic.flatMap((p) => byId.get(p.patternId)!.notes.map((note) => note.pitch + p.transpose)));
  if (new Set(melodic.map((p) => p.instrument)).size < 2 || melodicPatterns.size < 4 || pitches.size < 6 || [...melodicPatterns].reduce((sum, id) => sum + byId.get(id)!.notes.length, 0) < 24) fail();
  // 섹션은 0마디부터 빈틈없이 이어져 정확한 총마디 수를 구성해야 한다. intro/outro와 대비 구간도 필수다.
  let bar = 0;
  const sections: Section[] = list(raw.sections, 5, 12).map((v) => {
    const p = record(v, ['name', 'startBar', 'bars']);
    if (!SECTION_NAMES.includes(p.name as Section['name'])) fail();
    const section: Section = { name: p.name as Section['name'], startBar: n(p.startBar, 0, 164, true), bars: n(p.bars, 1, 64, true) };
    if (section.startBar !== bar) fail();
    bar += section.bars;
    return section;
  });
  if (bar !== totalBars || sections[0]!.name !== 'intro' || sections.at(-1)!.name !== 'outro' || SECTION_NAMES.some((name) => !sections.some((section) => section.name === name))) fail();
  const orchestration = sections.map((section) => parts.filter((p) => p.startBar < section.startBar + section.bars && p.startBar + byId.get(p.patternId)!.bars * p.repeats > section.startBar).map((p) => `${p.instrument}:${p.patternId}:${p.transpose}:${p.gain}`).sort().join('|'));
  if (new Set(orchestration).size < 3 || orchestration.some((signature) => !signature)) fail();
  const score: Composition = { version: 1, bpm, genre, mood, seed, patterns, parts, sections };
  // Limit actual expansion and synthesis work, including releases and percussion tails.
  const events = expandComposition(score, duration);
  if (events.length > 16_000 || events.length < 48 || events.reduce((sum, event) => sum + event.length, 0) > 6_000) fail();
  // 발음 시작/종료를 시간순으로 훑는 sweep으로 최대 동시 발음을 계산한다. 같은 시각에는 종료를 먼저 처리한다.
  const boundaries = events.flatMap((event) => [{ time: event.start, delta: 1 }, { time: event.start + event.length, delta: -1 }]).sort((a, b) => a.time - b.time || a.delta - b.delta);
  let active = 0, previousEnd = 0;
  for (const boundary of boundaries) { active += boundary.delta; if (active > 48) fail(); }
  // 이벤트는 시작순이다. 이전 모든 음의 최대 종료 시각을 유지해 긴 무음이 허용 한도를 넘는지 검사한다.
  for (const event of events) {
    if (event.start - previousEnd > Math.min(5, 480 / bpm)) fail();
    previousEnd = Math.max(previousEnd, event.start + event.length);
  }
  if (duration - previousEnd > Math.min(5, 480 / bpm)) fail();
  return score;
}

// 펼친 이벤트는 초 단위다. gate는 악보상 유지 시간, length는 release/타악기 꼬리와 곡 종료 절단까지 반영한 실제 합성 시간이다.
export interface MusicalEvent { instrument: Instrument; pitch: number; velocity: number; gain: number; pan: number; start: number; gate: number; length: number; index: number }
// 검증기의 연산량 예산과 renderer envelope가 같은 release 값을 사용해야 비용 계산이 실제 합성량을 반영한다.
export function releaseFor(instrument: Instrument): number { return instrument === 'strings' || instrument === 'pad' ? 0.65 : instrument === 'bell' ? 0.9 : instrument === 'piano' || instrument === 'guitar' ? 0.22 : 0.12; }
// 타악기는 악보 gate 대신 악기 고유 감쇠 시간을 사용한다. 이 길이도 합성 예산 계산에 포함한다.
export function percussionLength(pitch: number): number { return pitch === 49 ? 1.6 : pitch === 46 ? 0.65 : pitch === 51 ? 0.75 : pitch === 36 ? 0.45 : pitch === 45 || pitch === 48 ? 0.4 : pitch === 38 || pitch === 39 ? 0.28 : 0.12; }
// 재사용 패턴을 유한한 초 단위 이벤트로 펼친다. 요청 끝 이후 시작 음은 제외하고 남은 음의 꼬리는 정확한 끝에서 자른다.
// 안정된 index를 보존해 같은 악보의 seeded 연주가 정렬 후에도 결정적으로 재현되도록 한다.
export function expandComposition(score: Composition, duration: number): MusicalEvent[] {
  const beatSeconds = 60 / score.bpm, byId = new Map(score.patterns.map((pattern) => [pattern.id, pattern]));
  const events: MusicalEvent[] = [];
  for (const part of score.parts) {
    const pattern = byId.get(part.patternId)!;
    for (let repetition = 0; repetition < part.repeats; repetition++) {
      for (const note of pattern.notes) {
        const start = ((part.startBar + repetition * pattern.bars) * 4 + note.beat) * beatSeconds;
        if (start >= duration) continue;
        const gate = note.duration * beatSeconds;
        const length = Math.min(duration - start, part.instrument === 'drums' ? percussionLength(note.pitch) : gate + releaseFor(part.instrument));
        events.push({ instrument: part.instrument, pitch: note.pitch + part.transpose, velocity: note.velocity, gain: part.gain, pan: part.pan, start, gate, length, index: events.length });
        if (events.length > 16_000) fail();
      }
    }
  }
  return events.sort((a, b) => a.start - b.start || a.index - b.index);
}
