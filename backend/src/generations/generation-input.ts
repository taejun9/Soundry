import type { GenerationInput, GenerationSettings, MusicMode, ProviderCapabilities, SettingKey } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';

const settingKeys = new Set(['mode', 'genre', 'mood', 'bpm', 'durationSeconds', 'seed']);
function invalid(message: string): never { throw new AppError(400, 'INVALID_INPUT', message); }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || value.includes('\0')) invalid(`${label} 형식을 확인해 주세요.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) invalid(`${label}: 1–${max}자로 입력해 주세요.`);
  return cleaned;
}
function numeric(value: unknown, range: { min: number; max: number } | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) invalid(`${label}에 올바른 숫자를 입력해 주세요.`);
  if (range && (value < range.min || value > range.max)) invalid(`${label}: ${range.min}–${range.max} 범위로 입력해 주세요.`);
  return value;
}

/** Validates the immutable musical input. Request keys/project references are checked by the job API. */
export function validateGenerationInput(value: unknown, capabilities: ProviderCapabilities): GenerationInput {
  if (!object(value) || Object.keys(value).some((key) => !['prompt', 'settings', 'variationCount'].includes(key))) {
    invalid('지원하지 않는 생성 입력입니다.');
  }
  const prompt = text(value.prompt, 4000, '프롬프트');
  const maxVariations = Math.min(4, capabilities.maxVariations);
  const variationCount = value.variationCount === undefined ? Math.min(2, maxVariations) : value.variationCount;
  if (typeof variationCount !== 'number' || !Number.isInteger(variationCount) || variationCount < 1 || variationCount > maxVariations) {
    invalid(`결과 수는 1–${maxVariations} 사이의 정수여야 합니다.`);
  }
  const rawSettings = value.settings === undefined ? {} : value.settings;
  if (!object(rawSettings) || Object.keys(rawSettings).some((key) => !settingKeys.has(key))) invalid('지원하지 않는 설정입니다.');
  const settings: GenerationSettings = {};
  for (const [key, raw] of Object.entries(rawSettings)) {
    if (key === 'mode') {
      if (typeof raw !== 'string' || !capabilities.modes.includes(raw as MusicMode)) invalid('현재 공급자가 지원하지 않는 음악 모드입니다.');
      settings.mode = raw as MusicMode;
      continue;
    }
    if (!capabilities.settings.includes(key as SettingKey)) invalid('현재 공급자가 지원하지 않는 설정이 포함되어 있습니다.');
    switch (key) {
      case 'genre': settings.genre = text(raw, 80, '장르'); break;
      case 'mood': settings.mood = text(raw, 80, '분위기'); break;
      case 'seed':
        if (!capabilities.seedSupported) invalid('현재 공급자는 seed를 지원하지 않습니다.');
        settings.seed = text(raw, 120, 'Seed'); break;
      case 'bpm': settings.bpm = numeric(raw, capabilities.bpmRange, 'BPM'); break;
      case 'durationSeconds': settings.durationSeconds = numeric(raw, capabilities.durationRangeSeconds, '길이'); break;
    }
  }
  return { prompt, settings, variationCount };
}
