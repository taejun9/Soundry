import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, realpath, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBatch, parseArguments } from './cli_batch_runner.mjs';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const MODEL = 'codex-composer-local-synth-v1';
const wav = Buffer.alloc(44 + 90 * 44100 * 4);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(44100 * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
// Deliberately synthetic unit-test bytes. Musical and signal quality is checked by qa_audio_tools.py.
for (let index = 44; index < wav.length; index += 2) wav.writeInt16LE(Math.round(Math.sin(index / 40) * 10000), index);
async function setup() {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'soundry-batch-qa-')); roots.push(root);
  const plan = { provider: 'cli', model: MODEL, tracks: Array.from({ length: 20 }, (_, index) => ({ number: index + 1, title: `Concept ${index + 1}`, input: { prompt: `Original instrumental concept ${index + 1}`, settings: { mode: 'instrumental', durationSeconds: 150, seed: String(index + 1) }, variationCount: 1 } })) };
  const planPath = join(root, 'plan.json'); await writeFile(planPath, JSON.stringify(plan));
  const stateDir = join(root, 'state'); const calls = []; const jobs = new Map();
  let generationPostCount = 0; let loseResponse = false; let status = 'completed'; let providerReady = true; let providerId = 'cli'; let badDownload = false; let wrongRename = false; let loseProject = false; let downloads = 0; let oversized = false;
  function result(body) {
    const id = `generation-${jobs.size + 1}`; const trackId = `track-${jobs.size + 1}`;
    return { ...body, id, projectId: 'project-one', provider: 'cli', model: MODEL, status, finishedAt: '2026-10-01T00:00:00.000Z', errorCode: status === 'failed' ? 'CLI_LIMIT_REACHED' : null, tracks: status === 'completed' ? [{ id: trackId, generationId: id, projectId: 'project-one', variationIndex: 0, title: 'Generated title', provider: 'cli', model: MODEL, durationSeconds: 90, byteSize: wav.length, mimeType: 'audio/wav', seed: body.settings.seed, downloadUrl: badDownload ? 'https://outside.invalid/music.wav' : `/api/tracks/${trackId}/download` }] : [] };
  }
  async function fetchStub(url, options) {
    assert.equal(new URL(url).origin, 'http://127.0.0.1:3000'); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Origin, 'http://127.0.0.1:5174');
    const path = new URL(url).pathname; const method = options.method ?? 'GET'; calls.push({ path, method });
    if (path === '/api/providers/current') return Response.json({ id: providerId, model: providerId === 'cli' ? MODEL : 'demo-fixture', isMock: providerId === 'mock', configured: providerReady, generationEnabled: providerReady });
    if (path === '/api/projects' && method === 'POST') { if (loseProject) throw new Error('lost project response'); return Response.json({ id: 'project-one' }); }
    if (path === '/api/projects/project-one' && method === 'GET') return Response.json({ id: 'project-one' });
    if (path === '/api/projects/project-one/generations' && method === 'POST') {
      generationPostCount++; const body = JSON.parse(options.body);
      assert.equal(options.headers['X-Soundry-Request'], '1');
      const saved = JSON.parse(await readFile(join(stateDir, 'checkpoint.json'), 'utf8'));
      assert.ok(Object.values(saved.entries).some(entry => entry.requestKey === body.requestKey && JSON.stringify(entry.input) === JSON.stringify({ prompt: body.prompt, settings: body.settings, variationCount: body.variationCount })), 'request key/input must be on disk before POST');
      if (!jobs.has(body.requestKey)) jobs.set(body.requestKey, result(body));
      if (loseResponse) { loseResponse = false; throw new Error('response lost after server insertion'); }
      return Response.json(jobs.get(body.requestKey));
    }
    if (path.startsWith('/api/generations/')) {
      const job = [...jobs.values()].find(item => item.id === path.split('/').at(-1));
      assert.ok(job); return Response.json(job);
    }
    if (path.startsWith('/api/tracks/') && method === 'PATCH') {
      const track = [...jobs.values()].flatMap(job => job.tracks).find(item => item.id === path.split('/').at(-1)); assert.ok(track);
      track.title = JSON.parse(options.body).title;
      return Response.json(wrongRename ? { ...track, id: 'different-track' } : track);
    }
    if (path.endsWith('/download')) { downloads++; return new Response(wav, { headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(oversized ? 100 * 1024 * 1024 + 1 : wav.length) } }); }
    throw new Error('Unexpected fixture route');
  }
  let clock = 0;
  const options = { plan: planPath, stateDir, projectId: 'project-one', numbers: [1], pollMs: 1, timeoutMs: 3 };
  const dependencies = { fetch: fetchStub, wait: async ms => { clock += ms; }, now: () => clock, log: () => {} };
  return { root, plan, planPath, stateDir, calls, jobs, options, dependencies, get postCount() { return generationPostCount; }, get downloads() { return downloads; }, makeJob(body) { return result(body); }, oversizedDownload(value = true) { oversized = value; }, loseNextResponse() { loseResponse = true; }, setStatus(value) { status = value; }, unavailable() { providerReady = false; }, mockProvider() { providerId = 'mock'; }, unsafeDownload() { badDownload = true; }, wrongRename() { wrongRename = true; }, loseProject() { loseProject = true; } };
}

