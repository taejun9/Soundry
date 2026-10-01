/**
 * 전역 보관함 조회의 필터와 cursor 계약이다. HTTP query 문자열을 명시적으로 파싱해 암묵적인 truthy/숫자 변환을 피한다.
 * createdAt/ID cursor는 제목·즐겨찾기 변경이나 경계 행 삭제 이후에도 같은 정렬 위치를 표현한다.
 */
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
// 페이지 경계 자체를 저장하므로 다음 조회에서 기준 트랙 row가 존재할 필요는 없다.
export function encodeTrackCursor(track: TrackCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: track.createdAt, id: track.id })).toString('base64url');
}
// 반복 query는 배열이 될 수 있으므로 문자열 이외 값을 거부한다. favorite=false와 필터 생략을 구분한다.
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
  // cursor는 작은 canonical base64url JSON만 받는다. 다른 필드 구조나 잘못된 UTC 시각을 우연히 수용하지 않는다.
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
