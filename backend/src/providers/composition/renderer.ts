/**
 * 검증된 악보를 외부 sample 없이 stereo 44.1 kHz PCM16 WAV로 합성한다.
 * seed별 음색/위상과 dither를 재현하고, 긴 DSP 반복 중에는 event loop를 양보해 API와 취소 요청이 응답하도록 한다.
 */
import { setImmediate as yieldImmediate } from 'node:timers/promises';
import { CompositionError, expandComposition, parseComposition, releaseFor } from './schema.js';
import type { Composition, Instrument, MusicalEvent } from './schema.js';

export const SAMPLE_RATE = 44_100;
const BLOCK = 4_096;
const TABLE_SIZE = 4_096;
// 4096개 사인 lookup table로 매 sample의 삼각함수 계산을 줄인다. table 크기는 비트 마스크 wrap에 맞는 2의 거듭제곱이다.
const sineTable = Float64Array.from({ length: TABLE_SIZE }, (_, index) => Math.sin(index * 2 * Math.PI / TABLE_SIZE));
function sine(cycles: number): number { return sineTable[(cycles * TABLE_SIZE) & (TABLE_SIZE - 1)]!; }
function check(signal: AbortSignal): void { if (signal.aborted) throw new DOMException('음악 생성이 취소되었습니다.', 'AbortError'); }
// 양보 전후에 취소를 확인해 이미 취소된 작업과 양보 중 들어온 취소를 모두 즉시 처리한다.
async function breathe(signal: AbortSignal): Promise<void> { check(signal); await yieldImmediate(); check(signal); }
// 문자 seed를 32비트 값으로 바꾼 뒤 결정적 PRNG에 사용한다. 인증/보안 용도의 해시가 아니다.
function hash(text: string): number { let value = 2_166_136_261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16_777_619); return value >>> 0; }
// 전역 Math.random 대신 음표별 상태를 가진 PRNG를 사용해 다른 job 실행 순서에 영향을 받지 않는다.
function random(seed: number): () => number {
  let state = seed;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let value = Math.imul(state ^ (state >>> 15), 1 | state); value ^= value + Math.imul(value ^ (value >>> 7), 61 | value); return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296; };
}
function attackFor(instrument: Instrument): number { return instrument === 'strings' ? 0.12 : instrument === 'pad' ? 0.22 : instrument === 'brass' ? 0.045 : instrument === 'synth' ? 0.012 : 0.003; }
function decayFor(instrument: Instrument, frequency: number): number {
  if (instrument === 'piano') return 0.5 + frequency / 1_000;
  if (instrument === 'guitar') return 1.2 + frequency / 900;
  if (instrument === 'bell') return 0.55;
  return instrument === 'bass' ? 0.4 : 0.08;
}

