/**
 * 공급자 stream을 로컬 파일로 확정하는 저장 계층 계약이다. 저장된 경로는 서버 내부에서만 사용한다.
 * 파일 이동 완료와 DB commit은 별개이므로 호출자가 실패한 batch를 보상 삭제할 수 있게 한다.
 */
import type { ProviderTrack } from '../providers/music-generation-provider.js';

// durationSeconds/byteSize는 실제 파일 검사 결과다. metadata의 요청 추정값으로 측정값을 대체하지 않는다.
export interface StoredAudio {
  id: string;
  audioPath: string;
  mimeType: 'audio/wav';
  byteSize: number;
  durationSeconds: number;
  model: string;
  metadata: ProviderTrack['metadata'];
}
export class StorageError extends Error {
  constructor(readonly code: 'INVALID_AUDIO' | 'AUDIO_TOO_LARGE' | 'STORAGE_FAILED') {
    super(code);
    this.name = 'StorageError';
  }
}
/** Runtime StorageService implements this boundary; all paths stay server-side. */
// saveBatch는 전 variation 검증 후 최종 파일들을 반환한다. 부분 실패 시 저장 계층이 자신이 만든 파일을 정리한다.
export interface BatchStorage {
  saveBatch(generationId: string, sources: readonly ProviderTrack[], signal: AbortSignal): Promise<StoredAudio[]>;
  /** True indicates files remain for the next startup cleanup. */
  discardBatch(batch: readonly StoredAudio[]): boolean;
}
