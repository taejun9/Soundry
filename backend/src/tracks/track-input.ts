import type { UpdateTrackRequest } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(message: string): never { throw new AppError(400, 'INVALID_INPUT', message); }

export function trackId(value: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid('올바른 트랙 ID가 필요합니다.');
  return value.toLowerCase();
}

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
