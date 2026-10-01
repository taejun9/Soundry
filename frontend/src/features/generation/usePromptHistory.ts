/**
 * 프롬프트 이력의 cursor 조회 상태. 요청 sequence와 scope 수명으로 오래된 응답을 버린다.
 * 페이지를 이어 붙일 때 generationId로 중복을 제거하고 새로고침은 항상 첫 페이지에서 시작한다.
 */
import { onScopeDispose, ref } from 'vue';
import type { PromptSummary } from '../../../../shared/contracts';
import { listPrompts } from '../../api/prompts';
import { errorMessage } from '../../api/client';
export function usePromptHistory(projectId: string, list = listPrompts) {
  const items = ref<PromptSummary[]>([]); const nextCursor = ref<string | null>(null); const loading = ref(false); const error = ref('');
  let active = true; let sequence = 0; let controller: AbortController | undefined;
  /** 새 요청은 이전 조회를 취소한다. 응답은 scope와 sequence가 살아 있을 때만 목록에 반영한다. */
  async function load(append = false) {
    if (!active || (append && (loading.value || !nextCursor.value))) return;
    controller?.abort(); controller = new AbortController();
    const current = ++sequence; const signal = controller.signal;
    loading.value = true; error.value = '';
    try {
      const page = await list(projectId, append ? nextCursor.value : null, signal);
      if (!active || current !== sequence) return;
      items.value = append ? [...new Map([...items.value, ...page.items].map(item => [item.generationId, item])).values()] : page.items;
      nextCursor.value = page.nextCursor;
    } catch (reason) { if (active && current === sequence && !signal.aborted) error.value = errorMessage(reason); }
    finally { if (active && current === sequence) loading.value = false; }
  }
  onScopeDispose(() => { active = false; sequence++; controller?.abort(); });
  return { items, nextCursor, loading, error, refresh: () => load(), more: () => load(true) };
}
