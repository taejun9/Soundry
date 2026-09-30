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

const summaryColumns = {
  id: projects.id, name: projects.name, createdAt: projects.createdAt, updatedAt: projects.updatedAt,
  trackCount: sql<number>`(SELECT count(*) FROM tracks INNER JOIN generations ON tracks.generation_id = generations.id WHERE generations.project_id = projects.id)`.mapWith(Number),
};

@Injectable()
export class ProjectsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(StorageConfig) private readonly storage: StorageConfig) {}

  list(limit: number, cursor?: ProjectCursor): Page<ProjectSummary> {
    const condition = cursor ? or(lt(projects.updatedAt, cursor.updatedAt), and(eq(projects.updatedAt, cursor.updatedAt), lt(projects.id, cursor.id))) : undefined;
    const rows = this.database.db.select(summaryColumns).from(projects).where(condition).orderBy(desc(projects.updatedAt), desc(projects.id)).limit(limit + 1).all();
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? encodeCursor(items[items.length - 1]!) : null };
  }

  get(id: string): ProjectSummary {
    const project = this.database.db.select(summaryColumns).from(projects).where(eq(projects.id, id)).get();
    if (!project) throw new AppError(404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
    return project;
  }

  create(name: string): ProjectSummary {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.db.insert(projects).values({ id, name, createdAt: now, updatedAt: now }).run();
    return this.get(id);
  }

  rename(id: string, name: string): ProjectSummary {
    return this.database.db.transaction(() => {
      this.get(id);
      this.database.db.update(projects).set({ name }).where(eq(projects.id, id)).run();
      this.database.touchProject(id);
      return this.get(id);
    });
  }

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
