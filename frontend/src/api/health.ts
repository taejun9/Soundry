/**
 * 최소 health 응답만 확인하는 연결 상태 조회. 음악 생성이나 공급자 인증 상태를 변경하지 않는다.
 * 호출자가 전달한 AbortSignal로 연결 확인의 시간 제한과 화면 해제를 제어한다.
 */
import type { HealthResponse } from '../../../shared/contracts';

/** status만 비슷한 다른 서비스의 응답을 성공으로 오인하지 않도록 서비스 식별자까지 확인한다. */
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
