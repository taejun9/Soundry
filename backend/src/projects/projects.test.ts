/**
 * 프로젝트 HTTP CRUD와 실제 SQLite/파일 lifecycle을 함께 검증한다.
 * 재시작 보존, stable pagination, FK/UNIQUE, 진행 중 삭제 차단, cascade 범위와 안전한 파일 정리가 핵심이다.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApplication } from '../app.js';
import { DatabaseService } from '../database/database.service.js';
import { StorageConfig } from '../config/storage-config.js';
import type { DeleteResult, Page, ProjectSummary } from '../../../shared/contracts.js';

type Result<T> = { status: number; body: T };
let app: NestExpressApplication;
let database: DatabaseService;
let dataDir: string;
let port: number;

// 동일 임시 data 루트로 앱을 다시 시작할 수 있게 분리해 영속성을 검증한다.
async function start(): Promise<void> {
  app = await createApplication({ dataDir, uiPort: '5173' });
  await app.listen(0, '127.0.0.1');
  database = app.get(DatabaseService);
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
}

// 실제 HTTP 직렬화·로컬 헤더를 사용하므로 controller 입력 검증도 함께 통과해야 한다.
function api<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  return new Promise((resolve, reject) => {
    const content = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port, method, path: `/api${path}`, headers: {
      host: 'localhost:3000', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json',
      ...(content === undefined ? {} : { 'content-length': String(Buffer.byteLength(content)) }),
    } }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { text += chunk; });
      response.on('end', () => { try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) as T }); } catch (error) { reject(error); } });
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end(content);
  });
}

async function create(name = '테스트 프로젝트'): Promise<ProjectSummary> {
  const result = await api<ProjectSummary>('POST', '/projects', { name });
  expect(result.status).toBe(201);
  return result.body;
}

// 프로젝트 조회/삭제의 경계를 준비하는 직접 DB fixture다. 작곡 과정은 이 테스트의 검증 범위가 아니다.
function generation(projectId: string, status = 'completed', requestKey = randomUUID(), source: string | null = null): string {
  const id = randomUUID();
  database.client.prepare('INSERT INTO generations (id, project_id, prompt, settings_json, provider, status, variation_count, request_key, source_generation_id, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, projectId, '자체 제작 테스트', '{}', 'mock', status, 2, requestKey, source, new Date().toISOString(), status === 'completed' ? new Date().toISOString() : null);
  return id;
}

// 트랙 수와 삭제 경로를 독립적으로 조절해 다른 프로젝트 파일이 보호되는지 확인한다.
function track(generationId: string, variationIndex = 0, storedPath?: string): string {
  const id = randomUUID();
  const path = storedPath ?? `audio/${id}.wav`;
  database.client.prepare('INSERT INTO tracks (id, generation_id, variation_index, title, audio_path, mime_type, byte_size, provider, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, generationId, variationIndex, '임시 테스트', path, 'audio/wav', 4, 'mock', new Date().toISOString());
  if (storedPath === undefined) writeFileSync(join(dataDir, path), 'test');
  return path;
}

beforeEach(async () => {
  dataDir = mkdtempSync('/private/tmp/soundry-projects-');
  await start();
});

afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// 정상 CRUD뿐 아니라 DB와 파일시스템을 모두 검사해 응답만 성공하고 데이터가 어긋나는 경우를 잡는다.
describe('Projects API and SQLite lifecycle', () => {
  it('creates, trims, reads, renames, restarts, and deletes without losing persisted state', async () => {
    const project = await create('  서울의 밤  ');
    expect(project.name).toBe('서울의 밤');
    expect(project.trackCount).toBe(0);
    const unchanged = await api<ProjectSummary>('GET', `/projects/${project.id}`);
    expect(unchanged.body.updatedAt).toBe(project.updatedAt);
    const renamed = await api<ProjectSummary>('PATCH', `/projects/${project.id}`, { name: '새로운 이름' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.updatedAt > project.updatedAt).toBe(true);
    await app.close();
    await start();
    expect((await api<ProjectSummary>('GET', `/projects/${project.id}`)).body).toEqual(renamed.body);
    expect(database.client.prepare('SELECT count(*) AS total FROM __drizzle_migrations').get()).toEqual({ total: 3 });
    expect(await api<DeleteResult>('DELETE', `/projects/${project.id}`)).toEqual({ status: 200, body: { deleted: true, cleanupPending: false } });
    expect((await api('GET', `/projects/${project.id}`)).status).toBe(404);
  });

  it('rejects invalid names and unknown fields on create and rename', async () => {
    const project = await create();
    for (const body of [null, [], {}, { name: 1 }, { name: null }, { name: '' }, { name: '   ' }, { name: '\0' }, { name: '\0Music' }, { name: 'Music\0Garden' }, { name: 'x'.repeat(121) }, { name: 'ok', dataDir: '/private/path' }]) {
      expect((await api('POST', '/projects', body)).status).toBe(400);
      expect((await api('PATCH', `/projects/${project.id}`, body)).status).toBe(400);
    }
    expect((await api('GET', `/projects/${project.id}`)).body).toEqual(project);
  });

  // 이름의 SQL 문법은 바인딩된 데이터로 처리되어야 하며 중복 이름도 별도 UUID로 유지해야 한다.
  it('allows duplicate names and treats SQL text as plain data', async () => {
    const name = "'); DROP TABLE projects; --";
    const first = await create(name);
    const second = await create(name);
    expect(first.id).not.toBe(second.id);
    const result = await api<Page<ProjectSummary>>('GET', '/projects');
    expect(result.body.items).toHaveLength(2);
    expect(result.body.items.every((item) => item.name === name)).toBe(true);
  });

  it('distinguishes malformed IDs from absent UUIDs and conceals internal details', async () => {
    for (const id of ['not-a-uuid', '..%2Fsecret', '%2Fprivate%2Ftmp']) {
      const result = await api('GET', `/projects/${id}`);
      expect(result.status).toBe(400);
      expect(JSON.stringify(result.body)).not.toContain(dataDir);
    }
    expect((await api('GET', `/projects/${randomUUID()}`)).status).toBe(404);
    expect((await api('DELETE', `/projects/${randomUUID()}`)).status).toBe(404);
  });

  // 같은 timestamp를 의도적으로 만들어 ID tie-breaker 누락으로 생기는 중복/누락을 검출한다.
  it('paginates timestamp ties by ID without duplicates or missing rows', async () => {
    const expected: string[] = [];
    const timestamp = '2026-10-01T00:00:00.000Z';
    for (let index = 0; index < 35; index++) {
      const id = randomUUID(); expected.push(id);
      database.client.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, `프로젝트 ${index}`, timestamp, timestamp);
    }
    expected.sort().reverse();
    const page1 = await api<Page<ProjectSummary>>('GET', '/projects');
    expect(page1.body.items).toHaveLength(30);
    expect(page1.body.nextCursor).not.toBeNull();
    const page2 = await api<Page<ProjectSummary>>('GET', `/projects?cursor=${page1.body.nextCursor}`);
    expect(page2.body.items).toHaveLength(5);
    expect(page2.body.nextCursor).toBeNull();
    expect([...page1.body.items, ...page2.body.items].map((item) => item.id)).toEqual(expected);
    expect((await api<Page<ProjectSummary>>('GET', '/projects?limit=100')).body.items).toHaveLength(35);
  });

  it('rejects invalid limits and cursors instead of silently changing the request', async () => {
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=1&limit=2', 'limit=abc', 'limit=', 'cursor=', 'cursor=abc', 'cursor=%2F..', 'unexpected=true']) {
      expect((await api('GET', `/projects?${query}`)).status).toBe(400);
    }
    for (const cursor of [{ id: randomUUID(), updatedAt: 'yesterday' }, { id: 'x', updatedAt: new Date().toISOString() }, { id: randomUUID(), updatedAt: new Date().toISOString(), path: dataDir }]) {
      const encoded = Buffer.from(JSON.stringify(cursor)).toString('base64url');
      expect((await api('GET', `/projects?cursor=${encoded}`)).status).toBe(400);
    }
  });

  it('counts tracks across generations while isolating other projects', async () => {
    const first = await create('첫 프로젝트');
    const second = await create('두 번째 프로젝트');
    const gen1 = generation(first.id); const gen2 = generation(first.id);
    track(gen1, 0); track(gen1, 1); track(gen2, 0);
    track(generation(second.id));
    expect((await api<ProjectSummary>('GET', `/projects/${first.id}`)).body.trackCount).toBe(3);
    expect((await api<ProjectSummary>('GET', `/projects/${second.id}`)).body.trackCount).toBe(1);
    await api('PATCH', `/projects/${second.id}`, { name: '다른 이름' });
    expect((await api<ProjectSummary>('GET', `/projects/${first.id}`)).body.updatedAt).toBe(first.updatedAt);
  });

  it.each(['queued', 'processing'])('rejects deletion with a %s generation while preserving rows and files', async (status) => {
    const project = await create();
    generation(project.id, status);
    const path = track(generation(project.id));
    const result = await api<{ error: { code: string } }>('DELETE', `/projects/${project.id}`);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('PROJECT_BUSY');
    expect((await api<ProjectSummary>('GET', `/projects/${project.id}`)).body.trackCount).toBe(1);
    expect(existsSync(join(dataDir, path))).toBe(true);
  });

  it('cascades only the deleted project and removes only its audio files', async () => {
    const first = await create(); const second = await create();
    const firstPath = track(generation(first.id));
    const secondPath = track(generation(second.id));
    const result = await api<DeleteResult>('DELETE', `/projects/${first.id}`);
    expect(result.body.cleanupPending).toBe(false);
    expect(existsSync(join(dataDir, firstPath))).toBe(false);
    expect(readFileSync(join(dataDir, secondPath), 'utf8')).toBe('test');
    expect(database.client.prepare('SELECT count(*) AS total FROM generations').get()).toEqual({ total: 1 });
    expect(database.client.prepare('SELECT count(*) AS total FROM tracks').get()).toEqual({ total: 1 });
  });

  // DB 삭제는 commit하되 위험한 링크 삭제는 하지 않는 분리된 결과를 확인한다.
  it('reports cleanupPending while preserving a symlink target outside audio', async () => {
    const project = await create();
    const path = `audio/${randomUUID()}.wav`;
    const sentinel = join(dataDir, 'sentinel.txt');
    writeFileSync(sentinel, 'preserve me');
    symlinkSync(sentinel, join(dataDir, path));
    track(generation(project.id), 0, path);
    const result = await api<DeleteResult>('DELETE', `/projects/${project.id}`);
    expect(result.body).toEqual({ deleted: true, cleanupPending: true });
    expect(readFileSync(sentinel, 'utf8')).toBe('preserve me');
  });

  it('never follows traversal or encoded paths stored in invalid track metadata', async () => {
    const project = await create();
    const sentinel = join(dataDir, 'sentinel.txt');
    writeFileSync(sentinel, 'preserve me');
    const id = generation(project.id);
    track(id, 0, '../sentinel.txt');
    track(id, 1, 'audio/%2e%2e%2fsentinel.txt');
    expect((await api<DeleteResult>('DELETE', `/projects/${project.id}`)).body.cleanupPending).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('preserve me');
  });

  // 재시작 청소는 앱이 인식하는 미참조 파일에만 적용되고 사용자가 둔 임의 파일은 보존해야 한다.
  it('retries orphan cleanup on restart but preserves unrecognized files', async () => {
    const orphan = `audio/${randomUUID()}.wav`;
    writeFileSync(join(dataDir, orphan), 'temporary audio');
    writeFileSync(join(dataDir, 'audio', 'user-notes.txt'), 'preserve me');
    await app.close(); await start();
    expect(existsSync(join(dataDir, orphan))).toBe(false);
    expect(readFileSync(join(dataDir, 'audio', 'user-notes.txt'), 'utf8')).toBe('preserve me');
  });

  it('enables foreign keys, request-key uniqueness, cascades, and source SET NULL', async () => {
    expect(database.client.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(() => generation(randomUUID())).toThrow();
    const first = await create(); const second = await create();
    const requestKey = randomUUID();
    const source = generation(first.id, 'completed', requestKey);
    const child = generation(first.id, 'completed', randomUUID(), source);
    expect(() => generation(first.id, 'completed', requestKey)).toThrow();
    expect(() => generation(second.id, 'completed', requestKey)).not.toThrow();
    expect(() => track(randomUUID())).toThrow();
    track(source);
    expect(() => track(source)).toThrow();
    database.client.prepare('DELETE FROM generations WHERE id = ?').run(source);
    expect(database.client.prepare('SELECT source_generation_id FROM generations WHERE id = ?').get(child)).toEqual({ source_generation_id: null });
    expect(database.client.prepare('SELECT count(*) AS total FROM tracks').get()).toEqual({ total: 0 });
  });

  it('enforces status, variation count, favorite and audio-path constraints', async () => {
    const project = await create(); const gen = generation(project.id);
    expect(() => database.client.prepare('UPDATE generations SET status = ? WHERE id = ?').run('invented', gen)).toThrow();
    for (const count of [0, 5]) expect(() => database.client.prepare('UPDATE generations SET variation_count = ? WHERE id = ?').run(count, gen)).toThrow();
    const path = track(gen);
    expect(() => database.client.prepare('UPDATE tracks SET favorite = 2 WHERE generation_id = ?').run(gen)).toThrow();
    expect(() => track(generation(project.id), 0, path)).toThrow();
    expect(app.get(StorageConfig).root).toBe(dataDir);
  });
});
