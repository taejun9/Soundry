import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { createApplication } from '../app.js';
import { DatabaseService } from '../database/database.service.js';
import { MockProvider } from '../providers/mock-provider.js';
import { MembersService } from './members.service.js';
import type {
  Arrangement,
  GenerationSummary,
  MemberSummary,
  ProjectSummary,
  SessionSummary,
} from '../../../shared/contracts.js';
import { REPOSITORY_ROOT, StorageConfig } from '../config/storage-config.js';
let app: NestExpressApplication;
let root: string;
let port: number;
let db: DatabaseService;
type Result<T> = { status: number; body: T; cookie?: string };
function api<T = unknown>(method: string, path: string, body?: unknown, cookie = ''): Promise<Result<T>> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: `/api${path}`,
        method,
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:5173',
          'content-type': 'application/json',
          cookie,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode!,
              body: JSON.parse(text),
              cookie: res.headers['set-cookie']?.[0]?.split(';')[0],
            });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}
async function start(delayMs = 0) {
  app = await createApplication({
    dataDir: root,
    musicProvider: 'mock',
    providerOverride: new MockProvider({ delayMs }),
  });
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
  db = app.get(DatabaseService);
}
async function register(email = 'admin@example.test') {
  const result = await api<{ member: MemberSummary }>('POST', '/members/register', {
    email,
    password: 'local-test-password',
    name: email.split('@')[0],
  });
  expect(result.status).toBe(201);
  return { member: result.body.member, cookie: result.cookie! };
}
async function project(cookie: string) {
  const p = await api<ProjectSummary>('POST', '/projects', { name: '테스트 프로젝트' }, cookie);
  expect(p.status).toBe(201);
  return p.body;
}
async function generate(id: string, cookie: string, count = 1, key = randomUUID()) {
  return api<GenerationSummary>(
    'POST',
    `/projects/${id}/generations`,
    { prompt: '검증 비트', variationCount: count, requestKey: key },
    cookie,
  );
}
async function complete(id: string, cookie: string) {
  for (let i = 0; i < 200; i++) {
    const g = await api<GenerationSummary>('GET', `/generations/${id}`, undefined, cookie);
    if (g.body.status === 'completed') return g.body;
    if (g.body.status === 'failed') throw Error(g.body.errorCode!);
    await delay(10);
  }
  throw Error('completion timeout');
}
beforeEach(() => {
  root = mkdtempSync('/private/tmp/soundry-members-');
});
afterEach(async () => {
  vi.useRealTimers();
  await app?.close();
  rmSync(root, { recursive: true, force: true });
});
describe('membership, ownership, usage and arrangements', () => {
  it('migrates a real v1 database while preserving legacy projects and gives only the first signup admin ownership', async () => {
    const storage = new StorageConfig(root);
    const old = new BetterSqlite3(storage.databasePath);
    const sql = readFileSync(join(REPOSITORY_ROOT, 'backend/migrations/0000_initial.sql'), 'utf8');
    old.exec(sql);
    old.exec(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)',
    );
    old
      .prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES(?,?)')
      .run('legacy-test', 1790784000000);
    const id = randomUUID();
    old
      .prepare('INSERT INTO projects VALUES(?,?,?,?)')
      .run(id, '기존 프로젝트', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
    old.close();
    await start();
    expect(db.client.pragma('user_version', { simple: true })).toBe(2);
    const admin = await register();
    const member = await register('free@example.test');
    expect(admin.member.tier).toBe('admin');
    expect(member.member.tier).toBe('free');
    expect((await api('GET', `/projects/${id}`, undefined, admin.cookie)).status).toBe(200);
    expect((await api('GET', `/projects/${id}`, undefined, member.cookie)).status).toBe(404);
    expect(JSON.stringify(admin.member)).not.toContain('password');
    const stored = db.client.prepare('SELECT password_hash FROM members WHERE id=?').get(admin.member.id) as {
      password_hash: string;
    };
    expect(stored.password_hash).not.toContain('local-test-password');
    expect(stored.password_hash.split(':')[0]).toHaveLength(32);
  });
  it('protects lists, project mutations, generation details and audio against other members and anonymous requests', async () => {
    await start();
    const admin = await register();
    const member = await register('member@example.test');
    const p = await project(admin.cookie);
    const g = await generate(p.id, admin.cookie);
    const done = await complete(g.body.id, admin.cookie);
    const track = done.tracks[0]!;
    for (const path of [
      '/projects',
      '/tracks',
      `/projects/${p.id}`,
      `/tracks/${track.id}/audio`,
      `/generations/${done.id}`,
    ])
      expect((await api('GET', path)).status).toBe(401);
    for (const path of [
      `/projects/${p.id}`,
      `/tracks/${track.id}`,
      `/tracks/${track.id}/audio`,
      `/tracks/${track.id}/download`,
      `/generations/${done.id}`,
      `/projects/${p.id}/arrangement`,
    ])
      expect((await api('GET', path, undefined, member.cookie)).status).toBe(404);
    expect(
      (await api<{ items: unknown[] }>('GET', '/projects', undefined, member.cookie)).body.items,
    ).toEqual([]);
    expect((await api<{ items: unknown[] }>('GET', '/tracks', undefined, member.cookie)).body.items).toEqual(
      [],
    );
    expect((await api('PATCH', `/projects/${p.id}`, { name: '다른 사람' }, member.cookie)).status).toBe(404);
    expect((await generate(p.id, member.cookie)).status).toBe(404);
    expect((await api('GET', '/members', undefined, member.cookie)).status).toBe(403);
    expect((await api('GET', '/MEMBERS', undefined, member.cookie)).status).toBe(403);
    expect((await api('GET', `/PROJECTS/${p.id}`, undefined, member.cookie)).status).toBe(404);
    expect((await api('GET', `/TRACKS/${track.id}/AUDIO`, undefined, member.cookie)).status).toBe(404);
    expect((await api('GET', `/GENERATIONS/${done.id}`, undefined, member.cookie)).status).toBe(404);
    expect((await api('GET', '/members', undefined, member.cookie)).status).toBe(403);
  });
  it('uses expiring opaque sessions, rejects forged tiers and bad credentials, and revokes logout', async () => {
    await start();
    const admin = await register();
    expect(
      (
        await api('POST', '/members/register', {
          email: 'a@example.test',
          password: 'local-test-password',
          name: '공격',
          tier: 'admin',
        })
      ).status,
    ).toBe(400);
    expect(
      (await api('POST', '/members/login', { email: admin.member.email, password: 'wrong-password' })).status,
    ).toBe(401);
    const login = await api('POST', '/members/login', {
      email: admin.member.email.toUpperCase(),
      password: 'local-test-password',
    });
    expect(login.status).toBe(200);
    expect(login.cookie).toMatch(/^soundry_session=[a-f0-9]{64}$/);
    expect(
      (await api<SessionSummary>('GET', '/members/session', undefined, login.cookie)).body.member?.id,
    ).toBe(admin.member.id);
    await api('POST', '/members/logout', {}, login.cookie);
    expect((await api('GET', '/projects', undefined, login.cookie)).status).toBe(401);
    db.client.prepare('UPDATE sessions SET expires_at=?').run('2000-01-01T00:00:00.000Z');
    expect((await api('GET', '/projects', undefined, admin.cookie)).status).toBe(401);
  });
  it('allows admin tier changes but preserves the last admin and applies changes to existing sessions', async () => {
    await start();
    const admin = await register();
    const member = await register('member@example.test');
    expect((await api('PATCH', `/members/${admin.member.id}`, { tier: 'free' }, admin.cookie)).status).toBe(
      409,
    );
    expect((await api('PATCH', `/members/${member.member.id}`, { tier: 'pro' }, member.cookie)).status).toBe(
      403,
    );
    expect((await api('PATCH', `/members/${member.member.id}`, { tier: 'pro' }, admin.cookie)).status).toBe(
      200,
    );
    expect(
      (await api<SessionSummary>('GET', '/members/session', undefined, member.cookie)).body,
    ).toMatchObject({ member: { tier: 'pro' }, usage: { limit: 500 } });
  });
  it('reserves variation usage atomically, accepts duplicate keys at the limit, and never refunds completed project deletion', async () => {
    await start();
    await register();
    const member = await register('free@example.test');
    const p = await project(member.cookie);
    const first = await generate(p.id, member.cookie, 4);
    await complete(first.body.id, member.cookie);
    await complete((await generate(p.id, member.cookie, 4)).body.id, member.cookie);
    const key = randomUUID();
    const last = await generate(p.id, member.cookie, 2, key);
    await complete(last.body.id, member.cookie);
    expect((await generate(p.id, member.cookie, 2, key)).status).toBe(200);
    expect((await generate(p.id, member.cookie)).status).toBe(429);
    expect(
      (await api<SessionSummary>('GET', '/members/session', undefined, member.cookie)).body.usage,
    ).toMatchObject({ used: 10, remaining: 0 });
    await api('DELETE', `/projects/${p.id}`, undefined, member.cookie);
    const next = await project(member.cookie);
    expect((await generate(next.id, member.cookie)).status).toBe(429);
  });
  it('refunds cancellation and failure, retains refund after deletion, and admin has no membership cap', async () => {
    await start(5000);
    const admin = await register();
    const member = await register('free@example.test');
    const p = await project(member.cookie);
    const g = await generate(p.id, member.cookie, 4);
    expect(
      (await api<SessionSummary>('GET', '/members/session', undefined, member.cookie)).body.usage?.used,
    ).toBe(4);
    await api('POST', `/generations/${g.body.id}/cancel`, {}, member.cookie);
    expect(
      (await api<SessionSummary>('GET', '/members/session', undefined, member.cookie)).body.usage?.used,
    ).toBe(0);
    await api('DELETE', `/projects/${p.id}`, undefined, member.cookie);
    expect(
      (await api<SessionSummary>('GET', '/members/session', undefined, member.cookie)).body.usage?.used,
    ).toBe(0);
    const service = app.get(MembersService);
    expect(service.usage(admin.member).limit).toBeNull();
    expect(() => service.assertQuota(admin.member.id, 10000)).not.toThrow();
    const q = await project(member.cookie);
    const failed = await generate(q.id, member.cookie, 2);
    db.client.prepare("UPDATE generations SET status='failed' WHERE id=?").run(failed.body.id);
    expect(service.usage(member.member).used).toBe(0);
  });
  it('uses Korean monthly boundaries independently of host timezone', async () => {
    await start();
    await register();
    const member = await register('free@example.test');
    const service = app.get(MembersService);
    for (const [at, amount] of [
      ['2026-09-30T14:59:59.999Z', 4],
      ['2026-09-30T15:00:00.000Z', 2],
      ['2026-10-31T14:59:59.999Z', 3],
      ['2026-10-31T15:00:00.000Z', 1],
    ] as const)
      db.client
        .prepare('INSERT INTO usage_entries VALUES(?,?,?,?,?)')
        .run(randomUUID(), member.member.id, amount, 'completed', at);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'));
    expect(service.usage(member.member)).toMatchObject({ month: '2026-10', used: 5 });
    vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
    expect(service.usage(member.member)).toMatchObject({ month: '2026-11', used: 1 });
  });
  it('stores overlapping clips and added lanes, rejects foreign sources, invalid lengths, duplicates and oversized layouts', async () => {
    await start();
    const admin = await register();
    const p = await project(admin.cookie);
    const q = await project(admin.cookie);
    const track = (await complete((await generate(p.id, admin.cookie)).body.id, admin.cookie)).tracks[0]!;
    const foreign = (await complete((await generate(q.id, admin.cookie)).body.id, admin.cookie)).tracks[0]!;
    const a: Arrangement = {
      duration: 180,
      lanes: [
        {
          id: randomUUID(),
          name: '기본 비트',
          muted: false,
          clips: [
            {
              id: randomUUID(),
              trackId: track.id,
              label: 'A',
              start: 0,
              offset: 0,
              duration: 180,
              volume: 0.8,
              loop: true,
            },
          ],
        },
        {
          id: randomUUID(),
          name: '포인트',
          muted: false,
          clips: [
            {
              id: randomUUID(),
              trackId: track.id,
              label: 'B',
              start: 30,
              offset: 1,
              duration: 6,
              volume: 0.5,
              loop: false,
            },
          ],
        },
        { id: randomUUID(), name: '추가 행', muted: true, clips: [] },
      ],
    };
    expect((await api('PUT', `/projects/${p.id}/arrangement`, a, admin.cookie)).status).toBe(200);
    expect(
      (await api<Arrangement>('GET', `/projects/${p.id}/arrangement`, undefined, admin.cookie)).body,
    ).toEqual(a);
    const cases = [
      { ...a, duration: 10 },
      { ...a, duration: null },
      { ...a, lanes: [] },
      {
        ...a,
        lanes: Array.from({ length: 33 }, () => ({ id: randomUUID(), name: '행', muted: false, clips: [] })),
      },
    ];
    for (const bad of cases)
      expect((await api('PUT', `/projects/${p.id}/arrangement`, bad, admin.cookie)).status).toBe(400);
    for (const change of [
      { trackId: foreign.id },
      { duration: 9, loop: false },
      { offset: 8 },
      { volume: 2 },
      { id: a.lanes[0]!.id },
      { start: -1 },
      { start: 179, duration: 2 },
    ]) {
      const bad = structuredClone(a);
      Object.assign(bad.lanes[0]!.clips[0]!, change);
      expect((await api('PUT', `/projects/${p.id}/arrangement`, bad, admin.cookie)).status).toBe(400);
    }
    await app.close();
    await start();
    const login = await api('POST', '/members/login', {
      email: admin.member.email,
      password: 'local-test-password',
    });
    expect(
      (await api<Arrangement>('GET', `/projects/${p.id}/arrangement`, undefined, login.cookie)).body,
    ).toEqual(a);
  });
  it('rate limits repeated credential attempts without disclosing secrets', async () => {
    await start();
    const admin = await register();
    for (let i = 0; i < 19; i++)
      await api('POST', '/members/login', { email: admin.member.email, password: 'wrong-password' });
    const rejected = await api('POST', '/members/login', {
      email: admin.member.email,
      password: 'wrong-password',
    });
    expect(rejected.status).toBe(429);
    expect(JSON.stringify(rejected.body)).not.toContain('wrong-password');
  });
});
