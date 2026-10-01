/**
 * Mock이 실제 재생 가능한 fixture stream을 반환하되 AI 생성처럼 행동하지 않는 계약을 검증한다.
 * manifest·RIFF·SHA·길이를 교차 확인하고 generate 이전부터 소비 종료까지 취소/실패/자원 해제를 검사한다.
 */
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import type { ReadStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import type { GenerationInput } from '../../../shared/contracts.js';
import { REPOSITORY_ROOT } from '../config/storage-config.js';
import { MockProvider } from './mock-provider.js';
import type { ProviderContext } from './music-generation-provider.js';

const fixtureRoot = join(REPOSITORY_ROOT, 'backend', 'fixtures', 'audio');
const input: GenerationInput = { prompt: '수학 합성 데모 테스트', settings: {}, variationCount: 2 };
// signal과 단계 callback을 동시에 관측해 취소 후 saving 같은 잘못된 진행 이벤트가 발생하는지 확인한다.
function context(controller = new AbortController()) {
  return { signal: controller.signal, onStage: vi.fn<ProviderContext['onStage']>() };
}
// 작은 8초 테스트 fixture만 수집한다. 운영 다운로드/저장은 전체 byte를 메모리에 모으지 않는다.
async function collect(source: AsyncIterable<Uint8Array>) {
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function expectAbort(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({ name: 'AbortError', message: '음악 생성이 취소되었습니다.' });
}

// 결과 수 1–4를 모두 소비해 fixture 순환과 stream 독립성을 확인한다. 요청 prompt에 따른 합성은 주장하지 않는다.
describe('MockProvider real WAV contract', () => {
  it('returns 1–4 complete WAV streams, cycling independent sources with actual metadata', async () => {
    const manifest = JSON.parse(readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8')) as {
      files: { file: string; sha256: string; frames: number; sampleRate: number; durationSeconds: number }[];
    };
    const provider = new MockProvider({ delayMs: 0 });
    for (const variationCount of [1, 2, 3, 4]) {
      const ctx = context();
      const tracks = await provider.generate({ ...input, variationCount }, ctx);
      expect(tracks).toHaveLength(variationCount);
      expect(ctx.onStage.mock.calls.flat()).toEqual(['generating', 'saving']);
      for (const [index, track] of tracks.entries()) {
        const expected = manifest.files[index % 2]!;
        const bytes = await collect(track.audio);
        expect(bytes.equals(readFileSync(join(fixtureRoot, expected.file)))).toBe(true);
        expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString()).toBe('WAVE');
        expect(bytes.readUInt32LE(4) + 8).toBe(bytes.length);
        expect(bytes.readUInt16LE(20)).toBe(1);
        expect(bytes.readUInt16LE(22)).toBe(2);
        expect(bytes.readUInt32LE(24)).toBe(44_100);
        expect(bytes.readUInt16LE(34)).toBe(16);
        const actualDuration = bytes.readUInt32LE(40) / bytes.readUInt32LE(28);
        expect(track.metadata).toEqual({ durationSeconds: actualDuration });
        expect(actualDuration).toBe(expected.frames / expected.sampleRate);
        expect(actualDuration).toBe(expected.durationSeconds);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected.sha256);
        expect(track).toMatchObject({ mediaType: 'audio/wav', extension: 'wav', model: 'demo-fixture' });
      }
    }
  });

  it('does not pretend different prompts change the fixed fixture', async () => {
    const provider = new MockProvider({ delayMs: 0 });
    const a = await provider.generate({ ...input, prompt: '재즈', variationCount: 1 }, context());
    const b = await provider.generate({ ...input, prompt: '록', variationCount: 1 }, context());
    expect((await collect(a[0]!.audio)).equals(await collect(b[0]!.audio))).toBe(true);
    expect(a[0]!.metadata).toEqual({ durationSeconds: 8 });
  });

  it('waits for its injected delay before announcing saving', async () => {
    const ctx = context();
    let completed = false;
    const pending = new MockProvider({ delayMs: 30 }).generate(input, ctx).then((tracks) => { completed = true; return tracks; });
    await delay(5);
    expect(completed).toBe(false);
    expect(ctx.onStage.mock.calls.flat()).toEqual(['generating']);
    await pending;
    expect(ctx.onStage.mock.calls.flat()).toEqual(['generating', 'saving']);
  });

  it('rejects unsupported settings and counts before starting work', async () => {
    const ctx = context();
    const provider = new MockProvider({ delayMs: 0 });
    for (const value of [{ ...input, variationCount: 5 }, { ...input, settings: { seed: '42' } }, { ...input, settings: { mode: 'vocal' as const } }]) {
      await expect(provider.generate(value, ctx)).rejects.toMatchObject({ status: 400 });
    }
    expect(ctx.onStage).not.toHaveBeenCalled();
  });

  it('keeps capability mutation from enabling unsupported settings', () => {
    const provider = new MockProvider();
    provider.capabilities.settings.push('seed');
    provider.capabilities.maxVariations = 99;
    expect(provider.capabilities.settings).toEqual([]);
    expect(provider.capabilities.maxVariations).toBe(4);
  });
});

