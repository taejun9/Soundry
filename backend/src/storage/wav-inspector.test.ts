import { linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../config/storage-config.js';
import { inspectWav } from './wav-inspector.js';
let directory: string;
beforeEach(() => { directory = mkdtempSync('/private/tmp/soundry-wav-'); });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });
const fixture = () => readFileSync(join(REPOSITORY_ROOT, 'backend/fixtures/audio/demo-01.wav'));
async function inspect(bytes: Buffer) { const path = join(directory, 'audio.wav'); writeFileSync(path, bytes); return inspectWav(path, bytes.length); }

describe('independent WAV header boundary', () => {
  it('reads PCM and IEEE float frame duration and skips bounded metadata chunks', async () => {
    const pcm = fixture();
    expect(await inspect(pcm)).toEqual({ durationSeconds: 8 });
    const float = Buffer.from(pcm); float.writeUInt16LE(3, 20); float.writeUInt16LE(32, 34); float.writeUInt16LE(8, 32); float.writeUInt32LE(44100 * 8, 28);
    expect(await inspect(float)).toEqual({ durationSeconds: 4 });
    const chunk = Buffer.from('4a554e4b020000006f6b', 'hex');
    const tagged = Buffer.concat([pcm.subarray(0, 12), chunk, pcm.subarray(12)]); tagged.writeUInt32LE(tagged.length - 8, 4);
    expect(await inspect(tagged)).toEqual({ durationSeconds: 8 });
  });

  it('accepts a valid extensible PCM header and rejects an unknown subformat', async () => {
    const original = fixture();
    const chunk = Buffer.alloc(48); chunk.write('fmt '); chunk.writeUInt32LE(40, 4);
    original.copy(chunk, 8, 20, 36);
    chunk.writeUInt16LE(0xfffe, 8); chunk.writeUInt16LE(22, 24); chunk.writeUInt16LE(16, 26); chunk.writeUInt32LE(3, 28);
    Buffer.from('0100000000001000800000aa00389b71', 'hex').copy(chunk, 32);
    const extended = Buffer.concat([original.subarray(0, 12), chunk, original.subarray(36)]);
    extended.writeUInt32LE(extended.length - 8, 4);
    expect(await inspect(extended)).toEqual({ durationSeconds: 8 });
    extended[12 + 32 + 15] = 0;
    await expect(inspect(extended)).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
  });

  it('rejects truncated data, forged RIFF sizes, invalid alignment and unsupported codecs', async () => {
    const original = fixture();
    const forged = Buffer.from(original); forged.writeUInt32LE(original.length, 4);
    const alignment = Buffer.from(original); alignment.writeUInt16LE(1, 32);
    const codec = Buffer.from(original); codec.writeUInt16LE(6, 20);
    for (const invalid of [original.subarray(0, 80), forged, alignment, codec]) await expect(inspect(invalid)).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
  });

  it('requires the last odd chunk padding and rejects empty audio', async () => {
    const pcm = fixture();
    const odd = Buffer.concat([pcm, Buffer.from('4a554e4b0100000000', 'hex')]); odd.writeUInt32LE(odd.length - 8, 4);
    await expect(inspect(odd)).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
    const empty = pcm.subarray(0, 44); empty.writeUInt32LE(36, 4); empty.writeUInt32LE(0, 40);
    await expect(inspect(empty)).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
  });

  it('rejects symlinks and hardlinks instead of accepting an unrelated source file', async () => {
    const file = join(directory, 'source.wav'); writeFileSync(file, fixture());
    const link = join(directory, 'link.wav'); symlinkSync(file, link);
    await expect(inspectWav(link, fixture().length)).rejects.toThrow();
    const hardlink = join(directory, 'hard.wav'); linkSync(file, hardlink);
    await expect(inspectWav(hardlink, fixture().length)).rejects.toMatchObject({ code: 'INVALID_AUDIO' });
  });
});
