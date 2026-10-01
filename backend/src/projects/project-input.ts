/**
 * 프로젝트 HTTP 입력을 정규화하고 잘못된 값은 공개 가능한 400 오류로 변환한다.
 * 타입스크립트 선언과 별개로 JSON/query의 런타임 타입, 크기, 알 수 없는 필드를 검사한다.
 */
import { AppError } from '../api-errors.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// UUID 대소문자를 정규화해 같은 ID의 중복 표현을 제거한다. 이름이나 경로를 ID로 사용하지 않는다.
export function projectId(value: string): string {
  if (!uuidPattern.test(value)) throw new AppError(400, 'INVALID_INPUT', '올바른 프로젝트 ID가 필요합니다.');
  return value.toLowerCase();
}

// 요청에는 name 하나만 허용한다. trim 이후 길이를 제한하고 DB 문자열을 끊는 NUL은 거부한다.
export function projectName(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || !('name' in body) || typeof body.name !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', '프로젝트 이름만 입력해 주세요.');
  }
  if (body.name.includes('\0')) throw new AppError(400, 'INVALID_INPUT', '프로젝트 이름에 사용할 수 없는 문자가 있습니다.');
  const name = body.name.trim();
  if (name.length < 1 || name.length > 120) throw new AppError(400, 'INVALID_INPUT', '프로젝트 이름은 1–120자로 입력해 주세요.');
  return name;
}

export type ProjectCursor = { updatedAt: string; id: string };
// 정렬에 사용한 수정 시각과 ID를 함께 보존해 같은 시각의 프로젝트도 빠짐없이 이어 읽는다.
export function encodeCursor(project: ProjectCursor): string {
  return Buffer.from(JSON.stringify({ updatedAt: project.updatedAt, id: project.id })).toString('base64url');
}

// 숫자 문자열만 허용해 반복 query/소수/NaN을 거부한다. cursor는 크기와 canonical base64url·UTC 날짜까지 검증한다.
export function projectListQuery(query: Record<string, unknown>): { limit: number; cursor?: ProjectCursor } {
  if (Object.keys(query).some((key) => key !== 'limit' && key !== 'cursor')) throw new AppError(400, 'INVALID_INPUT', '지원하지 않는 조회 조건입니다.');
  const limit = query.limit === undefined ? 30 : typeof query.limit === 'string' && /^[0-9]+$/.test(query.limit) ? Number(query.limit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError(400, 'INVALID_INPUT', '목록 개수는 1–100 사이의 정수여야 합니다.');
  if (query.cursor === undefined) return { limit };
  try {
    const value = query.cursor;
    if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new Error();
    const cursor = JSON.parse(decoded.toString('utf8')) as unknown;
    if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor) || Object.keys(cursor).length !== 2 || !('id' in cursor) || !('updatedAt' in cursor) || typeof cursor.id !== 'string' || typeof cursor.updatedAt !== 'string') throw new Error();
    if (!uuidPattern.test(cursor.id) || new Date(cursor.updatedAt).toISOString() !== cursor.updatedAt) throw new Error();
    return { limit, cursor: { id: cursor.id.toLowerCase(), updatedAt: cursor.updatedAt } };
  } catch { throw new AppError(400, 'INVALID_INPUT', '목록 위치가 올바르지 않습니다. 목록을 새로고침해 주세요.'); }
}
