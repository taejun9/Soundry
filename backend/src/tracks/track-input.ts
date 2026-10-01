/**
 * 트랙 ID와 수정 가능한 필드를 런타임 검증한다. 제목/favorite 외 provenance나 파일 경로는 수정할 수 없다.
 * 생략한 필드는 그대로 두고 명시한 false는 유효한 변경으로 유지한다.
 */
import type { UpdateTrackRequest } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(message: string): never { throw new AppError(400, 'INVALID_INPUT', message); }

// UUID를 소문자로 정규화한다. 제목이나 파일 경로를 track 식별자로 받지 않는다.
export function trackId(value: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid('올바른 트랙 ID가 필요합니다.');
  return value.toLowerCase();
}

// 빈 PATCH와 알 수 없는 속성을 거부한다. 문자열은 trim한 후 길이를 확인하고 favorite은 boolean만 허용한다.
export function validateTrackUpdate(value: unknown): UpdateTrackRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid('트랙 제목 또는 즐겨찾기를 입력해 주세요.');
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => key !== 'title' && key !== 'favorite')) invalid('트랙 제목과 즐겨찾기만 변경할 수 있습니다.');
  const input = value as Record<string, unknown>;
  const result: UpdateTrackRequest = {};
  if (Object.hasOwn(input, 'title')) {
    if (typeof input.title !== 'string' || input.title.includes('\0')) invalid('트랙 제목 형식을 확인해 주세요.');
    const title = input.title.trim();
    if (title.length < 1 || title.length > 120) invalid('트랙 제목은 1–120자로 입력해 주세요.');
    result.title = title;
  }
  if (Object.hasOwn(input, 'favorite')) {
    if (typeof input.favorite !== 'boolean') invalid('즐겨찾기는 true 또는 false로 입력해 주세요.');
    result.favorite = input.favorite;
  }
  return result;
}
