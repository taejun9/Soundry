/**
 * 음원 상세와 과거 입력의 JSON 경계를 검증한다.
 * 요청 설정과 출력 metadata를 분리하고 삭제 후 빈 이력은 허용하되 잘못된 ID·URL·개수는 거부한다.
 */
import { describe, expect, it } from 'vitest';
import { parseTrackDetail } from './tracks';
import { parsePrompt } from './prompts';
import { trackFixture } from '../features/generation/test-fixtures';
const detail = () => ({ ...trackFixture(), requestedSettings: { mode: 'instrumental' }, requestedVariationCount: 2 });
const prompt = () => ({ generationId: 'job-one', prompt: 'An old idea', settings: {}, variationCount: 2, status: 'completed', trackCount: 0, createdAt: '2026-10-01T00:00:00.000Z' });
describe('track and prompt response boundaries', () => {
  it('preserves requested settings separately from actual audio and validates identity and local URLs', () => {
    expect(parseTrackDetail(detail(), 'track-one', 'project-one').requestedVariationCount).toBe(2);
    for (const changed of [{ id: 'other' }, { projectId: 'other' }, { downloadUrl: 'https://outside.invalid/audio' }, { requestedSettings: { unknown: true } }, { requestedVariationCount: 0 }]) expect(() => parseTrackDetail({ ...detail(), ...changed }, 'track-one', 'project-one')).toThrow();
  });
  it('accepts an empty completed result history but rejects impossible counts and settings', () => {
    expect(parsePrompt(prompt()).trackCount).toBe(0);
    for (const changed of [{ trackCount: 3 }, { trackCount: -1 }, { variationCount: 2.5 }, { status: 'unknown' }, { settings: { bpm: Infinity } }, { createdAt: 'invalid' }]) expect(() => parsePrompt({ ...prompt(), ...changed })).toThrow();
  });
});
