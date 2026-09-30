import type { DeleteResult, Page, ProjectSummary } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';

function isProject(value: unknown): value is ProjectSummary {
  return typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'string' &&
    'name' in value && typeof value.name === 'string' &&
    'createdAt' in value && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) &&
    'updatedAt' in value && typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt)) &&
    'trackCount' in value && typeof value.trackCount === 'number' && Number.isInteger(value.trackCount) && value.trackCount >= 0;
}

function invalidResponse(): never {
  throw new ApiError('서버 응답을 확인하지 못했어요. 목록을 새로고침해 주세요.', 0, 'INVALID_RESPONSE');
}

function projectResult(value: unknown): ProjectSummary {
  if (!isProject(value)) return invalidResponse();
  return value;
}

export async function listProjects(cursor: string | null, signal: AbortSignal): Promise<Page<ProjectSummary>> {
  const query = new URLSearchParams({ limit: '30' });
  if (cursor) query.set('cursor', cursor);
  const result = await requestJson(`/projects?${query.toString()}`, { signal });
  if (typeof result !== 'object' || result === null ||
    !('items' in result) || !Array.isArray(result.items) || !result.items.every(isProject) ||
    !('nextCursor' in result) || !(result.nextCursor === null || typeof result.nextCursor === 'string')) return invalidResponse();
  return { items: result.items, nextCursor: result.nextCursor };
}

export async function getProject(id: string, signal: AbortSignal): Promise<ProjectSummary> {
  return projectResult(await requestJson(`/projects/${encodeURIComponent(id)}`, { signal }));
}

export async function createProject(name: string, signal: AbortSignal): Promise<ProjectSummary> {
  return projectResult(await requestJson('/projects', { method: 'POST', body: { name }, signal }));
}

export async function renameProject(id: string, name: string, signal: AbortSignal): Promise<ProjectSummary> {
  return projectResult(await requestJson(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name }, signal }));
}

export async function deleteProject(id: string, signal: AbortSignal): Promise<DeleteResult> {
  const result = await requestJson(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
  if (typeof result !== 'object' || result === null || !('deleted' in result) || result.deleted !== true ||
    !('cleanupPending' in result) || typeof result.cleanupPending !== 'boolean') return invalidResponse();
  return { deleted: true, cleanupPending: result.cleanupPending };
}
