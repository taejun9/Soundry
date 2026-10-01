/**
 * 작업 queue의 상태 전이·취소 경쟁·atomic batch·재시작 복구를 제어 가능한 비동기 대역으로 검증한다.
 * 실제 SQLite transaction을 사용하되 필요한 테스트에서만 실제 storage를 연결해 실패 순서를 정확히 재현한다.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationInput, GenerationSummary } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { createApplication } from '../app.js';
import type { ApplicationOptions } from '../app.js';
import { DatabaseService } from '../database/database.service.js';
import { generations } from '../database/schema.js';
import { ProjectsService } from '../projects/projects.service.js';
import { MockProvider, mockCapabilities } from '../providers/mock-provider.js';
import type { MusicGenerationProvider, ProviderContext, ProviderTrack } from '../providers/music-generation-provider.js';
import { StorageError } from '../storage/storage.types.js';
import type { BatchStorage, StoredAudio } from '../storage/storage.types.js';
import { GenerationsService } from './generations.service.js';

// 테스트가 완료/실패 시점을 직접 선택한다. 우연한 timer 순서 대신 취소 전후의 경쟁 결과를 결정적으로 만든다.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
// queue 테스트용 stream placeholder다. WAV 유효성 검증은 실제 StorageService 테스트가 담당한다.
function source(): ProviderTrack {
  return { audio: { async *[Symbol.asyncIterator]() { yield Buffer.from('test source'); } }, mediaType: 'audio/wav', extension: 'wav', model: 'demo-fixture', metadata: { durationSeconds: 8 } };
}
function saved(): StoredAudio {
  const id = randomUUID();
  return { id, audioPath: `audio/${id}.wav`, mimeType: 'audio/wav', byteSize: 64, durationSeconds: 8, model: 'demo-fixture', metadata: {} };
}
// 저장 결과와 discard 호출을 관측하는 대역이다. 파일 복사를 생략해 상태/transaction 검증에 집중한다.
function fakeStorage(): BatchStorage & { saveBatch: ReturnType<typeof vi.fn<BatchStorage['saveBatch']>>; discardBatch: ReturnType<typeof vi.fn<BatchStorage['discardBatch']>> } {
  return {
    saveBatch: vi.fn(async (_id, sources) => sources.map(() => saved())),
    discardBatch: vi.fn(() => false),
  };
}
// 각 generate 호출과 context를 기록하고 외부에서 resolve/reject하여 FIFO 및 늦은 결과를 재현한다.
function controlledProvider() {
  const calls: { input: GenerationInput; context: ProviderContext; result: ReturnType<typeof deferred<readonly ProviderTrack[]>> }[] = [];
  const provider: MusicGenerationProvider = {
    id: 'mock', capabilities: mockCapabilities(),
    generate(input, context) {
      const result = deferred<readonly ProviderTrack[]>();
      calls.push({ input, context, result });
      context.onStage('generating');
      return result.promise;
    },
  };
  return { provider, calls };
}
const apps = new Set<NestExpressApplication>();
const roots: string[] = [];
// app별 임시 DB를 소유하고 필요한 provider/storage만 주입한다. 기본 data와 원격 작곡에 접근하지 않는다.
async function setup(options: Partial<ApplicationOptions> = {}) {
  const dataDir = options.dataDir ?? mkdtempSync('/private/tmp/soundry-jobs-');
  if (!options.dataDir) roots.push(dataDir);
  const storage = options.storageOverride ?? fakeStorage();
  const app = await createApplication({ dataDir, uiPort: '5173', musicProvider: 'mock', providerOverride: new MockProvider({ delayMs: 0 }), storageOverride: storage, ...options });
  apps.add(app);
  await app.init();
  const service = app.get(GenerationsService);
  const projects = app.get(ProjectsService);
  return { app, dataDir, storage, service, projects, database: app.get(DatabaseService) };
}
async function close(app: NestExpressApplication) { await app.close(); apps.delete(app); }
// 수락 조건을 짧게 재확인하되 제한 시간이 지나면 실패한다. 무한 대기나 임의 긴 sleep으로 통과를 가정하지 않는다.
async function until<T>(read: () => T, accepts: (value: T) => boolean, timeout = 2500): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = read();
    if (accepts(value)) return value;
    await delay(5);
  }
  throw new Error('Test condition did not settle');
}
function submit(service: GenerationsService, projectId: string, prompt = '테스트', requestKey = randomUUID(), variationCount = 1) {
  return service.create(projectId, { prompt, requestKey, settings: {}, variationCount });
}
function terminal(service: GenerationsService, id: string): Promise<GenerationSummary> {
  return until(() => service.get(id), (row) => !['queued', 'processing'].includes(row.status));
}
afterEach(async () => {
  for (const app of apps) await app.close();
  apps.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// 전역 직렬 실행, 20개 상한, 중복 키 우선 조회와 프로젝트 수정 시각의 실제 변경 시점을 확인한다.
describe('generation FIFO and immutable acceptance', () => {
  it('runs one job globally across projects in FIFO order and commits all tracks together', async () => {
    const controlled = controlledProvider();
    const { service, projects, storage } = await setup({ providerOverride: controlled.provider });
    const firstProject = projects.create('첫 번째');
    const secondProject = projects.create('두 번째');
    const rows = [submit(service, firstProject.id, 'first', randomUUID(), 2), submit(service, secondProject.id, 'second'), submit(service, firstProject.id, 'third')];
    await until(() => controlled.calls.length, (count) => count === 1);
    expect(rows.map((row) => service.get(row.generation.id).status)).toEqual(['processing', 'queued', 'queued']);
    expect(service.get(rows[0]!.generation.id).stage).toBe('generating');
    expect(service.get(rows[0]!.generation.id).tracks).toEqual([]);
    for (let index = 0; index < rows.length; index += 1) {
      await until(() => controlled.calls.length, (count) => count === index + 1);
      expect(controlled.calls[index]!.input.prompt).toBe(['first', 'second', 'third'][index]);
      controlled.calls[index]!.result.resolve(Array.from({ length: index === 0 ? 2 : 1 }, source));
      const completed = await terminal(service, rows[index]!.generation.id);
      expect(completed.status).toBe('completed');
      expect(completed.tracks).toHaveLength(index === 0 ? 2 : 1);
      expect(completed.stage).toBeNull();
      expect(completed.progress).toBeNull();
    }
    expect(storage.saveBatch).toHaveBeenCalledTimes(3);
    expect(projects.get(firstProject.id).trackCount).toBe(3);
    expect(projects.get(secondProject.id).trackCount).toBe(1);
  });

  it('enforces the global 20 active limit after duplicate lookup and releases a cancelled slot', async () => {
    const controlled = controlledProvider();
    const { service, projects } = await setup({ providerOverride: controlled.provider });
    const project = projects.create('상한 테스트');
    const key = randomUUID();
    const first = submit(service, project.id, 'first', key);
    const queued = Array.from({ length: 19 }, () => submit(service, project.id));
    expect(submit(service, project.id, ' first ', key)).toMatchObject({ status: 200, generation: { id: first.generation.id } });
    try { submit(service, project.id); throw new Error('Expected queue limit'); }
    catch (error) { expect(error).toBeInstanceOf(AppError); expect((error as AppError).publicCode).toBe('QUEUE_FULL'); expect((error as AppError).getStatus()).toBe(429); }
    service.cancel(queued[0]!.generation.id);
    expect(submit(service, project.id).status).toBe(202);
  });

  it('cancels queued work without invoking its provider and makes repeated cancellation idempotent', async () => {
    const controlled = controlledProvider();
    const { service, projects } = await setup({ providerOverride: controlled.provider });
    const project = projects.create('대기 취소');
    const first = submit(service, project.id);
    const second = submit(service, project.id);
    await until(() => controlled.calls.length, (count) => count === 1);
    const cancelled = service.cancel(second.generation.id);
    expect(cancelled).toMatchObject({ status: 'cancelled', startedAt: null, tracks: [] });
    expect(service.cancel(second.generation.id)).toEqual(cancelled);
    controlled.calls[0]!.result.resolve([source()]);
    await terminal(service, first.generation.id);
    await delay(20);
    expect(controlled.calls).toHaveLength(1);
  });

  it('touches the project for acceptance and completion, while GET/list leave it unchanged', async () => {
    const { service, projects } = await setup();
    const project = projects.create('갱신 시각');
    const submitted = submit(service, project.id);
    const acceptedAt = projects.get(project.id).updatedAt;
    expect(acceptedAt > project.updatedAt).toBe(true);
    await terminal(service, submitted.generation.id);
    const completedAt = projects.get(project.id).updatedAt;
    expect(completedAt > acceptedAt).toBe(true);
    service.get(submitted.generation.id);
    service.list(project.id, 30);
    expect(projects.get(project.id).updatedAt).toBe(completedAt);
  });
});

// 취소/timeout 이후 대역이 늦게 성공해도 새 트랙을 공개하거나 다음 작업을 막아서는 안 된다.
describe('generation cancel, timeout, and late result races', () => {
  it('records cancellation first and discards a provider success that arrives later', async () => {
    const controlled = controlledProvider();
    const storage = fakeStorage();
    const { service, projects } = await setup({ providerOverride: controlled.provider, storageOverride: storage });
    const row = submit(service, projects.create('실행 취소').id);
    await until(() => controlled.calls.length, (count) => count === 1);
    expect(service.cancel(row.generation.id).status).toBe('cancelled');
    expect(controlled.calls[0]!.context.signal.aborted).toBe(true);
    const closeSource = vi.fn(async () => ({ done: true as const, value: undefined }));
    controlled.calls[0]!.result.resolve([{ ...source(), audio: { [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true as const, value: undefined }), return: closeSource }) } }]);
    await until(() => closeSource.mock.calls.length, (count) => count === 1);
    expect(service.get(row.generation.id)).toMatchObject({ status: 'cancelled', tracks: [] });
    expect(storage.saveBatch).not.toHaveBeenCalled();
  });

  it('times out an uncooperative provider and continues the FIFO without waiting for its late result', async () => {
    const controlled = controlledProvider();
    const { service, projects } = await setup({ providerOverride: controlled.provider, generationTimeoutMs: 50 });
    const project = projects.create('시간 초과');
    const first = submit(service, project.id);
    const second = submit(service, project.id);
    const failed = await terminal(service, first.generation.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'GENERATION_TIMEOUT', tracks: [] });
    await until(() => controlled.calls.length, (count) => count === 2);
    controlled.calls[1]!.result.resolve([source()]);
    expect((await terminal(service, second.generation.id)).status).toBe('completed');
    controlled.calls[0]!.result.resolve([source()]);
    await delay(10);
    expect(service.get(first.generation.id).status).toBe('failed');
  });

  // saveBatch도 늦게 resolve할 수 있다. 이미 취소된 worker가 늦은 최종 파일 전체를 보상 삭제해야 한다.
  it('discards all final files returned by a save that finishes after cancellation', async () => {
    const storage = fakeStorage();
    const pending = deferred<StoredAudio[]>();
    storage.saveBatch.mockImplementation(() => pending.promise);
    const { service, projects } = await setup({ storageOverride: storage });
    const row = submit(service, projects.create('저장 중 취소').id, 'two', randomUUID(), 2);
    await until(() => storage.saveBatch.mock.calls.length, (count) => count === 1);
    expect(service.get(row.generation.id).stage).toBe('saving');
    service.cancel(row.generation.id);
    const late = [saved(), saved()];
    pending.resolve(late);
    await until(() => storage.discardBatch.mock.calls.length, (count) => count === 1);
    expect(storage.discardBatch).toHaveBeenCalledWith(late);
    expect(service.get(row.generation.id)).toMatchObject({ status: 'cancelled', tracks: [] });
  });

  // 경쟁의 반대 순서도 확인한다. 완료 commit이 먼저라면 뒤늦은 취소가 원본 파일을 지우면 안 된다.
  it('keeps a completed batch when completion commits before cancellation', async () => {
    const storage = fakeStorage();
    const { service, projects } = await setup({ storageOverride: storage });
    const row = submit(service, projects.create('완료 경합').id);
    const completed = await terminal(service, row.generation.id);
    expect(completed.status).toBe('completed');
    expect(service.cancel(row.generation.id)).toEqual(completed);
    expect(storage.discardBatch).not.toHaveBeenCalled();
  });

  it('applies the same timeout while consuming a stalled real storage stream', async () => {
    const stalled: MusicGenerationProvider = {
      id: 'mock', capabilities: mockCapabilities(),
      async generate() { return [{ ...source(), audio: { [Symbol.asyncIterator]() { return { next: () => new Promise<IteratorResult<Uint8Array>>(() => undefined) }; } } }]; },
    };
    const dataDir = mkdtempSync('/private/tmp/soundry-stalled-save-');
    roots.push(dataDir);
    const app = await createApplication({ dataDir, uiPort: '5173', musicProvider: 'mock', providerOverride: stalled, generationTimeoutMs: 100 });
    apps.add(app);
    await app.init();
    const service = app.get(GenerationsService);
    const row = submit(service, app.get(ProjectsService).create('stream timeout').id);
    const failed = await terminal(service, row.generation.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'GENERATION_TIMEOUT', tracks: [] });
    await until(() => readdirSync(`${dataDir}/temp`).length, (count) => count === 0);
    expect(readdirSync(`${dataDir}/audio`)).toEqual([]);
  });
});

// 한 variation 실패·DB 실패가 부분 트랙을 남기지 않고 후속 작업은 진행하는지 확인한다.
describe('atomic batches, safe failures, and recovery', () => {
  it('keeps provider errors private and allows a following job to complete', async () => {
    const controlled = controlledProvider();
    const { service, projects } = await setup({ providerOverride: controlled.provider });
    const project = projects.create('안전 오류');
    const first = submit(service, project.id);
    const second = submit(service, project.id);
    await until(() => controlled.calls.length, (count) => count === 1);
    controlled.calls[0]!.result.reject(new Error('/private/secret FAL_KEY=example https://example.test/private'));
    const failed = await terminal(service, first.generation.id);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'PROVIDER_FAILED', tracks: [] });
    expect(JSON.stringify(failed)).not.toMatch(/private|FAL_KEY|https:/);
    await until(() => controlled.calls.length, (count) => count === 2);
    controlled.calls[1]!.result.resolve([source()]);
    expect((await terminal(service, second.generation.id)).status).toBe('completed');
  });

  it('rejects a provider variation mismatch before storage and exposes no partial tracks', async () => {
    const provider: MusicGenerationProvider = { id: 'mock', capabilities: mockCapabilities(), async generate() { return [source(), source()]; } };
    const storage = fakeStorage();
    const { service, projects } = await setup({ providerOverride: provider, storageOverride: storage });
    const row = submit(service, projects.create('개수 오류').id);
    expect(await terminal(service, row.generation.id)).toMatchObject({ status: 'failed', errorCode: 'PROVIDER_FAILED', tracks: [] });
    expect(storage.saveBatch).not.toHaveBeenCalled();
  });

  it('records storage validation failures with no tracks', async () => {
    const storage = fakeStorage();
    storage.saveBatch.mockRejectedValue(new StorageError('INVALID_AUDIO'));
    const { service, projects } = await setup({ storageOverride: storage });
    const project = projects.create('파일 오류');
    const row = submit(service, project.id);
    expect(await terminal(service, row.generation.id)).toMatchObject({ status: 'failed', errorCode: 'INVALID_AUDIO', tracks: [] });
    expect(projects.get(project.id).trackCount).toBe(0);
  });

  // DB insert를 의도적으로 실패시켜 all-or-nothing transaction과 파일 보상 삭제가 함께 동작하는지 검사한다.
  it('rolls back the whole track transaction and discards the batch after a database insert failure', async () => {
    const storage = fakeStorage();
    const duplicate = saved();
    const batch = [duplicate, { ...duplicate }];
    storage.saveBatch.mockResolvedValue(batch);
    const { service, projects, database } = await setup({ storageOverride: storage });
    const project = projects.create('DB 보상');
    const row = submit(service, project.id, 'batch', randomUUID(), 2);
    expect(await terminal(service, row.generation.id)).toMatchObject({ status: 'failed', errorCode: 'STORAGE_FAILED', tracks: [] });
    expect(database.client.prepare('SELECT count(*) AS count FROM tracks').get()).toEqual({ count: 0 });
    expect(storage.discardBatch).toHaveBeenCalledExactlyOnceWith(batch);
    expect(projects.get(project.id).trackCount).toBe(0);
  });

  // worker 점유 자체가 실패해도 이미 202로 접수한 row를 영원히 queued로 두어서는 안 된다.
  it('fails a rejected database queue claim instead of leaving an accepted request queued forever', async () => {
    const { service, projects, database } = await setup();
    const project = projects.create('작업 점유 실패');
    const first = submit(service, project.id);
    database.client.exec(`CREATE TRIGGER reject_test_claim BEFORE UPDATE OF status ON generations WHEN NEW.id = '${first.generation.id}' AND NEW.status = 'processing' BEGIN SELECT RAISE(ABORT, 'synthetic claim failure'); END`);
    const second = submit(service, project.id);
    expect(await terminal(service, first.generation.id)).toMatchObject({ status: 'failed', errorCode: 'STORAGE_FAILED', tracks: [] });
    expect((await terminal(service, second.generation.id)).status).toBe('completed');
  });

  // 요청값과 실제 provider metadata를 다르게 두어 추정값 복사가 UI에서 확인된 사실처럼 보이는 회귀를 막는다.
  it('does not copy requested settings into actual track metadata', async () => {
    const provider: MusicGenerationProvider = { id: 'mock', capabilities: { ...mockCapabilities(), settings: ['bpm', 'genre'] }, async generate() { return [source()]; } };
    const { service, projects } = await setup({ providerOverride: provider });
    const row = service.create(projects.create('요청과 결과').id, { prompt: 'metadata', requestKey: randomUUID(), settings: { bpm: 120, genre: 'test genre' }, variationCount: 1 });
    const completed = await terminal(service, row.generation.id);
    expect(completed.settings).toEqual({ bpm: 120, genre: 'test genre' });
    expect(completed.tracks[0]).toMatchObject({ bpm: null, genre: null, mood: null, seed: null, durationSeconds: 8 });
  });

  it('rejects nonfinite actual metadata and discards the batch', async () => {
    const storage = fakeStorage();
    const invalid = { ...saved(), metadata: { bpm: NaN } };
    storage.saveBatch.mockResolvedValue([invalid]);
    const { service, projects } = await setup({ storageOverride: storage });
    const row = submit(service, projects.create('metadata validation').id);
    expect(await terminal(service, row.generation.id)).toMatchObject({ status: 'failed', errorCode: 'INVALID_AUDIO', tracks: [] });
    expect(storage.discardBatch).toHaveBeenCalledExactlyOnceWith([invalid]);
  });

  // 재시작 복구는 실패 마감이며 자동 provider 재호출이 아님을 호출 수로 검증한다.
  it('marks persisted queued/processing rows failed on restart without submitting them again', async () => {
    const initial = await setup();
    const project = initial.projects.create('재시작');
    const now = new Date().toISOString();
    const ids = ['queued', 'processing', 'completed', 'cancelled'].map((status) => {
      const id = randomUUID();
      initial.database.db.insert(generations).values({ id, projectId: project.id, prompt: status, settingsJson: '{}', provider: 'mock', status: status as GenerationSummary['status'], variationCount: 1, requestKey: randomUUID(), createdAt: now, startedAt: status === 'processing' ? now : null, finishedAt: ['completed', 'cancelled'].includes(status) ? now : null }).run();
      return id;
    });
    await close(initial.app);
    const controlled = controlledProvider();
    const restarted = await setup({ dataDir: initial.dataDir, providerOverride: controlled.provider });
    for (const id of ids.slice(0, 2)) expect(restarted.service.get(id)).toMatchObject({ status: 'failed', errorCode: 'SERVER_RESTARTED', tracks: [] });
    expect(restarted.service.get(ids[0]!).finishedAt).not.toBeNull();
    expect(restarted.service.get(ids[2]!).status).toBe('completed');
    expect(restarted.service.get(ids[3]!).status).toBe('cancelled');
    expect(restarted.projects.get(project.id).updatedAt > project.updatedAt).toBe(true);
    await delay(20);
    expect(controlled.calls).toHaveLength(0);
  });

  // DB가 닫힌 뒤 worker가 쓰기를 시도하지 않도록 종료 순서를 검사하고 남은 queued는 다음 시작에서 복구한다.
  it('aborts a hanging worker before the database closes and recovers queued work at next start', async () => {
    const controlled = controlledProvider();
    const initial = await setup({ providerOverride: controlled.provider });
    const project = initial.projects.create('종료 복구');
    const first = submit(initial.service, project.id);
    const second = submit(initial.service, project.id);
    await until(() => controlled.calls.length, (count) => count === 1);
    await close(initial.app);
    expect(controlled.calls[0]!.context.signal.aborted).toBe(true);
    expect(initial.database.client.open).toBe(false);
    const restarted = await setup({ dataDir: initial.dataDir });
    for (const id of [first.generation.id, second.generation.id]) expect(restarted.service.get(id)).toMatchObject({ status: 'failed', errorCode: 'SERVER_RESTARTED', tracks: [] });
  });
});
