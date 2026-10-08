/**
 * 저장된 공급자 ID를 사용자에게 보여줄 출처 설명으로 변환한다.
 * 현재 공급자가 바뀌어도 과거 Mock 결과와 CLI 작곡 결과의 차이를 유지한다.
 */
/** Labels describe the stored provider, including older Mock results. */
export function providerName(id: string): string {
  return id === 'mock' ? 'Mock' : id === 'cli' ? 'Codex CLI' : id === 'ollama' ? '로컬 LLM' : id === 'llamacpp' ? 'llama.cpp' : id;
}
export function providerResultLabel(id: string): string {
  return id === 'mock' ? 'Mock · 고정 데모' : ['cli', 'ollama', 'llamacpp'].includes(id) ? 'AI 작곡 · 로컬 합성' : id;
}
