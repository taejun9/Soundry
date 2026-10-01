/** Labels describe the stored provider, including older Mock results. */
export function providerName(id: string): string {
  return id === 'mock' ? 'Mock' : id === 'cli' ? 'Codex CLI' : id;
}
export function providerResultLabel(id: string): string {
  return id === 'mock' ? 'Mock · 고정 데모' : id === 'cli' ? 'AI 작곡 · 로컬 합성' : id;
}
