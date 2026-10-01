import { onScopeDispose, ref } from 'vue';
import type { PromptSummary } from '../../../../shared/contracts';
import { listPrompts } from '../../api/prompts';
import { errorMessage } from '../../api/client';
export function usePromptHistory(projectId: string, list = listPrompts) {
  const items = ref<PromptSummary[]>([]); const nextCursor = ref<string | null>(null); const loading = ref(false); const error = ref('');
  let active = true; let sequence = 0; let controller: AbortController | undefined;
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
