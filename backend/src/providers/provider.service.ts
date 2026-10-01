import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { GenerationInput, ProviderSummary } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { MOCK_MODEL, MockProvider } from './mock-provider.js';
import { CLI_GENERATION_TIMEOUT_MS, CLI_MODEL, CliProvider, validateCliInput } from './cli-provider.js';
import type { CompositionRunner } from './cli-runner.js';
import type { MusicGenerationProvider } from './music-generation-provider.js';
import { providerMessage } from './provider-error.js';

export function readMusicProvider(value: string | undefined): 'cli' | 'mock' {
  if (value === undefined || value === 'cli') return 'cli';
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
    this.current = override ?? (selected === 'mock' ? new MockProvider() : new CliProvider(runner));
  }
  get timeoutMs(): number { return this.current.id === 'cli' ? CLI_GENERATION_TIMEOUT_MS : 30_000; }
  onModuleInit(): void { void this.refreshConfiguration(); }
  async onModuleDestroy(): Promise<void> { this.probeController.abort(); await this.checking; }
  async refreshConfiguration(): Promise<void> {
    if (!(this.current instanceof CliProvider) || this.probeController.signal.aborted) return;
    this.checking ??= this.current.probe(this.probeController.signal).catch(() => undefined).finally(() => { this.checking = undefined; });
    await this.checking;
  }
  validateInput(input: GenerationInput): void { if (this.current.id === 'cli') validateCliInput({ prompt: input.prompt, settings: input.settings, variationCount: input.variationCount }); }
  assertConfigured(): void {
    if (this.current instanceof CliProvider && this.current.availability !== 'ready') throw new AppError(503, this.current.availability, providerMessage(this.current.availability));
  }
  summary(): ProviderSummary {
    if (this.current.id === 'cli') {
      const availability = this.current instanceof CliProvider ? this.current.availability : 'ready';
      const configured = availability === 'ready';
      return { id: 'cli', model: CLI_MODEL, isMock: false, configured, generationEnabled: configured, capabilities: this.current.capabilities,
        notice: (configured ? '' : providerMessage(availability) + ' ') +
          '설치된 Codex CLI가 JSON 악보를 작곡하고 이 앱이 로컬에서 음원을 합성합니다. 프롬프트와 설정은 기존 ChatGPT 계정으로 전송되며 계정 사용 한도가 적용됩니다. 유료 음악 API는 사용하지 않습니다. 취소는 로컬 실행을 중단하며 이미 사용한 계정 한도를 되돌리지는 않습니다.' };
    }
    return { id: this.current.id, model: MOCK_MODEL, isMock: true, configured: true, generationEnabled: true,
      capabilities: this.current.capabilities, notice: '고정된 짧은 데모 음원을 사용하는 Mock 모드입니다. 프롬프트가 음원을 바꾸지 않으며 외부로 전송되지 않습니다.' };
  }
}
