import type { GenerationInput, GenerationSettings, MusicMode, ProviderCapabilities, SettingKey } from '../../../../shared/contracts';

export interface ComposerDraft {
  prompt: string;
  mode: MusicMode | '';
  genre: string;
  mood: string;
  bpm: string;
  durationSeconds: string;
  seed: string;
  variationCount: number;
}
export type ReusableGeneration = GenerationInput & { generationId: string };
export function draftFromGeneration(input: GenerationInput): ComposerDraft {
  return { prompt: input.prompt, mode: input.settings.mode ?? '', genre: input.settings.genre ?? '', mood: input.settings.mood ?? '', bpm: input.settings.bpm?.toString() ?? '', durationSeconds: input.settings.durationSeconds?.toString() ?? '', seed: input.settings.seed ?? '', variationCount: input.variationCount };
}
export type DraftErrors = Partial<Record<keyof ComposerDraft, string>>;
export function emptyDraft(): ComposerDraft {
  return { prompt: '', mode: '', genre: '', mood: '', bpm: '', durationSeconds: '', seed: '', variationCount: 2 };
}
export function supportsSetting(caps: ProviderCapabilities | null, key: SettingKey): boolean {
  return Boolean(caps?.settings.includes(key) && (key !== 'seed' || caps.seedSupported));
}
export function maxVariations(caps: ProviderCapabilities | null): number {
  return Math.min(4, caps?.maxVariations ?? 4);
}

export function seedCharacterLimit(providerId?: string): number { return providerId === 'cli' ? 64 : 120; }

export function sanitizeDraft(draft: ComposerDraft, caps: ProviderCapabilities, seedLimit = 120): { draft: ComposerDraft; changed: (keyof ComposerDraft)[] } {
  const next = { ...draft };
  if (next.mode && !caps.modes.includes(next.mode)) next.mode = '';
  for (const key of ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'] as const) {
    if (!supportsSetting(caps, key)) next[key] = '';
  }
  for (const [key, range] of [['bpm', caps.bpmRange], ['durationSeconds', caps.durationRangeSeconds]] as const) {
    const value = Number(next[key]);
    if (next[key] && (!Number.isFinite(value) || value <= 0 || (range && (value < range.min || value > range.max)))) next[key] = '';
  }
  if (next.seed.trim().length > seedLimit) next.seed = '';
  if (!Number.isInteger(next.variationCount) || next.variationCount < 1 || next.variationCount > maxVariations(caps)) {
    next.variationCount = Math.min(2, maxVariations(caps));
  }
  const changed = (Object.keys(next) as (keyof ComposerDraft)[]).filter(key => next[key] !== draft[key]);
  return { draft: next, changed };
}

export function prepareGenerationInput(draft: ComposerDraft, caps: ProviderCapabilities, seedLimit = 120): { input: GenerationInput | null; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const prompt = draft.prompt.trim();
  if (!prompt || prompt.length > 4000) errors.prompt = '음악 아이디어를 앞뒤 공백을 제외하고 1–4000자로 입력해 주세요.';
  else if (prompt.includes('\0')) errors.prompt = '사용할 수 없는 문자가 포함되어 있어요. 해당 부분을 지우고 다시 입력해 주세요.';
  if (!Number.isInteger(draft.variationCount) || draft.variationCount < 1 || draft.variationCount > maxVariations(caps)) errors.variationCount = `곡 수는 1–${maxVariations(caps)} 사이에서 선택해 주세요.`;
  const settings: GenerationSettings = {};
  if (draft.mode) {
    if (caps.modes.includes(draft.mode)) settings.mode = draft.mode;
    else errors.mode = '현재 공급자가 지원하는 음악 유형을 선택해 주세요.';
  }
  for (const key of ['genre', 'mood', 'seed'] as const) {
    if (!supportsSetting(caps, key)) continue;
    const value = draft[key].trim();
    if (!value) continue;
    const limit = key === 'seed' ? seedLimit : 80;
    if (value.length > limit) errors[key] = `${limit}자 이내로 입력해 주세요.`;
    else if (value.includes('\0')) errors[key] = '사용할 수 없는 문자가 포함되어 있어요. 해당 부분을 다시 입력해 주세요.';
    else settings[key] = value;
  }
  for (const [key, range] of [['bpm', caps.bpmRange], ['durationSeconds', caps.durationRangeSeconds]] as const) {
    if (!supportsSetting(caps, key) || !draft[key].trim()) continue;
    const value = Number(draft[key]);
    if (!Number.isFinite(value) || value <= 0 || (range && (value < range.min || value > range.max))) {
      errors[key] = range ? `${range.min}–${range.max} 사이의 숫자를 입력해 주세요.` : '0보다 큰 숫자를 입력해 주세요.';
    } else settings[key] = value;
  }
  return { input: Object.keys(errors).length ? null : { prompt, settings, variationCount: draft.variationCount }, errors };
}
