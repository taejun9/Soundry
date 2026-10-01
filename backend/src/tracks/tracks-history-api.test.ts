/**
 * 트랙 metadata 수정/삭제와 Generation 기반 프롬프트 이력의 일관성을 실제 HTTP·DB·파일로 검증한다.
 * 원본 byte와 snapshot 보존, transaction rollback, cleanupPending/restart 및 결과가 없는 이력도 함께 확인한다.
 */
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { request } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorResponse, DeleteResult, GenerationSettings, GenerationStatus, GenerationSummary, Page, PromptSummary, TrackDetail } from '../../../shared/contracts.js';
import { createApplication } from '../app.js';
import { REPOSITORY_ROOT, StorageConfig } from '../config/storage-config.js';
import { DatabaseService } from '../database/database.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { MockProvider } from '../providers/mock-provider.js';

type Result = { status: number; headers: IncomingHttpHeaders; bytes: Buffer };
let app: NestExpressApplication | undefined;
let database: DatabaseService;
let storage: StorageConfig;
let root: string;
let port: number;
let projectId: string;

// 동일 임시 루트를 재시작해 UI와 무관한 서버 영속성 계약을 검사한다.
async function start() {
  app = await createApplication({ dataDir: root, uiPort: '5173', musicProvider: 'mock', providerOverride: new MockProvider({ delayMs: 0 }) });
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
  database = app.get(DatabaseService); storage = app.get(StorageConfig);
}
// 다운로드는 Buffer로 받고 JSON 요청은 동일 helper를 사용해 원본 SHA와 API 응답을 비교할 수 있게 한다.
function raw(method: string, endpoint: string, body?: unknown): Promise<Result> {
  return new Promise((resolve, reject) => {
    const content = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port, path: `/api${endpoint}`, method, headers: {
      host: 'localhost:3000', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json',
      ...(content === undefined ? {} : { 'content-length': String(Buffer.byteLength(content)) }),
    } }, response => {
      const parts: Buffer[] = [];
      response.on('data', (part: Buffer) => parts.push(part));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, bytes: Buffer.concat(parts) }));
      response.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local fixture HTTP timeout')));
    req.on('error', reject); req.end(content);
  });
}
async function api<T>(method: string, endpoint: string, body?: unknown) {
  const response = await raw(method, endpoint, body);
  return { status: response.status, body: JSON.parse(response.bytes.toString('utf8')) as T };
}
function project() { return app!.get(ProjectsService).get(projectId); }
function audioPath(id: string): string {
  const row = database.client.prepare('SELECT audio_path AS path FROM tracks WHERE id=?').get(id) as { path: string };
  return join(root, row.path);
}
function generationRow(id: string) { return database.client.prepare('SELECT * FROM generations WHERE id=?').get(id); }
// 상태/시각/트랙 수를 제어하는 DB fixture로 페이지/삭제 경계를 만든다. 설정값과 실제 metadata를 일부러 다르게 둔다.
function seed(options: { owner?: string; createdAt?: string; status?: GenerationStatus; count?: number; settings?: GenerationSettings } = {}) {
  const id = randomUUID();
  const createdAt = options.createdAt ?? '2026-01-01T12:00:00.000Z';
  const status = options.status ?? 'completed';
  const count = options.count ?? 2;
  const settings = options.settings ?? { mode: 'instrumental', bpm: 93, durationSeconds: 120, seed: 'requested-only' };
  database.client.prepare('INSERT INTO generations (id, project_id, prompt, settings_json, provider, status, variation_count, request_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, options.owner ?? projectId, `검증용 원본 프롬프트 ${id}`, JSON.stringify(settings), 'mock', status, Math.max(1, count), randomUUID(), createdAt);
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const trackId = randomUUID(); ids.push(trackId);
    const path = `audio/${trackId}.wav`;
    const fixture = join(REPOSITORY_ROOT, 'backend/fixtures/audio/demo-01.wav');
    copyFileSync(fixture, join(root, path));
    database.client.prepare('INSERT INTO tracks (id, generation_id, variation_index, title, audio_path, mime_type, byte_size, duration_seconds, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(trackId, id, index, `검증용 음원 ${index + 1}`, path, 'audio/wav', readFileSync(fixture).length, 8, 'mock', createdAt);
  }
  return { id, ids, createdAt, settings, status };
}
// 이력 간 보존 검증에서는 실제 Mock job 저장 경로를 거쳐 서로 다른 Generation을 만든다.
async function generate(prompt: string, sourceGenerationId?: string) {
  const response = await api<GenerationSummary>('POST', `/projects/${projectId}/generations`, {
    prompt, settings: { mode: 'instrumental' }, variationCount: 2, requestKey: randomUUID(), ...(sourceGenerationId ? { sourceGenerationId } : {}),
  });
  expect(response.status).toBe(202);
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await api<GenerationSummary>('GET', `/generations/${response.body.id}`);
    if (result.body.status === 'completed') return result.body;
    if (result.body.status === 'failed') throw new Error('Fixture generation failed');
    await delay(10);
  }
  throw new Error('Fixture generation did not finish');
}

