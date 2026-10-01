/**
 * 공급자와 HTTP 계층이 함께 사용하는 음악 입력 계약이다. 요청을 새 객체로 정규화해 이후 입력 변경과 분리한다.
 * 앱의 기본 상한과 현재 공급자 capability를 모두 적용하며 지원하지 않는 설정을 조용히 무시하지 않는다.
 */
import type { GenerationInput, GenerationSettings, MusicMode, ProviderCapabilities, SettingKey } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';

const settingKeys = new Set(['mode', 'genre', 'mood', 'bpm', 'durationSeconds', 'seed']);
function invalid(message: string): never { throw new AppError(400, 'INVALID_INPUT', message); }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
// 문자열 길이는 trim한 실제 입력을 기준으로 제한하고 NUL을 거부한다.
function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || value.includes('\0')) invalid(`${label} 형식을 확인해 주세요.`);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) invalid(`${label}: 1–${max}자로 입력해 주세요.`);
  return cleaned;
}
// JSON 밖의 내부 호출도 고려해 NaN/Infinity를 거부하고 공급자가 명시한 실제 허용 범위를 적용한다.
function numeric(value: unknown, range: { min: number; max: number } | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) invalid(`${label}에 올바른 숫자를 입력해 주세요.`);
  if (range && (value < range.min || value > range.max)) invalid(`${label}: ${range.min}–${range.max} 범위로 입력해 주세요.`);
  return value;
}

/** Validates the immutable musical input. Request keys/project references are checked by the job API. */
// requestKey·프로젝트 관계는 여기서 다루지 않는다. 음악 입력만 검증해 provider 단독 호출에도 재사용한다.
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
  // mode는 별도 enum으로, 나머지 필드는 settings capability와 seedSupported까지 확인한다.
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
