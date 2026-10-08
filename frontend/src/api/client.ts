/**
 * 모든 도메인 JSON 요청의 공통 통신 경계. 응답은 unknown으로 반환하고 각 API 모듈이 계약을 검증한다.
 * 사용자 취소·15초 제한·서버 오류를 구분하며, 응답을 잃은 쓰기는 자동 재전송하지 않는다.
 */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// 서버의 원시 stderr/경로를 쓰지 않는 허용 목록이다. code별 안내만 브라우저에 노출한다.
const cliSetupErrors: Record<string, string> = {
  LOCAL_UNAVAILABLE: '로컬 Ollama 실행과 버전을 확인해 주세요.',
  LOCAL_MODEL_MISSING: '설정한 작곡 모델을 로컬에 준비한 뒤 다시 확인해 주세요.',
  LOCAL_CLOUD_ENABLED: 'Ollama 클라우드 기능을 끄고 재시작해 주세요. 로컬 전용 상태 확인이 필요합니다.',
  CLI_NOT_INSTALLED: 'Codex CLI를 찾을 수 없어요. CLI를 설치한 뒤 공급자 정보를 다시 확인해 주세요.',
  CLI_LOGIN_REQUIRED: 'Codex CLI 로그인이 필요해요. ChatGPT 계정으로 로그인한 뒤 공급자 정보를 다시 확인해 주세요.',
  CLI_AUTH_UNSUPPORTED: 'Codex CLI를 ChatGPT 계정으로 로그인해 주세요. API 키 로그인은 지원하지 않습니다.',
  CLI_UNAVAILABLE: 'Codex CLI 상태를 확인하지 못했어요. CLI 실행 상태를 확인한 뒤 공급자 정보를 다시 불러와 주세요.',
};

/** 503 중 접수 전에 확정 거부된 CLI 준비 오류만 분류한다. 일반 503은 접수 여부가 불확실할 수 있다. */
export function isCliSetupError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 503 && Object.hasOwn(cliSetupErrors, error.code);
}

/** 4xx의 공개 설명만 사용하고 5xx의 원시 출력은 숨긴다. 안전한 고정 문구가 있는 오류는 별도로 안내한다. */
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
  if (status === 503 && Object.hasOwn(cliSetupErrors, code)) message = cliSetupErrors[code]!;
  if (status === 404) message = '요청한 항목을 찾을 수 없어요.';
  if (status === 409 && code === 'PROJECT_BUSY') message = '진행 중인 음악 생성이 있어요. 작업을 취소하거나 완료된 뒤 삭제해 주세요.';
  return new ApiError(message, status, code);
}

/** 상위 취소 신호를 내부 시간 제한과 합친다. 요청이 끝나면 timer/listener를 해제해 다음 요청에 영향을 주지 않는다. */
export async function requestJson(path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal } = {}): Promise<unknown> {
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
    // 사용자가 화면을 떠난 취소는 연결 실패와 구분해 상위가 오류 배너를 만들지 않게 한다.
    if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (error instanceof ApiError) throw error;
    // 서버가 쓰기를 완료했지만 응답만 유실됐을 수 있으므로 실패 확정이나 자동 재전송을 하지 않는다.
    if (method !== 'GET') {
      throw new ApiError('저장 결과를 확인하지 못했어요. 창을 닫고 프로젝트 목록을 새로고침해 반영 여부를 확인해 주세요.', 0, 'NETWORK_ERROR');
    }
    throw new ApiError('로컬 서버에 연결할 수 없어요. 서버 실행을 확인한 뒤 다시 시도해 주세요.', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', relayAbort);
  }
}

/** 검증된 ApiError 외 예외 객체의 내부 내용을 UI로 노출하지 않는다. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '응답을 확인하지 못했어요. 다시 시도해 주세요.';
}
