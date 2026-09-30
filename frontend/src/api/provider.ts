import type { MusicMode, ProviderCapabilities, ProviderSummary, SettingKey } from '../../../shared/contracts';
import { ApiError, requestJson } from './client';

const modes: readonly string[] = ['instrumental', 'vocal'];
const settings: readonly string[] = ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'];
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isRange(value: unknown): value is { min: number; max: number } {
  return isRecord(value) && typeof value.min === 'number' && typeof value.max === 'number' &&
    Number.isFinite(value.min) && Number.isFinite(value.max) && value.min > 0 && value.max >= value.min;
}
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
