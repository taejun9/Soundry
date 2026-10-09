import { describe, it, expect } from 'vitest';
import { COMPOSITION_CORPUS, GENRE_GUIDANCE } from './composition-corpus.js';
import { GENRE_PRESETS } from '../../frontend/src/features/generation/genres.js';
import { retrieveKnowledge } from '../../backend/src/knowledge/retrieval.js';
import type { CompositionKnowledge } from '../../shared/contracts.js';
const items: CompositionKnowledge[] = COMPOSITION_CORPUS.map((entry,index) => ({ ...entry, id: String(index), rating: null, trackId: null, createdAt: '2026-10-09', updatedAt: '2026-10-09' }));
describe('original composition corpus', () => {
  it('covers every supported genre with six unique local-only original observations', () => {
    expect(GENRE_GUIDANCE.map(row => row.genre)).toEqual(GENRE_PRESETS.map(row => row.label));
    expect(items).toHaveLength(96); expect(new Set(items.map(row => row.content)).size).toBe(96);
    expect(items.every(row => !row.allowRemote && row.rights === 'own' && row.content.length <= 4000 && row.tags.length <= 200)).toBe(true);
  });
  it.each(GENRE_PRESETS)('retrieves six matching distinct references for $label', preset => {
    const result = retrieveKnowledge(items, preset.prompt + ' ' + preset.label, false, preset.label);
    expect(result).toHaveLength(6); expect(result.every(row => row.reference.title.startsWith(preset.label + ':'))).toBe(true);
    expect(new Set(result.map(row => row.reference.digest)).size).toBe(6);
    expect(retrieveKnowledge(items, preset.prompt, true, preset.label)).toEqual([]);
  });
});
