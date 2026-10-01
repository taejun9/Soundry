/**
 * 프로젝트를 가로지르는 즐겨찾기 조회 경계. 음원 계약에 projectName과 필터 일치 검사를 추가한다.
 * 목록의 순서와 cursor는 서버가 소유하며, 알려지지 않은 음악 metadata는 null로 보존한다.
 */
import type { LibraryTrackSummary, Page } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';
import { isTrackSummary } from './generations';

/** 공통 음원 검증에 비어 있지 않은 프로젝트 표시 이름을 요구한다. */
export function parseLibraryTrack(value: unknown): LibraryTrackSummary {
  if (!isTrackSummary(value) || !('projectName' in value) || typeof value.projectName !== 'string' || !value.projectName.trim()) throw new ApiError('보관함 음원 정보를 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_LIBRARY_RESPONSE');
  return value as LibraryTrackSummary;
}
/** 서버가 필터를 누락한 응답을 보내도 즐겨찾기/프로젝트 조건을 다시 확인한 뒤 반환한다. */
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
