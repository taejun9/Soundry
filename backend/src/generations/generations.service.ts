import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { GenerationSettings, GenerationSummary, Page, TrackSummary } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { DatabaseService } from '../database/database.service.js';
import { generations, projects, tracks } from '../database/schema.js';
import { ProviderService } from '../providers/provider.service.js';
import { canonicalSettings, encodeGenerationCursor, validateCreateGeneration } from './generation-request.js';
import type { GenerationCursor } from './generation-request.js';
import { JobManager, MAX_ACTIVE_GENERATIONS } from './job-manager.js';

type GenerationRow = typeof generations.$inferSelect;
export interface CreateGenerationResult { status: 200 | 202; generation: GenerationSummary }

@Injectable()
export class GenerationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProviderService) private readonly providers: ProviderService,
    @Inject(JobManager) private readonly jobs: JobManager,
  ) {}

  private projectExists(projectId: string): void {
    if (!this.database.db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()) throw new AppError(404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
  }

  private summaries(rows: GenerationRow[]): GenerationSummary[] {
    if (rows.length === 0) return [];
    const audio = this.database.db.select().from(tracks).where(inArray(tracks.generationId, rows.map((row) => row.id))).orderBy(tracks.variationIndex).all();
    return rows.map((row) => {
      const trackSummaries: TrackSummary[] = audio.filter((track) => track.generationId === row.id).map((track) => ({
        id: track.id, projectId: row.projectId, generationId: row.id, variationIndex: track.variationIndex,
        title: track.title, prompt: row.prompt, audioUrl: `/api/tracks/${track.id}/audio`, downloadUrl: `/api/tracks/${track.id}/download`,
        mimeType: track.mimeType, byteSize: track.byteSize, durationSeconds: track.durationSeconds,
        bpm: track.bpm, genre: track.genre, mood: track.mood, seed: track.seed, provider: track.provider,
        model: track.model, favorite: track.favorite, createdAt: track.createdAt,
      }));
      return {
        id: row.id, projectId: row.projectId, prompt: row.prompt, settings: JSON.parse(row.settingsJson) as GenerationSettings,
        variationCount: row.variationCount, requestKey: row.requestKey, sourceGenerationId: row.sourceGenerationId,
        provider: row.provider, model: row.model, status: row.status, stage: row.status === 'processing' ? this.jobs.stage(row.id) : null,
        progress: null, errorCode: row.errorCode, errorMessage: row.errorMessage, createdAt: row.createdAt,
        startedAt: row.startedAt, finishedAt: row.finishedAt, tracks: trackSummaries,
      };
    });
  }

  get(id: string): GenerationSummary {
    const row = this.database.db.select().from(generations).where(eq(generations.id, id)).get();
    if (!row) throw new AppError(404, 'NOT_FOUND', '생성 작업을 찾을 수 없습니다.');
    return this.summaries([row])[0]!;
  }

  list(projectId: string, limit: number, cursor?: GenerationCursor): Page<GenerationSummary> {
    this.projectExists(projectId);
    const position = cursor ? or(lt(generations.createdAt, cursor.createdAt), and(eq(generations.createdAt, cursor.createdAt), lt(generations.id, cursor.id))) : undefined;
    const rows = this.database.db.select().from(generations).where(and(eq(generations.projectId, projectId), position)).orderBy(desc(generations.createdAt), desc(generations.id)).limit(limit + 1).all();
    const selected = rows.slice(0, limit);
    return { items: this.summaries(selected), nextCursor: rows.length > limit ? encodeGenerationCursor(selected[selected.length - 1]!) : null };
  }

  create(projectId: string, body: unknown): CreateGenerationResult {
    const input = validateCreateGeneration(body, this.providers.current.capabilities);
    const settingsJson = canonicalSettings(input.settings);
    const result = this.database.db.transaction(() => {
      this.projectExists(projectId);
      const existing = this.database.db.select().from(generations).where(and(eq(generations.projectId, projectId), eq(generations.requestKey, input.requestKey))).get();
      if (existing) {
        if (existing.prompt !== input.prompt || canonicalSettings(JSON.parse(existing.settingsJson) as GenerationSettings) !== settingsJson || existing.variationCount !== input.variationCount || existing.sourceGenerationId !== (input.sourceGenerationId ?? null)) {
          throw new AppError(409, 'REQUEST_KEY_CONFLICT', '같은 요청 ID에 다른 내용이 포함되어 있습니다. 새 작업으로 제출해 주세요.');
        }
        return { id: existing.id, created: false };
      }
      if (!this.jobs.accepting) throw new AppError(503, 'SERVER_STOPPING', '서버가 종료 중입니다. 다시 연결한 뒤 제출해 주세요.');
      if (input.sourceGenerationId) {
        const source = this.database.db.select({ projectId: generations.projectId }).from(generations).where(eq(generations.id, input.sourceGenerationId)).get();
        if (!source || source.projectId !== projectId) throw new AppError(400, 'INVALID_INPUT', '같은 프로젝트의 생성 이력만 재사용할 수 있습니다.');
      }
      const active = this.database.db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(generations).where(inArray(generations.status, ['queued', 'processing'])).get()!.count;
      if (active >= MAX_ACTIVE_GENERATIONS) throw new AppError(429, 'QUEUE_FULL', '대기 중인 작업이 많습니다. 작업이 끝난 뒤 다시 제출해 주세요.');
      const id = randomUUID();
      this.database.db.insert(generations).values({
        id, projectId, prompt: input.prompt, settingsJson, provider: this.providers.current.id,
        model: this.providers.summary().model, status: 'queued', variationCount: input.variationCount,
        requestKey: input.requestKey, sourceGenerationId: input.sourceGenerationId ?? null, createdAt: new Date().toISOString(),
      }).run();
      this.database.touchProject(projectId);
      return { id, created: true };
    }, { behavior: 'immediate' });
    if (result.created) this.jobs.enqueue(result.id);
    return { status: result.created ? 202 : 200, generation: this.get(result.id) };
  }

  cancel(id: string): GenerationSummary {
    this.database.db.transaction(() => {
      const row = this.database.db.select().from(generations).where(eq(generations.id, id)).get();
      if (!row) throw new AppError(404, 'NOT_FOUND', '생성 작업을 찾을 수 없습니다.');
      if (row.status !== 'queued' && row.status !== 'processing') return;
      this.database.db.update(generations).set({ status: 'cancelled', finishedAt: new Date().toISOString(), errorCode: null, errorMessage: null }).where(and(eq(generations.id, id), inArray(generations.status, ['queued', 'processing']))).run();
      this.database.touchProject(row.projectId);
    }, { behavior: 'immediate' });
    this.jobs.cancel(id);
    return this.get(id);
  }
}
