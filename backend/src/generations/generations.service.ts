/**
 * 생성 요청의 영속 접수와 이력 조회를 담당한다. 실제 공급자 실행은 JobManager에 위임한다.
 * 요청 snapshot은 불변이며 같은 requestKey는 새 호출 없이 기존 작업으로 연결한다.
 */
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { GenerationSettings, GenerationSummary, Page, PromptSummary } from '../../../shared/contracts.js';
import { MembersService } from '../members/members.service.js';
import { AppError } from '../api-errors.js';
import { DatabaseService } from '../database/database.service.js';
import { generations, projects, tracks } from '../database/schema.js';
import { trackSummary } from '../tracks/track-summary.js';
import { ProviderService } from '../providers/provider.service.js';
import { canonicalSettings, encodeGenerationCursor, storedInputCapabilities, validateCreateGeneration } from './generation-request.js';
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
    @Inject(MembersService) private readonly members: MembersService,
  ) {}

  private projectExists(projectId: string): void {
    if (!this.database.db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()) throw new AppError(404, 'NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
  }

  // 여러 Generation의 트랙을 한 번 조회한 뒤 그룹에 배치한다. 실제 진행률을 모르면 null이며 단계는 실행 중에만 노출한다.
  private summaries(rows: GenerationRow[]): GenerationSummary[] {
    if (rows.length === 0) return [];
    const audio = this.database.db.select().from(tracks).where(inArray(tracks.generationId, rows.map((row) => row.id))).orderBy(tracks.variationIndex).all();
    return rows.map((row) => {
      const trackSummaries = audio.filter((track) => track.generationId === row.id).map((track) => trackSummary(track, row));
      return {
        id: row.id, projectId: row.projectId, prompt: row.prompt, settings: JSON.parse(row.settingsJson) as GenerationSettings,
        variationCount: row.variationCount, requestKey: row.requestKey, sourceGenerationId: row.sourceGenerationId,
        provider: row.provider, model: row.model, status: row.status, stage: row.status === 'processing' ? this.jobs.stage(row.id) : null,
        progress: null, errorCode: row.errorCode, errorMessage: row.errorMessage, createdAt: row.createdAt,
        startedAt: row.startedAt, finishedAt: row.finishedAt, tracks: trackSummaries,
      };
    });
  }

  // 단건/목록이 같은 DTO 변환을 사용해 내부 파일 경로나 임의 공급자 payload가 응답에 섞이지 않게 한다.
  get(id: string): GenerationSummary {
    const row = this.database.db.select().from(generations).where(eq(generations.id, id)).get();
    if (!row) throw new AppError(404, 'NOT_FOUND', '생성 작업을 찾을 수 없습니다.');
    return this.summaries([row])[0]!;
  }

  // 프로젝트 존재 확인 후 createdAt/ID 내림차순 경계로 탐색한다. limit+1은 다음 페이지 유무만 확인한다.
  list(projectId: string, limit: number, cursor?: GenerationCursor): Page<GenerationSummary> {
    this.projectExists(projectId);
    const position = cursor ? or(lt(generations.createdAt, cursor.createdAt), and(eq(generations.createdAt, cursor.createdAt), lt(generations.id, cursor.id))) : undefined;
    const rows = this.database.db.select().from(generations).where(and(eq(generations.projectId, projectId), position)).orderBy(desc(generations.createdAt), desc(generations.id)).limit(limit + 1).all();
    const selected = rows.slice(0, limit);
    return { items: this.summaries(selected), nextCursor: rows.length > limit ? encodeGenerationCursor(selected[selected.length - 1]!) : null };
  }

  // 성공·실패·취소 및 결과를 삭제한 작업도 이력에 남긴다. trackCount는 현재 결과 수를 계산한다.
  prompts(projectId: string, limit: number, cursor?: GenerationCursor): Page<PromptSummary> {
    this.projectExists(projectId);
    const position = cursor ? or(lt(generations.createdAt, cursor.createdAt), and(eq(generations.createdAt, cursor.createdAt), lt(generations.id, cursor.id))) : undefined;
    const rows = this.database.db.select({
      generation: generations,
      trackCount: sql<number>`(SELECT count(*) FROM tracks WHERE tracks.generation_id = generations.id)`.mapWith(Number),
    }).from(generations).where(and(eq(generations.projectId, projectId), position))
      .orderBy(desc(generations.createdAt), desc(generations.id)).limit(limit + 1).all();
    const selected = rows.slice(0, limit);
    return {
      items: selected.map(({ generation, trackCount }) => ({
        generationId: generation.id, prompt: generation.prompt, settings: JSON.parse(generation.settingsJson) as GenerationSettings,
        variationCount: generation.variationCount, status: generation.status, trackCount, createdAt: generation.createdAt,
      })),
      nextCursor: rows.length > limit ? encodeGenerationCursor(selected[selected.length - 1]!.generation) : null,
    };
  }

  // 기존 키 조회를 준비 상태/queue cap보다 먼저 수행해 네트워크 재전송이 새로운 유료 작업을 만들지 않게 한다.
  // 같은 키에 입력이 달라지면 409로 거부하고, 새 작업만 현재 공급자의 입력 제한을 검사한다.
  create(projectId: string, body: unknown, memberId?: string): CreateGenerationResult {
    const input = validateCreateGeneration(body, storedInputCapabilities);
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
      validateCreateGeneration(body, this.providers.current.capabilities);
      this.providers.validateInput(input);
      this.providers.assertConfigured();
      if (!this.jobs.accepting) throw new AppError(503, 'SERVER_STOPPING', '서버가 종료 중입니다. 다시 연결한 뒤 제출해 주세요.');
      // 원본 참조는 같은 프로젝트의 이력으로 한정한다. retry/regenerate는 원본 row를 수정하지 않는다.
      if (input.sourceGenerationId) {
        const source = this.database.db.select({ projectId: generations.projectId }).from(generations).where(eq(generations.id, input.sourceGenerationId)).get();
        if (!source || source.projectId !== projectId) throw new AppError(400, 'INVALID_INPUT', '같은 프로젝트의 생성 이력만 재사용할 수 있습니다.');
      }
      const active = this.database.db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(generations).where(inArray(generations.status, ['queued', 'processing'])).get()!.count;
      if (active >= MAX_ACTIVE_GENERATIONS) throw new AppError(429, 'QUEUE_FULL', '대기 중인 작업이 많습니다. 작업이 끝난 뒤 다시 제출해 주세요.');
      if (memberId) this.members.assertQuota(memberId, input.variationCount);
      const id = randomUUID();
      this.database.db.insert(generations).values({
        id, projectId, memberId: memberId ?? null, prompt: input.prompt, settingsJson, provider: this.providers.current.id,
        model: this.providers.summary().model, status: 'queued', variationCount: input.variationCount,
        requestKey: input.requestKey, sourceGenerationId: input.sourceGenerationId ?? null, createdAt: new Date().toISOString(),
      }).run();
      this.database.touchProject(projectId);
      return { id, created: true };
    }, { behavior: 'immediate' });
    // queued row의 commit이 끝난 뒤에만 메모리 queue에 넣는다. 응답 전에 중단되어도 다음 시작에서 복구 상태로 전환된다.
    if (result.created) this.jobs.enqueue(result.id);
    return { status: result.created ? 202 : 200, generation: this.get(result.id) };
  }

  // DB에 취소를 먼저 기록하고 나서 실행 중 signal을 중단한다. 완료 transaction과 선착순으로 하나의 최종 상태만 남는다.
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
