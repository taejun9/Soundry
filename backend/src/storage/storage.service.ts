/**
 * 오디오 stream을 temp에 기록·검증하고 최종 UUID 파일로 이동하는 batch 저장소다.
 * 소유 파일/디렉터리의 device와 inode를 추적해 검사 중 파일 교체를 탐지하고, 실패/취소에는 이번 batch만 정리한다.
 */
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

// iterator.next가 영원히 대기해도 취소가 저장 루프를 풀어주도록 signal과 경쟁시킨다. 완료 후 listener를 제거한다.
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

  // job UUID와 결과 개수를 검증한 뒤 0700 전용 temp 폴더에만 새 파일을 만든다. 기존 작업 폴더를 덮어쓰지 않는다.
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
          // stream chunk의 byte 타입·빈 chunk 연속 수·총크기를 검증한다. 유효하지 않거나 끝없는 빈 stream은 거부한다.
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
            // 파일 write가 부분 쓰기를 반환할 수 있으므로 남은 byte를 반복 기록한다. 0byte 진행은 저장 실패로 처리한다.
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
        // 확장자나 provider 주장만 믿지 않고 닫힌 파일의 WAV 구조·실제 길이를 독립 검사한다.
        const measured = await inspectWav(path, bytes, signal, part);
        const track: StoredAudio = {
          id, audioPath: `audio/${id}.wav`, mimeType: 'audio/wav', byteSize: bytes,
          durationSeconds: measured.durationSeconds, model: source.model,
          metadata: { ...source.metadata, durationSeconds: measured.durationSeconds },
        };
        staged.push({ part, track });
      }
      // Validation finishes for every variation before publishing any final file.
      // 모든 variation 검사가 끝난 후에만 최종 경로로 이동한다. 중간 이동 실패는 moved 목록을 보상 삭제한다.
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
      // cleanup도 생성 당시 inode의 파일만 지운다. 교체된 경로나 링크는 건드리지 않고 다음 복구 필요를 안내한다.
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

  // 상위 temp 안전성과 생성 당시 디렉터리 identity를 함께 확인해 이름만 같은 다른 폴더를 소유했다고 보지 않는다.
  private assertOwnedDirectory(path: string, identity: Identity): void {
    this.storage.assertSafeTemp();
    const info = lstatSync(path, { bigint: true });
    if (!info.isDirectory() || info.isSymbolicLink() || info.dev !== identity.dev || info.ino !== identity.ino) throw new StorageError('STORAGE_FAILED');
  }

  // 일반 파일·단일 링크·동일 device/inode 조건이 모두 맞아야 검사/rename/unlink 대상으로 다룬다.
  private assertOwnedPart(part: OwnedPart): void {
    const info = lstatSync(part.path, { bigint: true });
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n || info.dev !== part.dev || info.ino !== part.ino) throw new StorageError('STORAGE_FAILED');
  }

  // DB commit 실패나 늦은 취소 결과에서 호출한다. true는 삭제 성공이 아니라 후속 정리가 남았다는 뜻이다.
  discardBatch(batch: readonly StoredAudio[]): boolean {
    let pending = false;
    for (const track of batch) if (!this.storage.removeAudio(track.audioPath)) pending = true;
    if (pending) cleanupWarning();
    return pending;
  }
}

function isMissing(error: unknown): boolean { return error instanceof Error && 'code' in error && error.code === 'ENOENT'; }
function cleanupWarning(): void { console.warn('Soundry: 일부 임시 음원을 정리하지 못했습니다. 다음 시작 때 다시 정리합니다.'); }
