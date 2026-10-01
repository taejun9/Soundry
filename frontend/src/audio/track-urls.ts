/**
 * 음원 재생과 다운로드를 해당 track ID의 로컬 API 경로로만 제한한다.
 * 외부 공급자 주소나 다른 음원의 주소가 JSON에 섞여도 브라우저가 요청하지 않도록 사용 전에 확인한다.
 */
import type { TrackSummary } from '../../../shared/contracts';

/** Media never points at a provider or an arbitrary URL returned in JSON. */
export function hasLocalTrackUrls(track: Pick<TrackSummary, 'id' | 'audioUrl' | 'downloadUrl'>): boolean {
  const path = `/api/tracks/${encodeURIComponent(track.id)}`;
  return track.audioUrl === `${path}/audio` && track.downloadUrl === `${path}/download`;
}
