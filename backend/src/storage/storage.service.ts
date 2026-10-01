import { ProviderError } from '../providers/provider-error.js';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { constants, lstatSync, renameSync, rmdirSync, unlinkSync } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { StorageConfig } from '../config/storage-config.js';
import type { ProviderTrack } from '../providers/music-generation-provider.js';
import { StorageError } from './storage.types.js';
import type { BatchStorage, StoredAudio } from './storage.types.js';
import { inspectWav } from './wav-inspector.js';

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
type Identity = { dev: bigint; ino: bigint };
type OwnedPart = Identity & { path: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('음악 저장이 취소되었습니다.', 'AbortError');
}

async function nextChunk(iterator: AsyncIterator<Uint8Array>, signal: AbortSignal): Promise<IteratorResult<Uint8Array>> {
  cancelled(signal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('음악 저장이 취소되었습니다.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => { cancelled(signal); return iterator.next(); }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

@Injectable()
export class StorageService implements BatchStorage {
  constructor(@Inject(StorageConfig) private readonly storage: StorageConfig) {}

  async saveBatch(generationId: string, sources: readonly ProviderTrack[], signal: AbortSignal): Promise<StoredAudio[]> {
    cancelled(signal);
    if (!uuid.test(generationId) || sources.length < 1 || sources.length > 4) throw new StorageError('INVALID_AUDIO');
    const directory = join(this.storage.tempDirectory, generationId.toLowerCase());
    const staged: { part: OwnedPart; track: StoredAudio }[] = [];
    const createdParts: OwnedPart[] = [];
    const moved: StoredAudio[] = [];
    let directoryIdentity: Identity | undefined;
    try {
      this.storage.assertSafe();
      await mkdir(directory, { mode: 0o700 });
      const directoryInfo = lstatSync(directory, { bigint: true });
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new StorageError('STORAGE_FAILED');
      directoryIdentity = { dev: directoryInfo.dev, ino: directoryInfo.ino };
      for (const source of sources) {
        cancelled(signal);
        if (source.mediaType !== 'audio/wav' || source.extension !== 'wav') throw new StorageError('INVALID_AUDIO');
        this.assertOwnedDirectory(directory, directoryIdentity);
        const id = randomUUID();
        const path = join(directory, `${id}.part`);
        const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        let part: OwnedPart;
        let bytes = 0;
        let emptyChunks = 0;
        let iterator: AsyncIterator<Uint8Array> | undefined;
        try {
          const fileInfo = await file.stat({ bigint: true });
          part = { path, dev: fileInfo.dev, ino: fileInfo.ino };
          createdParts.push(part);
          this.assertOwnedDirectory(directory, directoryIdentity);
          iterator = source.audio[Symbol.asyncIterator]();
          for (;;) {
            const result = await nextChunk(iterator, signal);
            if (result.done) break;
            cancelled(signal);
            const chunk = result.value;
            if (!(chunk instanceof Uint8Array)) throw new StorageError('INVALID_AUDIO');
            if (chunk.byteLength === 0) {
              if (++emptyChunks > 16) throw new StorageError('INVALID_AUDIO');
              continue;
            }
            emptyChunks = 0;
            bytes += chunk.byteLength;
            if (bytes > MAX_AUDIO_BYTES) throw new StorageError('AUDIO_TOO_LARGE');
            let written = 0;
            while (written < chunk.byteLength) {
              cancelled(signal);
              const result = await file.write(chunk, written, chunk.byteLength - written);
              if (result.bytesWritten === 0) throw new StorageError('STORAGE_FAILED');
              written += result.bytesWritten;
            }
          }
          cancelled(signal);
          await file.sync();
        } finally {
          // An uncooperative source cannot keep cancellation/file cleanup waiting forever.
          try { void Promise.resolve(iterator?.return?.()).catch(() => undefined); } catch { /* no owned resource in source */ }
          await file.close();
        }
        cancelled(signal);
        this.assertOwnedDirectory(directory, directoryIdentity);
        this.assertOwnedPart(part);
        const measured = await inspectWav(path, bytes, signal, part);
        const track: StoredAudio = {
          id, audioPath: `audio/${id}.wav`, mimeType: 'audio/wav', byteSize: bytes,
          durationSeconds: measured.durationSeconds, model: source.model,
          metadata: { ...source.metadata, durationSeconds: measured.durationSeconds },
        };
        staged.push({ part, track });
      }
      // Validation finishes for every variation before publishing any final file.
      for (const item of staged) {
        cancelled(signal);
        const target = this.storage.resolveAudioPath(item.track.audioPath);
        try { lstatSync(target); throw new StorageError('STORAGE_FAILED'); }
        catch (error) { if (!isMissing(error)) throw error; }
        this.assertOwnedDirectory(directory, directoryIdentity);
        this.assertOwnedPart(item.part);
        renameSync(item.part.path, target);
        moved.push(item.track);
      }
      cancelled(signal);
      return moved;
    } catch (error) {
      this.discardBatch(moved);
      if (signal.aborted) cancelled(signal);
      if (error instanceof StorageError || error instanceof ProviderError) throw error;
      throw new StorageError('STORAGE_FAILED');
    } finally {
      if (directoryIdentity) {
        try {
          this.assertOwnedDirectory(directory, directoryIdentity);
          for (const part of createdParts) {
            try {
              this.assertOwnedDirectory(directory, directoryIdentity);
              this.assertOwnedPart(part);
              unlinkSync(part.path);
            } catch (error) { if (!isMissing(error)) cleanupWarning(); }
          }
          this.assertOwnedDirectory(directory, directoryIdentity);
          rmdirSync(directory);
        } catch (error) { if (!isMissing(error)) cleanupWarning(); }
      }
    }
  }

  private assertOwnedDirectory(path: string, identity: Identity): void {
    this.storage.assertSafeTemp();
    const info = lstatSync(path, { bigint: true });
    if (!info.isDirectory() || info.isSymbolicLink() || info.dev !== identity.dev || info.ino !== identity.ino) throw new StorageError('STORAGE_FAILED');
  }

  private assertOwnedPart(part: OwnedPart): void {
    const info = lstatSync(part.path, { bigint: true });
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n || info.dev !== part.dev || info.ino !== part.ino) throw new StorageError('STORAGE_FAILED');
  }

  discardBatch(batch: readonly StoredAudio[]): boolean {
    let pending = false;
    for (const track of batch) if (!this.storage.removeAudio(track.audioPath)) pending = true;
    if (pending) cleanupWarning();
    return pending;
  }
}

function isMissing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }
function cleanupWarning(): void { console.warn('Soundry: 일부 임시 음원을 정리하지 못했습니다. 다음 시작 때 다시 정리합니다.'); }
