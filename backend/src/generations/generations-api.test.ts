/**
 * HTTP 생성 접수부터 실제 Mock WAV 저장·조회·취소·재시작까지 검증한다.
 * 중복 요청 방지, immutable snapshot, project 경계, 페이지 탐색 및 안전한 오류 DTO를 확인하며 외부 AI는 호출하지 않는다.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorResponse, GenerationStatus, GenerationSummary, Page, ProjectSummary } from '../../../shared/contracts.js';
import { createApplication } from '../app.js';
import { REPOSITORY_ROOT } from '../config/storage-config.js';
import { DatabaseService } from '../database/database.service.js';
import { MockProvider } from '../providers/mock-provider.js';
import type { MusicGenerationProvider } from '../providers/music-generation-provider.js';

type Result<T> = { status: number; body: T };
let app: NestExpressApplication | undefined;
let database: DatabaseService;
let dataDir: string;
let port: number;

// 동일 dataDir로 다시 열 수 있는 실제 앱을 만들되 공급자는 지연 없는 Mock 또는 이 테스트의 대역만 쓴다.
async function start(provider: MusicGenerationProvider = new MockProvider({ delayMs: 0 })): Promise<void> {
  app = await createApplication({ dataDir, uiPort: '5173', musicProvider: 'mock', providerOverride: provider });
  await app.listen(0, '127.0.0.1');
  database = app.get(DatabaseService);
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
}

// JSON을 실제 loopback HTTP로 보내 요청 key·body·상태 코드와 controller 경계까지 함께 검증한다.
function api<T = unknown>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  return new Promise((resolve, reject) => {
    const content = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port, method, path: `/api${path}`, headers: {
      host: 'localhost:3000', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json',
      ...(content === undefined ? {} : { 'content-length': String(Buffer.byteLength(content)) }),
    } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { text += chunk; });
      response.on('end', () => {
        try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) as T }); }
        catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local test HTTP timeout')));
    req.on('error', reject);
    req.end(content);
  });
}

async function project(name = '생성 API 테스트'): Promise<ProjectSummary> {
  const result = await api<ProjectSummary>('POST', '/projects', { name });
  expect(result.status).toBe(201);
  return result.body;
}

async function create(projectId: string, body: Record<string, unknown> = {}): Promise<GenerationSummary> {
  const result = await api<GenerationSummary>('POST', `/projects/${projectId}/generations`, { requestKey: randomUUID(), prompt: '자체 제작 검증용 연주', ...body });
  expect(result.status).toBe(202);
  return result.body;
}

// 고정 sleep 뒤 성공을 가정하지 않고 상태를 유한 시간 polling한다. 다른 최종 상태에 도달하면 즉시 실패시킨다.
async function waitForStatus(id: string, status: GenerationStatus): Promise<GenerationSummary> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const result = await api<GenerationSummary>('GET', `/generations/${id}`);
    expect(result.status).toBe(200);
    if (result.body.status === status) return result.body;
    if (['completed', 'failed', 'cancelled'].includes(result.body.status) || Date.now() >= deadline) {
      throw new Error(`Expected ${status}, received ${result.body.status} (${result.body.errorCode ?? 'no error'})`);
    }
    await delay(15);
  }
}

// 페이지 정렬 검사용 row만 직접 삽입한다. 이 fixture의 존재를 실제 작곡 성공 근거로 사용하지 않는다.
function seedCompleted(projectId: string, createdAt: string): { id: string; createdAt: string } {
  const id = randomUUID();
  database.client.prepare('INSERT INTO generations (id, project_id, prompt, settings_json, provider, model, status, variation_count, request_key, created_at, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, projectId, '페이지 조회용 자체 테스트', '{}', 'mock', 'demo-fixture', 'completed', 1, randomUUID(), createdAt, createdAt, createdAt);
  return { id, createdAt };
}

beforeEach(() => { dataDir = mkdtempSync('/private/tmp/soundry-generations-api-'); });
afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('generation HTTP API', () => {
  // 순차 재전송뿐 아니라 동시에 같은 requestKey를 보내도 row/provider 실행은 하나여야 한다.
  it('accepts once and returns the same generation for sequential and concurrent identical request keys', async () => {
    const provider = new MockProvider({ delayMs: 20 });
    const generate = vi.spyOn(provider, 'generate');
    await start(provider);
    const owner = await project();
    const requestKey = randomUUID();
    const body = { requestKey: requestKey.toUpperCase(), prompt: '  조용한 테스트  ', settings: { mode: 'instrumental' }, variationCount: 2 };
    const accepted = await create(owner.id, body);
    expect(accepted).toMatchObject({ projectId: owner.id, requestKey, prompt: '조용한 테스트', status: 'queued', stage: null, progress: null, tracks: [] });
    const repeats = await Promise.all(Array.from({ length: 5 }, () => api<GenerationSummary>('POST', `/projects/${owner.id}/generations`, { ...body, requestKey, prompt: '조용한 테스트' })));
    for (const result of repeats) {
      expect(result.status).toBe(200);
      expect(result.body.id).toBe(accepted.id);
    }
    await waitForStatus(accepted.id, 'completed');
    expect(generate).toHaveBeenCalledTimes(1);
    const list = await api<Page<GenerationSummary>>('GET', `/projects/${owner.id}/generations`);
    expect(list.body.items.map((item) => item.id)).toEqual([accepted.id]);
    expect(database.client.prepare('SELECT count(*) AS total FROM generations').get()).toEqual({ total: 1 });
    expect(database.client.prepare('SELECT count(*) AS total FROM tracks').get()).toEqual({ total: 2 });
    const terminalRepeat = await api<GenerationSummary>('POST', `/projects/${owner.id}/generations`, body);
    expect(terminalRepeat.status).toBe(200);
    expect(terminalRepeat.body.status).toBe('completed');
  });

  // 키의 유일 범위가 project임을 확인하고 같은 project의 내용 변경은 충돌로 구분한다.
  it('rejects request-key content changes while allowing the same key in another project', async () => {
    await start();
    const first = await project('첫 프로젝트');
    const second = await project('다른 프로젝트');
    const requestKey = randomUUID();
    const original = await create(first.id, { requestKey, prompt: '첫 입력', variationCount: 2 });
    for (const difference of [{ prompt: '변경된 입력' }, { variationCount: 1 }, { settings: { mode: 'instrumental' } }, { sourceGenerationId: original.id }]) {
      const result = await api<ApiErrorResponse>('POST', `/projects/${first.id}/generations`, { requestKey, prompt: '첫 입력', variationCount: 2, ...difference });
      expect(result.status).toBe(409);
      expect(result.body.error.code).toBe('REQUEST_KEY_CONFLICT');
    }
    const other = await create(second.id, { requestKey, prompt: '다른 프로젝트의 입력', variationCount: 1 });
    expect(other.id).not.toBe(original.id);
    await waitForStatus(original.id, 'completed');
    await waitForStatus(other.id, 'completed');
    expect((await api<Page<GenerationSummary>>('GET', `/projects/${first.id}/generations`)).body.items.map((item) => item.id)).toEqual([original.id]);
    expect((await api<Page<GenerationSummary>>('GET', `/projects/${second.id}/generations`)).body.items.map((item) => item.id)).toEqual([other.id]);
  });

  it('distinguishes malformed IDs from absent records and rejects unknown musical/request fields', async () => {
    await start();
    const owner = await project();
    const valid = { requestKey: randomUUID(), prompt: '입력 검증' };
    for (const input of [null, [], {}, { ...valid, requestKey: 'bad' }, { ...valid, requestKey: undefined }, { ...valid, prompt: ' ' }, { ...valid, prompt: 'x'.repeat(4001) }, { ...valid, prompt: '음악\0' }, { ...valid, settings: { bpm: 90 } }, { ...valid, settings: { mode: 'vocal' } }, { ...valid, settings: { privatePath: dataDir } }, { ...valid, sourceGenerationId: null }, { ...valid, variationCount: 5 }, { ...valid, apiKey: 'synthetic-key-must-not-echo' }]) {
      const result = await api<ApiErrorResponse>('POST', `/projects/${owner.id}/generations`, input);
      expect(result.status).toBe(400);
      expect(Object.keys(result.body)).toEqual(['error']);
      expect(Object.keys(result.body.error).sort()).toEqual(['code', 'message']);
      expect(result.body.error.code).toBe('INVALID_INPUT');
      expect(JSON.stringify(result.body)).not.toContain(dataDir);
      expect(JSON.stringify(result.body)).not.toContain('synthetic-key-must-not-echo');
    }
    for (const badId of ['not-a-uuid', '..%2Fprivate']) {
      expect((await api('GET', `/projects/${badId}/generations`)).status).toBe(400);
      expect((await api('POST', `/projects/${badId}/generations`, valid)).status).toBe(400);
      expect((await api('GET', `/generations/${badId}`)).status).toBe(400);
      expect((await api('POST', `/generations/${badId}/cancel`, {})).status).toBe(400);
    }
    const absent = randomUUID();
    expect((await api('GET', `/projects/${absent}/generations`)).status).toBe(404);
    expect((await api('POST', `/projects/${absent}/generations`, valid)).status).toBe(404);
    expect((await api('GET', `/generations/${absent}`)).status).toBe(404);
    expect((await api('POST', `/generations/${absent}/cancel`, {})).status).toBe(404);
    expect((await api<Page<GenerationSummary>>('GET', `/projects/${owner.id}/generations`)).body.items).toEqual([]);
  });

  // 재시도는 새 row이며 원본을 수정하지 않아야 한다. 다른 project 원본을 참조하는 요청은 차단한다.
  it('accepts an explicit retry only with a source in the same project and preserves the original snapshot', async () => {
    await start();
    const owner = await project();
    const elsewhere = await project('별도 프로젝트');
    const source = await create(owner.id, { prompt: '원본 입력', settings: { mode: 'instrumental' }, variationCount: 1 });
    const original = await waitForStatus(source.id, 'completed');
    for (const [projectId, sourceGenerationId] of [[elsewhere.id, source.id], [owner.id, randomUUID()]]) {
      const result = await api<ApiErrorResponse>('POST', `/projects/${projectId}/generations`, { requestKey: randomUUID(), prompt: '재시도', sourceGenerationId });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('INVALID_INPUT');
    }
    const retry = await create(owner.id, { prompt: '수정한 입력', sourceGenerationId: source.id.toUpperCase(), variationCount: 2 });
    expect(retry.id).not.toBe(source.id);
    expect(retry.requestKey).not.toBe(source.requestKey);
    expect(retry.sourceGenerationId).toBe(source.id);
    await waitForStatus(retry.id, 'completed');
    expect((await api<GenerationSummary>('GET', `/generations/${source.id.toUpperCase()}`)).body).toEqual(original);
    expect((await api<ProjectSummary>('GET', `/projects/${owner.id}`)).body.trackCount).toBe(3);
    expect((await api<ProjectSummary>('GET', `/projects/${elsewhere.id}`)).body.trackCount).toBe(0);
  });

  it('paginates newest-first createdAt/UUID ties with default limits and project isolation', async () => {
    await start();
    const owner = await project();
    const elsewhere = await project('페이지 제외 프로젝트');
    const rows = Array.from({ length: 33 }, () => seedCompleted(owner.id, '2026-10-01T12:00:00.000Z'));
    rows.push(seedCompleted(owner.id, '2026-10-01T11:00:00.000Z'), seedCompleted(owner.id, '2026-10-01T13:00:00.000Z'));
    for (let index = 0; index < 3; index++) seedCompleted(elsewhere.id, '2026-10-01T12:00:00.000Z');
    const expected = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map((row) => row.id);
    const first = await api<Page<GenerationSummary>>('GET', `/projects/${owner.id}/generations`);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(30);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await api<Page<GenerationSummary>>('GET', `/projects/${owner.id}/generations?cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(5);
    expect(second.body.nextCursor).toBeNull();
    const all = [...first.body.items, ...second.body.items];
    expect(all.map((item) => item.id)).toEqual(expected);
    expect(new Set(all.map((item) => item.id)).size).toBe(35);
    expect(all.every((item) => item.projectId === owner.id)).toBe(true);
    expect((await api<Page<GenerationSummary>>('GET', `/projects/${owner.id}/generations?limit=100`)).body.items).toHaveLength(35);
    expect((await api<Page<GenerationSummary>>('GET', `/projects/${elsewhere.id}/generations?limit=1`)).body.items).toHaveLength(1);
  });

  it('rejects invalid list limits, repeated query fields, and noncanonical or expanded cursors', async () => {
    await start();
    const owner = await project();
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=1&limit=2', 'limit=abc', 'limit=', 'cursor=', 'cursor=abc', 'cursor=a&cursor=b', 'unexpected=true', `cursor=${'x'.repeat(513)}`]) {
      expect((await api('GET', `/projects/${owner.id}/generations?${query}`)).status).toBe(400);
    }
    for (const cursor of [{ id: randomUUID(), createdAt: 'yesterday' }, { id: randomUUID(), createdAt: '2026-10-01T00:00:00.000+00:00' }, { id: randomUUID(), createdAt: '2026-10-01T00:00:00.000Z', path: dataDir }]) {
      const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64url');
      expect((await api('GET', `/projects/${owner.id}/generations?cursor=${encoded}`)).status).toBe(400);
    }
  });

  // 완료 상태 외에도 실제 bytes와 SHA·파일 개수·DTO 공개 필드·재시작 후 상태를 확인한다.
  it('saves every actual mock variation, exposes only public DTO fields, and persists completion across restart', async () => {
    await start();
    const owner = await project();
    const accepted = await create(owner.id, { variationCount: 4 });
    const complete = await waitForStatus(accepted.id, 'completed');
    expect(complete).toMatchObject({ status: 'completed', stage: null, progress: null, errorCode: null, errorMessage: null, provider: 'mock', model: 'demo-fixture' });
    expect(complete.startedAt).toEqual(expect.any(String));
    expect(complete.finishedAt).toEqual(expect.any(String));
    expect(Object.keys(complete).sort()).toEqual(['id', 'projectId', 'prompt', 'settings', 'variationCount', 'requestKey', 'sourceGenerationId', 'provider', 'model', 'status', 'stage', 'progress', 'errorCode', 'errorMessage', 'createdAt', 'startedAt', 'finishedAt', 'tracks'].sort());
    const manifest = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'backend/fixtures/audio/manifest.json'), 'utf8')) as { files: { sha256: string }[] };
    expect(complete.tracks).toHaveLength(4);
    expect(new Set(complete.tracks.map((track) => track.id)).size).toBe(4);
    for (const [index, track] of complete.tracks.entries()) {
      expect(Object.keys(track).sort()).toEqual(['id', 'projectId', 'generationId', 'variationIndex', 'title', 'prompt', 'audioUrl', 'downloadUrl', 'mimeType', 'byteSize', 'durationSeconds', 'bpm', 'genre', 'mood', 'seed', 'provider', 'model', 'favorite', 'createdAt'].sort());
      expect(track).toMatchObject({ projectId: owner.id, generationId: complete.id, variationIndex: index, prompt: complete.prompt, durationSeconds: 8, mimeType: 'audio/wav', byteSize: 1_411_244, provider: 'mock', model: 'demo-fixture', favorite: false, bpm: null, genre: null, mood: null, seed: null });
      expect(track.audioUrl).toBe(`/api/tracks/${track.id}/audio`);
      expect(track.downloadUrl).toBe(`/api/tracks/${track.id}/download`);
      const bytes = readFileSync(join(dataDir, 'audio', `${track.id}.wav`));
      expect(bytes.length).toBe(track.byteSize);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.files[index % 2]!.sha256);
    }
    expect(JSON.stringify(complete)).not.toContain(dataDir);
    expect(JSON.stringify(complete)).not.toContain(REPOSITORY_ROOT);
    expect(readdirSync(join(dataDir, 'temp'))).toEqual([]);
    expect((await api<ProjectSummary>('GET', `/projects/${owner.id}`)).body.trackCount).toBe(4);
    expect((await api<ProjectSummary>('GET', `/projects/${owner.id}`)).body.updatedAt > owner.updatedAt).toBe(true);
    const cancelledTerminal = await api<GenerationSummary>('POST', `/generations/${complete.id}/cancel`, {});
    expect(cancelledTerminal).toEqual({ status: 200, body: complete });
    await app!.close();
    await start();
    expect((await api<GenerationSummary>('GET', `/generations/${complete.id}`)).body).toEqual(complete);
    expect((await api<Page<GenerationSummary>>('GET', `/projects/${owner.id}/generations`)).body.items).toEqual([complete]);
    expect((await api<ProjectSummary>('GET', `/projects/${owner.id}`)).body.trackCount).toBe(4);
    expect(readdirSync(join(dataDir, 'audio')).sort()).toEqual(complete.tracks.map((track) => `${track.id}.wav`).sort());
  });

  // 작업 중 삭제 충돌과 queued/processing 취소를 함께 재현해 사용자 경고와 멱등 최종 상태를 검증한다.
  it('blocks active project deletion, cancels queued/processing jobs idempotently, and keeps cancelled sources immutable', async () => {
    await start(new MockProvider({ delayMs: 5000 }));
    const owner = await project();
    const active = await create(owner.id, { prompt: '취소할 원본' });
    const processing = await waitForStatus(active.id, 'processing');
    expect(processing.stage).toBe('generating');
    expect(processing.progress).toBeNull();
    const queued = await create(owner.id, { prompt: '대기 중 취소' });
    expect(queued.status).toBe('queued');
    const deletion = await api<ApiErrorResponse>('DELETE', `/projects/${owner.id}`);
    expect(deletion.status).toBe(409);
    expect(deletion.body.error.code).toBe('PROJECT_BUSY');
    expect((await api('POST', `/generations/${active.id}/cancel`, { force: true })).status).toBe(400);
    expect((await api('POST', `/generations/${active.id}/cancel`, [])).status).toBe(400);
    expect((await api<GenerationSummary>('GET', `/generations/${active.id}`)).body.status).toBe('processing');
    for (const item of [queued, active]) {
      const cancelled = await api<GenerationSummary>('POST', `/generations/${item.id}/cancel`, {});
      expect(cancelled.status).toBe(200);
      expect(cancelled.body).toMatchObject({ id: item.id, status: 'cancelled', stage: null, progress: null, tracks: [], errorCode: null, errorMessage: null });
      expect(cancelled.body.finishedAt).toEqual(expect.any(String));
      expect(await api<GenerationSummary>('POST', `/generations/${item.id}/cancel`, {})).toEqual(cancelled);
    }
    const original = (await api<GenerationSummary>('GET', `/generations/${active.id}`)).body;
    const retry = await create(owner.id, { sourceGenerationId: active.id, prompt: '사용자가 새로 제출한 입력', variationCount: 1 });
    expect(retry.id).not.toBe(active.id);
    expect(retry.requestKey).not.toBe(active.requestKey);
    expect(retry.sourceGenerationId).toBe(active.id);
    expect((await api<GenerationSummary>('GET', `/generations/${active.id}`)).body).toEqual(original);
    await api('POST', `/generations/${retry.id}/cancel`, {});
    expect((await api<ProjectSummary>('GET', `/projects/${owner.id}`)).body.trackCount).toBe(0);
    expect((await api('DELETE', `/projects/${owner.id}`)).status).toBe(200);
    expect((await api('GET', `/generations/${active.id}`)).status).toBe(404);
    expect(readdirSync(join(dataDir, 'audio'))).toEqual([]);
  });

  // 대역이 임의 내부 오류를 던져도 provider 원문이 공개 DTO에 들어가지 않는지 확인한다.
  it('returns safe failed DTOs without reflecting provider exception details', async () => {
    const provider = new MockProvider();
    vi.spyOn(provider, 'generate').mockRejectedValue(new Error(`synthetic-secret-token https://private.example.test/output?key=synthetic ${dataDir}`));
    await start(provider);
    const owner = await project();
    const accepted = await create(owner.id);
    const failed = await waitForStatus(accepted.id, 'failed');
    expect(failed).toMatchObject({ status: 'failed', stage: null, progress: null, errorCode: 'PROVIDER_FAILED', tracks: [] });
    for (const privateText of ['synthetic-secret-token', 'private.example.test', dataDir]) expect(JSON.stringify(failed)).not.toContain(privateText);
    expect((await api<GenerationSummary>('POST', `/generations/${failed.id}/cancel`, {})).body).toEqual(failed);
    expect((await api<ProjectSummary>('GET', `/projects/${owner.id}`)).body.trackCount).toBe(0);
  });
});
