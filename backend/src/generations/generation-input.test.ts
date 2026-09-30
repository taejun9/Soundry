import { describe, expect, it } from 'vitest';
import type { ProviderCapabilities } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { mockCapabilities } from '../providers/providers.controller.js';
import { validateGenerationInput } from './generation-input.js';

const fullCapabilities: ProviderCapabilities = {
  modes: ['instrumental', 'vocal'], settings: ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'],
  maxVariations: 8, durationRangeSeconds: { min: 90, max: 180 }, bpmRange: { min: 40, max: 240 },
  seedSupported: true, canCancelRemote: false,
};
function rejects(value: unknown, caps = fullCapabilities) {
  try { validateGenerationInput(value, caps); throw new Error('expected invalid input'); }
  catch (error) { expect(error).toBeInstanceOf(AppError); expect((error as AppError).getStatus()).toBe(400); }
}

describe('generation input contract', () => {
  it('accepts prompt-only input and normalizes an independent snapshot', () => {
    expect(validateGenerationInput({ prompt: '  새벽의 정원  ' }, mockCapabilities())).toEqual({ prompt: '새벽의 정원', settings: {}, variationCount: 2 });
    const source = { prompt: 'Music', settings: { mode: 'vocal', genre: ' Jazz ', mood: ' Calm ', bpm: 92.5, durationSeconds: 150.5, seed: ' 0 ' }, variationCount: 4 };
    const result = validateGenerationInput(source, fullCapabilities);
    expect(result.settings).toEqual({ mode: 'vocal', genre: 'Jazz', mood: 'Calm', bpm: 92.5, durationSeconds: 150.5, seed: '0' });
    source.settings.genre = 'Changed';
    expect(result.settings.genre).toBe('Jazz');
  });
  it('rejects unknown keys, null, arrays, blank/NUL/oversized prompts', () => {
    for (const value of [null, [], {}, { prompt: 10 }, { prompt: '' }, { prompt: '  ' }, { prompt: '\0Music' }, { prompt: 'x'.repeat(4001) }, { prompt: 'Music', path: '/private' }, { prompt: 'Music', settings: null }, { prompt: 'Music', settings: [] }, { prompt: 'Music', settings: { externalUrl: 'https://example.test' } }]) rejects(value);
  });
  it('rejects unsupported settings rather than ignoring requested input', () => {
    for (const settings of [{ mode: 'vocal' }, { genre: 'Jazz' }, { mood: 'Calm' }, { bpm: 90 }, { durationSeconds: 150 }, { seed: '0' }]) rejects({ prompt: 'Music', settings }, mockCapabilities());
    rejects({ prompt: 'Music', settings: { mode: '' } });
    rejects({ prompt: 'Music', settings: { seed: '0' } }, { ...fullCapabilities, seedSupported: false });
  });
  it('applies the app variation cap and the smaller provider cap', () => {
    for (const variationCount of [null, 0, -1, 1.5, '2', 5, Infinity, NaN]) rejects({ prompt: 'Music', variationCount });
    const limited = { ...fullCapabilities, maxVariations: 1 };
    expect(validateGenerationInput({ prompt: 'Music' }, limited).variationCount).toBe(1);
    rejects({ prompt: 'Music', variationCount: 2 }, limited);
  });
  it('rejects nonfinite, nonnumeric, nonpositive, or out-of-range numbers', () => {
    for (const bpm of ['90', NaN, Infinity, 0, -1, 39, 241]) rejects({ prompt: 'Music', settings: { bpm } });
    for (const durationSeconds of ['150', NaN, Infinity, 0, 89.9, 180.1]) rejects({ prompt: 'Music', settings: { durationSeconds } });
  });
  it('bounds optional text and preserves numeric-looking seeds as strings', () => {
    for (const genre of ['', ' ', 0, '\0', 'x'.repeat(81)]) rejects({ prompt: 'Music', settings: { genre } });
    for (const mood of ['', ' ', 0, '\0', 'x'.repeat(81)]) rejects({ prompt: 'Music', settings: { mood } });
    for (const seed of ['', ' ', 0, '\0', 'x'.repeat(121)]) rejects({ prompt: 'Music', settings: { seed } });
    expect(validateGenerationInput({ prompt: 'Music', settings: { seed: '000042' } }, fullCapabilities).settings.seed).toBe('000042');
  });
});
