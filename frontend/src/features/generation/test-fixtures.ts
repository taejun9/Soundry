/**
 * 프런트엔드 계약·상태 테스트에서 공유하는 최소 생성/음원 fixture. 실제 사용자 데이터는 포함하지 않는다.
 * Mock 결과의 8초 길이와 미확인 metadata를 명시하여 요청값을 결과로 추정하는 회귀를 막는다.
 */
import type { GenerationSummary, TrackSummary } from '../../../../shared/contracts';
/** 기본 대기 작업에서 필요한 필드만 덮어써 테스트 시나리오를 구성한다. */
export function jobFixture(overrides: Partial<GenerationSummary> = {}): GenerationSummary {
  return { id: 'job-one', projectId: 'project-one', prompt: 'A rain-washed city', settings: {}, variationCount: 1, requestKey: 'key-one', sourceGenerationId: null, provider: 'mock', model: 'demo-fixture', status: 'queued', stage: null, progress: null, errorCode: null, errorMessage: null, createdAt: '2026-10-01T00:00:00.000Z', startedAt: null, finishedAt: null, tracks: [], ...overrides };
}
/** 로컬 재생/다운로드 경로가 같은 ID를 가리키는 독립된 음원 객체를 매번 만든다. */
export function trackFixture(): TrackSummary {
  return { id: 'track-one', projectId: 'project-one', generationId: 'job-one', variationIndex: 0, title: 'Demo result', prompt: 'A rain-washed city', audioUrl: '/api/tracks/track-one/audio', downloadUrl: '/api/tracks/track-one/download', mimeType: 'audio/wav', byteSize: 768044, durationSeconds: 8, bpm: null, genre: null, mood: null, seed: null, provider: 'mock', model: 'demo-fixture', favorite: false, createdAt: '2026-10-01T00:00:00.000Z' };
}
