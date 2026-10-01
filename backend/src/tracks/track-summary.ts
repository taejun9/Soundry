import type { TrackSummary } from '../../../shared/contracts.js';
import type { generations, tracks } from '../database/schema.js';

/** Public metadata is shared by generation history and the individual track API. */
export function trackSummary(track: typeof tracks.$inferSelect, generation: Pick<typeof generations.$inferSelect, 'id' | 'projectId' | 'prompt'>): TrackSummary {
  return {
    id: track.id, projectId: generation.projectId, generationId: generation.id, variationIndex: track.variationIndex,
    title: track.title, prompt: generation.prompt, audioUrl: `/api/tracks/${track.id}/audio`, downloadUrl: `/api/tracks/${track.id}/download`,
    mimeType: track.mimeType, byteSize: track.byteSize, durationSeconds: track.durationSeconds,
    bpm: track.bpm, genre: track.genre, mood: track.mood, seed: track.seed, provider: track.provider,
    model: track.model, favorite: track.favorite, createdAt: track.createdAt,
  };
}
