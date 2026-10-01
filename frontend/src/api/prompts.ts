/**
 * Generation에 저장된 입력 이력을 조회한다. 별도의 프롬프트 저장본을 만들지 않는다.
 * 음원이 모두 삭제된 완료 작업도 재사용할 수 있으므로 trackCount가 0인 정상 이력을 허용한다.
 */
import type { Page, PromptSummary } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';
import { isGenerationSettings } from './generations';
const statuses = ['queued', 'processing', 'completed', 'failed', 'cancelled'];
/** 상태·요청 수·남은 음원 수의 가능한 조합과 입력 설정 형식을 확인한다. */
export function parsePrompt(value: unknown): PromptSummary {
  if (!value || typeof value !== 'object' || !('generationId' in value) || typeof value.generationId !== 'string' || !('prompt' in value) || typeof value.prompt !== 'string' || !('settings' in value) || !isGenerationSettings(value.settings) || !('variationCount' in value) || typeof value.variationCount !== 'number' || !Number.isInteger(value.variationCount) || value.variationCount < 1 || value.variationCount > 4 || !('status' in value) || typeof value.status !== 'string' || !statuses.includes(value.status) || !('trackCount' in value) || typeof value.trackCount !== 'number' || !Number.isInteger(value.trackCount) || value.trackCount < 0 || value.trackCount > value.variationCount || !('createdAt' in value) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new ApiError('프롬프트 이력을 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_PROMPT_RESPONSE');
  return value as PromptSummary;
}
/** 좁은 작성 열에 맞는 10개 단위 이력을 읽고 cursor를 그대로 보존한다. */
export async function listPrompts(projectId: string, cursor: string | null, signal: AbortSignal): Promise<Page<PromptSummary>> {
  const query = new URLSearchParams({ limit: '10' }); if (cursor) query.set('cursor', cursor);
  const value = await requestJson(`/projects/${encodeURIComponent(projectId)}/prompts?${query}`, { signal });
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items) || !('nextCursor' in value) || !(value.nextCursor === null || typeof value.nextCursor === 'string')) throw new ApiError('프롬프트 목록을 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_PROMPT_RESPONSE');
  return { items: value.items.map(parsePrompt), nextCursor: value.nextCursor };
}