// 취소 위치를 지연 중·미소비·소비 중·멈춘 stream으로 나누어 모든 비동기 경계를 확인한다.
describe('MockProvider cancellation and failures', () => {
  it('honors cancellation before generate without stage updates or file access', async () => {
    const controller = new AbortController();
    controller.abort(new Error('private upstream reason'));
    const openAudio = vi.fn(() => Readable.from([Buffer.from('unused')]));
    const ctx = context(controller);
    await expectAbort(new MockProvider({ openAudio }).generate(input, ctx));
    expect(ctx.onStage).not.toHaveBeenCalled();
    expect(openAudio).not.toHaveBeenCalled();
  });

  it('interrupts the generation delay without announcing saving', async () => {
    const controller = new AbortController();
    const ctx = context(controller);
    const openAudio = vi.fn(() => Readable.from([]));
    const pending = new MockProvider({ delayMs: 30_000, openAudio }).generate(input, ctx);
    const check = expectAbort(pending);
    controller.abort();
    await check;
    expect(ctx.onStage.mock.calls.flat()).toEqual(['generating']);
    expect(openAudio).not.toHaveBeenCalled();
  });

  it('checks cancellation after generation and before opening an unconsumed stream', async () => {
    const controller = new AbortController();
    const openAudio = vi.fn(() => Readable.from([]));
    const tracks = await new MockProvider({ delayMs: 0, openAudio }).generate(input, context(controller));
    controller.abort();
    await expectAbort(collect(tracks[0]!.audio));
    expect(openAudio).not.toHaveBeenCalled();
  });

  // 대역 호출 수 대신 실제 ReadStream의 closed 상태를 확인해 FD가 남지 않는지 검증한다.
  it('destroys a real file stream when cancelled during consumption', async () => {
    const controller = new AbortController();
    let source: ReadStream | undefined;
    const provider = new MockProvider({ delayMs: 0, openAudio: (file) => {
      source = createReadStream(join(fixtureRoot, file), { highWaterMark: 1024 });
      return source;
    } });
    const tracks = await provider.generate(input, context(controller));
    const reader = tracks[0]!.audio[Symbol.asyncIterator]();
    expect((await reader.next()).value).toHaveLength(1024);
    controller.abort();
    await expectAbort(reader.next());
    expect(source?.destroyed).toBe(true);
    if (source && !source.closed) await new Promise<void>((resolve) => source!.once('close', resolve));
    expect(source?.closed).toBe(true);
  });

  it('aborts even while waiting for the next chunk of a stalled stream', async () => {
    const controller = new AbortController();
    const source = new Readable({ read() { /* A source that never produces its next chunk. */ } });
    const tracks = await new MockProvider({ delayMs: 0, openAudio: () => source }).generate(input, context(controller));
    const reader = tracks[0]!.audio[Symbol.asyncIterator]();
    const pending = reader.next();
    const check = expectAbort(pending);
    controller.abort();
    await check;
    expect(source.destroyed).toBe(true);
  });

  // consumer의 조기 break도 정상 종료 경로이므로 generator finally가 원본 stream을 닫아야 한다.
  it('closes the source when a consumer stops early', async () => {
    const source = Readable.from([Buffer.from('first'), Buffer.from('second')]);
    const tracks = await new MockProvider({ delayMs: 0, openAudio: () => source }).generate(input, context());
    for await (const chunk of tracks[0]!.audio) { expect(chunk).toEqual(Buffer.from('first')); break; }
    expect(source.destroyed).toBe(true);
  });

  it('rejects repeated consumption instead of reopening the same stream', async () => {
    const openAudio = vi.fn(() => Readable.from([Buffer.from('once')]));
    const tracks = await new MockProvider({ delayMs: 0, openAudio }).generate(input, context());
    expect(await collect(tracks[0]!.audio)).toEqual(Buffer.from('once'));
    await expect(collect(tracks[0]!.audio)).rejects.toMatchObject({ code: 'PROVIDER_STREAM_CONSUMED' });
    expect(openAudio).toHaveBeenCalledTimes(1);
  });

  it('supports a generation failure without returning fake successful tracks', async () => {
    const ctx = context();
    const openAudio = vi.fn(() => Readable.from([]));
    await expect(new MockProvider({ delayMs: 0, failGeneration: true, openAudio }).generate(input, ctx)).rejects.toMatchObject({ code: 'PROVIDER_FAILED' });
    expect(ctx.onStage.mock.calls.flat()).toEqual(['generating']);
    expect(openAudio).not.toHaveBeenCalled();
  });

  // 파일 열기와 중간 읽기 양쪽에서 원시 경로/에러가 노출되지 않고 source가 정리되어야 한다.
  it('sanitizes source-open and mid-stream errors and releases the source', async () => {
    for (const midStream of [false, true]) {
      const source = new Readable({ read() { this.destroy(new Error('/private/example FAL_KEY=example')); } });
      const openAudio = () => {
        if (!midStream) throw new Error('/private/example FAL_KEY=example');
        return source;
      };
      const tracks = await new MockProvider({ delayMs: 0, openAudio }).generate(input, context());
      await expect(collect(tracks[0]!.audio)).rejects.toMatchObject({ code: 'PROVIDER_AUDIO_FAILED', message: 'PROVIDER_AUDIO_FAILED' });
      if (midStream) expect(source.destroyed).toBe(true);
    }
  });

  it('can inject invalid bytes for downstream storage validation without changing metadata', async () => {
    const corrupt = Buffer.from('not a WAV');
    const tracks = await new MockProvider({ delayMs: 0, openAudio: () => Readable.from([corrupt]) }).generate(input, context());
    expect(await collect(tracks[0]!.audio)).toEqual(corrupt);
    expect(tracks[0]!.metadata).toEqual({ durationSeconds: 8 });
  });

  it('rejects invalid delay controls', () => {
    for (const delayMs of [-1, Infinity, NaN, 30_001]) expect(() => new MockProvider({ delayMs })).toThrow('INVALID_MOCK_DELAY');
  });
});
