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

function frequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

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

  let peak = 0;
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const fade = Math.min(1, frame / (SAMPLE_RATE * 0.03), (FRAMES - 1 - frame) / (SAMPLE_RATE * 0.25));
    for (const channel of channels) {
      channel[frame] *= fade;
      peak = Math.max(peak, Math.abs(channel[frame]));
    }
  }
  if (!(peak > 0) || !Number.isFinite(peak)) throw new Error('Invalid synthesized signal');

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

function saveOrCheck(file, bytes) {
  const path = new URL(file, directory);
  if (checkOnly) {
    if (!readFileSync(path).equals(bytes)) throw new Error(`Fixture differs: ${file}`);
  } else {
    writeFileSync(path, bytes);
  }
}

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
