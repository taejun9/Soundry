/**
 * 서버가 선택한 공급자 하나와 현재 준비 상태를 관리한다. CLI 준비 확인은 앱의 프로젝트/재생 기능 시작을 막지 않는다.
 * 공개 summary는 capability와 정제한 안내만 포함하고 credential이나 실행 경로를 제공하지 않는다.
 */
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { GenerationInput, ProviderSummary } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { MOCK_MODEL, MockProvider } from './mock-provider.js';
import { CLI_GENERATION_TIMEOUT_MS, CLI_MODEL, CliProvider, validateCliInput } from './cli-provider.js';
import { OllamaRunner } from './ollama-runner.js';
import type { CompositionRunner } from './cli-runner.js';
import type { MusicGenerationProvider } from './music-generation-provider.js';
import { providerMessage } from './provider-error.js';

// 기본은 실제 CLI이며 명시적인 mock만 허용한다. 오타를 숨기는 fallback은 만들지 않는다.
export function readMusicProvider(value: string | undefined): 'cli' | 'mock' | 'ollama' {
  if (value === undefined || value === 'cli') return 'cli';
  if (value === 'ollama') return 'ollama';
  if (value === 'mock') return 'mock';
  throw new Error('INVALID_MUSIC_PROVIDER');
}
/** One selected provider; readiness checks never block application startup or unrelated local routes. */
export class ProviderService implements OnModuleInit, OnModuleDestroy {
  readonly current: MusicGenerationProvider;
  private readonly probeController = new AbortController();
  private checking?: Promise<void>;
  constructor(name: string | undefined = process.env.MUSIC_PROVIDER, override?: MusicGenerationProvider, runner?: CompositionRunner) {
    const selected = readMusicProvider(name);
    const local = selected === 'ollama' ? new OllamaRunner() : undefined;
    this.current = override ?? (selected === 'mock' ? new MockProvider() : new CliProvider(runner ?? local, local ? { id: 'ollama', model: 'ollama:' + local.model + ':score-v1' } : {}));
  }
  get timeoutMs(): number { return ['cli', 'ollama'].includes(this.current.id) ? CLI_GENERATION_TIMEOUT_MS : 30_000; }
  onModuleInit(): void { void this.refreshConfiguration(); }
  async onModuleDestroy(): Promise<void> { this.probeController.abort(); await this.checking; }
  // 동시 상태 조회는 같은 probe promise를 공유한다. 종료 signal이 취소되면 새 probe를 만들지 않는다.
  async refreshConfiguration(): Promise<void> {
    if (!(this.current instanceof CliProvider) || this.probeController.signal.aborted) return;
    this.checking ??= this.current.probe(this.probeController.signal).catch(() => undefined).finally(() => { this.checking = undefined; });
    await this.checking;
  }
  validateInput(input: GenerationInput): void { if (['cli', 'ollama'].includes(this.current.id)) validateCliInput({ prompt: input.prompt, settings: input.settings, variationCount: input.variationCount }); }
  // 새 생성 접수 시점에만 준비 상태를 요구한다. 기존 이력과 음원 재생은 준비 여부와 무관하게 유지한다.
  assertConfigured(): void {
    if (this.current instanceof CliProvider && this.current.availability !== 'ready') throw new AppError(503, this.current.availability, providerMessage(this.current.availability));
  }
  // Mock의 고정 fixture와 실제 CLI 작곡을 명확히 표시하고, CLI 텍스트 전송과 로컬 합성의 경계를 안내한다.
  summary(): ProviderSummary {
    if (this.current.id === 'ollama' && this.current instanceof CliProvider) {
      const configured = this.current.availability === 'ready';
      return { id: 'ollama', model: this.current.model, isMock: false, configured, generationEnabled: configured, capabilities: this.current.capabilities,
        notice: (configured ? '' : providerMessage(this.current.availability as Exclude<typeof this.current.availability, 'ready'>) + ' ') + '로컬 LLM이 악보를 작곡하고 기존 합성기로 미리듣기를 만듭니다. 로그인·원격 API 없이 실행하며 클라우드 비활성 상태를 확인합니다. 작곡 지식 RAG는 모델 가중치 훈련이 아니며 상업 품질은 청취 평가가 필요합니다.' };
    }
    if (this.current.id === 'cli') {
      const availability = this.current instanceof CliProvider ? this.current.availability : 'ready';
      const configured = availability === 'ready';
      return { id: 'cli', model: CLI_MODEL, isMock: false, configured, generationEnabled: configured, capabilities: this.current.capabilities,
        notice: (configured ? '' : providerMessage(availability) + ' ') +
          '설치된 Codex CLI가 JSON 악보를 작곡하고 이 앱이 로컬에서 음원을 합성합니다. 프롬프트·설정 및 전송에 동의한 작곡 지식은 기존 ChatGPT 계정으로 전송되며 계정 사용 한도가 적용됩니다. 유료 음악 API는 사용하지 않습니다. 취소는 로컬 실행을 중단하며 이미 사용한 계정 한도를 되돌리지는 않습니다.' };
    }
    return { id: this.current.id, model: MOCK_MODEL, isMock: true, configured: true, generationEnabled: true,
      capabilities: this.current.capabilities, notice: '고정된 짧은 데모 음원을 사용하는 Mock 모드입니다. 프롬프트가 음원을 바꾸지 않으며 외부로 전송되지 않습니다.' };
  }
}
