/**
 * Mock workflow에 쓰는 원본 수학 합성 fixture 두 개를 재현하는 도구다. 네트워크나 사용자 데이터는 사용하지 않는다.
 * 8초 fixture는 기능 검증 전용이며 사용자가 요청한 90–180초 완성곡/실제 AI 작곡을 대신하지 않는다.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// These fixed, original mathematical sketches exercise the local audio path.
// They deliberately do not respond to a prompt, seed, genre, or tempo setting.
const SAMPLE_RATE = 44_100;
const CHANNELS = 2;
const SAMPLE_WIDTH_BYTES = 2;
const DURATION_SECONDS = 8;
const FRAMES = SAMPLE_RATE * DURATION_SECONDS;
const PEAK = 0.56;
const directory = new URL('./', import.meta.url);
const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
if (process.argv.length > 2 && !checkOnly) {
  throw new Error('Usage: node backend/fixtures/audio/generate.mjs [--check]');
}

// MIDI 69=A4=440 Hz 기준의 평균율 변환이다.
function frequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

// 악기 종류에 따른 attack/release와 배음을 합산하고 일정 전력 pan으로 stereo 위치를 만든다.
function addTone(channels, midi, start, duration, gain, pan, voice) {
  const first = Math.round(start * SAMPLE_RATE);
  const last = Math.min(FRAMES, Math.round((start + duration) * SAMPLE_RATE));
  const hz = frequency(midi);
  const leftGain = Math.cos((pan + 1) * Math.PI / 4) * gain;
  const rightGain = Math.sin((pan + 1) * Math.PI / 4) * gain;
  for (let frame = first; frame < last; frame += 1) {
    const elapsed = (frame - first) / SAMPLE_RATE;
    const remaining = duration - elapsed;
    const phase = 2 * Math.PI * hz * elapsed;
    const attack = Math.min(1, elapsed / (voice === 'pad' ? 0.12 : 0.008));
    const release = Math.min(1, remaining / (voice === 'pad' ? 0.45 : 0.15));
    const envelope = attack * release * (voice === 'pad' ? 1 : Math.exp(-4 * elapsed / duration));
    const tone = voice === 'pad'
      ? Math.sin(phase) + 0.14 * Math.sin(phase * 2) + 0.04 * Math.sin(phase * 3)
      : Math.sin(phase) + 0.3 * Math.sin(phase * 2) + 0.1 * Math.sin(phase * 3);
    channels[0][frame] += tone * envelope * leftGain;
    channels[1][frame] += tone * envelope * rightGain;
  }
}

// 두 개의 고정 자작 화성/분산화음으로 서로 다른 fixture를 만든다. prompt/seed에 따라 달라지는 생성 로직이 아니다.
function sketch(number) {
  const channels = [new Float64Array(FRAMES), new Float64Array(FRAMES)];
  if (number === 1) {
    // A minor 9 → F major 9 → C major 9 → G 6, with a slow bell figure.
    const chords = [[45, 52, 55, 60, 71], [41, 48, 52, 57, 67], [48, 55, 59, 64, 74], [43, 50, 55, 59, 64]];
    chords.forEach((notes, bar) => {
      notes.forEach((midi, index) => addTone(channels, midi, bar * 2, 2.4, 0.085, (index - 2) * 0.22, 'pad'));
      [0, 2, 3, 1].forEach((index, step) => {
        addTone(channels, notes[index] + 24, bar * 2 + step * 0.5, 0.95, 0.13, step % 2 === 0 ? -0.35 : 0.35, 'pluck');
      });
    });
  } else {
    // D major → B minor → G major → A major; a brighter, quicker harp figure.
    const chords = [[38, 50, 54, 57], [35, 47, 50, 54], [31, 43, 47, 50], [33, 45, 49, 52]];
    chords.forEach((notes, bar) => {
      addTone(channels, notes[0], bar * 2, 2.15, 0.21, 0, 'pad');
      [1, 2, 3, 2, 1, 3, 2, 3].forEach((index, step) => {
        addTone(channels, notes[index] + 12, bar * 2 + step * 0.25, 0.7, 0.23, (step % 3 - 1) * 0.42, 'pluck');
      });
      addTone(channels, notes[3] + 24, bar * 2 + 1, 1.1, 0.065, -0.2, 'pad');
    });
  }

  // 시작/끝 fade로 click을 줄이고 전체 peak를 재서 PCM16 범위를 넘지 않는 일정 크기로 정규화한다.
  let peak = 0;
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const fade = Math.min(1, frame / (SAMPLE_RATE * 0.03), (FRAMES - 1 - frame) / (SAMPLE_RATE * 0.25));
    for (const channel of channels) {
      channel[frame] *= fade;
      peak = Math.max(peak, Math.abs(channel[frame]));
    }
  }
  if (!(peak > 0) || !Number.isFinite(peak)) throw new Error('Invalid synthesized signal');

  // 표준 44byte PCM WAV 헤더와 interleaved 좌우 sample을 기록한다. manifest와 실제 frame/byte 수가 일치해야 한다.
  const dataBytes = FRAMES * CHANNELS * SAMPLE_WIDTH_BYTES;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // Uncompressed PCM.
  wav.writeUInt16LE(CHANNELS, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH_BYTES, 28);
  wav.writeUInt16LE(CHANNELS * SAMPLE_WIDTH_BYTES, 32);
  wav.writeUInt16LE(SAMPLE_WIDTH_BYTES * 8, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < FRAMES; frame += 1) {
    for (let channel = 0; channel < CHANNELS; channel += 1) {
      const sample = Math.round(channels[channel][frame] / peak * PEAK * 32_767);
      if (sample < -32_768 || sample > 32_767) throw new Error('PCM overflow');
      wav.writeInt16LE(sample, 44 + (frame * CHANNELS + channel) * SAMPLE_WIDTH_BYTES);
    }
  }
  if (wav.length > 2 * 1024 * 1024) throw new Error('Fixture exceeds 2 MiB');
  return wav;
}

// --check는 파일을 바꾸지 않고 재합성 bytes와 기존 산출물을 비교한다. 기본 실행만 fixture/manifest를 다시 쓴다.
function saveOrCheck(file, bytes) {
  const path = new URL(file, directory);
  if (checkOnly) {
    if (!readFileSync(path).equals(bytes)) throw new Error(`Fixture differs: ${file}`);
  } else {
    writeFileSync(path, bytes);
  }
}

// 음원 byte의 SHA256과 측정 가능한 포맷 값을 함께 기록해 독립 검사기가 손상·우발적 변경을 검출하게 한다.
const files = [1, 2].map((number) => {
  const file = `demo-0${number}.wav`;
  const bytes = sketch(number);
  saveOrCheck(file, bytes);
  return {
    file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    frames: FRAMES,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    sampleWidthBytes: SAMPLE_WIDTH_BYTES,
    durationSeconds: DURATION_SECONDS,
  };
});
saveOrCheck('manifest.json', Buffer.from(`${JSON.stringify({ files }, null, 2)}\n`));
console.log(`${checkOnly ? 'Verified' : 'Generated'} ${files.length} original mock fixtures in ${fileURLToPath(directory)}`);
