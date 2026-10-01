/**
 * 프로젝트 CRUD와 실제 트랙 수 집계를 담당한다. 목록/단건 조회는 같은 summary 컬럼을 사용한다.
 * DB 삭제와 파일 삭제가 한 transaction이 될 수 없으므로 먼저 참조를 지운 뒤 파일을 정리하고 보류 여부를 반환한다.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DeleteResult, Page, ProjectSummary } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { StorageConfig } from '../config/storage-config.js';
import { DatabaseService } from '../database/database.service.js';
import { generations, projects, tracks } from '../database/schema.js';
import { encodeCursor } from './project-input.js';
import type { ProjectCursor } from './project-input.js';

// COUNT를 실제 Generation 관계에서 계산해 별도 카운터와의 불일치를 피한다.
const summaryColumns = {
  id: projects.id, name: projects.name, createdAt: projects.createdAt, updatedAt: projects.updatedAt,
  trackCount: sql<number>`(SELECT count(*) FROM tracks INNER JOIN generations ON tracks.generation_id = generations.id WHERE generations.project_id = projects.id)`.mapWith(Number),
};

@Injectable()
export class ProjectsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(StorageConfig) private readonly storage: StorageConfig) {}

  // 정렬 키 쌍으로 다음 페이지를 찾고 한 개 더 조회해 nextCursor 필요 여부를 결정한다.
  list(limit: number, cursor?: ProjectCursor): Page<ProjectSummary> {
    const condition = cursor ? or(lt(projects.updatedAt, cursor.updatedAt), and(eq(projects.updatedAt, cursor.updatedAt), lt(projects.id, cursor.id))) : undefined;
    const rows = this.database.db.select(summaryColumns).from(projects).where(condition).orderBy(desc(projects.updatedAt), desc(projects.id)).limit(limit + 1).all();
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]!) : null };
  }

  // 형식이 유효해도 존재하지 않는 UUID는 404로 구분한다.
  get(id: string): ProjectSummary {
    const project = this.database.db.select(summaryColumns).from(projects).where(eq(projects.id, id)).get();
    if (!project) throw new AppError(404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
    return project;
  }

  // UUID는 표시 이름과 독립적이므로 동일 이름 프로젝트도 각각 별도 데이터가 된다.
  create(name: string): ProjectSummary {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.db.insert(projects).values({ id, name, createdAt: now, updatedAt: now }).run();
    return this.get(id);
  }

  // 이름과 수정 시각을 같은 transaction에서 바꿔 최신순 목록에 일관되게 나타나도록 한다.
  rename(id: string, name: string): ProjectSummary {
    return this.database.db.transaction(() => {
      this.get(id);
      this.database.db.update(projects).set({ name }).where(eq(projects.id, id)).run();
      this.database.touchProject(id);
      return this.get(id);
    });
  }

  // 진행 중 작업 검사와 cascade 삭제를 IMMEDIATE transaction으로 묶어 새 작업 접수와의 경쟁을 막는다.
  // commit 뒤에만 해당 프로젝트의 경로들을 정리하며 다른 프로젝트의 이력·파일은 보존한다.
  delete(id: string): DeleteResult {
    const paths = this.database.db.transaction(() => {
      this.get(id);
      const active = this.database.db.select({ id: generations.id }).from(generations).where(and(eq(generations.projectId, id), inArray(generations.status, ['queued', 'processing']))).limit(1).get();
      if (active) throw new AppError(409, 'PROJECT_BUSY', '생성 중인 작업을 취소한 뒤 프로젝트를 삭제해 주세요.');
      const audio = this.database.db.select({ path: tracks.audioPath }).from(tracks).innerJoin(generations, eq(tracks.generationId, generations.id)).where(eq(generations.projectId, id)).all();
      this.database.db.delete(projects).where(eq(projects.id, id)).run();
      return audio.map((track) => track.path);
    }, { behavior: 'immediate' });
    let cleanupPending = false;
    for (const path of paths) if (!this.storage.removeAudio(path)) cleanupPending = true;
    return { deleted: true, cleanupPending };
  }
}
