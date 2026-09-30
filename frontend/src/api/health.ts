import type { HealthResponse } from '../../../shared/contracts';

export async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('로컬 서버에 연결할 수 없습니다.');
  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' || payload === null ||
    !('status' in payload) || payload.status !== 'ok' ||
    !('service' in payload) || payload.service !== 'soundry-api'
  ) {
    throw new Error('로컬 서버의 응답을 확인할 수 없습니다.');
  }
  return { status: 'ok', service: 'soundry-api' };
}
