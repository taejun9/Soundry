/**
 * backend 전용 음악 공급자 경계다. job/project ID·파일 경로·인증 정보는 adapter 계약에 포함하지 않는다.
 * 결과 metadata는 요청값의 추정 복사가 아니라 공급자/음원에서 실제 확인한 값이어야 한다.
 */
import type { GenerationInput, GenerationSettings, ProviderCapabilities } from '../../../shared/contracts.js';

/** Server-only contract; paths, remote URLs and credentials never cross this boundary. */
export interface ProviderContext {
  onComposition?(index: number, score: import('./composition/index.js').Composition): void;
  knowledge?: import('../knowledge/retrieval.js').RetrievedKnowledge[];
  signal: AbortSignal;
  onStage(stage: 'generating' | 'saving'): void;
}

// audio는 한 번만 소비한다. generate 반환 이후 파일 저장 중에도 동일 AbortSignal의 취소를 따라야 한다.
export interface ProviderTrack {
  /** Single-use source. Cancellation applies throughout consumption, not only generate(). */
  audio: AsyncIterable<Uint8Array>;
  mediaType: 'audio/wav' | 'audio/mpeg';
  extension: 'wav' | 'mp3';
  model: string;
  metadata: Omit<GenerationSettings, 'mode'>;
}

// capability는 UI와 서버 검증에 함께 쓰인다. generate 결과 개수는 요청 variationCount와 일치해야 한다.
export interface MusicGenerationProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  generate(input: GenerationInput, context: ProviderContext): Promise<readonly ProviderTrack[]>;
}
