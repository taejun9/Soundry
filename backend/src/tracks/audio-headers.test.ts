import { describe, expect, it } from 'vitest';
import { audioDisposition, parseAudioRange } from './audio-headers.js';

describe('single byte ranges', () => {
  it.each([
    ['bytes=0-0', 0, 0], ['bytes=10-19', 10, 19], ['bytes=90-', 90, 99],
    ['bytes=-10', 90, 99], ['bytes=90-999', 90, 99], ['bytes=-100', 0, 99],
    [' BYTES=001-002 ', 1, 2], ['bytes=-999999999999999999999999', 0, 99],
    ['bytes=2-999999999999999999999999', 2, 99],
  ])('resolves %s without overflowing or escaping the file', (value, start, end) => {
    expect(parseAudioRange(value, 100)).toEqual({ kind: 'partial', start, end });
  });
  it.each(['bytes=100-', 'bytes=100-200', 'bytes=-0', 'bytes=999999999999999999999999-'])('rejects a valid outside range %s', (value) => {
    expect(parseAudioRange(value, 100)).toEqual({ kind: 'unsatisfiable' });
  });
  it.each([undefined, '', 'bytes=-', 'bytes=10-9', 'bytes=1.5-3', 'bytes=+1-3', 'bytes=0-1,3-4', 'items=1-2', 'bytes= 1-2', 'bytes=1 - 2', 'bytes=a-b', 'bytes=0-1\nextra'])('ignores unsupported or malformed range %s', (value) => {
    expect(parseAudioRange(value, 100)).toEqual({ kind: 'full' });
  });
});

describe('safe original download names', () => {
  it('uses the real extension and RFC extended UTF-8 filename for Korean/emoji', () => {
    const disposition = audioDisposition('새벽의 정원 🎵.mp3', true, 'wav');
    expect(disposition).toContain('attachment; filename="soundry-track.wav";');
    expect(decodeURIComponent(disposition.split("UTF-8''")[1]!)).toBe('새벽의 정원 🎵.wav');
    expect(audioDisposition('demo.wav', false, 'wav')).toBe('inline; filename="demo.wav"; filename*=UTF-8\'\'demo.wav');
  });
  it('removes header controls, path separators, invisible controls and lone surrogates', () => {
    const disposition = audioDisposition('../folder\\title\r\nHeader: value\0\u202e\ud800.wav', true, 'wav');
    const filename = decodeURIComponent(disposition.split("UTF-8''")[1]!);
    expect(filename).not.toMatch(/[\r\n\0/\\\u202e\ud800:]/u);
    expect(filename.startsWith('.')).toBe(false);
    expect(filename.endsWith('.wav')).toBe(true);
    expect(disposition).not.toMatch(/[\r\n]/);
  });
  it('encodes special attr characters, bounds UTF-8 bytes, and handles reserved/empty titles', () => {
    const encoded = audioDisposition("title!'()*", true, 'wav').split("UTF-8''")[1]!;
    expect(encoded).toBe('title%21%27%28%29-.wav'); // The Windows-reserved * is removed before header encoding.
    const long = decodeURIComponent(audioDisposition('🎵'.repeat(400), true, 'wav').split("UTF-8''")[1]!);
    expect(Buffer.byteLength(long)).toBeLessThanOrEqual(164);
    expect(long.endsWith('.wav')).toBe(true);
    expect(audioDisposition('CON', true, 'wav')).toContain('filename="soundry-CON.wav"');
    expect(audioDisposition('... ', true, 'wav')).toContain('filename="soundry-track.wav"');
  });
});
