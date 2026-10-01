/**
 * 프로젝트 CRUD의 JSON 경계. TypeScript 선언만 신뢰하지 않고 날짜·음원 수·페이지 모양을 확인한다.
 * 삭제 응답의 cleanupPending은 DB 삭제 성공과 원본 파일 정리 지연을 구분하기 위해 그대로 전달한다.
 */
import type { DeleteResult, Page, ProjectSummary } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';

/** UI에서 사용하는 날짜와 음원 수를 확인해 잘못된 JSON이 렌더링 오류나 허위 수치로 이어지지 않게 한다. */
function isProject(value: unknown): value is ProjectSummary {
  return typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'string' &&
    'name' in value && typeof value.name === 'string' &&
    'createdAt' in value && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) &&
    'updatedAt' in value && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) &&
    'trackCount' in value && typeof value.trackCount === 'number' && Number.isInteger(value.trackCount) && value.trackCount >= 0;
}

/** 모든 잘못된 프로젝트 응답을 같은 안전한 재조회 안내로 변환한다. */
function invalidResponse(): never {
  throw new ApiError('서버 응답을 확인하지 못했어요. 목록을 새로고침해 주세요.', 0, 'INVALID_RESPONSE');
}

/** 단일 항목을 공통 guard로 좁힌 뒤 도메인 타입으로 반환한다. */
function projectResult(value: unknown): ProjectSummary {
  if (!isProject(value)) return invalidResponse();
  return value;
}

/** 서버 cursor를 변경하지 않고 목록과 다음 페이지 필드의 모양을 함께 검사한다. */
export async function listProjects(cursor: string | null, signal: AbortSignal): Promise<Page<ProjectSummary>> {
  const query = new URLSearchParams({ limit: '30' });
  if (cursor) query.set('cursor', cursor);
  const result = await requestJson(`/projects?${query.toString()}`, { signal });
  if (typeof result !== 'object' || result === null ||
    !('items' in result) || !Array.isArray(result.items) || !result.items.every(isProject) ||
    !('nextCursor' in result) || !(result.nextCursor === null || typeof result.nextCursor === 'string')) return invalidResponse();
  return { items: result.items, nextCursor: result.nextCursor };
}

/** 식별자를 URL 경로 조각으로 인코딩하고 프로젝트 상세를 조회한다. */
export async function getProject(id: string, signal: AbortSignal): Promise<ProjectSummary> {
  return projectResult(await requestJson(`/projects/${encodeURIComponent(id)}`, { signal }));
}

/** 이름만 전송한다. ID·날짜·음원 수는 서버가 생성한 응답을 기준으로 사용한다. */
export async function createProject(name: string, signal: AbortSignal): Promise<ProjectSummary> {
  return projectResult(await requestJson('/projects', { method: 'POST', body: { name }, signal }));
}

/** 표시 이름 변경만 PATCH하고 성공 후 반환된 서버 값을 사용한다. */
export async function renameProject(id: string, name: string, signal: AbortSignal): Promise<ProjectSummary> {
  return projectResult(await requestJson(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name }, signal }));
}

/** DB 삭제 확인과 파일 정리 대기 여부를 별도로 검증해 호출자가 경고를 표시할 수 있게 한다. */
export async function deleteProject(id: string, signal: AbortSignal): Promise<DeleteResult> {
  const result = await requestJson(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
  if (typeof result !== 'object' || result === null || !('deleted' in result) || result.deleted !== true ||
    !('cleanupPending' in result) || typeof result.cleanupPending !== 'boolean') return invalidResponse();
  return { deleted: true, cleanupPending: result.cleanupPending };
}
