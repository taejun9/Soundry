/**
 * 작곡 실패를 DB/API에 남길 수 있는 고정 오류 코드와 한국어 안내로 제한한다.
 * CLI stderr, 계정 정보, 입력 프롬프트, 작업 경로를 에러 메시지에 이어 붙이지 않는다.
 */
const messages = {
  LOCAL_UNAVAILABLE: '로컬 LLM 서버 상태를 확인하지 못했어요. 실행과 연결 설정을 확인해 주세요.',
  LOCAL_MODEL_MISSING: '설정한 로컬 작곡 모델이 설치되지 않았어요. 모델을 준비한 뒤 다시 확인해 주세요.',
  LOCAL_CLOUD_ENABLED: 'Ollama의 클라우드 기능을 끄고 재시작해 주세요. 로컬 전용 상태를 확인해야 작곡할 수 있습니다.',
  LOCAL_FAILED: '로컬 모델 작곡을 완료하지 못했어요. 모델과 메모리 상태를 확인해 주세요.',
  LOCAL_INVALID_OUTPUT: '로컬 모델이 유효한 악보를 만들지 못했어요. 모델 또는 음악 설명을 조정해 주세요.',
  LOCAL_TIMEOUT: '로컬 작곡 시간이 초과되었어요. 더 작은 모델이나 단순한 구성을 사용해 주세요.',
  LOCAL_OUTPUT_TOO_LARGE: '로컬 작곡 응답이 허용 크기를 초과했어요.',
  CLI_NOT_INSTALLED: 'Codex CLI를 찾지 못했어요. 설치한 뒤 서버를 다시 시작해 주세요.',
  CLI_LOGIN_REQUIRED: 'Codex CLI에서 ChatGPT 계정으로 로그인한 뒤 공급자 상태를 다시 확인해 주세요.',
  CLI_AUTH_UNSUPPORTED: '이 앱은 Codex CLI의 ChatGPT 로그인만 사용합니다. API 키 방식 대신 ChatGPT 계정으로 로그인해 주세요.',
  CLI_UNAVAILABLE: 'Codex CLI 상태를 확인하지 못했어요. 설치와 로그인을 확인한 뒤 다시 시도해 주세요.',
  CLI_LIMIT_REACHED: 'Codex 계정 사용 한도에 도달했어요. 계정의 한도와 갱신 시간을 확인한 뒤 새 작업으로 시도해 주세요.',
  CLI_TIMEOUT: 'CLI 작곡 시간이 초과되었어요. 입력을 줄이거나 곡 수를 줄여 새 작업으로 시도해 주세요.',
  CLI_FAILED: 'CLI 작곡을 완료하지 못했어요. 계정 연결 상태와 입력을 확인한 뒤 새 작업으로 시도해 주세요.',
  CLI_INVALID_OUTPUT: 'CLI가 올바른 악보를 만들지 못했어요. 음악 설명을 조정해 새 작업으로 시도해 주세요.',
  CLI_OUTPUT_TOO_LARGE: 'CLI 악보 출력이 허용 크기를 초과했어요. 설명과 구성을 간단히 해 다시 시도해 주세요.',
  RENDER_FAILED: '작성된 악보를 음원으로 만들지 못했어요. 새 작업으로 다시 시도해 주세요.',
} as const;
export type ProviderErrorCode = keyof typeof messages;
/** Only these application-owned messages cross the API/DB boundary. */
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode) { super(messages[code]); this.name = 'ProviderError'; }
}
export function providerMessage(code: ProviderErrorCode): string { return messages[code]; }
