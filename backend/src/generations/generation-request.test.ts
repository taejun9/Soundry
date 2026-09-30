import { describe, expect, it } from 'vitest';
import type { GenerationSettings, ProviderCapabilities } from '../../../shared/contracts.js';
import { AppError } from '../api-errors.js';
import { canonicalSettings, encodeGenerationCursor, generationId, generationListQuery, validateCreateGeneration } from './generation-request.js';

const id = 'ABCDEF12-3456-4789-ABCD-ABCDEF123456';
const sourceId = 'FEDCBA98-7654-4321-ABCD-FEDCBA987654';
const createdAt = '2026-10-01T12:34:56.789Z';
const capabilities: ProviderCapabilities = {
  modes: ['instrumental'], settings: ['genre', 'mood', 'bpm', 'durationSeconds', 'seed'], maxVariations: 4,
  seedSupported: true, canCancelRemote: false, bpmRange: { min: 40, max: 240 }, durationRangeSeconds: { min: 90, max: 180 },
};
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function rejects(action: () => unknown) {
  try { action(); throw new Error('Expected invalid input'); }
  catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).getStatus()).toBe(400);
    expect((error as AppError).publicCode).toBe('INVALID_INPUT');
  }
}

describe('generation request validation', () => {
  it('normalizes request identifiers and delegates musical input into a fresh snapshot', () => {
    const value = { requestKey: id, sourceGenerationId: sourceId, prompt: '  새벽 산책  ', settings: { genre: ' Ambient ', bpm: 90 } };
    const result = validateCreateGeneration(value, capabilities);
    expect(result).toEqual({ requestKey: id.toLowerCase(), sourceGenerationId: sourceId.toLowerCase(), prompt: '새벽 산책', settings: { genre: 'Ambient', bpm: 90 }, variationCount: 2 });
    value.settings.genre = 'Changed';
    expect(result.settings.genre).toBe('Ambient');
  });
  it('omits an absent source and respects the provider variation cap', () => {
    const result = validateCreateGeneration({ requestKey: id, prompt: 'Music' }, { ...capabilities, maxVariations: 1 });
    expect(result).toEqual({ requestKey: id.toLowerCase(), prompt: 'Music', settings: {}, variationCount: 1 });
    expect(Object.hasOwn(result, 'sourceGenerationId')).toBe(false);
  });
  it('requires a UUID request key and rejects nullable or malformed source references', () => {
    for (const requestKey of [undefined, null, 1, {}, [], '', 'not-a-uuid', ` ${id}`, `${id}\n`, id.replaceAll('-', '')]) {
      rejects(() => validateCreateGeneration({ prompt: 'Music', requestKey }, capabilities));
    }
    for (const sourceGenerationId of [null, 1, {}, [], '', 'not-a-uuid', ` ${sourceId}`, `${sourceId}\n`]) {
      rejects(() => validateCreateGeneration({ prompt: 'Music', requestKey: id, sourceGenerationId }, capabilities));
    }
  });
  it('rejects unknown request keys and non-object bodies', () => {
    for (const value of [undefined, null, [], 'Music', 1, { requestKey: id, prompt: 'Music', projectId: id }, { requestKey: id, prompt: 'Music', provider: 'mock' }]) {
      rejects(() => validateCreateGeneration(value, capabilities));
    }
  });
  it('preserves prompt, settings, and variation validation at the request boundary', () => {
    for (const input of [{ prompt: ' ' }, { prompt: 'x'.repeat(4001) }, { settings: { mode: 'vocal' } }, { settings: { genre: '\0' } }, { settings: { bpm: 241 } }, { settings: { path: '/private' } }, { variationCount: 5 }]) {
      rejects(() => validateCreateGeneration({ requestKey: id, prompt: 'Music', ...input }, capabilities));
    }
  });
  it('normalizes generation route IDs without accepting surrounding whitespace', () => {
    expect(generationId(id)).toBe(id.toLowerCase());
    for (const value of ['', 'invalid', `${id} `, `${id}\n`, `${id}/audio`]) rejects(() => generationId(value));
  });
});

