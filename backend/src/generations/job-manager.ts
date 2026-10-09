/**
 * 동시 실행 1개의 메모리 FIFO worker다. DB가 상태의 기준이며 queue와 화면 단계는 일시적 상태다.
 * 공급자·저장·DB 사이의 비동기 경계에서 취소/시간초과/종료를 처리하고 모든 variation을 함께 공개한다.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { GenerationInput, GenerationStage } from '../../../shared/contracts.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { DatabaseService } from '../database/database.service.js';
import { generations, tracks } from '../database/schema.js';
import { ProviderError } from '../providers/provider-error.js';
import { CLI_GENERATION_TIMEOUT_MS } from '../providers/cli-provider.js';
import { ProviderService } from '../providers/provider.service.js';
import type { ProviderTrack } from '../providers/music-generation-provider.js';
import { StorageService } from '../storage/storage.service.js';
import { StorageError } from '../storage/storage.types.js';
import type { BatchStorage, StoredAudio } from '../storage/storage.types.js';

export const GENERATION_RUNTIME = Symbol('GENERATION_RUNTIME');
export interface GenerationRuntime { timeoutMs: number }
export const DEFAULT_GENERATION_TIMEOUT_MS = 30_000;
export const MAX_ACTIVE_GENERATIONS = 20;

type StopReason = 'cancelled' | 'timeout' | 'shutdown';
type ActiveJob = { id: string; controller: AbortController; reason?: StopReason };
const restartMessage = '서버가 종료되어 작업이 중단되었습니다. 입력을 확인한 뒤 다시 생성해 주세요.';

function abortError(): DOMException { return new DOMException('작업이 중단되었습니다.', 'AbortError'); }

/** Even an adapter that settles late cannot hold the local worker or publish its output. */
// signal을 무시하는 구현도 로컬 worker를 붙잡지 못하도록 결과와 취소를 경쟁시킨다.
// 늦게 성공한 결과는 전용 정리 함수로 넘겨 파일/stream이 공개되거나 남지 않게 한다.
function withCancellation<T>(pending: Promise<T>, signal: AbortSignal, discardLate: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => { if (!settled) { settled = true; signal.removeEventListener('abort', abort); reject(abortError()); } };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void pending.then((value) => {
      if (settled) {
        try { discardLate(value); } catch { console.warn('Soundry: 중단된 생성 결과를 정리하지 못했습니다.'); }
        return;
      }
      settled = true;
      signal.removeEventListener('abort', abort);
      resolve(value);
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}

// 공급자 결과도 외부 입력이다. DB commit 전에 모델과 실제 metadata의 타입·유한값·길이를 검사한다.
function validateMetadata(audio: StoredAudio): void {
  if (typeof audio.model !== 'string' || !audio.model.trim() || audio.model.length > 120 || audio.model.includes('\0')) throw new StorageError('INVALID_AUDIO');
  const { bpm, genre, mood, seed } = audio.metadata;
  if (bpm !== undefined && (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0)) throw new StorageError('INVALID_AUDIO');
  for (const [value, maximum] of [[genre, 80], [mood, 80], [seed, 120]] as const) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0'))) throw new StorageError('INVALID_AUDIO');
  }
}

// 소비하지 않는 오디오 iterator를 닫되 비협조적인 return()을 기다리지 않는다. 내부 오류 원문은 기록하지 않는다.
function releaseSources(sources: readonly ProviderTrack[]): void {
  for (const source of sources) {
    try {
      const closing = source.audio[Symbol.asyncIterator]().return?.();
      if (closing) void Promise.resolve(closing).catch(() => undefined);
    } catch { /* The result is discarded; adapter internals are never logged. */ }
  }
}

@Injectable()
export class JobManager implements OnModuleInit, OnModuleDestroy {
  private readonly queue: string[] = [];
  private readonly stages = new Map<string, GenerationStage>();
  private active?: ActiveJob;
  private running?: Promise<void>;
  private scheduled?: NodeJS.Immediate;
  private closing = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProviderService) private readonly providers: ProviderService,
    @Inject(StorageService) private readonly storage: BatchStorage,
    @Inject(GENERATION_RUNTIME) private readonly runtime: GenerationRuntime,
    @Inject(KnowledgeService) private readonly knowledge: KnowledgeService,
  ) {
    if (!Number.isFinite(runtime.timeoutMs) || runtime.timeoutMs < 1 || runtime.timeoutMs > CLI_GENERATION_TIMEOUT_MS) throw new Error('INVALID_GENERATION_TIMEOUT');
  }

  get accepting(): boolean { return !this.closing; }
  stage(id: string): GenerationStage | null { return this.stages.get(id) ?? null; }

  // 프로세스가 재시작되면 미완료 요청을 실패로 마감한다. 자동 재작곡이나 계정 한도 재사용은 하지 않는다.
  onModuleInit(): void {
    this.database.db.transaction(() => {
      const interrupted = this.database.db.select({ projectId: generations.projectId }).from(generations).where(inArray(generations.status, ['queued', 'processing'])).all();
      this.database.db.update(generations).set({ status: 'failed', errorCode: 'SERVER_RESTARTED', errorMessage: restartMessage, finishedAt: new Date().toISOString() }).where(inArray(generations.status, ['queued', 'processing'])).run();
      for (const projectId of new Set(interrupted.map((row) => row.projectId))) this.database.touchProject(projectId);
    }, { behavior: 'immediate' });
  }

  // 접수 service의 DB commit 이후 호출된다. 실제 시작은 다음 event-loop turn으로 미뤄 HTTP 응답을 막지 않는다.
  enqueue(id: string): void {
    this.queue.push(id);
    this.schedule();
  }

  // 아직 시작하지 않은 항목은 queue에서 제거한다. 실행 중이면 최초 중단 사유를 보존하고 signal을 전달한다.
  cancel(id: string): void {
    const queued = this.queue.indexOf(id);
    if (queued !== -1) this.queue.splice(queued, 1);
    if (this.active?.id === id) {
      this.active.reason ??= 'cancelled';
      this.active.controller.abort();
    }
  }

  // running/scheduled가 하나만 존재하도록 해 서로 다른 프로젝트도 전역 FIFO 순서로 처리한다.
  private schedule(): void {
    if (this.closing || this.running || this.scheduled || this.queue.length === 0) return;
    this.scheduled = setImmediate(() => {
      this.scheduled = undefined;
      if (this.closing || this.running) return;
      const id = this.queue.shift();
      if (!id) return;
      this.running = this.run(id).catch(() => {
        // A failed queue claim must not leave an accepted request stuck in queued.
        try { this.fail(id, 'STORAGE_FAILED', '작업을 저장하지 못했습니다. 저장 공간과 폴더 상태를 확인해 주세요.'); }
        catch { console.warn('Soundry: 생성 작업을 마무리하지 못했습니다. 서버 상태를 확인해 주세요.'); }
      }).finally(() => {
        this.running = undefined;
        this.schedule();
      });
    });
  }

  // queued/processing에만 조건부 UPDATE한다. 늦은 실패가 completed/cancelled 상태를 되돌릴 수 없다.
  private fail(id: string, code: string, message: string): void {
    this.database.db.transaction(() => {
      const row = this.database.db.select({ projectId: generations.projectId }).from(generations).where(eq(generations.id, id)).get();
      if (!row) return;
      const changed = this.database.db.update(generations).set({ status: 'failed', errorCode: code, errorMessage: message, finishedAt: new Date().toISOString() }).where(and(eq(generations.id, id), inArray(generations.status, ['queued', 'processing']))).run();
      if (changed.changes) this.database.touchProject(row.projectId);
    }, { behavior: 'immediate' });
  }

  // DB에 공개하지 못한 이번 batch의 파일만 보상 삭제한다. 실패한 정리는 다음 시작 복구 대상으로 남는다.
  private discard(batch: readonly StoredAudio[]): void {
    try {
      if (this.storage.discardBatch(batch)) console.warn('Soundry: 생성 중단 후 일부 임시 음원을 정리하지 못했습니다. 다음 시작 시 정리합니다.');
    } catch { console.warn('Soundry: 생성 중단 후 파일 정리가 필요합니다. 저장 폴더 상태를 확인해 주세요.'); }
  }

  // 짧은 transaction에서 queued를 processing으로 점유한 뒤 긴 공급자/파일 작업은 transaction 밖에서 실행한다.
  private async run(id: string): Promise<void> {
    const row = this.database.db.transaction(() => {
      const current = this.database.db.select().from(generations).where(and(eq(generations.id, id), eq(generations.status, 'queued'))).get();
      if (!current) return undefined;
      this.database.db.update(generations).set({ status: 'processing', startedAt: new Date().toISOString() }).where(and(eq(generations.id, id), eq(generations.status, 'queued'))).run();
      return current;
    }, { behavior: 'immediate' });
    if (!row) return;
    const active: ActiveJob = { id, controller: new AbortController() };
    this.active = active;
    this.stages.set(id, 'preparing');
    const signal = active.controller.signal;
    const timeout = setTimeout(() => { active.reason ??= 'timeout'; active.controller.abort(); }, this.runtime.timeoutMs);
    timeout.unref();
    let batch: StoredAudio[] | undefined;
    try {
      const input: GenerationInput = { prompt: row.prompt, settings: JSON.parse(row.settingsJson) as GenerationInput['settings'], variationCount: row.variationCount };
      const styleReference=this.providers.current.id==='llamacpp'&&row.sourceGenerationId?this.knowledge.styleReference(row.sourceGenerationId,row.projectId):undefined;
      const sources = await withCancellation(this.providers.current.generate(input, {
        signal,
        styleReference,
        onComposition: (index, score) => { if (!signal.aborted) this.knowledge.storeScore(id, index, score); },
        knowledge: this.knowledge.forGeneration(id, row.memberId, input, this.providers.current.id),
        onStage: (stage) => { if (!signal.aborted) this.stages.set(id, stage); },
      }), signal, releaseSources);
      if (sources.length !== row.variationCount) { releaseSources(sources); throw new Error('INVALID_PROVIDER_RESULT'); }
      if (signal.aborted) { releaseSources(sources); throw abortError(); }
      this.stages.set(id, 'saving');
      batch = await withCancellation(this.storage.saveBatch(id, sources, signal), signal, (lateBatch) => this.discard(lateBatch));
      if (batch.length !== row.variationCount) throw new StorageError('INVALID_AUDIO');
      for (const audio of batch) validateMetadata(audio);
      const stored = batch;
      // 모든 파일이 검증·이동된 뒤 트랙 INSERT와 completed 전이를 하나의 transaction으로 묶는다.
      // 그 사이 취소가 먼저 commit되었다면 결과를 공개하지 않고 finally에서 전체 batch를 정리한다.
      const committed = this.database.db.transaction(() => {
        const current = this.database.db.select({ status: generations.status }).from(generations).where(eq(generations.id, id)).get();
        if (signal.aborted || current?.status !== 'processing') return false;
        const finishedAt = new Date().toISOString();
        this.database.db.insert(tracks).values(stored.map((audio, variationIndex) => ({
          id: audio.id, generationId: id, variationIndex, title: `음원 ${variationIndex + 1}`,
          audioPath: audio.audioPath, mimeType: audio.mimeType, byteSize: audio.byteSize,
          durationSeconds: audio.durationSeconds, bpm: audio.metadata.bpm ?? null,
          genre: audio.metadata.genre ?? null, mood: audio.metadata.mood ?? null, seed: audio.metadata.seed ?? null,
          provider: row.provider, model: audio.model, favorite: false, createdAt: finishedAt,
        }))).run();
        this.database.db.update(generations).set({ status: 'completed', finishedAt, errorCode: null, errorMessage: null,...(styleReference?{model:stored[0]!.model}:{}) }).where(and(eq(generations.id, id), eq(generations.status, 'processing'))).run();
        this.database.touchProject(row.projectId);
        return true;
      }, { behavior: 'immediate' });
      // DB가 파일 참조를 소유하게 된 경우에만 보상 삭제 목록에서 제거한다.
      if (committed) batch = undefined;
    } catch (error) {
      if (active.reason === 'shutdown') this.fail(id, 'SERVER_RESTARTED', restartMessage);
      else if (active.reason === 'timeout') this.fail(id, 'GENERATION_TIMEOUT', '생성 시간이 초과되었습니다. 입력을 확인한 뒤 다시 생성해 주세요.');
      else if (active.reason !== 'cancelled' && error instanceof ProviderError) this.fail(id, error.code, error.message);
      else if (active.reason !== 'cancelled') {
        const code = error instanceof StorageError ? error.code : batch ? 'STORAGE_FAILED' : 'PROVIDER_FAILED';
        const message = code === 'INVALID_AUDIO' ? '생성된 음원을 검증하지 못했습니다. 다시 생성해 주세요.'
          : code === 'AUDIO_TOO_LARGE' ? '생성된 음원이 저장 용량 제한을 초과했습니다.'
            : code === 'STORAGE_FAILED' ? '음원을 저장하지 못했습니다. 저장 공간과 폴더 상태를 확인해 주세요.'
              : '음악을 생성하지 못했습니다. 입력을 확인한 뒤 다시 생성해 주세요.';
        this.fail(id, code, message);
      }
    } finally {
      clearTimeout(timeout);
      active.controller.abort();
      if (batch) this.discard(batch);
      this.stages.delete(id);
      if (this.active === active) this.active = undefined;
    }
  }

  // 신규 접수를 닫고 예약/대기 실행을 비운 뒤 현재 worker를 중단한다. 이 await가 끝나야 DB 종료 훅이 잠금을 해제한다.
  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    if (this.scheduled) clearImmediate(this.scheduled);
    this.scheduled = undefined;
    this.queue.length = 0;
    if (this.active) {
      this.active.reason ??= 'shutdown';
      this.active.controller.abort();
    }
    await this.running;
  }
}
