/**
 * 외부 호출 없는 workflow 검증용 공급자다. 프롬프트와 무관한 자체 제작 8초 fixture를 반복 선택한다.
 * 실제 AI 생성물로 표시하지 않으며 지연/실패/읽기 대역은 프로세스 내부 테스트에서만 주입한다.
 */
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { addAbortSignal } from 'node:stream';
import type { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { GenerationInput, ProviderCapabilities } from '../../../shared/contracts.js';
import { REPOSITORY_ROOT } from '../config/storage-config.js';
import { validateGenerationInput } from '../generations/generation-input.js';
import type { MusicGenerationProvider, ProviderContext, ProviderTrack } from './music-generation-provider.js';

export const MOCK_MODEL = 'demo-fixture';
export const MOCK_DELAY_MS = 350;
export type MockFixtureName = 'demo-01.wav' | 'demo-02.wav';
const fixtures: readonly MockFixtureName[] = ['demo-01.wav', 'demo-02.wav'];

// fixture가 반영하지 않는 BPM/길이/seed/vocal 설정은 지원한다고 주장하지 않는다.
export function mockCapabilities(): ProviderCapabilities {
  return { modes: ['instrumental'], settings: [], maxVariations: 4, seedSupported: false, canCancelRemote: false };
}

/** Injectable test controls are local dependencies; no env or API debug switches. */
export interface MockProviderOptions {
  delayMs?: number;
  failGeneration?: boolean;
  openAudio?: (file: MockFixtureName) => Readable;
}

export class MockProviderError extends Error {
  constructor(readonly code: 'PROVIDER_FAILED' | 'PROVIDER_AUDIO_FAILED' | 'PROVIDER_STREAM_CONSUMED') {
    super(code);
    this.name = 'MockProviderError';
  }
}

function checkCancellation(signal: AbortSignal): void {
  // Do not copy signal.reason, which can contain an upstream response or local path.
  if (signal.aborted) throw new DOMException('음악 생성이 취소되었습니다.', 'AbortError');
}

// 파일은 소비할 때 열고 끝/실패/취소에서 닫는다. 동일 결과를 두 번 소비해 예기치 않은 중복 저장을 만들 수 없다.
function audioSource(file: MockFixtureName, signal: AbortSignal, openAudio: NonNullable<MockProviderOptions['openAudio']>): AsyncIterable<Uint8Array> {
  let consumed = false;
  return {
    async *[Symbol.asyncIterator]() {
      if (consumed) throw new MockProviderError('PROVIDER_STREAM_CONSUMED');
      consumed = true;
      checkCancellation(signal);
      let source: Readable | undefined;
      try {
        source = addAbortSignal(signal, openAudio(file));
        for await (const rawChunk of source) {
          checkCancellation(signal);
          const chunk: unknown = rawChunk;
          if (!(chunk instanceof Uint8Array)) throw new MockProviderError('PROVIDER_AUDIO_FAILED');
          yield chunk;
        }
        checkCancellation(signal);
      } catch {
        checkCancellation(signal);
        throw new MockProviderError('PROVIDER_AUDIO_FAILED');
      } finally {
        source?.destroy();
      }
    },
  };
}

export class MockProvider implements MusicGenerationProvider {
  readonly id = 'mock';
  private readonly delayMs: number;
  private readonly failGeneration: boolean;
  private readonly openAudio: NonNullable<MockProviderOptions['openAudio']>;

  constructor(options: MockProviderOptions = {}) {
    this.delayMs = options.delayMs ?? MOCK_DELAY_MS;
    if (!Number.isFinite(this.delayMs) || this.delayMs < 0 || this.delayMs > 30_000) throw new Error('INVALID_MOCK_DELAY');
    this.failGeneration = options.failGeneration ?? false;
    this.openAudio = options.openAudio ?? ((file) => createReadStream(join(REPOSITORY_ROOT, 'backend', 'fixtures', 'audio', file), { highWaterMark: 64 * 1024 }));
  }

  get capabilities(): ProviderCapabilities { return mockCapabilities(); }

  // 입력·취소를 확인한 뒤 작은 지연으로 비동기 job 흐름을 재현한다. variation 수만큼 fixture를 순환해 반환한다.
  async generate(input: GenerationInput, context: ProviderContext): Promise<readonly ProviderTrack[]> {
    checkCancellation(context.signal);
    const validated = validateGenerationInput(input, this.capabilities);
    context.onStage('generating');
    checkCancellation(context.signal);
    try {
      await delay(this.delayMs, undefined, { signal: context.signal });
    } catch {
      checkCancellation(context.signal);
      throw new MockProviderError('PROVIDER_FAILED');
    }
    checkCancellation(context.signal);
    if (this.failGeneration) throw new MockProviderError('PROVIDER_FAILED');
    const tracks = Array.from({ length: validated.variationCount }, (_, index): ProviderTrack => ({
      audio: audioSource(fixtures[index % fixtures.length]!, context.signal, this.openAudio),
      mediaType: 'audio/wav', extension: 'wav', model: MOCK_MODEL,
      // Both committed fixtures are exactly 8 seconds; byte/manifest agreement is tested.
      metadata: { durationSeconds: 8 },
    }));
    context.onStage('saving');
    checkCancellation(context.signal);
    return tracks;
  }
}
