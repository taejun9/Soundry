import type { CreateGenerationRequest, GenerationSettings, GenerationSummary, Page, TrackSummary } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';
import { hasLocalTrackUrls } from '../audio/track-urls';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableDate = (value: unknown) => value === null || date(value);
const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nullablePositive = (value: unknown) => value === null || positive(value);
export function isGenerationSettings(value: unknown): value is GenerationSettings {
  if (!record(value) || Object.keys(value).some(key => !['mode', 'genre', 'mood', 'bpm', 'durationSeconds', 'seed'].includes(key))) return false;
  return (value.mode === undefined || value.mode === 'instrumental' || value.mode === 'vocal') &&
    ['genre', 'mood', 'seed'].every(key => value[key] === undefined || typeof value[key] === 'string') &&
    ['bpm', 'durationSeconds'].every(key => value[key] === undefined || positive(value[key]));
}
export function isTrackSummary(value: unknown): value is TrackSummary {
  return record(value) && ['id', 'projectId', 'generationId', 'title', 'prompt', 'audioUrl', 'downloadUrl', 'mimeType', 'provider'].every(key => typeof value[key] === 'string') &&
    hasLocalTrackUrls(value as unknown as TrackSummary) && typeof value.variationIndex === 'number' && Number.isInteger(value.variationIndex) && value.variationIndex >= 0 && value.variationIndex < 4 &&
    positive(value.byteSize) && Number.isInteger(value.byteSize) && nullablePositive(value.durationSeconds) && nullablePositive(value.bpm) &&
    ['genre', 'mood', 'seed', 'model'].every(key => nullableString(value[key])) && typeof value.favorite === 'boolean' && date(value.createdAt);
}
export function parseGeneration(value: unknown, projectId?: string): GenerationSummary {
  if (!record(value) || !['id', 'projectId', 'prompt', 'requestKey', 'provider'].every(key => typeof value[key] === 'string') ||
    (projectId !== undefined && value.projectId !== projectId) || !isGenerationSettings(value.settings) ||
    typeof value.variationCount !== 'number' || !Number.isInteger(value.variationCount) || value.variationCount < 1 || value.variationCount > 4 ||
    !nullableString(value.sourceGenerationId) || !nullableString(value.model) ||
    typeof value.status !== 'string' || !['queued', 'processing', 'completed', 'failed', 'cancelled'].includes(value.status) ||
    !(value.stage === null || (typeof value.stage === 'string' && ['preparing', 'generating', 'saving'].includes(value.stage))) || value.progress !== null ||
    !nullableString(value.errorCode) || !nullableString(value.errorMessage) || !date(value.createdAt) || !nullableDate(value.startedAt) || !nullableDate(value.finishedAt) ||
    !Array.isArray(value.tracks) || !value.tracks.every(isTrackSummary) ||
    value.tracks.some(track => track.projectId !== value.projectId || track.generationId !== value.id || track.variationIndex >= Number(value.variationCount)) ||
    new Set(value.tracks.map(track => track.id)).size !== value.tracks.length ||
    new Set(value.tracks.map(track => track.variationIndex)).size !== value.tracks.length ||
    (value.status === 'completed' ? value.tracks.length > value.variationCount : value.tracks.length !== 0)) {
    throw new ApiError('작업 응답을 확인하지 못했어요. 이력을 다시 불러와 주세요.', 0, 'INVALID_GENERATION_RESPONSE');
  }
  return value as unknown as GenerationSummary;
}
export async function listGenerations(projectId: string, cursor: string | null, signal: AbortSignal): Promise<Page<GenerationSummary>> {
  const query = new URLSearchParams({ limit: '30' });
  if (cursor) query.set('cursor', cursor);
  const result = await requestJson(`/projects/${encodeURIComponent(projectId)}/generations?${query}`, { signal });
  if (!record(result) || !Array.isArray(result.items) || !nullableString(result.nextCursor)) throw new ApiError('작업 목록을 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_GENERATION_RESPONSE');
  return { items: result.items.map(item => parseGeneration(item, projectId)), nextCursor: result.nextCursor as string | null };
}
export async function getGeneration(projectId: string, id: string, signal: AbortSignal): Promise<GenerationSummary> {
  const result = parseGeneration(await requestJson(`/generations/${encodeURIComponent(id)}`, { signal }), projectId);
  if (result.id !== id) throw new ApiError('요청한 작업의 응답이 아니에요. 이력을 다시 불러와 주세요.', 0, 'INVALID_GENERATION_RESPONSE');
  return result;
}
export async function createGeneration(projectId: string, body: CreateGenerationRequest, signal: AbortSignal): Promise<GenerationSummary> {
  const result = parseGeneration(await requestJson(`/projects/${encodeURIComponent(projectId)}/generations`, { method: 'POST', body, signal }), projectId);
  if (result.requestKey !== body.requestKey) throw new ApiError('접수한 요청의 결과를 확인하지 못했어요.', 0, 'INVALID_GENERATION_RESPONSE');
  return result;
}
export async function cancelGeneration(projectId: string, id: string, signal: AbortSignal): Promise<GenerationSummary> {
  const result = parseGeneration(await requestJson(`/generations/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {}, signal }), projectId);
  if (result.id !== id) throw new ApiError('취소할 작업의 응답을 확인하지 못했어요.', 0, 'INVALID_GENERATION_RESPONSE');
  return result;
}
