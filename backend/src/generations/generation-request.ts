/**
 * 음악 입력에 요청 키·원본 이력 참조·페이지 cursor를 결합하는 API 계약이다.
 * canonical snapshot을 사용해 JSON 키 순서 차이만으로 같은 요청이 충돌하지 않도록 한다.
 */
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

// 기존 요청의 재전송은 공급자 설정이 바뀌어도 조회할 수 있어야 한다. 먼저 앱 차원의 폭넓은 계약으로 비교한다.
// 신규 접수일 때만 GenerationsService가 현재 공급자 capability와 준비 상태를 추가 검증한다.
export const storedInputCapabilities: ProviderCapabilities = { modes: ['instrumental', 'vocal'], settings: ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'], maxVariations: 4, seedSupported: true, canCancelRemote: false };

// UUID는 소문자로 정규화하고 source가 생략되면 속성 자체를 생략해 명시적 null과 구분한다.
export function validateCreateGeneration(value: unknown, capabilities: ProviderCapabilities): CreateGenerationRequest {
  if (!object(value) || Object.keys(value).some((key) => !requestFields.has(key))) invalid('지원하지 않는 생성 요청입니다.');
  const requestKey = uuid(value.requestKey, '요청 키');
  const sourceGenerationId = value.sourceGenerationId === undefined ? undefined : uuid(value.sourceGenerationId, '원본 생성 ID');
  const input = validateGenerationInput({ prompt: value.prompt, settings: value.settings, variationCount: value.variationCount }, capabilities);
  return { ...input, requestKey, ...(sourceGenerationId === undefined ? {} : { sourceGenerationId }) };
}

export type GenerationCursor = { createdAt: string; id: string };
// 생성 시각과 ID를 함께 저장해 동시 생성 및 삭제 이후에도 안정된 페이지 경계를 유지한다.
export function encodeGenerationCursor(generation: GenerationCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: generation.createdAt, id: generation.id })).toString('base64url');
}

// 허용 query 외 필드와 반복 파라미터를 거부한다. cursor는 정해진 두 필드 및 밀리초 UTC 표현만 받는다.
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
// 검증된 값은 변경하지 않고 key 순서만 정렬한다. 의미가 다른 값은 다른 snapshot으로 남는다.
export function canonicalSettings(settings: GenerationSettings): string {
  return JSON.stringify(Object.fromEntries(Object.keys(settings).sort().map((key) => [key, settings[key as keyof GenerationSettings]])));
}
