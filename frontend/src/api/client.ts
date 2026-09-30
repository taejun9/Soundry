export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function responseError(payload: unknown, status: number): ApiError {
  let code = 'REQUEST_FAILED';
  let message = '요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = payload.error;
    if (typeof error === 'object' && error !== null) {
      if ('code' in error && typeof error.code === 'string') code = error.code;
      if (status < 500 && 'message' in error && typeof error.message === 'string') message = error.message;
    }
  }
  if (status === 404) message = '프로젝트가 없거나 이미 삭제되었어요.';
  if (status === 409) message = '진행 중인 음악 생성이 있어요. 작업을 취소하거나 완료된 뒤 삭제해 주세요.';
  return new ApiError(message, status, code);
}

export async function requestJson(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal } = {}): Promise<unknown> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  options.signal?.addEventListener('abort', relayAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const method = options.method ?? 'GET';
  try {
    const response = await fetch(`/api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Soundry-Request': '1' } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw responseError(payload, response.status);
    return payload;
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (error instanceof ApiError) throw error;
    if (method !== 'GET') {
      throw new ApiError('저장 결과를 확인하지 못했어요. 창을 닫고 프로젝트 목록을 새로고침해 반영 여부를 확인해 주세요.', 0, 'NETWORK_ERROR');
    }
    throw new ApiError('로컬 서버에 연결할 수 없어요. 서버 실행을 확인한 뒤 다시 시도해 주세요.', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', relayAbort);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '응답을 확인하지 못했어요. 다시 시도해 주세요.';
}