/** Additive, band-limited tones. Each note has its own seeded phase, dynamics and envelope. */
// MIDI를 주파수로 변환하고 악기별 배음·detune·감쇠를 더한다. constant-power pan으로 좌우 에너지를 배분한다.
// 발음 길이는 이미 예산 검증된 이벤트를 사용하고 sample 배열 경계를 넘지 않게 한 번 더 제한한다.
async function addTone(event: MusicalEvent, left: Float32Array, right: Float32Array, seed: number, signal: AbortSignal): Promise<void> {
  const rng = random(seed), instrument = event.instrument;
  const frequency = 440 * 2 ** ((event.pitch - 69) / 12), step = frequency / SAMPLE_RATE;
  const begin = Math.round(event.start * SAMPLE_RATE), end = Math.min(left.length, begin + Math.ceil(event.length * SAMPLE_RATE));
  const gateSamples = event.gate * SAMPLE_RATE, attackSamples = Math.min(attackFor(instrument), event.gate * 0.35) * SAMPLE_RATE;
  const releaseSamples = releaseFor(instrument) * SAMPLE_RATE;
  const pan = (event.pan + 1) * Math.PI / 4;
  const amplitude = event.gain * event.velocity * (0.97 + rng() * 0.06) * 0.21;
  const gainL = Math.cos(pan) * amplitude, gainR = Math.sin(pan) * amplitude;
  const initialPhase = rng(), detunePhase = rng();
  let phase = initialPhase, detune = detunePhase;
  const detuneStep = step * (instrument === 'strings' || instrument === 'pad' ? 1.003 : 1.0015);
  let decay = 1, bright = 1;
  const decayStep = Math.exp(-decayFor(instrument, frequency) / SAMPLE_RATE), brightStep = Math.exp(-4 / SAMPLE_RATE);
  // Remove harmonics above 0.45 sample rate, well below Nyquist.
  const h2 = frequency * 2 < SAMPLE_RATE * 0.45 ? 1 : 0;
  const h3 = frequency * 3 < SAMPLE_RATE * 0.45 ? 1 : 0;
  const h4 = frequency * 4 < SAMPLE_RATE * 0.45 ? 1 : 0;
  const h5 = frequency * 5 < SAMPLE_RATE * 0.45 ? 1 : 0;
  const bellPartial = frequency * 2.756 < SAMPLE_RATE * 0.45 ? 1 : 0;
  for (let frame = begin, local = 0; frame < end; frame++, local++) {
    if (local % BLOCK === 0) await breathe(signal);
    const attack = Math.min(1, local / Math.max(1, attackSamples));
    const release = local <= gateSamples ? 1 : Math.max(0, 1 - (local - gateSamples) / releaseSamples);
    const envelope = attack * release * release;
    const fundamental = sine(phase), second = sine(phase * 2) * h2, third = sine(phase * 3) * h3;
    let tone: number;
    // 모든 음색은 제한된 배음의 합이다. 악기마다 배음 비율과 밝기 감쇠를 다르게 해 같은 악보에서도 역할을 구분한다.
    switch (instrument) {
      case 'bass': tone = (fundamental + second * 0.2 + third * 0.07) * (0.55 + 0.45 * decay); break;
      case 'piano': tone = (fundamental + second * 0.42 * bright + third * 0.19 * bright + sine(phase * 4.003) * h4 * 0.08 * bright) * decay; break;
      case 'guitar': tone = (fundamental + second * 0.44 * bright + third * 0.24 + sine(phase * 4) * h4 * 0.12 * bright + sine(phase * 5) * h5 * 0.07 * bright) * decay; break;
      case 'bell': tone = (fundamental * 0.8 + sine(phase * 2.756) * bellPartial * 0.34 * bright + sine(phase * 4.07) * h5 * 0.12 * bright) * decay; break;
      case 'organ': tone = fundamental * 0.75 + second * 0.32 + third * 0.17 + sine(phase * 4) * h4 * 0.12; break;
      case 'brass': tone = (fundamental * 0.85 + second * 0.4 + third * 0.2 + sine(phase * 4) * h4 * 0.08) * (0.85 + 0.15 * sine(local / SAMPLE_RATE * 4.8)); break;
      case 'strings': tone = (fundamental * 0.52 + sine(detune) * 0.4 + second * 0.22 + third * 0.1 + sine(detune * 4) * h4 * 0.05) * (0.91 + 0.09 * sine(local / SAMPLE_RATE * 5.1)); break;
      case 'pad': tone = (fundamental * 0.7 + sine(detune) * 0.48 + third * 0.08) * (0.86 + 0.14 * sine(local / SAMPLE_RATE * 0.27)); break;
      default: tone = fundamental * 0.8 + sine(detune) * 0.25 + second * 0.23 + third * 0.13;
    }
    left[frame]! += tone * envelope * gainL;
    right[frame]! += tone * envelope * gainR;
    phase += step; detune += detuneStep; decay *= decayStep; bright *= brightStep;
  }
}

