import { describe, expect, it } from 'vitest';
import type { CompositionKnowledge } from '../../../shared/contracts.js';
import { knowledgePrompt, retrieveKnowledge, tokens } from './retrieval.js';
const item = (id: string, patch: Partial<CompositionKnowledge> = {}): CompositionKnowledge => ({ id, title: '재즈 보이스 리딩', content: '재즈 화성은 가까운 성부로 연결한다.', tags: 'jazz 화성', source: '직접 작성', rights: 'own', allowRemote: false, rating: null, trackId: null, createdAt: '2026-10-09', updatedAt: '2026-10-09', ...patch });
describe('bounded local lexical RAG', () => {
  it('matches Korean inflections and normalized English but excludes unrelated knowledge', () => {
    expect(tokens('재즈에서 JAZZ')).toContain('재즈');
    expect(retrieveKnowledge([item('a'), item('b', { title: '클래식', tags: 'classical', content: '현악기의 선율' })], '재즈에서 jazz를 작곡', false).map(i => i.reference.id)).toEqual(['a']);
    expect(retrieveKnowledge([item('a')], 'techno kick', false)).toEqual([]);
  });
  it('filters remote consent and neutral ratings while marking negative feedback as avoidance', () => {
    const values = [item('local'), item('good', { content: '재즈 jazz 좋은 연결', rating: 5, allowRemote: true }), item('neutral', { rating: 3, allowRemote: true }), item('bad', { content: '재즈 jazz 나쁜 연결', rating: 1, allowRemote: true })];
    const remote = retrieveKnowledge(values, 'jazz 재즈', true);
    expect(remote.map(v => v.reference.id).sort()).toEqual(['bad','good']);
    expect(knowledgePrompt(remote)).toContain('"use":"avoid"');
    expect(retrieveKnowledge(values, 'jazz', false)).toHaveLength(3);
    expect(knowledgePrompt([])).toBe('');
  });
  it('deduplicates equivalent passages without changing stored ownership or consent', () => {
    expect(retrieveKnowledge([item('a'), item('b', { title: 'jazz 메모', content: '재즈  화성은 가까운 성부로 연결한다.' })], 'jazz 재즈', false)).toHaveLength(1);
  });
  it('retrieves a later relevant passage and bounds count/length with deterministic provenance', () => {
    const values = Array.from({ length: 20 }, (_, index) => item(String(index), { title: '기법', tags: '', content: 'x'.repeat(2000) + ' jazz 성부를 연결 ' + index }));
    const result = retrieveKnowledge(values, 'jazz', false);
    expect(result).toHaveLength(6); expect(result.every(v => v.content.length <= 1000)).toBe(true);
    expect(result[0]!.content).toContain('jazz'); expect(result[0]!.reference.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(retrieveKnowledge(values, 'jazz', false)).toEqual(result);
  });
});
