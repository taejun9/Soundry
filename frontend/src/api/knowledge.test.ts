import { describe, expect, it } from 'vitest';
import { knowledgeItem } from './knowledge';
describe('knowledge response validation', () => {
  const valid = { id: 'example', title: '재즈', content: '직접 작성', tags: 'jazz', source: '나', rights: 'own', allowRemote: false, rating: null, trackId: null, createdAt: 'date', updatedAt: 'date' };
  it('preserves explicit false consent and rejects corrupt or missing fields', () => {
    expect(knowledgeItem(valid).allowRemote).toBe(false);
    for (const value of [null, [], {}, { ...valid, allowRemote: 'false' }, { ...valid, rating: 7 }, { ...valid, rights: 'unknown' }, { ...valid, content: 2 }]) expect(() => knowledgeItem(value)).toThrow();
  });
});