test('persists keys before one sequential POST each and skips only verified completed originals', async () => {
  const fixture = await setup(); fixture.options.numbers = [1, 2];
  const result = await runBatch(fixture.options, fixture.dependencies);
  assert.equal(result.completed, 2); assert.equal(fixture.postCount, 2); assert.equal(fixture.jobs.size, 2);
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.deepEqual(manifest.results.map(row => [row.trackNumber, row.provider, row.model, row.listeningQa.performed]), [[1, 'cli', MODEL, false], [2, 'cli', MODEL, false]]);
  assert.equal(fixture.calls.filter(call => call.method === 'PATCH').length, 2);
  const before = fixture.calls.length; const rerun = await runBatch(fixture.options, fixture.dependencies);
  assert.equal(rerun.skipped, 2); assert.equal(fixture.calls.length, before);
});

test('response loss requires explicit rerun, reuses exactly the saved key/input, and does not create another job', async () => {
  const fixture = await setup(); fixture.loseNextResponse();
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /checkpoint/);
  assert.equal(fixture.postCount, 1); assert.equal(fixture.jobs.size, 1);
  const first = JSON.parse(await readFile(join(fixture.stateDir, 'checkpoint.json')));
  await runBatch(fixture.options, fixture.dependencies);
  const next = JSON.parse(await readFile(join(fixture.stateDir, 'checkpoint.json')));
  assert.equal(next.entries['1'].requestKey, first.entries['1'].requestKey); assert.deepEqual(next.entries['1'].input, first.entries['1'].input);
  assert.equal(fixture.postCount, 2); assert.equal(fixture.jobs.size, 1);
});

test('a timed-out pending job resumes by generation GET and never submits again', async () => {
  const fixture = await setup(); fixture.setStatus('processing');
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /대기 시간이 끝/);
  assert.equal(fixture.postCount, 1);
  const saved = JSON.parse(await readFile(join(fixture.stateDir, 'checkpoint.json'))); const job = [...fixture.jobs.values()][0];
  assert.equal(saved.entries['1'].generationId, job.id);
  job.status = 'failed'; job.errorCode = 'CLI_INVALID_OUTPUT';
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /failed.*CLI_INVALID_OUTPUT/);
  assert.equal(fixture.postCount, 1);
});

test('failed and cancelled jobs stop the batch without processing later concepts', async () => {
  for (const status of ['failed', 'cancelled']) {
    const fixture = await setup(); fixture.setStatus(status); fixture.options.numbers = [1, 2];
    await assert.rejects(runBatch(fixture.options, fixture.dependencies), new RegExp(status));
    await assert.rejects(runBatch(fixture.options, fixture.dependencies), new RegExp(status));
    assert.equal(fixture.postCount, 1); assert.equal(fixture.jobs.size, 1); assert.equal(fixture.downloads, 0);
  }
});

