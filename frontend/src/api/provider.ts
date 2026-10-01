/**
 * 현재 공급자의 공개 capability를 검증한다. 서버가 제공한 지원 범위만 입력 폼을 제어하게 한다.
 * 이 조회는 공급자 상태 확인이며 음악 생성 요청을 보내거나 미지원 설정을 임의 활성화하지 않는다.
 */
import type { MusicMode, ProviderCapabilities, ProviderSummary, SettingKey } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';

const modes: readonly string[] = ['instrumental', 'vocal'];
const settings: readonly string[] = ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'];
/** 배열과 null을 제외해 capability 객체를 검사할 수 있는 형태로 좁힌다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** 양수의 유한한 최소/최대이며 순서가 올바른 지원 범위만 허용한다. */
function isRange(value: unknown): value is { min: number; max: number } {
  return isRecord(value) && typeof value.min === 'number' && typeof value.max === 'number' &&
    Number.isFinite(value.min) && Number.isFinite(value.max) && value.min > 0 && value.max >= value.min;
}
/** 알려진 mode/setting만 통과시키고 선택 범위는 존재할 때 검증된 값만 복사한다. */
function capabilities(value: unknown): ProviderCapabilities | null {
  if (!isRecord(value) || !Array.isArray(value.modes) || value.modes.length === 0 ||
    !value.modes.every((mode): mode is MusicMode => typeof mode === 'string' && modes.includes(mode)) ||
    !Array.isArray(value.settings) || !value.settings.every((setting): setting is SettingKey => typeof setting === 'string' && settings.includes(setting)) ||
    typeof value.maxVariations !== 'number' || !Number.isInteger(value.maxVariations) || value.maxVariations < 1 ||
    typeof value.seedSupported !== 'boolean' || typeof value.canCancelRemote !== 'boolean' ||
    (value.durationRangeSeconds !== undefined && !isRange(value.durationRangeSeconds)) ||
    (value.bpmRange !== undefined && !isRange(value.bpmRange))) return null;
  return {
    modes: value.modes,
    settings: value.settings,
    maxVariations: value.maxVariations,
    seedSupported: value.seedSupported,
    canCancelRemote: value.canCancelRemote,
    ...(isRange(value.durationRangeSeconds) ? { durationRangeSeconds: value.durationRangeSeconds } : {}),
    ...(isRange(value.bpmRange) ? { bpmRange: value.bpmRange } : {}),
  };
}

/** 상태 플래그가 실제 boolean인지 확인해 문자열 false가 참처럼 폼을 활성화하지 못하게 한다. */
export async function fetchCurrentProvider(signal: AbortSignal): Promise<ProviderSummary> {
  const value = await requestJson('/providers/current', { signal });
  const supported = isRecord(value) ? capabilities(value.capabilities) : null;
  if (!isRecord(value) || !supported || typeof value.id !== 'string' || !value.id.trim() ||
    !(value.model === null || typeof value.model === 'string') || typeof value.isMock !== 'boolean' ||
    typeof value.configured !== 'boolean' || typeof value.generationEnabled !== 'boolean' || typeof value.notice !== 'string') {
    throw new ApiError('공급자의 지원 설정을 확인하지 못했어요. 다시 불러와 주세요.', 0, 'INVALID_PROVIDER_RESPONSE');
  }
  return { id: value.id, model: value.model, isMock: value.isMock, configured: value.configured, generationEnabled: value.generationEnabled, notice: value.notice, capabilities: supported };
}
