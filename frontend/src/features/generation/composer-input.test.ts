/**
 * 작성 초안에서 생성 입력으로 넘어가는 순수 검증 경계를 검사한다.
 * 문자 길이·NUL·숫자 유한성·capability·variation 상한을 확인하고 예문이 출력 metadata로 새지 않게 한다.
 */
import { describe, expect, it } from 'vitest';
import type { ProviderCapabilities } from '../../../../shared/contracts';
import { emptyDraft, prepareGenerationInput, sanitizeDraft } from './composer-input';
import { GENRE_PRESETS } from './genres';

const mock: ProviderCapabilities = { modes: ['instrumental'], settings: [], maxVariations: 4, seedSupported: false, canCancelRemote: false };
const full: ProviderCapabilities = { modes: ['instrumental', 'vocal'], settings: ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'], maxVariations: 8, seedSupported: true, canCancelRemote: false, bpmRange: { min: 60, max: 180 }, durationRangeSeconds: { min: 90, max: 180 } };

describe('composer submission boundary', () => {
  it('builds a prompt-only request with two variations and no invented settings', () => {
    expect(prepareGenerationInput({ ...emptyDraft(), prompt: '  비 오는 밤의 연주곡  ' }, mock).input).toEqual({ prompt: '비 오는 밤의 연주곡', settings: {}, variationCount: 2 });
  });

  it('provides 16 distinct concepts without leaking unsupported genre metadata', () => {
    expect(GENRE_PRESETS).toHaveLength(16);
    expect(new Set(GENRE_PRESETS.map(preset => preset.id)).size).toBe(16);
    expect(new Set(GENRE_PRESETS.map(preset => preset.concept)).size).toBe(16);
    for (const preset of GENRE_PRESETS) {
      const result = prepareGenerationInput({ ...emptyDraft(), prompt: preset.prompt, genre: preset.label }, mock);
      expect(result.errors).toEqual({});
      expect(result.input?.settings).toEqual({});
    }
  });

  it.each(['   ', 'a'.repeat(4001), 'idea\0hidden'])('rejects a blank, overlong, or NUL prompt', prompt => {
    const result = prepareGenerationInput({ ...emptyDraft(), prompt }, mock);
    expect(result.input).toBeNull();
    expect(result.errors.prompt).toBeTruthy();
  });

  it('keeps decimal ranges and string seeds while enforcing the app variation ceiling', () => {
    const draft = { ...emptyDraft(), prompt: 'Test concept', bpm: '90.5', durationSeconds: '120.5', seed: '  00123  ', genre: ' Jazz ', mood: ' Calm ', variationCount: 4 };
    expect(prepareGenerationInput(draft, full).input?.settings).toEqual({ bpm: 90.5, durationSeconds: 120.5, seed: '00123', genre: 'Jazz', mood: 'Calm' });
    expect(prepareGenerationInput({ ...draft, variationCount: 5 }, full).input).toBeNull();
  });

  it.each(['Infinity', 'NaN', '-1', '59.9', '180.1'])('rejects unsupported numeric values without clamping user intent: %s', bpm => {
    const result = prepareGenerationInput({ ...emptyDraft(), prompt: 'Test concept', bpm }, full);
    expect(result.input).toBeNull();
    expect(result.errors.bpm).toBeTruthy();
  });

  it('rejects unsupported modes and invalid text settings', () => {
    expect(prepareGenerationInput({ ...emptyDraft(), prompt: 'Concept', mode: 'vocal' }, mock).errors.mode).toBeTruthy();
    const result = prepareGenerationInput({ ...emptyDraft(), prompt: 'Concept', genre: 'a'.repeat(81), mood: '\0hidden', seed: 'b'.repeat(121) }, full);
    expect(result.input).toBeNull();
    expect(Object.keys(result.errors).sort()).toEqual(['genre', 'mood', 'seed']);
  });

  it('clears settings invalidated by a provider change and preserves the prompt', () => {
    const draft = { ...emptyDraft(), prompt: 'Keep my entire original idea', mode: 'vocal' as const, genre: 'Jazz', bpm: '120', durationSeconds: '150', seed: '42', variationCount: 4 };
    const result = sanitizeDraft(draft, { ...mock, maxVariations: 1 });
    expect(result.draft).toEqual({ ...emptyDraft(), prompt: draft.prompt, variationCount: 1 });
    expect(result.changed).toEqual(expect.arrayContaining(['mode', 'genre', 'bpm', 'durationSeconds', 'seed', 'variationCount']));
    expect(prepareGenerationInput(result.draft, { ...mock, maxVariations: 1 }).input?.settings).toEqual({});
  });

  it('omits blank settings and requires both seed capability declarations', () => {
    const result = prepareGenerationInput({ ...emptyDraft(), prompt: 'Concept', genre: ' ', bpm: ' ', seed: 'secret-seed' }, { ...full, seedSupported: false });
    expect(result.input?.settings).toEqual({});
  });
});

import { seedCharacterLimit } from './composer-input';
describe('local score composer limits', () => { it('uses the same bounded seed for CLI and local LLM', () => { expect(seedCharacterLimit('ollama')).toBe(64); expect(seedCharacterLimit('cli')).toBe(64); }); });
