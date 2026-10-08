import type { CompositionKnowledge, KnowledgeReference } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => new ApiError('작곡 지식 응답을 확인하지 못했어요.', 0, 'INVALID_RESPONSE');
export function knowledgeItem(value: unknown): CompositionKnowledge {
  if (!object(value) || !['id','title','content','tags','source','createdAt','updatedAt'].every(key => typeof value[key] === 'string') ||
    !['own','licensed','public-domain'].includes(String(value.rights)) || typeof value.allowRemote !== 'boolean' ||
    !(value.trackId === null || typeof value.trackId === 'string') || !(value.rating === null || typeof value.rating === 'number' && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) throw invalid();
  return value as unknown as CompositionKnowledge;
}
export async function listKnowledge(signal?: AbortSignal): Promise<CompositionKnowledge[]> {
  const result = await requestJson('/knowledge', { signal });
  if (!object(result) || !Array.isArray(result.items)) throw invalid();
  return result.items.map(knowledgeItem);
}
export type KnowledgeInput = Pick<CompositionKnowledge, 'title' | 'content' | 'tags' | 'source' | 'rights' | 'allowRemote'>;
export async function saveKnowledge(body: KnowledgeInput, id?: string, signal?: AbortSignal) {
  return knowledgeItem(await requestJson('/knowledge' + (id ? '/' + id : ''), { method: id ? 'PATCH' : 'POST', body, signal }));
}
export async function saveFeedback(id: string, body: { rating: number; notes: string; allowRemote: boolean }, signal?: AbortSignal) {
  return knowledgeItem(await requestJson('/tracks/' + id + '/feedback', { method: 'POST', body, signal }));
}
export async function knowledgeReferences(id: string, signal?: AbortSignal): Promise<KnowledgeReference[]> {
  const result = await requestJson('/generations/' + id + '/knowledge', { signal });
  if (!object(result) || !Array.isArray(result.items)) throw invalid();
  return result.items.map((value: unknown) => {
    if (!object(value) || !(value.id === null || typeof value.id === 'string') || !['title','source','digest'].every(k => typeof value[k] === 'string') || !(value.rating === null || typeof value.rating === 'number')) throw invalid();
    return value as unknown as KnowledgeReference;
  });
}
export async function compositionArtifact(id: string, signal?: AbortSignal): Promise<{ score: object; summary: string }> {
  const result = await requestJson('/tracks/' + id + '/composition', { signal });
  if (!object(result) || !object(result.score) || typeof result.summary !== 'string') throw invalid();
  return { score: result.score, summary: result.summary };
}