test('a changed plan is rejected before reusing an uncertain key', async () => {
  const fixture = await setup(); fixture.loseNextResponse(); await assert.rejects(runBatch(fixture.options, fixture.dependencies));
  fixture.plan.tracks[0].input.prompt = 'Different idea'; await writeFile(fixture.planPath, JSON.stringify(fixture.plan));
  const before = fixture.calls.length; await assert.rejects(runBatch(fixture.options, fixture.dependencies), /입력이 제작 계획과 다릅니다/);
  assert.equal(fixture.calls.length, before); assert.equal(fixture.postCount, 1);
});

test('a completed manifest cannot hide a replaced original', async () => {
  const fixture = await setup(); await runBatch(fixture.options, fixture.dependencies);
  const source = join(fixture.stateDir, 'originals', '01-original.wav'); const replaced = Buffer.from(wav); replaced[44] ^= 1; await writeFile(source, replaced);
  const before = fixture.calls.length; await assert.rejects(runBatch(fixture.options, fixture.dependencies), /SHA256/);
  assert.equal(fixture.calls.length, before);
});

test('provider readiness, foreign audio URLs, and mismatched rename responses never download or fall back', async () => {
  for (const fault of ['unavailable', 'mockProvider', 'unsafeDownload', 'wrongRename']) {
    const fixture = await setup(); fixture[fault]();
    await assert.rejects(runBatch(fixture.options, fixture.dependencies)); assert.equal(fixture.downloads, 0);
    if (fault === 'unavailable' || fault === 'mockProvider') assert.equal(fixture.postCount, 0);
  }
});

test('an uncertain project creation is not automatically repeated on restart', async () => {
  const fixture = await setup(); delete fixture.options.projectId; fixture.loseProject();
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /checkpoint/);
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /--project-id/);
  assert.equal(fixture.calls.filter(call => call.path === '/api/projects' && call.method === 'POST').length, 1);
  fixture.options.projectId = 'project-one'; await runBatch(fixture.options, fixture.dependencies); assert.equal(fixture.postCount, 1);
});

test('symlink state directories and another owner lock are rejected', async () => {
  const fixture = await setup(); const destination = join(fixture.root, 'elsewhere'); await mkdir(destination); await symlink(destination, fixture.stateDir);
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /symlink/); assert.equal(fixture.calls.length, 0);
  await rm(fixture.stateDir); await mkdir(fixture.stateDir); await writeFile(join(fixture.stateDir, '.batch.lock'), 'existing owner');
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /batch.lock/);
  assert.equal(await readFile(join(fixture.stateDir, '.batch.lock'), 'utf8'), 'existing owner');
});

test('arguments do not permit remote origins or conflicting project reuse', async () => {
  const fixture = await setup();
  assert.deepEqual(parseArguments(['--numbers', '1,2', '--timeout-seconds', '12']), { numbers: [1, 2], timeoutMs: 12000 });
  assert.throws(() => parseArguments(['--numbers', '1-20']));
  await assert.rejects(runBatch({ ...fixture.options, origin: 'https://outside.invalid:3000' }, fixture.dependencies), /HTTP 포트/);
  await runBatch(fixture.options, fixture.dependencies);
  await assert.rejects(runBatch({ ...fixture.options, projectId: 'different-project' }, fixture.dependencies), /다른 프로젝트/);
});


test('a manually connected first generation uses its existing ID with no new generation POST', async () => {
  const fixture = await setup(); const requestKey = 'existing-first-request'; const input = fixture.plan.tracks[0].input;
  const job = fixture.makeJob({ ...input, requestKey }); fixture.jobs.set(requestKey, job);
  await mkdir(fixture.stateDir);
  await writeFile(join(fixture.stateDir, 'checkpoint.json'), JSON.stringify({ version: 1, projectId: 'project-one', projectCreationAttempted: false, entries: { '1': { requestKey, input, generationId: job.id, state: 'processing' } } }));
  const result = await runBatch(fixture.options, fixture.dependencies);
  assert.equal(result.completed, 1); assert.equal(fixture.postCount, 0); assert.equal(fixture.downloads, 1);
  assert.ok(fixture.calls.some(call => call.path === `/api/generations/${job.id}`));
});