describe('generation list cursors', () => {
  it('round-trips createdAt/id and normalizes UUID case', () => {
    const cursor = encodeGenerationCursor({ createdAt, id });
    expect(cursor).toBe(encoded({ createdAt, id }));
    expect(generationListQuery({ cursor, limit: '100' })).toEqual({ limit: 100, cursor: { createdAt, id: id.toLowerCase() } });
    expect(generationListQuery({})).toEqual({ limit: 30 });
    expect(generationListQuery({ limit: '1' })).toEqual({ limit: 1 });
  });
  it('rejects unknown filters, repeated parameters, and out-of-range or noninteger limits', () => {
    rejects(() => generationListQuery({ status: 'completed' }));
    for (const limit of [null, 30, '', '0', '-1', '101', '1.5', '1e2', ' 2', '2 ', '+2', ['2'], {}, '9'.repeat(512)]) {
      rejects(() => generationListQuery({ limit }));
    }
  });
  it('requires canonical unpadded base64url within the 512-character bound', () => {
    const cursor = encodeGenerationCursor({ createdAt, id });
    for (const value of [null, [], {}, '', 'x'.repeat(513), `${cursor}=`, `${cursor}\n`, ` ${cursor}`, '+/', 'Zh', '___']) {
      rejects(() => generationListQuery({ cursor: value }));
    }
    // Zh decodes to the same byte as Zg, but its nonzero trailing bits are not canonical.
    expect(Buffer.from('Zh', 'base64url')).toEqual(Buffer.from('Zg', 'base64url'));
  });
  it('rejects malformed JSON, extra fields, wrong cursor keys, and invalid UUIDs', () => {
    rejects(() => generationListQuery({ cursor: Buffer.from('{').toString('base64url') }));
    for (const value of [null, [], 'text', {}, { createdAt }, { id }, { id, updatedAt: createdAt }, { id, createdAt, extra: true }, { id: 'invalid', createdAt }, { id: 1, createdAt }]) {
      rejects(() => generationListQuery({ cursor: encoded(value) }));
    }
  });
  it('requires a real canonical UTC ISO timestamp including milliseconds', () => {
    for (const timestamp of [null, 1, '', '2026-10-01', '2026-10-01T12:34:56Z', '2026-10-01T12:34:56.789+00:00', '2026-02-30T12:34:56.789Z', '2026-10-01T24:34:56.789Z', '2026-10-01T12:34:56.7890Z']) {
      rejects(() => generationListQuery({ cursor: encoded({ id, createdAt: timestamp }) }));
    }
    expect(generationListQuery({ cursor: encoded({ id, createdAt: '2024-02-29T00:00:00.000Z' }) }).cursor?.createdAt).toBe('2024-02-29T00:00:00.000Z');
  });
});

describe('canonical generation settings', () => {
  it('makes equivalent insertion orders identical without mutating the settings', () => {
    const first: GenerationSettings = { seed: '000042', mood: '고요한 밤', bpm: 92.5, genre: 'Jazz', durationSeconds: 150, mode: 'instrumental' };
    const keys = Object.keys(first);
    const second: GenerationSettings = { mode: 'instrumental', durationSeconds: 150, genre: 'Jazz', bpm: 92.5, mood: '고요한 밤', seed: '000042' };
    expect(canonicalSettings(first)).toBe(canonicalSettings(second));
    expect(canonicalSettings(first)).toBe('{"bpm":92.5,"durationSeconds":150,"genre":"Jazz","mode":"instrumental","mood":"고요한 밤","seed":"000042"}');
    expect(Object.keys(first)).toEqual(keys);
  });
  it('preserves meaningful value differences and canonicalizes empty settings', () => {
    expect(canonicalSettings({})).toBe('{}');
    expect(canonicalSettings({ seed: '000042' })).not.toBe(canonicalSettings({ seed: '42' }));
    expect(canonicalSettings({ bpm: 90 })).not.toBe(canonicalSettings({ bpm: 90.5 }));
  });
});
