import { AppError } from '../api-errors.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(message: string): never { throw new AppError(400, 'INVALID_INPUT', message); }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export interface TrackCursor { createdAt: string; id: string }
export interface TrackListQuery {
  limit: number;
  favorite?: boolean;
  projectId?: string;
  cursor?: TrackCursor;
}
export function encodeTrackCursor(track: TrackCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: track.createdAt, id: track.id })).toString('base64url');
}
export function trackListQuery(query: Record<string, unknown>): TrackListQuery {
  if (!object(query) || Object.keys(query).some((key) => !['limit', 'cursor', 'favorite', 'projectId'].includes(key))) invalid('지원하지 않는 음원 조회 조건입니다.');
  const limit = query.limit === undefined ? 30 : typeof query.limit === 'string' && /^[0-9]+$/.test(query.limit) ? Number(query.limit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid('목록 개수는 1–100 사이의 정수여야 합니다.');
  const result: TrackListQuery = { limit };
  if (query.favorite !== undefined) {
    if (query.favorite !== 'true' && query.favorite !== 'false') invalid('즐겨찾기 필터는 true 또는 false로 입력해 주세요.');
    result.favorite = query.favorite === 'true';
  }
  if (query.projectId !== undefined) {
    if (typeof query.projectId !== 'string' || !uuidPattern.test(query.projectId)) invalid('올바른 프로젝트 ID가 필요합니다.');
    result.projectId = query.projectId.toLowerCase();
  }
  if (query.cursor !== undefined) {
    try {
      const value = query.cursor;
      if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
      const decoded = Buffer.from(value, 'base64url');
      if (decoded.toString('base64url') !== value) throw new Error();
      const cursor: unknown = JSON.parse(decoded.toString('utf8'));
      if (!object(cursor) || Object.keys(cursor).length !== 2 || typeof cursor.id !== 'string' || typeof cursor.createdAt !== 'string') throw new Error();
      if (!uuidPattern.test(cursor.id) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.createdAt) || new Date(cursor.createdAt).toISOString() !== cursor.createdAt) throw new Error();
      result.cursor = { createdAt: cursor.createdAt, id: cursor.id.toLowerCase() };
    } catch { invalid('목록 위치가 올바르지 않습니다. 목록을 새로고침해 주세요.'); }
  }
  return result;
}
