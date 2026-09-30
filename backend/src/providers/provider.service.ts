import type { ProviderSummary } from '../../../shared/contracts.js';
import { MOCK_MODEL, MockProvider } from './mock-provider.js';
import type { MusicGenerationProvider } from './music-generation-provider.js';

export function readMusicProvider(value: string | undefined): 'mock' {
  if (value === undefined || value === 'mock') return 'mock';
  throw new Error('INVALID_MUSIC_PROVIDER');
}

/** One selected provider owns both the runtime behavior and its public capability summary. */
export class ProviderService {
  readonly current: MusicGenerationProvider;

  constructor(name: string | undefined = process.env.MUSIC_PROVIDER) {
    readMusicProvider(name);
    this.current = new MockProvider();
  }

  summary(): ProviderSummary {
    return {
      id: this.current.id, model: MOCK_MODEL, isMock: true, configured: true,
      generationEnabled: false, capabilities: this.current.capabilities,
      notice: '고정된 짧은 데모 음원을 사용하는 Mock 모드입니다. 프롬프트가 음원을 바꾸지 않으며 외부로 전송되지 않습니다. 음악 생성 기능은 준비 중입니다.',
    };
  }
}
