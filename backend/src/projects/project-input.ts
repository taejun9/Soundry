import { AppError } from '../api-errors.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function projectId(value: string): string {
  if (!uuidPattern.test(value)) throw new AppError(400, 'INVALID_INPUT', '올바른 프로젝트 ID가 필요합니다.');
  return value.toLowerCase();
}

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
export function encodeCursor(project: ProjectCursor): string {
  return Buffer.from(JSON.stringify({ updatedAt: project.updatedAt, id: project.id })).toString('base64url');
}

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
