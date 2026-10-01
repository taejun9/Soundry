import type { TrackSummary } from '../../../shared/contracts';

/** Media never points at a provider or an arbitrary URL returned in JSON. */
export function hasLocalTrackUrls(track: Pick<TrackSummary, 'id' | 'audioUrl' | 'downloadUrl'>): boolean {
  const path = `/api/tracks/${encodeURIComponent(track.id)}`;
  return track.audioUrl === `${path}/audio` && track.downloadUrl === `${path}/download`;
}
