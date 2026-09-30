import type { GenerationInput, GenerationSettings, ProviderCapabilities } from '../../../shared/contracts.js';

/** Server-only contract; paths, remote URLs and credentials never cross this boundary. */
export interface ProviderContext {
  signal: AbortSignal;
  onStage(stage: 'generating' | 'saving'): void;
}

export interface ProviderTrack {
  /** Single-use source. Cancellation applies throughout consumption, not only generate(). */
  audio: AsyncIterable<Uint8Array>;
  mediaType: 'audio/wav' | 'audio/mpeg';
  extension: 'wav' | 'mp3';
  model: string;
  metadata: Omit<GenerationSettings, 'mode'>;
}

export interface MusicGenerationProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generate(input: GenerationInput, context: ProviderContext): Promise<readonly ProviderTrack[]>;
}
