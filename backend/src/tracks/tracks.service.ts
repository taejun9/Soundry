/**
 * 트랙 metadata와 원본 파일 읽기 경계를 관리한다. 요청 설정은 Generation에서, 실제 결과 값은 Track에서 가져온다.
 * 이름/favorite 변경과 프로젝트 수정 시각은 함께 commit하며 음원 삭제 후에도 Generation snapshot은 보존한다.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { closeSync, constants, createReadStream, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { AppError } from '../api-errors.js';
import { StorageConfig } from '../config/storage-config.js';
import { DatabaseService } from '../database/database.service.js';
import { generations, projects, tracks } from '../database/schema.js';
import type { DeleteResult, GenerationSettings, LibraryTrackSummary, Page, TrackDetail, UpdateTrackRequest } from '../../../shared/contracts.js';
import { encodeTrackCursor } from './track-list.js';
import type { TrackListQuery } from './track-list.js';
import { trackId } from './track-input.js';
import { trackSummary } from './track-summary.js';
import { MAX_AUDIO_BYTES } from '../storage/storage.service.js';

// 검증된 FD를 controller에 캡슐화한다. stream으로 넘기거나 close하는 두 경로 중 하나가 정확히 한 번 소유권을 끝낸다.
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

  // 트랙과 원본 generation을 함께 조회해 API별로 provenance가 달라지는 것을 막는다.
  private find(id: string) {
    const row = this.database.db.select({ track: tracks, generation: generations }).from(tracks)
      .innerJoin(generations, eq(tracks.generationId, generations.id)).where(eq(tracks.id, id)).get();
    if (!row) throw new AppError(404, 'NOT_FOUND', '음원을 찾을 수 없습니다.');
    return row;
  }

  // favorite/project 필터를 cursor와 limit보다 먼저 적용한다. 한 개 더 조회해 다음 페이지 존재를 확인한다.
  list(query: TrackListQuery, memberId?: string): Page<LibraryTrackSummary> {
    const position = query.cursor
      ? or(lt(tracks.createdAt, query.cursor.createdAt), and(eq(tracks.createdAt, query.cursor.createdAt), lt(tracks.id, query.cursor.id)))
      : undefined;
    const rows = this.database.db.select({ track: tracks, generation: generations, projectName: projects.name }).from(tracks)
      .innerJoin(generations, eq(tracks.generationId, generations.id))
      .innerJoin(projects, eq(generations.projectId, projects.id))
      .where(and(
        query.favorite === undefined ? undefined : eq(tracks.favorite, query.favorite),
        query.projectId === undefined ? undefined : eq(generations.projectId, query.projectId),
        memberId ? eq(projects.memberId, memberId) : undefined,
        position,
      ))
      .orderBy(desc(tracks.createdAt), desc(tracks.id)).limit(query.limit + 1).all();
    const selected = rows.slice(0, query.limit);
    return {
      items: selected.map(({ track, generation, projectName }) => ({ ...trackSummary(track, generation), projectName })),
      nextCursor: rows.length > query.limit ? encodeTrackCursor(selected[selected.length - 1]!.track) : null,
    };
  }

  // 요청 snapshot을 별도 필드로 제공해 실제 음원 metadata와 혼동하지 않게 한다.
  get(id: string): TrackDetail {
    const { track, generation } = this.find(id);
    return { ...trackSummary(track, generation), requestedSettings: JSON.parse(generation.settingsJson) as GenerationSettings, requestedVariationCount: generation.variationCount };
  }

  // 표시 metadata만 변경한다. 제목을 바꾸어도 audioPath/원본 bytes는 바뀌지 않는다.
  update(id: string, input: UpdateTrackRequest): TrackDetail {
    return this.database.db.transaction(() => {
      const { generation } = this.find(id);
      this.database.db.update(tracks).set(input).where(eq(tracks.id, id)).run();
      this.database.touchProject(generation.projectId);
      return this.get(id);
    }, { behavior: 'immediate' });
  }

  // DB 참조를 먼저 제거한 후 파일을 정리한다. 파일 삭제가 실패해도 이력은 보존하고 cleanupPending으로 명시한다.
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

  // lstat → open → fstat → 경로 재검사의 identity 비교로 검사와 읽기 사이의 교체를 탐지한다.
  // 경로를 다시 열지 않고 검사한 FD를 stream에 넘겨 다운로드도 같은 파일을 읽도록 한다.
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
      // DB에 기록된 크기·MIME·확장자와 RIFF 헤더를 비교한다. 읽기마다 전체 오디오를 재분석하거나 메모리에 적재하지 않는다.
      const size = Number(file.size);
      if (!Number.isSafeInteger(size) || size < 44 || size > MAX_AUDIO_BYTES || size !== row.byteSize || row.mimeType !== 'audio/wav' || !row.audioPath.toLowerCase().endsWith('.wav')) throw changed();
      const header = Buffer.alloc(12);
      if (readSync(fd, header, 0, header.length, 0) !== header.length || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE' || header.readUInt32LE(4) + 8 !== size) throw changed();
      // 반환 객체에 소유권을 넘겼으므로 바깥 finally가 FD를 닫지 않게 한다. stream을 만들면 autoClose가 이후 책임을 갖는다.
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
