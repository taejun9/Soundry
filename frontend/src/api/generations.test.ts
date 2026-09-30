import { describe, expect, it } from 'vitest';
import { parseGeneration } from './generations';
import { jobFixture, trackFixture } from '../features/generation/test-fixtures';

describe('generation response boundary', () => {
  it('accepts verified results while preserving unknown metadata as null', () => {
    const value = jobFixture({ status: 'completed', tracks: [trackFixture()] });
    expect(parseGeneration(value, 'project-one').tracks[0]?.bpm).toBeNull();
    expect(parseGeneration(value).tracks[0]?.durationSeconds).toBe(8);
  });
  it.each([
    jobFixture({ tracks: [trackFixture()] }),
    jobFixture({ status: 'completed', tracks: [trackFixture(), { ...trackFixture(), id: 'track-two', variationIndex: 1 }] }),
    { ...jobFixture(), progress: 57 },
    { ...jobFixture(), status: { toString: 'completed' } },
    jobFixture({ status: 'completed', tracks: [{ ...trackFixture(), projectId: 'other-project' }] }),
    jobFixture({ status: 'completed', tracks: [{ ...trackFixture(), generationId: 'other-job' }] }),
  ])('rejects incomplete-job tracks, fabricated progress or mismatched results', value => {
    expect(() => parseGeneration(value, 'project-one')).toThrow('작업 응답');
  });
  it('preserves completed generation history after some or all tracks are deleted', () => {
    expect(parseGeneration(jobFixture({ status: 'completed', tracks: [] })).tracks).toEqual([]);
    expect(parseGeneration(jobFixture({ status: 'completed', variationCount: 2, tracks: [trackFixture()] })).tracks).toHaveLength(1);
  });
  it('does not let another project response enter the current workspace', () => {
    expect(() => parseGeneration(jobFixture(), 'project-two')).toThrow('작업 응답');
  });
});
