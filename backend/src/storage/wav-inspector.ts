import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { StorageError } from './storage.types.js';

async function readExact(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const bytes = Buffer.alloc(length);
  const result = await file.read(bytes, 0, length, position);
  if (result.bytesRead !== length) throw new StorageError('INVALID_AUDIO');
  return bytes;
}

/** Inspect bounded headers by offset, never load the whole recording into memory. */
export async function inspectWav(path: string, expectedBytes: number, signal?: AbortSignal, identity?: { dev: bigint; ino: bigint }): Promise<{ durationSeconds: number }> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat({ bigint: true });
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 44 || !stat.isFile() || stat.nlink !== 1n || stat.size !== BigInt(expectedBytes) || (identity && (identity.dev !== stat.dev || identity.ino !== stat.ino))) throw new StorageError('INVALID_AUDIO');
    const size = expectedBytes;
    const header = await readExact(file, 0, 12);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE' || header.readUInt32LE(4) + 8 !== size) throw new StorageError('INVALID_AUDIO');
    let offset = 12;
    let rate = 0;
    let alignment = 0;
    let dataBytes: number | undefined;
    let formatSeen = false;
    while (offset < size) {
      if (signal?.aborted) throw new DOMException('음악 저장이 취소되었습니다.', 'AbortError');
      if (offset + 8 > size) throw new StorageError('INVALID_AUDIO');
      const chunk = await readExact(file, offset, 8);
      const name = chunk.toString('ascii', 0, 4);
      const length = chunk.readUInt32LE(4);
      const start = offset + 8;
      const end = start + length + length % 2;
      if (end > size) throw new StorageError('INVALID_AUDIO');
      if (name === 'fmt ') {
        if (formatSeen || length < 16) throw new StorageError('INVALID_AUDIO');
        formatSeen = true;
        const fmt = await readExact(file, start, Math.min(length, 40));
        let format = fmt.readUInt16LE(0);
        const channels = fmt.readUInt16LE(2);
        rate = fmt.readUInt32LE(4);
        const byteRate = fmt.readUInt32LE(8);
        alignment = fmt.readUInt16LE(12);
        const bits = fmt.readUInt16LE(14);
        if (format === 0xfffe) {
          if (length < 40 || fmt.readUInt16LE(16) < 22 || fmt.readUInt16LE(16) + 18 > length) throw new StorageError('INVALID_AUDIO');
          const validBits = fmt.readUInt16LE(18);
          if (validBits < 1 || validBits > bits || fmt.subarray(28, 40).toString('hex') !== '00001000800000aa00389b71') throw new StorageError('INVALID_AUDIO');
          format = fmt.readUInt32LE(24);
        }
        if (!((format === 1 && [8, 16, 24, 32].includes(bits)) || (format === 3 && bits === 32))) throw new StorageError('INVALID_AUDIO');
        if (![1, 2].includes(channels) || rate < 8000 || rate > 192000 || alignment !== channels * bits / 8 || byteRate !== rate * alignment) throw new StorageError('INVALID_AUDIO');
      } else if (name === 'data') {
        if (dataBytes !== undefined || length === 0) throw new StorageError('INVALID_AUDIO');
        dataBytes = length;
      }
      offset = end;
    }
    if (!formatSeen || dataBytes === undefined || offset !== size || dataBytes % alignment !== 0) throw new StorageError('INVALID_AUDIO');
    return { durationSeconds: dataBytes / (rate * alignment) };
  } finally {
    await file.close();
  }
}
