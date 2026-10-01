/**
 * 음원 상세·이름/즐겨찾기 변경·삭제의 API 경계. 요청한 음원과 프로젝트의 식별자를 대조한다.
 * 요청 설정은 실제 출력 metadata와 별개로 유지하고 파일 시스템 경로는 브라우저에 전달하지 않는다.
 */
import type { DeleteResult, TrackDetail, UpdateTrackRequest } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';
import { isGenerationSettings, isTrackSummary } from './generations';

/** 음원의 실제 metadata와 별도 requestedSettings를 확인하고 요청한 항목인지 대조한다. */
export function parseTrackDetail(value: unknown, id: string, projectId: string): TrackDetail {
  if (!isTrackSummary(value) || value.id !== id || value.projectId !== projectId || !('requestedSettings' in value) || !isGenerationSettings(value.requestedSettings) || !('requestedVariationCount' in value) || typeof value.requestedVariationCount !== 'number' || !Number.isInteger(value.requestedVariationCount) || value.requestedVariationCount < 1 || value.requestedVariationCount > 4) {
    throw new ApiError('음원 정보를 확인하지 못했어요. 이력을 새로고침해 주세요.', 0, 'INVALID_TRACK_RESPONSE');
  }
  return value as TrackDetail;
}
/** 편집 전에 최신 상세를 읽어 오래된 카드 정보만으로 변경하지 않게 한다. */
export async function getTrack(id: string, projectId: string, signal: AbortSignal): Promise<TrackDetail> {
  return parseTrackDetail(await requestJson(`/tracks/${encodeURIComponent(id)}`, { signal }), id, projectId);
}
/** 이름 또는 favorite만 전달하며 응답도 같은 음원·프로젝트의 상세인지 확인한다. */
export async function updateTrack(id: string, projectId: string, body: UpdateTrackRequest, signal: AbortSignal): Promise<TrackDetail> {
  return parseTrackDetail(await requestJson(`/tracks/${encodeURIComponent(id)}`, { method: 'PATCH', body, signal }), id, projectId);
}
/** 삭제 성공을 추정하지 않고 명시적인 deleted/cleanupPending 응답을 요구한다. */
export async function deleteTrack(id: string, signal: AbortSignal): Promise<DeleteResult> {
  const value = await requestJson(`/tracks/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
  if (!value || typeof value !== 'object' || !('deleted' in value) || value.deleted !== true || !('cleanupPending' in value) || typeof value.cleanupPending !== 'boolean') throw new ApiError('삭제 결과를 확인하지 못했어요. 이력을 새로고침해 주세요.', 0, 'INVALID_TRACK_RESPONSE');
  return { deleted: true, cleanupPending: value.cleanupPending };
}
