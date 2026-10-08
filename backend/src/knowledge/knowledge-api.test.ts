import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompositionKnowledge, GenerationInput, GenerationSummary, KnowledgeReference } from '../../../shared/contracts.js';
import { createApplication } from '../app.js';
import { DatabaseService } from '../database/database.service.js';
import { MembersService } from '../members/members.service.js';
import { ProviderService } from '../providers/provider.service.js';
import type { CompositionRunner } from '../providers/cli-runner.js';
import type { Composition } from '../providers/composition/index.js';
import { KnowledgeService } from './knowledge.service.js';
function score(input: GenerationInput): Composition {
  const total = Math.ceil((input.settings.durationSeconds ?? 150) / 2);
  let startBar = 0;
  const sections: Composition['sections'] = ['intro', 'verse', 'chorus', 'bridge', 'outro'].map((name, index) => {
    const bars = [4, 12, 12, 8, total - 36][index]!;
    const section = { name: name as Composition['sections'][number]['name'], startBar, bars }; startBar += bars; return section;
  });
  const notes = (pitches: number[]) => pitches.map((pitch, index) => ({ beat: index / 2, pitch, duration: 0.4, velocity: 0.7 }));
  const parts: Composition['parts'] = [];
  for (const [index, section] of sections.entries()) {
    const common = { startBar: section.startBar, repeats: section.bars, transpose: 0 };
    parts.push({ ...common, instrument: 'piano', patternId: 'chords', gain: index === 2 ? 0.4 : 0.25, pan: -0.3 });
    parts.push({ ...common, instrument: 'bass', patternId: 'bass', gain: 0.55, pan: 0 });
    if (index !== 0) parts.push({ ...common, instrument: index === 3 ? 'bell' : 'synth', patternId: index === 2 ? 'hook' : 'melody', gain: 0.35, pan: 0.18 });
  }
  return { version: 1, bpm: 120, genre: input.settings.genre ?? 'Jazz', mood: input.settings.mood ?? 'warm', seed: input.settings.seed ?? 'fixture',
    patterns: [
      { id: 'chords', bars: 1, notes: notes([60, 64, 67, 71, 60, 64, 67, 71]) },
      { id: 'bass', bars: 1, notes: notes([36, 43, 40, 47]) },
      { id: 'melody', bars: 1, notes: notes([72, 74, 76, 79, 76, 74, 71, 67]) },
      { id: 'hook', bars: 1, notes: notes([79, 76, 74, 72, 74, 76, 81, 79]) },
    ], parts, sections };
}
let app: NestExpressApplication; let root: string; let port: number; let db: DatabaseService;
const notes = (title: string, allowRemote = false) => ({ title, content: '재즈 화성을 가까운 성부로 연결하고 후렴 리듬에 변화를 준다.', tags: 'Jazz 재즈', source: '직접 작성', rights: 'own', allowRemote });
const compose = vi.fn<CompositionRunner['compose']>();
async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown, cookie = ''): Promise<{ status: number; body: T }> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, method, path: '/api' + path, headers: { host: 'localhost:3000', origin: 'http://localhost:5173', 'content-type': 'application/json', cookie } }, res => {
      let data = ''; res.setEncoding('utf8'); res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(data) as T }));
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
async function member(email: string) {
  const result = await app.get(MembersService).register({ name: email, email: email + '@example.test', password: 'local-only-test-password' });
  return { id: result.member.id, cookie: 'soundry_session=' + result.token };
}
async function project(cookie: string) { return (await api('POST','/projects', { name: 'RAG 작곡 QA' }, cookie)).body.id as string; }
async function generate(projectId: string, cookie: string, key = randomUUID()) {
  return api<GenerationSummary>('POST', '/projects/' + projectId + '/generations', { prompt: '원래 만든 Jazz 재즈 작곡', settings: { bpm: 120, genre: 'Jazz', durationSeconds: 90, seed: 'qa-original' }, variationCount: 1, requestKey: key }, cookie);
}
async function complete(id: string, cookie: string) {
  for (let i = 0; i < 350; i++) { const result = (await api<GenerationSummary>('GET', '/generations/' + id, undefined, cookie)).body; if (!['queued','processing'].includes(result.status)) { expect(result.status).toBe('completed'); return result; } await delay(20); }
  throw new Error('composition timeout');
}
beforeEach(async () => {
  root = mkdtempSync('/private/tmp/soundry-knowledge-'); compose.mockReset();
  compose.mockImplementation(async prompt => score(JSON.parse(prompt.split('\n').find(line => line.startsWith('{"prompt":'))!) as GenerationInput));
  app = await createApplication({ dataDir: root, musicProvider: 'cli', cliRunnerOverride: { probe: async () => 'ready', compose } });
  await app.listen(0, '127.0.0.1'); port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
  db = app.get(DatabaseService); await app.get(ProviderService).refreshConfiguration();
});
afterEach(async () => { await app?.close(); rmSync(root, { recursive: true, force: true }); });
describe('composition memory ownership and lifecycle', () => {
  it('requires membership even before setup and isolates read/update/delete from administrators', async () => {
    expect((await api('GET','/knowledge')).status).toBe(401);
    const a = await member('admin'); const b = await member('writer');
    const added = await api<CompositionKnowledge>('POST','/knowledge', notes('비공개 재즈'), b.cookie); expect(added.status).toBe(201);
    expect((await api<{ items: CompositionKnowledge[] }>('GET','/knowledge', undefined, a.cookie)).body.items).toEqual([]);
    expect((await api('PATCH','/knowledge/' + added.body.id, notes('권한 우회'), a.cookie)).status).toBe(404);
    expect((await api('DELETE','/knowledge/' + added.body.id, undefined, a.cookie)).status).toBe(404);
    expect((await api('PATCH','/knowledge/' + added.body.id, notes('수정 재즈', true), b.cookie)).status).toBe(200);
    expect((await api('DELETE','/knowledge/' + added.body.id, undefined, b.cookie)).status).toBe(200);
  });
  it('rejects missing consent, unsupported rights/fields and oversized or control text', async () => {
    const a = await member('admin'); const input = notes('지식');
    for (const body of [{ ...input, allowRemote: undefined }, { ...input, allowRemote: 'true' }, { ...input, rights: 'copyrighted' }, { ...input, rights: { toString: 'own' } }, { ...input, tags: null }, { ...input, content: 'x'.repeat(4001) }, { ...input, content: 'bad\u0000note' }, { ...input, path: '/private/file' }]) expect((await api('POST','/knowledge', body, a.cookie)).status).toBe(400);
    expect(app.get(KnowledgeService).list(a.id)).toEqual([]);
  });
  it('uses only owner/consented knowledge, preserves idempotency and score JSON, and redacts deleted references', async () => {
    const a = await member('admin'); const b = await member('writer'); const p = await project(a.cookie);
    await api('POST','/knowledge', notes('PRIVATE LOCAL'), a.cookie);
    await api('POST','/knowledge', notes('OTHER OWNER', true), b.cookie);
    const known = (await api<CompositionKnowledge>('POST','/knowledge', notes('재즈 보이스 리딩', true), a.cookie)).body;
    const key = randomUUID(); const accepted = await generate(p,a.cookie,key); expect(accepted.status).toBe(202);
    const done = await complete(accepted.body.id,a.cookie); const track = done.tracks[0]!;
    const prompt = compose.mock.calls[0]![0]; expect(prompt).toContain(known.title); expect(prompt).not.toMatch(/PRIVATE LOCAL|OTHER OWNER/);
    const refs = await api<{ items: KnowledgeReference[] }>('GET','/generations/' + done.id + '/knowledge', undefined,a.cookie);
    expect(refs.body.items.map(v => v.id)).toEqual([known.id]); expect(refs.body.items[0]!.digest).toMatch(/^[a-f0-9]{64}$/);
    const artifact = await api<{ score: Composition; summary: string }>('GET','/tracks/' + track.id + '/composition',undefined,a.cookie);
    expect(artifact.body.score.bpm).toBe(120); expect(artifact.body.summary).toContain('chorus');
    expect((await api('GET','/tracks/' + track.id + '/composition',undefined,b.cookie)).status).toBe(404);
    expect((await api('GET','/generations/' + done.id + '/knowledge',undefined,b.cookie)).status).toBe(404);
    await api('DELETE','/knowledge/' + known.id,undefined,a.cookie);
    const retried = await generate(p,a.cookie,key); expect(retried.status).toBe(200); expect(retried.body.id).toBe(done.id); expect(compose).toHaveBeenCalledTimes(1);
    expect((await api<{ items: KnowledgeReference[] }>('GET','/generations/' + done.id + '/knowledge',undefined,a.cookie)).body.items[0]).toMatchObject({ id: null,title: '삭제된 지식' });
    expect(db.client.prepare('SELECT count(*) AS n FROM generation_scores').get()).toEqual({ n: 1 });
  });
  it('accumulates user feedback once per track, uses evaluated structure and separates low-rated mistakes', async () => {
    const a = await member('admin'); const b = await member('writer'); const p = await project(a.cookie);
    const accepted = await generate(p,a.cookie); const done = await complete(accepted.body.id,a.cookie); const track = done.tracks[0]!;
    const body = { rating: 5, notes: '재즈 후렴의 성부 연결이 좋다', allowRemote: true };
    expect((await api('POST','/tracks/' + track.id + '/feedback',body,b.cookie)).status).toBe(404);
    const feedback = (await api<CompositionKnowledge>('POST','/tracks/' + track.id + '/feedback',body,a.cookie)).body;
    expect(feedback.rating).toBe(5);
    const changed = (await api<CompositionKnowledge>('POST','/tracks/' + track.id + '/feedback',{ ...body,rating: 1, notes: '재즈 후렴 전개가 반복적이다. 다음에는 리듬 변화를 늘린다.' },a.cookie)).body;
    expect(changed.id).toBe(feedback.id); expect(app.get(KnowledgeService).list(a.id)).toHaveLength(1);
    const anotherId = randomUUID();
    db.client.prepare('INSERT INTO generations(id,project_id,member_id,prompt,settings_json,provider,status,variation_count,request_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(anotherId,p,a.id,'재즈','{}','cli','queued',1,randomUUID(),new Date().toISOString());
    const retrieved = app.get(KnowledgeService).forGeneration(anotherId,a.id,{ prompt: '재즈 후렴', settings: {},variationCount: 1 },'cli');
    expect(retrieved[0]!.reference.rating).toBe(1); expect(retrieved[0]!.content).toContain('Evaluated arrangement structure:');
    expect(retrieved[0]!.content).not.toContain('"pitch"');
    await api('POST','/tracks/' + track.id + '/feedback',{ ...body,rating: 3 },a.cookie);
    expect(app.get(KnowledgeService).forGeneration(randomUUID(),a.id,{ prompt: '재즈',settings: {},variationCount: 1 },'cli')).toEqual([]);
  });
  it('persists knowledge and validated scores across restart without publishing failed output', async () => {
    const a = await member('admin'); const item = (await api<CompositionKnowledge>('POST','/knowledge',notes('재즈 기억'),a.cookie)).body;
    const p = await project(a.cookie); compose.mockResolvedValueOnce({ malicious: 'unvalidated raw output' });
    const job = await generate(p,a.cookie);
    for (let i = 0; i < 50; i++) { if ((await api<GenerationSummary>('GET','/generations/' + job.body.id,undefined,a.cookie)).body.status === 'failed') break; await delay(10); }
    expect(db.client.prepare('SELECT count(*) AS n FROM generation_scores').get()).toEqual({ n: 0 });
    await app.close();
    app = await createApplication({ dataDir: root,musicProvider: 'mock' }); await app.listen(0,'127.0.0.1'); port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
    expect((await api<{items: CompositionKnowledge[]}>('GET','/knowledge',undefined,a.cookie)).body.items[0]!.id).toBe(item.id);
  });
});
