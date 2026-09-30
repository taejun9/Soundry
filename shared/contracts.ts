/** JSON-only boundary: neither app may import server runtime through this file. */
export interface HealthResponse {
  status: 'ok';
  service: 'soundry-api';
}

export interface ApiErrorResponse {
  error: { code: string; message: string };
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  trackCount: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DeleteResult {
  deleted: true;
  cleanupPending: boolean;
}

export type MusicMode = 'instrumental' | 'vocal';
export type SettingKey = 'genre' | 'mood' | 'bpm' | 'durationSeconds' | 'seed';
export interface GenerationSettings {
  mode?: MusicMode;
  genre?: string;
  mood?: string;
  bpm?: number;
  durationSeconds?: number;
  seed?: string;
}
export interface GenerationInput {
  prompt: string;
  settings: GenerationSettings;
  variationCount: number;
}
export interface ProviderCapabilities {
  modes: MusicMode[];
  settings: SettingKey[];
  maxVariations: number;
  durationRangeSeconds?: { min: number; max: number };
  bpmRange?: { min: number; max: number };
  seedSupported: boolean;
  canCancelRemote: boolean;
}
export interface ProviderSummary {
  id: string;
  model: string | null;
  isMock: boolean;
  configured: boolean;
  generationEnabled: boolean;
  capabilities: ProviderCapabilities;
  notice: string;
}

export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type GenerationStage = 'preparing' | 'generating' | 'saving';
export interface CreateGenerationRequest extends GenerationInput {
  requestKey: string;
  sourceGenerationId?: string;
}
export interface TrackSummary {
  id: string;
  projectId: string;
  generationId: string;
  variationIndex: number;
  title: string;
  prompt: string;
  audioUrl: string;
  downloadUrl: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: number | null;
  bpm: number | null;
  genre: string | null;
  mood: string | null;
  seed: string | null;
  provider: string;
  model: string | null;
  favorite: boolean;
  createdAt: string;
}
export interface GenerationSummary {
  id: string;
  projectId: string;
  prompt: string;
  settings: GenerationSettings;
  variationCount: number;
  requestKey: string;
  sourceGenerationId: string | null;
  provider: string;
  model: string | null;
  status: GenerationStatus;
  stage: GenerationStage | null;
  progress: null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  tracks: TrackSummary[];
}
