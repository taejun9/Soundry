import type { CreateGenerationRequest, GenerationSettings, ProviderCapabilities } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { validateGenerationInput } from './generation-input.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requestFields = new Set(['prompt', 'settings', 'variationCount', 'requestKey', 'sourceGenerationId']);
function invalid(message: string): never { throw new AppError(400, 'INVALID_INPUT', message); }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid(`올바른 ${label}가 필요합니다.`);
  return value.toLowerCase();
}

export function generationId(value: string): string {
  return uuid(value, '생성 ID');
}

export const storedInputCapabilities: ProviderCapabilities = { modes: ['instrumental', 'vocal'], settings: ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'], maxVariations: 4, seedSupported: true, canCancelRemote: false };

export function validateCreateGeneration(value: unknown, capabilities: ProviderCapabilities): CreateGenerationRequest {
  if (!object(value) || Object.keys(value).some((key) => !requestFields.has(key))) invalid('지원하지 않는 생성 요청입니다.');
  const requestKey = uuid(value.requestKey, '요청 키');
  const sourceGenerationId = value.sourceGenerationId === undefined ? undefined : uuid(value.sourceGenerationId, '원본 생성 ID');
  const input = validateGenerationInput({ prompt: value.prompt, settings: value.settings, variationCount: value.variationCount }, capabilities);
  return { ...input, requestKey, ...(sourceGenerationId === undefined ? {} : { sourceGenerationId }) };
}

export type GenerationCursor = { createdAt: string; id: string };
export function encodeGenerationCursor(generation: GenerationCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: generation.createdAt, id: generation.id })).toString('base64url');
}

export function generationListQuery(query: Record<string, unknown>): { limit: number; cursor?: GenerationCursor } {
  if (!object(query) || Object.keys(query).some((key) => key !== 'limit' && key !== 'cursor')) invalid('지원하지 않는 조회 조건입니다.');
  const limit = query.limit === undefined ? 30 : typeof query.limit === 'string' && /^[0-9]+$/.test(query.limit) ? Number(query.limit) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid('목록 개수는 1–100 사이의 정수여야 합니다.');
  if (query.cursor === undefined) return { limit };
  try {
    const value = query.cursor;
    if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new Error();
    const cursor: unknown = JSON.parse(decoded.toString('utf8'));
    if (!object(cursor) || Object.keys(cursor).length !== 2 || typeof cursor.id !== 'string' || typeof cursor.createdAt !== 'string') throw new Error();
    if (!uuidPattern.test(cursor.id) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.createdAt) || new Date(cursor.createdAt).toISOString() !== cursor.createdAt) throw new Error();
    return { limit, cursor: { createdAt: cursor.createdAt, id: cursor.id.toLowerCase() } };
  } catch {
    invalid('목록 위치가 올바르지 않습니다. 목록을 새로고침해 주세요.');
  }
}

/** Settings are already validated; only key order is normalized for immutable snapshots and idempotency. */
export function canonicalSettings(settings: GenerationSettings): string {
  return JSON.stringify(Object.fromEntries(Object.keys(settings).sort().map((key) => [key, settings[key as keyof GenerationSettings]])));
}