beforeEach(async () => {
  root = mkdtempSync('/private/tmp/soundry-history-api-');
  await start();
  projectId = app!.get(ProjectsService).create('음원과 프롬프트 이력').id;
});
afterEach(async () => { vi.restoreAllMocks(); await app?.close(); app = undefined; rmSync(root, { recursive: true, force: true }); });

// 표시 metadata만 바뀌고 원본 파일·다른 프로젝트·원래 요청은 유지되어야 한다.
describe('track detail, metadata and deletion HTTP API', () => {
  it('edits two generated results without changing audio bytes or source snapshots and preserves empty generation history across restart', async () => {
    const first = await generate('첫 번째 자체 데모');
    const second = await generate('두 번째 자체 데모', first.id);
    const snapshots = [generationRow(first.id), generationRow(second.id)];
    const target = first.tracks[0]!;
    const retained = second.tracks[0]!;
    const originalPath = audioPath(target.id);
    const originalHash = createHash('sha256').update(readFileSync(originalPath)).digest('hex');
    const other = app!.get(ProjectsService).create('다른 프로젝트');
    const beforeRead = project().updatedAt;
    const detail = await api<TrackDetail>('GET', `/tracks/${target.id.toUpperCase()}`);
    expect(detail).toEqual({ status: 200, body: { ...target, requestedSettings: first.settings, requestedVariationCount: 2 } });
    expect((await api<Page<PromptSummary>>('GET', `/projects/${projectId}/prompts`)).body.items).toHaveLength(2);
    expect(project().updatedAt).toBe(beforeRead);
    const updated = await api<TrackDetail>('PATCH', `/tracks/${target.id}`, { title: '  새로운 제목 🎵  ', favorite: true });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ ...detail.body, title: '새로운 제목 🎵', favorite: true });
    expect(project().updatedAt > beforeRead).toBe(true);
    expect(app!.get(ProjectsService).get(other.id)).toEqual(other);
    expect(audioPath(target.id)).toBe(originalPath);
    const download = await raw('GET', `/tracks/${target.id}/download`);
    expect(download.status).toBe(200);
    expect(createHash('sha256').update(download.bytes).digest('hex')).toBe(originalHash);
    expect(decodeURIComponent(download.headers['content-disposition']!.split("UTF-8''")[1]!)).toBe('새로운 제목 🎵.wav');
    const beforeFavorite = project().updatedAt;
    expect((await api<TrackDetail>('PATCH', `/tracks/${retained.id}`, { favorite: true })).body.favorite).toBe(true);
    expect(project().updatedAt > beforeFavorite).toBe(true);
    expect((await api<TrackDetail>('PATCH', `/tracks/${target.id}`, { favorite: false })).body.favorite).toBe(false);
    const history = (await api<GenerationSummary>('GET', `/generations/${first.id}`)).body;
    expect(history.tracks[0]).toMatchObject({ id: target.id, title: '새로운 제목 🎵', favorite: false });
    for (const track of first.tracks) {
      const path = audioPath(track.id); const beforeDelete = project().updatedAt;
      expect(await api<DeleteResult>('DELETE', `/tracks/${track.id}`)).toEqual({ status: 200, body: { deleted: true, cleanupPending: false } });
      expect(existsSync(path)).toBe(false);
      expect(project().updatedAt > beforeDelete).toBe(true);
      for (const suffix of ['', '/audio', '/download']) expect((await raw('GET', `/tracks/${track.id}${suffix}`)).status).toBe(404);
    }
    expect(project().trackCount).toBe(2);
    expect([generationRow(first.id), generationRow(second.id)]).toEqual(snapshots);
    expect((await api<GenerationSummary>('GET', `/generations/${first.id}`)).body).toMatchObject({ status: 'completed', variationCount: 2, tracks: [] });
    const prompts = (await api<Page<PromptSummary>>('GET', `/projects/${projectId}/prompts`)).body.items;
    expect(prompts.find(item => item.generationId === first.id)?.trackCount).toBe(0);
    expect(prompts.find(item => item.generationId === second.id)?.trackCount).toBe(2);
    expect(database.client.pragma('foreign_key_check')).toEqual([]);
    await app!.close(); app = undefined; await start();
    expect((await api<GenerationSummary>('GET', `/generations/${first.id}`)).body.tracks).toEqual([]);
    expect((await api<TrackDetail>('GET', `/tracks/${retained.id}`)).body.favorite).toBe(true);
    expect((await api<GenerationSummary>('GET', `/generations/${second.id}`)).body.sourceGenerationId).toBe(first.id);
  });

  it('returns requested settings separately from verified result metadata without leaking the stored audio path', async () => {
    const item = seed();
    const detail = await api<TrackDetail>('GET', `/tracks/${item.ids[0]}`);
    expect(detail.body).toMatchObject({ requestedSettings: item.settings, requestedVariationCount: 2, durationSeconds: 8, bpm: null, seed: null, favorite: false });
    expect(Object.keys(detail.body)).not.toContain('audioPath');
    expect(Object.keys(detail.body)).not.toContain('settingsJson');
    expect(JSON.stringify(detail.body)).not.toContain(root);
    unlinkSync(audioPath(item.ids[0]!));
    expect((await api<TrackDetail>('PATCH', `/tracks/${item.ids[0]}`, { title: '파일 없이도 이력 편집' })).status).toBe(200);
    expect((await api<DeleteResult>('DELETE', `/tracks/${item.ids[0]}`)).body.cleanupPending).toBe(false);
  });

  it('strictly rejects invalid patches and IDs without altering metadata or project timestamps', async () => {
    const item = seed(); const id = item.ids[0]!;
    const before = (await api<TrackDetail>('GET', `/tracks/${id}`)).body;
    const timestamp = project().updatedAt;
    for (const value of [null, [], {}, { title: null }, { title: '' }, { title: ' \t ' }, { title: 'a'.repeat(121) }, { title: 'bad\0title' }, { title: 2 }, { favorite: 'true' }, { favorite: 1 }, { favorite: null }, { title: 'valid', prompt: 'changed' }, { audioPath: '/private/synthetic-private-path' }]) {
      const response = await api<ApiErrorResponse>('PATCH', `/tracks/${id}`, value);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
      expect(JSON.stringify(response.body)).not.toContain('synthetic-private-path');
    }
    expect((await api<TrackDetail>('GET', `/tracks/${id}`)).body).toEqual(before);
    expect(project().updatedAt).toBe(timestamp);
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      expect((await raw(method, '/tracks/bad-id', method === 'PATCH' ? { favorite: true } : undefined)).status).toBe(400);
      expect((await raw(method, `/tracks/${randomUUID()}`, method === 'PATCH' ? { favorite: true } : undefined)).status).toBe(404);
    }
    expect((await api<TrackDetail>('PATCH', `/tracks/${id}`, { title: 'a'.repeat(120) })).body.title).toHaveLength(120);
  });

  // DB transaction 실패를 주입해 파일 삭제가 commit 이전에 실행되지 않는지 확인한다.
  it('rolls back metadata and deletion on transaction failure before touching the file', async () => {
    const item = seed(); const id = item.ids[0]!; const path = audioPath(id);
    const before = (await api<TrackDetail>('GET', `/tracks/${id}`)).body;
    const timestamp = project().updatedAt;
    const remove = vi.spyOn(storage, 'removeAudio');
    for (const method of ['PATCH', 'DELETE']) {
      vi.spyOn(database, 'touchProject').mockImplementationOnce(() => { throw new Error('/private/synthetic-internal-error'); });
      const response = await api<ApiErrorResponse>(method, `/tracks/${id}`, method === 'PATCH' ? { title: '실패한 변경' } : undefined);
      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('synthetic-internal-error');
      expect((await api<TrackDetail>('GET', `/tracks/${id}`)).body).toEqual(before);
      expect(existsSync(path)).toBe(true);
      expect(project().updatedAt).toBe(timestamp);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  // 파일 정리 실패를 정상 삭제 응답의 경고로 노출하고 다음 앱 시작에서 orphan을 정리하는 흐름을 검증한다.
  it('commits deletion before cleanup and reports failed cleanup, then removes its orphan after restart', async () => {
    const item = seed(); const id = item.ids[0]!; const path = audioPath(id);
    vi.spyOn(storage, 'removeAudio').mockImplementationOnce(() => {
      expect(database.client.prepare('SELECT id FROM tracks WHERE id=?').get(id)).toBeUndefined();
      expect(generationRow(item.id)).toBeDefined();
      return false;
    });
    expect(await api<DeleteResult>('DELETE', `/tracks/${id}`)).toEqual({ status: 200, body: { deleted: true, cleanupPending: true } });
    expect(existsSync(path)).toBe(true);
    expect((await api<TrackDetail>('GET', `/tracks/${id}`)).status).toBe(404);
    vi.restoreAllMocks();
    await app!.close(); app = undefined; await start();
    expect(existsSync(path)).toBe(false);
    expect((await api<GenerationSummary>('GET', `/generations/${item.id}`)).body.tracks).toHaveLength(1);
  });

  it('does not follow a replaced audio symlink when deleting a track', async () => {
    const item = seed(); const id = item.ids[0]!; const path = audioPath(id);
    const sentinel = join(root, 'outside-audio.wav'); copyFileSync(path, sentinel);
    const bytes = readFileSync(sentinel); unlinkSync(path); symlinkSync(sentinel, path);
    expect((await api<DeleteResult>('DELETE', `/tracks/${id}`)).body).toEqual({ deleted: true, cleanupPending: true });
    expect(readFileSync(sentinel).equals(bytes)).toBe(true);
    expect(project().trackCount).toBe(1);
  });
});

// 별도 prompt 저장본 없이 모든 Generation 상태를 조회한다. trackCount는 삭제 후 실제 잔여 수를 반영해야 한다.
describe('generation-based prompt history HTTP API', () => {
  it('paginates ties without losing any status, isolates projects and reports live counts without touching timestamps', async () => {
    const statuses: GenerationStatus[] = ['queued', 'processing', 'completed', 'failed', 'cancelled'];
    const items = statuses.map((status, index) => seed({ status, count: status === 'completed' ? 2 : 0, createdAt: index === 0 ? '2026-01-02T12:00:00.000Z' : undefined }));
    const other = app!.get(ProjectsService).create('분리된 프로젝트'); seed({ owner: other.id });
    const timestamp = project().updatedAt;
    const found: PromptSummary[] = []; let cursor: string | null = null;
    do {
      const result: { status: number; body: Page<PromptSummary> } = await api('GET', `/projects/${projectId}/prompts?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      expect(result.status).toBe(200); found.push(...result.body.items); cursor = result.body.nextCursor;
    } while (cursor);
    const ordered = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    expect(found.map(item => item.generationId)).toEqual(ordered.map(item => item.id));
    expect(found.map(item => item.status).sort()).toEqual([...statuses].sort());
    for (const item of found) {
      expect(item.trackCount).toBe(item.status === 'completed' ? 2 : 0);
      expect(item.settings).toEqual(items[0]!.settings);
      expect(Object.keys(item).sort()).toEqual(['createdAt', 'generationId', 'prompt', 'settings', 'status', 'trackCount', 'variationCount']);
    }
    expect(project().updatedAt).toBe(timestamp);
    const completed = items.find(item => item.status === 'completed')!;
    await api('DELETE', `/tracks/${completed.ids[0]}`);
    expect((await api<Page<PromptSummary>>('GET', `/projects/${projectId}/prompts`)).body.items.find(item => item.generationId === completed.id)?.trackCount).toBe(1);
    expect((await api<Page<PromptSummary>>('GET', `/projects/${other.id}/prompts`)).body.items).toHaveLength(1);
  });

  it('enforces default/max page sizes, validates cursors and distinguishes an empty project from a missing one', async () => {
    expect(await api('GET', `/projects/${projectId}/prompts`)).toEqual({ status: 200, body: { items: [], nextCursor: null } });
    for (let index = 0; index < 31; index++) seed({ count: 0 });
    const first = (await api<Page<PromptSummary>>('GET', `/projects/${projectId}/prompts`)).body;
    expect(first.items).toHaveLength(30); expect(first.nextCursor).not.toBeNull();
    expect((await api<Page<PromptSummary>>('GET', `/projects/${projectId}/prompts?limit=100`)).body.items).toHaveLength(31);
    for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=2&limit=3', 'cursor=bad', 'cursor=', 'status=completed', 'cursor=' + Buffer.from(JSON.stringify({ id: randomUUID(), createdAt: 'invalid-date' })).toString('base64url')]) {
      expect((await api('GET', `/projects/${projectId}/prompts?${query}`)).status).toBe(400);
    }
    expect((await api('GET', '/projects/not-a-uuid/prompts')).status).toBe(400);
    expect((await api('GET', `/projects/${randomUUID()}/prompts`)).status).toBe(404);
  });
});
