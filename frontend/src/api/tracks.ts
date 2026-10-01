import type { DeleteResult, TrackDetail, UpdateTrackRequest } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';
import { isGenerationSettings, isTrackSummary } from './generations';

export function parseTrackDetail(value: unknown, id: string, projectId: string): TrackDetail {
  if (!isTrackSummary(value) || value.id !== id || value.projectId !== projectId || !('requestedSettings' in value) || !isGenerationSettings(value.requestedSettings) || !('requestedVariationCount' in value) || typeof value.requestedVariationCount !== 'number' || !Number.isInteger(value.requestedVariationCount) || value.requestedVariationCount < 1 || value.requestedVariationCount > 4) {
    throw new ApiError('음원 정보를 확인하지 못했어요. 이력을 새로고침해 주세요.', 0, 'INVALID_TRACK_RESPONSE');
  }
  return value as TrackDetail;
}
export async function getTrack(id: string, projectId: string, signal: AbortSignal): Promise<TrackDetail> {
  return parseTrackDetail(await requestJson(`/tracks/${encodeURIComponent(id)}`, { signal }), id, projectId);
}
export async function updateTrack(id: string, projectId: string, body: UpdateTrackRequest, signal: AbortSignal): Promise<TrackDetail> {
  return parseTrackDetail(await requestJson(`/tracks/${encodeURIComponent(id)}`, { method: 'PATCH', body, signal }), id, projectId);
}
export async function deleteTrack(id: string, signal: AbortSignal): Promise<DeleteResult> {
  const value = await requestJson(`/tracks/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
  if (!value || typeof value !== 'object' || !('deleted' in value) || value.deleted !== true || !('cleanupPending' in value) || typeof value.cleanupPending !== 'boolean') throw new ApiError('삭제 결과를 확인하지 못했어요. 이력을 새로고침해 주세요.', 0, 'INVALID_TRACK_RESPONSE');
  return { deleted: true, cleanupPending: value.cleanupPending };
}