test('an oversized download stops before file publication and explicit resume downloads the same completed job', async () => {
  const fixture = await setup(); fixture.oversizedDownload();
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /크기 제한/);
  await assert.rejects(readFile(join(fixture.stateDir, 'originals', '01-original.wav')), { code: 'ENOENT' });
  fixture.oversizedDownload(false); await runBatch(fixture.options, fixture.dependencies);
  assert.equal(fixture.postCount, 1); assert.equal(fixture.jobs.size, 1); assert.equal(fixture.downloads, 2);
});


test('an existing completed job downloads after CLI logout or a switch to Mock', async () => {
  for (const fault of ['unavailable', 'mockProvider']) {
    const fixture = await setup(); fixture.oversizedDownload();
    await assert.rejects(runBatch(fixture.options, fixture.dependencies), /크기 제한/);
    fixture[fault](); fixture.oversizedDownload(false);
    const providerQueries = fixture.calls.filter(call => call.path === '/api/providers/current').length;
    const result = await runBatch(fixture.options, fixture.dependencies);
    assert.equal(result.completed, 1); assert.equal(fixture.postCount, 1); assert.equal(fixture.downloads, 2);
    assert.equal(fixture.calls.filter(call => call.path === '/api/providers/current').length, providerQueries);
  }
});

test('an existing pending job is still followed when CLI is unavailable', async () => {
  const fixture = await setup(); fixture.setStatus('processing');
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /대기 시간이 끝/);
  fixture.unavailable(); const job = [...fixture.jobs.values()][0]; job.status = 'cancelled';
  const providerQueries = fixture.calls.filter(call => call.path === '/api/providers/current').length;
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /cancelled/);
  assert.equal(fixture.postCount, 1);
  assert.equal(fixture.calls.filter(call => call.path === '/api/providers/current').length, providerQueries);
});

test('a key saved before response loss can be reconfirmed without current CLI readiness, then blocks only brand-new work', async () => {
  const fixture = await setup(); fixture.loseNextResponse();
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /checkpoint/);
  const requestKey = [...fixture.jobs.keys()][0]; fixture.unavailable(); fixture.options.numbers = [1, 2];
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /공급자가 준비되지/);
  const state = JSON.parse(await readFile(join(fixture.stateDir, 'checkpoint.json')));
  const manifest = JSON.parse(await readFile(join(fixture.stateDir, 'completed-manifest.json')));
  assert.equal(manifest.results.length, 1); assert.equal(manifest.results[0].requestKey, requestKey);
  assert.equal(state.entries['1'].state, 'completed'); assert.equal(state.entries['2'], undefined);
  assert.equal(fixture.postCount, 2); assert.equal(fixture.jobs.size, 1);
});


test('a prepared key saved before its first POST cannot create a Mock job after a provider switch', async () => {
  const fixture = await setup(); fixture.plan.tracks[0].input.settings = { mode: 'instrumental' };
  await writeFile(fixture.planPath, JSON.stringify(fixture.plan));
  await mkdir(fixture.stateDir);
  await writeFile(join(fixture.stateDir, 'checkpoint.json'), JSON.stringify({ version: 1, projectId: 'project-one', projectCreationAttempted: false, entries: { '1': { requestKey: 'prepared-not-submitted', input: fixture.plan.tracks[0].input, generationId: null, state: 'prepared' } } }));
  fixture.mockProvider();
  await assert.rejects(runBatch(fixture.options, fixture.dependencies), /CLI 공급자로 되돌린 뒤/);
  assert.equal(fixture.postCount, 0); assert.equal(fixture.jobs.size, 0); assert.equal(fixture.downloads, 0);
  const saved = JSON.parse(await readFile(join(fixture.stateDir, 'checkpoint.json')));
  assert.equal(saved.entries['1'].requestKey, 'prepared-not-submitted'); assert.equal(saved.entries['1'].generationId, null);
});
