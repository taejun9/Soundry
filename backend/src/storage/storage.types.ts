import type { ProviderTrack } from '../providers/music-generation-provider.js';

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
export interface BatchStorage {
  saveBatch(generationId: string, sources: readonly ProviderTrack[], signal: AbortSignal): Promise<StoredAudio[]>;
  /** True indicates files remain for the next startup cleanup. */
  discardBatch(batch: readonly StoredAudio[]): boolean;
}
