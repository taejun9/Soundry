import type { LibraryTrackSummary, Page } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';
import { isTrackSummary } from './generations';

export function parseLibraryTrack(value: unknown): LibraryTrackSummary {
  if (!isTrackSummary(value) || !('projectName' in value) || typeof value.projectName !== 'string' || !value.projectName.trim()) throw new ApiError('보관함 음원 정보를 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_LIBRARY_RESPONSE');
  return value as LibraryTrackSummary;
}
export async function listFavorites(cursor: string | null, signal: AbortSignal, projectId?: string): Promise<Page<LibraryTrackSummary>> {
  const query = new URLSearchParams({ favorite: 'true', limit: '30' });
  if (cursor) query.set('cursor', cursor);
  if (projectId) query.set('projectId', projectId);
  const value = await requestJson(`/tracks?${query}`, { signal });
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items) || !('nextCursor' in value) || !(value.nextCursor === null || typeof value.nextCursor === 'string')) throw new ApiError('보관함 목록을 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_LIBRARY_RESPONSE');
  const items = value.items.map(parseLibraryTrack);
  if (items.some(track => !track.favorite || (projectId && track.projectId !== projectId))) throw new ApiError('요청한 보관함 목록과 응답이 달라요. 다시 불러와 주세요.', 0, 'INVALID_LIBRARY_RESPONSE');
  return { items, nextCursor: value.nextCursor };
}
