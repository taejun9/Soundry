import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { closeSync, constants, createReadStream, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { AppError } from '../api-errors.js';
import { StorageConfig } from '../config/storage-config.js';
import { DatabaseService } from '../database/database.service.js';
import { generations, tracks } from '../database/schema.js';
import type { DeleteResult, GenerationSettings, TrackDetail, UpdateTrackRequest } from '../../../shared/contracts.js';
import { trackId } from './track-input.js';
import { trackSummary } from './track-summary.js';
import { MAX_AUDIO_BYTES } from '../storage/storage.service.js';

export interface OpenedAudio {
  readonly size: number;
  readonly title: string;
  readonly mediaType: 'audio/wav';
  readonly extension: 'wav';
  /** Transfers ownership of the checked FD to the returned stream exactly once. */
  stream(start: number, end: number): ReadStream;
  /** Closes only an FD that has not been transferred to a stream. */
  close(): void;
}
function unavailable(): AppError { return new AppError(409, 'AUDIO_UNAVAILABLE', '원본 음원 파일을 안전하게 읽을 수 없습니다. 저장 폴더의 파일 상태를 확인해 주세요.'); }
function changed(): AppError { return new AppError(409, 'AUDIO_CHANGED', '원본 음원 파일이 변경되었거나 손상되었습니다. 저장 폴더의 파일 상태를 확인해 주세요.'); }

@Injectable()
export class TracksService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(StorageConfig) private readonly storage: StorageConfig) {}

  private find(id: string) {
    const row = this.database.db.select({ track: tracks, generation: generations }).from(tracks)
      .innerJoin(generations, eq(tracks.generationId, generations.id)).where(eq(tracks.id, id)).get();
    if (!row) throw new AppError(404, 'NOT_FOUND', '음원을 찾을 수 없습니다.');
    return row;
  }

  get(id: string): TrackDetail {
    const { track, generation } = this.find(id);
    return { ...trackSummary(track, generation), requestedSettings: JSON.parse(generation.settingsJson) as GenerationSettings, requestedVariationCount: generation.variationCount };
  }

  update(id: string, input: UpdateTrackRequest): TrackDetail {
    return this.database.db.transaction(() => {
      const { generation } = this.find(id);
      this.database.db.update(tracks).set(input).where(eq(tracks.id, id)).run();
      this.database.touchProject(generation.projectId);
      return this.get(id);
    }, { behavior: 'immediate' });
  }

  delete(id: string): DeleteResult {
    const path = this.database.db.transaction(() => {
      const { track, generation } = this.find(id);
      this.database.db.delete(tracks).where(eq(tracks.id, id)).run();
      this.database.touchProject(generation.projectId);
      return track.audioPath;
    }, { behavior: 'immediate' });
    // Generation snapshots and other tracks survive; file cleanup starts only after commit.
    return { deleted: true, cleanupPending: !this.storage.removeAudio(path) };
  }

  openAudio(value: string): OpenedAudio {
    const id = trackId(value);
    const row = this.database.db.select({ audioPath: tracks.audioPath, title: tracks.title, mimeType: tracks.mimeType, byteSize: tracks.byteSize }).from(tracks).where(eq(tracks.id, id)).get();
    if (!row) throw new AppError(404, 'NOT_FOUND', '음원을 찾을 수 없습니다.');
    let fd: number | undefined;
    try {
      const path = this.storage.resolveAudioPath(row.audioPath);
      const directory = lstatSync(this.storage.audioDirectory, { bigint: true });
      const before = lstatSync(path, { bigint: true });
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) throw unavailable();
      // O_NONBLOCK also prevents a raced-in FIFO/device from hanging this local server.
      fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const file = fstatSync(fd, { bigint: true });
      if (!file.isFile() || file.nlink !== 1n || file.dev !== before.dev || file.ino !== before.ino) throw unavailable();
      this.storage.assertSafe();
      const afterDirectory = lstatSync(this.storage.audioDirectory, { bigint: true });
      const after = lstatSync(path, { bigint: true });
      if (!afterDirectory.isDirectory() || afterDirectory.isSymbolicLink() || directory.dev !== afterDirectory.dev || directory.ino !== afterDirectory.ino ||
        !after.isFile() || after.isSymbolicLink() || after.nlink !== 1n || after.dev !== file.dev || after.ino !== file.ino) throw unavailable();
      const size = Number(file.size);
      if (!Number.isSafeInteger(size) || size < 44 || size > MAX_AUDIO_BYTES || size !== row.byteSize || row.mimeType !== 'audio/wav' || !row.audioPath.toLowerCase().endsWith('.wav')) throw changed();
      const header = Buffer.alloc(12);
      if (readSync(fd, header, 0, header.length, 0) !== header.length || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE' || header.readUInt32LE(4) + 8 !== size) throw changed();
      const checkedFd = fd;
      fd = undefined;
      let owned = true;
      return {
        size, title: row.title, mediaType: 'audio/wav', extension: 'wav',
        stream(start, end) {
          if (!owned) throw unavailable();
          const source = createReadStream('', { fd: checkedFd, autoClose: true, start, end, highWaterMark: 64 * 1024 });
          owned = false;
          return source;
        },
        close() { if (owned) { owned = false; closeSync(checkedFd); } },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new AppError(404, 'AUDIO_MISSING', '원본 음원 파일을 찾을 수 없습니다. 파일이 이동되거나 삭제되었는지 확인해 주세요.');
      throw unavailable();
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
}