/** Synthetic percussion: pitch envelopes, filtered noise and metallic partials, no samples. */
// kick/tom은 내려가는 주파수, snare/clap/hat은 필터링한 noise와 금속성 배음을 사용한다. sample 라이브러리를 읽지 않는다.
async function addDrum(event: MusicalEvent, left: Float32Array, right: Float32Array, seed: number, signal: AbortSignal): Promise<void> {
  const rng = random(seed), pitch = event.pitch;
  const begin = Math.round(event.start * SAMPLE_RATE), end = Math.min(left.length, begin + Math.ceil(event.length * SAMPLE_RATE));
  const pan = (event.pan + 1) * Math.PI / 4;
  const amplitude = event.gain * event.velocity * (0.96 + rng() * 0.08) * (pitch === 36 ? 0.55 : pitch === 38 || pitch === 39 ? 0.34 : 0.16);
  const gainL = Math.cos(pan) * amplitude, gainR = Math.sin(pan) * amplitude;
  let phase = 0, low = 0, envelope = 1, snap = 1, frequencyEnvelope = 1;
  const decay = Math.exp(-(pitch === 36 ? 11 : pitch === 49 ? 3.5 : pitch === 46 || pitch === 51 ? 8 : pitch === 45 || pitch === 48 ? 13 : pitch === 38 || pitch === 39 ? 19 : 48) / SAMPLE_RATE);
  const snapDecay = Math.exp(-100 / SAMPLE_RATE), frequencyDecay = Math.exp(-38 / SAMPLE_RATE);
  for (let frame = begin, local = 0; frame < end; frame++, local++) {
    if (local % BLOCK === 0) await breathe(signal);
    const noise = rng() * 2 - 1;
    low += (noise - low) * 0.18;
    const high = noise - low;
    let sample: number;
    if (pitch === 36) { phase += (46 + 110 * frequencyEnvelope) / SAMPLE_RATE; sample = sine(phase) * envelope + high * snap * 0.05; }
    else if (pitch === 38 || pitch === 37) { phase += 185 / SAMPLE_RATE; sample = (sine(phase) * 0.35 + high * (pitch === 37 ? 0.38 : 0.85)) * envelope; }
    else if (pitch === 39) { const time = local / SAMPLE_RATE; const flutter = time < 0.033 ? 0.25 + 0.75 * Math.max(0, sine(time * 130)) : 0.7; sample = high * envelope * flutter; }
    else if (pitch === 45 || pitch === 48) { phase += ((pitch === 45 ? 95 : 145) + 65 * frequencyEnvelope) / SAMPLE_RATE; sample = (sine(phase) + high * 0.05) * envelope; }
    else { const time = local / SAMPLE_RATE; const metal = sine(time * 4_213) * sine(time * 2_809) + sine(time * 6_217) * 0.45; sample = (high * 0.7 + metal * 0.25) * envelope; }
    // Short raised attack/end tapers prevent clicks without removing the drum transient.
    const fade = Math.min(1, local / 44, (end - frame) / 220);
    left[frame]! += sample * gainL * fade;
    right[frame]! += sample * gainR * fade;
    envelope *= decay; snap *= snapDecay; frequencyEnvelope *= frequencyDecay;
  }
}

// 짧은 지연선의 감쇠 feedback으로 공간감을 더하고 DC 제거 및 곡 끝 fade를 적용한다.
// 전체 peak/RMS를 측정해 한 곡에 같은 gain을 사용하므로 섹션 간 강약 차이는 유지한다.
async function finishMix(left: Float32Array, right: Float32Array, signal: AbortSignal): Promise<number> {
  // Decorrelated, damped stereo feedback delay network. Feedback is strictly below unity.
  const delays = [1_423, 1_777, 2_131, 2_717].map((length) => new Float64Array(length));
  const indices = [0, 0, 0, 0], damped = [0, 0, 0, 0];
  let peak = 0, sumSquares = 0, dcL = 0, dcR = 0, previousL = 0, previousR = 0;
  for (let frame = 0; frame < left.length; frame++) {
    if (frame % BLOCK === 0) await breathe(signal);
    const sourceL = left[frame]!, sourceR = right[frame]!;
    const a = delays[0]![indices[0]!]!, b = delays[1]![indices[1]!]!, c = delays[2]![indices[2]!]!, d = delays[3]![indices[3]!]!;
    const feedback = [(b + c) * 0.36, (a - d) * 0.36, (a + d) * 0.36, (b - c) * 0.36];
    for (let j = 0; j < delays.length; j++) {
      damped[j]! += (feedback[j]! - damped[j]!) * 0.3;
      delays[j]![indices[j]!] = (j % 2 === 0 ? sourceL : sourceR) * 0.17 + damped[j]!;
      indices[j] = (indices[j]! + 1) % delays[j]!.length;
    }
    const wetL = sourceL + (a + c) * 0.4, wetR = sourceR + (b + d) * 0.4;
    dcL = wetL - previousL + 0.9986 * dcL; dcR = wetR - previousR + 0.9986 * dcR;
    previousL = wetL; previousR = wetR;
    // Gentle 1.8s end fade provides a deliberate tail even when duration cuts the last bar.
    const fade = Math.min(1, frame / (SAMPLE_RATE * 0.025), (left.length - 1 - frame) / (SAMPLE_RATE * 1.8));
    const l = dcL * fade, r = dcR * fade;
    if (!Number.isFinite(l) || !Number.isFinite(r)) throw new CompositionError('RENDER_FAILED');
    left[frame] = l; right[frame] = r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    sumSquares += l * l + r * r;
  }
  const rms = Math.sqrt(sumSquares / (left.length * 2));
  if (peak < 1e-6 || rms < 1e-7) throw new CompositionError('RENDER_FAILED');
  // Whole-song level adjustment preserves section dynamics; no clipping or hard limiting.
  return Math.min(0.9 / peak, 0.14 / rms);
}

