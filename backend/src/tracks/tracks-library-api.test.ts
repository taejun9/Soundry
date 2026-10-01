/**
 * 프로젝트를 가로지르는 Library 목록과 즐겨찾기 lifecycle을 검증한다.
 * 필터 적용 순서·timestamp tie·cursor anchor 삭제·수정/삭제/재시작과 공개 DTO의 실제 metadata를 확인한다.
 */
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ApiErrorResponse, LibraryTrackSummary, Page, ProjectSummary, TrackDetail } from '../../../shared/contracts.js';
import { createApplication } from '../app.js';
import { REPOSITORY_ROOT } from '../config/storage-config.js';
import { DatabaseService } from '../database/database.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { encodeTrackCursor } from './track-list.js';

let app: NestExpressApplication | undefined;
let root: string;
let port: number;
let database: DatabaseService;
let projectA: ProjectSummary;
let projectB: ProjectSummary;
// 임시 SQLite와 임의 loopback 포트로 독립 서버를 시작해 사용자 프로젝트를 건드리지 않는다.
async function start() {
  app = await createApplication({ dataDir: root, uiPort: '5173', musicProvider: 'mock' });
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
  database = app.get(DatabaseService);
}
async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const content = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port, method, path: `/api${path}`, headers: {
      host: 'localhost:3000', origin: 'http://127.0.0.1:5173', 'content-type': 'application/json',
      ...(content === undefined ? {} : { 'content-length': String(Buffer.byteLength(content)) }),
    } }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        try { resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) as T }); }
        catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local Library HTTP timeout')));
    req.on('error', reject); req.end(content);
  });
}
// 대부분 목록 검증은 row만 필요하다. 삭제/재시작 사례에만 실제 자체 WAV를 복사해 불필요한 파일 생성을 줄인다.
// 요청 seed와 합성 내부 오류 문자열을 넣어 공개 DTO가 이를 누출하지 않는지 확인한다.
function seed(owner: string, favorite = false, createdAt = '2026-10-01T00:00:00.000Z', withAudio = false) {
  const generationId = randomUUID();
  const id = randomUUID();
  const audioPath = `audio/${id}.wav`;
  database.client.prepare('INSERT INTO generations (id, project_id, prompt, settings_json, provider, model, status, variation_count, request_key, created_at, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(generationId, owner, '자체 목록 검증용 프롬프트', '{"bpm":123,"seed":"private-requested-only"}', 'mock', 'demo-fixture', 'completed', 1, randomUUID(), createdAt, 'https://private.invalid/?token=synthetic');
  database.client.prepare('INSERT INTO tracks (id, generation_id, variation_index, title, audio_path, mime_type, byte_size, duration_seconds, provider, model, favorite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, generationId, 0, `목록 검증용 음원 ${id}`, audioPath, 'audio/wav', 1411244, 8, 'mock', 'demo-fixture', favorite ? 1 : 0, createdAt);
  if (withAudio) copyFileSync(join(REPOSITORY_ROOT, 'backend/fixtures/audio/demo-01.wav'), join(root, audioPath));
  return { id, generationId, projectId: owner, favorite, createdAt, audioPath };
}
// 목록 요청은 항상 성공 상태를 확인한 뒤 page를 반환해 잘못된 오류 body가 빈 목록처럼 취급되지 않게 한다.
async function list(query = '') {
  const response = await api<Page<LibraryTrackSummary>>('GET', `/tracks${query ? '?' + query : ''}`);
  expect(response.status).toBe(200);
  return response.body;
}
beforeEach(async () => {
  root = mkdtempSync('/private/tmp/soundry-library-api-');
  await start();
  projectA = app!.get(ProjectsService).create('첫 번째 프로젝트');
  projectB = app!.get(ProjectsService).create('두 번째 프로젝트');
});
afterEach(async () => { await app?.close(); app = undefined; rmSync(root, { recursive: true, force: true }); });

describe('Library HTTP list and favorite lifecycle', () => {
  it('returns an empty collection for no tracks or a valid absent project filter', async () => {
    expect(await list()).toEqual({ items: [], nextCursor: null });
    seed(projectA.id, true);
    expect(await list(`projectId=${randomUUID()}&favorite=true`)).toEqual({ items: [], nextCursor: null });
  });

  it('paginates globally by immutable createdAt/id, including tied dates from different projects', async () => {
    const rows = Array.from({ length: 42 }, (_, i) => seed(i % 2 ? projectA.id : projectB.id, i % 3 === 0));
    rows.push(seed(projectA.id, true, '2026-09-30T00:00:00.000Z'), seed(projectB.id, false, '2026-10-02T00:00:00.000Z'));
    const expected = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map((row) => row.id);
    const first = await list();
    expect(first.items).toHaveLength(30);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await list(`cursor=${first.nextCursor}`);
    expect(second.items).toHaveLength(14);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(expected);
    expect((await list('limit=100')).items.map((item) => item.id)).toEqual(expected);
    for (const item of [...first.items, ...second.items]) expect(item.projectName).toBe(item.projectId === projectA.id ? projectA.name : projectB.name);
    expect(app!.get(ProjectsService).get(projectA.id).updatedAt).toBe(projectA.updatedAt);
    expect(app!.get(ProjectsService).get(projectB.id).updatedAt).toBe(projectB.updatedAt);
  });

  // 필터를 limit 이후에 적용하면 페이지가 비거나 누락되므로 여러 프로젝트와 favorite 상태를 교차 배치한다.
  it('applies true, false and project filters before limit/cursor and keeps pages disjoint', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => seed(i < 6 ? projectA.id : projectB.id, i % 2 === 0));
    const favorites = await list('favorite=true');
    const others = await list('favorite=false');
    expect(favorites.items.map((item) => item.id).sort()).toEqual(rows.filter((row) => row.favorite).map((row) => row.id).sort());
    expect(others.items.map((item) => item.id).sort()).toEqual(rows.filter((row) => !row.favorite).map((row) => row.id).sort());
    const expected = rows.filter((row) => row.projectId === projectA.id && row.favorite).sort((a, b) => b.id.localeCompare(a.id)).map((row) => row.id);
    const filter = `favorite=true&projectId=${projectA.id.toUpperCase()}&limit=1`;
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await list(filter + (cursor ? `&cursor=${cursor}` : ''));
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(seen.length);
  });

  // cursor는 row 참조가 아니라 정렬 위치다. 기준 row 삭제와 제목/favorite 수정에도 탐색이 이어져야 한다.
  it('keeps cursor progress valid when the anchor is deleted and does not reorder on favorite/title changes', async () => {
    const rows = Array.from({ length: 5 }, () => seed(projectA.id, true)).sort((a, b) => b.id.localeCompare(a.id));
    const first = await list('favorite=true&limit=2');
    expect(first.items.map((item) => item.id)).toEqual(rows.slice(0, 2).map((row) => row.id));
    await api('DELETE', `/tracks/${first.items[1]!.id}`);
    await api('PATCH', `/tracks/${rows[2]!.id}`, { title: '순서를 바꾸지 않는 제목' });
    const next = await list(`favorite=true&limit=2&cursor=${first.nextCursor}`);
    expect(next.items.map((item) => item.id)).toEqual(rows.slice(2, 4).map((row) => row.id));
    expect(next.items[0]!.createdAt).toBe(rows[2]!.createdAt);
    await api('PATCH', `/tracks/${rows[2]!.id}`, { favorite: false });
    expect((await list('favorite=true')).items.map((item) => item.id)).not.toContain(rows[2]!.id);
    expect((await list('favorite=false')).items.map((item) => item.id)).toEqual([rows[2]!.id]);
  });

  it('reflects favorite/title/project edits, track and project deletion, and persisted state after restart', async () => {
    const target = seed(projectA.id, false, undefined, true);
    const retained = seed(projectB.id, true, undefined, true);
    expect((await list('favorite=true')).items.map((item) => item.id)).toEqual([retained.id]);
    const updated = await api<TrackDetail>('PATCH', `/tracks/${target.id}`, { favorite: true, title: '보관한 연주' });
    expect(updated.status).toBe(200);
    expect(updated.body.createdAt).toBe(target.createdAt);
    expect(app!.get(ProjectsService).get(projectA.id).updatedAt > projectA.updatedAt).toBe(true);
    expect((await api('PATCH', `/projects/${projectA.id}`, { name: '변경된 프로젝트' })).status).toBe(200);
    const record = (await list(`favorite=true&projectId=${projectA.id}`)).items[0]!;
    expect(record).toMatchObject({ id: target.id, title: '보관한 연주', projectName: '변경된 프로젝트', favorite: true });
    await app!.close(); app = undefined; await start();
    expect((await list('favorite=true')).items).toHaveLength(2);
    expect((await list(`favorite=true&projectId=${projectA.id}`)).items[0]).toEqual(record);
    expect((await api('DELETE', `/tracks/${target.id}`)).status).toBe(200);
    expect(existsSync(join(root, target.audioPath))).toBe(false);
    expect((await list()).items.map((item) => item.id)).toEqual([retained.id]);
    expect((await api('DELETE', `/projects/${projectB.id}`)).status).toBe(200);
    expect(existsSync(join(root, retained.audioPath))).toBe(false);
    expect(await list()).toEqual({ items: [], nextCursor: null });
    expect(database.client.pragma('foreign_key_check')).toEqual([]);
  });

  // 파일이 없어도 metadata 조회는 가능하지만 요청 추정값/파일 경로/내부 오류는 summary에 섞이지 않아야 한다.
  it('exposes a strict public DTO with actual metadata only, even if the audio file is missing', async () => {
    const row = seed(projectA.id, true);
    const item = (await list('favorite=true')).items[0]!;
    expect(item).toMatchObject({ id: row.id, projectName: projectA.name, durationSeconds: 8, bpm: null, genre: null, mood: null, seed: null,
      audioUrl: `/api/tracks/${row.id}/audio`, downloadUrl: `/api/tracks/${row.id}/download` });
    expect(Object.keys(item).sort()).toEqual(['id', 'projectId', 'projectName', 'generationId', 'variationIndex', 'title', 'prompt', 'audioUrl', 'downloadUrl',
      'mimeType', 'byteSize', 'durationSeconds', 'bpm', 'genre', 'mood', 'seed', 'provider', 'model', 'favorite', 'createdAt'].sort());
    const json = JSON.stringify(item);
    for (const privateValue of [root, row.audioPath, 'private.invalid', 'private-requested-only', 'settingsJson', 'errorMessage']) expect(json).not.toContain(privateValue);
    expect((await api<ApiErrorResponse>('GET', `/tracks/${row.id}/audio`)).body.error.code).toBe('AUDIO_MISSING');
  });

  it('rejects unknown, repeated and malformed query values without echoing them or changing timestamps', async () => {
    seed(projectA.id, true);
    const queries = ['limit=0', 'limit=101', 'limit=1.5', 'limit=', 'limit=1&limit=2', 'favorite=', 'favorite=1', 'favorite=TRUE', 'favorite=true&favorite=false',
      'projectId=bad', `projectId=${projectA.id}&projectId=${projectB.id}`, 'cursor=', 'cursor=abc', 'cursor=a&cursor=b', 'privatePath=synthetic-private-token',
      'favorite[secret]=true', `cursor=${'x'.repeat(513)}`];
    for (const query of queries) {
      const response = await api<ApiErrorResponse>('GET', `/tracks?${query}`);
      expect(response).toMatchObject({ status: 400, body: { error: { code: 'INVALID_INPUT' } } });
      expect(JSON.stringify(response.body)).not.toContain('synthetic-private-token');
    }
    const valid = encodeTrackCursor({ id: randomUUID(), createdAt: '2026-10-01T00:00:00.000Z' });
    expect((await api('GET', `/tracks?cursor=${valid}=`)).status).toBe(400);
    expect(app!.get(ProjectsService).get(projectA.id).updatedAt).toBe(projectA.updatedAt);
  });
});
