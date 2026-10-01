import type { Page, PromptSummary } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';
import { isGenerationSettings } from './generations';
const statuses = ['queued', 'processing', 'completed', 'failed', 'cancelled'];
export function parsePrompt(value: unknown): PromptSummary {
  if (!value || typeof value !== 'object' || !('generationId' in value) || typeof value.generationId !== 'string' || !('prompt' in value) || typeof value.prompt !== 'string' || !('settings' in value) || !isGenerationSettings(value.settings) || !('variationCount' in value) || typeof value.variationCount !== 'number' || !Number.isInteger(value.variationCount) || value.variationCount < 1 || value.variationCount > 4 || !('status' in value) || typeof value.status !== 'string' || !statuses.includes(value.status) || !('trackCount' in value) || typeof value.trackCount !== 'number' || !Number.isInteger(value.trackCount) || value.trackCount < 0 || value.trackCount > value.variationCount || !('createdAt' in value) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new ApiError('프롬프트 이력을 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_PROMPT_RESPONSE');
  return value as PromptSummary;
}
export async function listPrompts(projectId: string, cursor: string | null, signal: AbortSignal): Promise<Page<PromptSummary>> {
  const query = new URLSearchParams({ limit: '10' }); if (cursor) query.set('cursor', cursor);
  const value = await requestJson(`/projects/${encodeURIComponent(projectId)}/prompts?${query}`, { signal });
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items) || !('nextCursor' in value) || !(value.nextCursor === null || typeof value.nextCursor === 'string')) throw new ApiError('프롬프트 목록을 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_PROMPT_RESPONSE');
  return { items: value.items.map(parsePrompt), nextCursor: value.nextCursor };
}
