import type { GenerationSummary, TrackSummary } from '../../../../shared/contracts';
export function jobFixture(overrides: Partial<GenerationSummary> = {}): GenerationSummary {
  return { id: 'job-one', projectId: 'project-one', prompt: 'A rain-washed city', settings: {}, variationCount: 1, requestKey: 'key-one', sourceGenerationId: null, provider: 'mock', model: 'demo-fixture', status: 'queued', stage: null, progress: null, errorCode: null, errorMessage: null, createdAt: '2026-10-01T00:00:00.000Z', startedAt: null, finishedAt: null, tracks: [], ...overrides };
}
export function trackFixture(): TrackSummary {
  return { id: 'track-one', projectId: 'project-one', generationId: 'job-one', variationIndex: 0, title: 'Demo result', prompt: 'A rain-washed city', audioUrl: '/api/tracks/track-one/audio', downloadUrl: '/api/tracks/track-one/download', mimeType: 'audio/wav', byteSize: 768044, durationSeconds: 8, bpm: null, genre: null, mood: null, seed: null, provider: 'mock', model: 'demo-fixture', favorite: false, createdAt: '2026-10-01T00:00:00.000Z' };
}