// 2채널 × 16bit로 frame당 4byte를 기록한다. RIFF/data 크기는 뒤따르는 실제 PCM byte 수와 같아야 한다.
function wavHeader(frames: number): Buffer {
  const header = Buffer.alloc(44), bytes = frames * 4;
  header.write('RIFF', 0); header.writeUInt32LE(bytes + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(bytes, 40);
  return header;
}

/** Single-use, bounded-memory WAV source. Cancellation yields at most every 4096 sample operations. */
// 한 번 소비하는 async source다. 최대 180초의 좌우 mix buffer를 사용하고 출력 PCM은 4096 frame씩 전달한다.
// 첫 PCM을 만들기 전에 악보를 다시 검증·복사해 호출자가 나중에 원본 객체를 바꾸는 영향도 차단한다.
export function renderComposition(score: Composition, durationSeconds: number, signal: AbortSignal): AsyncIterable<Uint8Array> {
  let consumed = false;
  return {
    async *[Symbol.asyncIterator]() {
      if (consumed) throw new CompositionError('COMPOSITION_STREAM_CONSUMED');
      consumed = true;
      check(signal);
      // Defensive copy/revalidation also prevents mutation after parse or between consumers.
      const safe = parseComposition(score, { prompt: '', settings: { durationSeconds }, variationCount: 1 });
      await breathe(signal);
      const frames = Math.round(durationSeconds * SAMPLE_RATE), seed = hash(safe.seed);
      const left = new Float32Array(frames), right = new Float32Array(frames);
      const events = expandComposition(safe, durationSeconds);
      // event index에서 음표별 seed를 파생해 발음 수·종류가 같은 score는 동일한 연주 변동을 갖게 한다.
      for (const event of events) {
        const voiceSeed = (seed ^ Math.imul(event.index + 1, 0x9E3779B1)) >>> 0;
        if (event.instrument === 'drums') await addDrum(event, left, right, voiceSeed, signal);
        else await addTone(event, left, right, voiceSeed, signal);
      }
      const gain = await finishMix(left, right, signal), rng = random(seed ^ 0xA5A5A5A5);
      check(signal);
      yield wavHeader(frames);
      for (let start = 0; start < frames; start += BLOCK) {
        await breathe(signal);
        const end = Math.min(frames, start + BLOCK), chunk = Buffer.allocUnsafe((end - start) * 4);
        for (let frame = start; frame < end; frame++) {
          // TPDF dither, at one 16-bit LSB, before deterministic quantization.
          const l = Math.round(left[frame]! * gain * 32_767 + rng() - rng());
          const r = Math.round(right[frame]! * gain * 32_767 + rng() - rng());
          chunk.writeInt16LE(Math.max(-32_768, Math.min(32_767, l)), (frame - start) * 4);
          chunk.writeInt16LE(Math.max(-32_768, Math.min(32_767, r)), (frame - start) * 4 + 2);
        }
        yield chunk;
      }
      check(signal);
    },
  };
}
