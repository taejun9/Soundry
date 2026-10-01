import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerationInput, GenerationSummary, TrackSummary } from '../../../shared/contracts.js';
import { createApplication } from '../app.js';
import { DatabaseService } from '../database/database.service.js';
import { CliProvider, CLI_MODEL, validateCliInput } from './cli-provider.js';
import type { CompositionRunner } from './cli-runner.js';
import type { Composition } from './composition/index.js';
import { ProviderError } from './provider-error.js';
import { ProviderService } from './provider.service.js';
import { join } from 'node:path';

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
const musicInput: GenerationInput = { prompt: '밤 산책\n원래 만든 재즈 연주곡', settings: { bpm: 120, durationSeconds: 90, genre: 'Jazz', mood: 'warm', seed: 'original-seed' }, variationCount: 2 };
function fromPrompt(prompt: string): GenerationInput {
  const line = prompt.split('\n').find(value => value.startsWith('{"prompt":'));
  if (!line) throw new Error('No request fixture');
  return JSON.parse(line) as GenerationInput;
}
function runner(): CompositionRunner & { probe: ReturnType<typeof vi.fn<CompositionRunner['probe']>>; compose: ReturnType<typeof vi.fn<CompositionRunner['compose']>> } {
  return { probe: vi.fn(async () => 'ready' as const), compose: vi.fn(async prompt => score(fromPrompt(prompt))) };
}
describe('CLI composition provider', () => {
  it('composes variations sequentially with explicit musical constraints and distinct bounded seeds', async () => {
    const fake = runner(); let running = 0; let maximum = 0;
    fake.compose.mockImplementation(async prompt => { maximum = Math.max(maximum, ++running); await delay(5); running--; return score(fromPrompt(prompt)); });
    const stages: string[] = [];
    const tracks = await new CliProvider(fake).generate(musicInput, { signal: new AbortController().signal, onStage: stage => stages.push(stage) });
    expect(maximum).toBe(1); expect(fake.compose).toHaveBeenCalledTimes(2); expect(stages).toEqual(['generating', 'saving']);
    expect(tracks[0]).toMatchObject({ mediaType: 'audio/wav', model: CLI_MODEL, metadata: { bpm: 120, genre: 'Jazz', mood: 'warm', seed: 'original-seed' } });
    expect(tracks[1]!.metadata.seed).not.toBe('original-seed'); expect(tracks[1]!.metadata.seed).toHaveLength(32);
    for (const call of fake.compose.mock.calls) expect(fromPrompt(call[0]).prompt).toBe(musicInput.prompt);
    const a = tracks[0]!.audio[Symbol.asyncIterator](); expect(Buffer.from((await a.next()).value as Uint8Array).subarray(0, 4).toString()).toBe('RIFF'); await a.return?.();
  });
  it('validates requested ranges, seed length and parser-incompatible control characters before CLI calls', async () => {
    const fake = runner(); const provider = new CliProvider(fake);
    for (const settings of [{ durationSeconds: 89 }, { durationSeconds: 181 }, { bpm: 39 }, { bpm: 221 }, { seed: 'x'.repeat(65) }, { seed: 'a\nb' }, { genre: 'a\tb' }, { mood: 'a\u007fb' }, { mode: 'vocal' }]) {
      await expect(provider.generate({ ...musicInput, settings } as GenerationInput, { signal: new AbortController().signal, onStage() {} })).rejects.toMatchObject({ publicCode: 'INVALID_INPUT' });
    }
    expect(fake.probe).not.toHaveBeenCalled(); expect(fake.compose).not.toHaveBeenCalled();
    expect(validateCliInput(musicInput).prompt).toContain('\n');
  });
  it('requires ChatGPT readiness and never falls back to Mock on auth or invalid output', async () => {
    const fake = runner(); fake.probe.mockResolvedValueOnce('CLI_AUTH_UNSUPPORTED');
    const provider = new CliProvider(fake);
    await expect(provider.generate(musicInput, { signal: new AbortController().signal, onStage() {} })).rejects.toMatchObject({ code: 'CLI_AUTH_UNSUPPORTED' });
    expect(fake.compose).not.toHaveBeenCalled();
    fake.compose.mockResolvedValueOnce({ code: 'shell/private' });
    await expect(provider.generate(musicInput, { signal: new AbortController().signal, onStage() {} })).rejects.toMatchObject({ code: 'CLI_INVALID_OUTPUT' });
    expect(fake.compose).toHaveBeenCalledTimes(1);
  });
  it('fails a partially composed batch without a partial result, retry or fallback', async () => {
    const fake = runner(); fake.compose.mockImplementationOnce(async prompt => score(fromPrompt(prompt))).mockRejectedValueOnce(new ProviderError('CLI_LIMIT_REACHED'));
    await expect(new CliProvider(fake).generate(musicInput, { signal: new AbortController().signal, onStage() {} })).rejects.toMatchObject({ code: 'CLI_LIMIT_REACHED' });
    expect(fake.compose).toHaveBeenCalledTimes(2);
  });
  it('cancels between variations and while consuming locally rendered PCM', async () => {
    const fake = runner(); const aborted = new AbortController();
    fake.compose.mockImplementationOnce(async prompt => { aborted.abort('private'); return score(fromPrompt(prompt)); });
    await expect(new CliProvider(fake).generate(musicInput, { signal: aborted.signal, onStage() {} })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.compose).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    const tracks = await new CliProvider(runner()).generate({ ...musicInput, variationCount: 1 }, { signal: controller.signal, onStage() {} });
    const stream = tracks[0]!.audio[Symbol.asyncIterator](); await stream.next(); controller.abort();
    await expect(stream.next()).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('defaults to 150 seconds in the exact JSON musical request', async () => {
    const fake = runner();
    await new CliProvider(fake).generate({ prompt: '새로운 곡', settings: {}, variationCount: 1 }, { signal: new AbortController().signal, onStage() {} });
    expect(fromPrompt(fake.compose.mock.calls[0]![0]).settings.durationSeconds).toBe(150);
  });
});

const apps = new Set<NestExpressApplication>(); const directories: string[] = [];
afterEach(async () => { for (const app of apps) await app.close(); apps.clear(); for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function appFor(fake: CompositionRunner, root = mkdtempSync('/private/tmp/soundry-cli-api-'), musicProvider = 'cli') {
  if (!directories.includes(root)) directories.push(root);
  const app = await createApplication({ dataDir: root, musicProvider, uiPort: '5173', cliRunnerOverride: fake }); apps.add(app);
  await app.listen(0, '127.0.0.1');
  const port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
  async function api(method: string, path: string, body?: unknown) {
    return new Promise<{ status: number; value: Record<string, unknown> }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, method, path: '/api' + path, headers: { host: 'localhost:3000', origin: 'http://localhost:5173', 'content-type': 'application/json' } }, response => {
        let text = ''; response.setEncoding('utf8'); response.on('data', data => { text += data; });
        response.on('end', () => resolve({ status: response.statusCode!, value: JSON.parse(text) as Record<string, unknown> }));
      }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  return { app, api, root };
}
async function terminal(api: Awaited<ReturnType<typeof appFor>>['api'], id: string) {
  for (let count = 0; count < 250; count++) {
    const row = (await api('GET', '/generations/' + id)).value as unknown as GenerationSummary;
    if (!['queued', 'processing'].includes(row.status)) return row;
    await delay(20);
  }
  throw new Error('local fixture generation did not complete');
}
describe('CLI API and persistence integration', () => {
  it('serves health and projects while readiness is pending; rejects unconfigured new requests before INSERT', async () => {
    const fake = runner(); let ready!: () => void;
    fake.probe.mockImplementation(signal => new Promise(resolve => { ready = () => resolve('CLI_LOGIN_REQUIRED'); signal.addEventListener('abort', () => resolve('CLI_UNAVAILABLE'), { once: true }); }));
    const { app, api } = await appFor(fake);
    expect((await api('GET', '/health')).status).toBe(200);
    const project = (await api('POST', '/projects', { name: '로그인 없어도 로컬 앱' })).value;
    expect((await api('POST', '/projects/' + project.id + '/generations', { ...musicInput, requestKey: randomUUID() })).status).toBe(503);
    fake.probe.mockResolvedValue('CLI_LOGIN_REQUIRED'); ready(); await app.get(ProviderService).refreshConfiguration();
    const summary = await api('GET', '/providers/current'); // another explicit probe
    expect(summary.value.configured).toBe(false);
    expect(app.get(DatabaseService).client.prepare('SELECT COUNT(*) n FROM generations').get()).toEqual({ n: 0 });
    expect(fake.compose).not.toHaveBeenCalled();
  });
  it('stores a real 90-second rendered WAV and preserves input/metadata/idempotency across a provider switch', async () => {
    const fake = runner(); const { app, api, root } = await appFor(fake); await app.get(ProviderService).refreshConfiguration();
    const project = (await api('POST', '/projects', { name: '실제 렌더러 통합' })).value;
    const body = { ...musicInput, variationCount: 1, requestKey: randomUUID() };
    const accepted = await api('POST', '/projects/' + project.id + '/generations', body); expect(accepted.status).toBe(202);
    const complete = await terminal(api, String(accepted.value.id));
    expect(complete.status).toBe('completed'); expect(complete.provider).toBe('cli');
    expect(complete.tracks).toHaveLength(1);
    const track = complete.tracks[0]!;
    expect(track).toMatchObject({ bpm: 120, genre: 'Jazz', mood: 'warm', seed: 'original-seed', durationSeconds: 90, model: CLI_MODEL, mimeType: 'audio/wav', byteSize: 44 + 90 * 44100 * 4 });
    expect(Object.keys(track)).not.toContain('audioPath');
    const audioFiles = readdirSync(join(root, 'audio')); expect(audioFiles).toHaveLength(1);
    const audio = readFileSync(join(root, 'audio', audioFiles[0]!)); expect(audio.subarray(0, 4).toString()).toBe('RIFF'); expect(audio.length).toBe(track.byteSize);
    await app.close(); apps.delete(app);
    const restarted = await appFor(fake, root, 'mock');
    const same = await restarted.api('POST', '/projects/' + project.id + '/generations', body);
    expect(same.status).toBe(200); expect(same.value.id).toBe(complete.id);
    expect((same.value.tracks as TrackSummary[])[0]!.durationSeconds).toBe(90);
    expect((await restarted.api('POST', '/projects/' + project.id + '/generations', { ...body, requestKey: randomUUID() })).status).toBe(400);
    expect(fake.compose).toHaveBeenCalledTimes(1);
  }, 15000);
  it('rejects impossible musical fields before accepting and publishes only safe execution errors', async () => {
    const fake = runner(); const { app, api } = await appFor(fake); await app.get(ProviderService).refreshConfiguration();
    const project = (await api('POST', '/projects', { name: '안전한 실패' })).value;
    for (const settings of [{ seed: 'x'.repeat(65) }, { mood: 'line\nbreak' }, { genre: 'tab\tvalue' }]) {
      const result = await api('POST', '/projects/' + project.id + '/generations', { ...musicInput, settings, requestKey: randomUUID() });
      expect(result.status).toBe(400);
    }
    expect(fake.compose).not.toHaveBeenCalled();
    fake.compose.mockRejectedValueOnce(new Error('private-key /private/path external-url'));
    const job = await api('POST', '/projects/' + project.id + '/generations', { ...musicInput, requestKey: randomUUID() });
    const failed = await terminal(api, String(job.value.id));
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'CLI_FAILED', tracks: [] });
    expect(failed.errorMessage).not.toMatch(/private|key|external/); expect(fake.compose).toHaveBeenCalledTimes(1);
  });
});
