import { onScopeDispose, ref } from 'vue';
import type { ProviderSummary } from '../../../../shared/contracts';
import { fetchCurrentProvider } from '../../api/provider';
import { errorMessage } from '../../api/client';

export function useProvider() {
  const provider = ref<ProviderSummary | null>(null);
  const loading = ref(false);
  const error = ref('');
  let controller: AbortController | undefined;
  let sequence = 0;
  async function reload() {
    controller?.abort();
    controller = new AbortController();
    const current = controller;
    const request = ++sequence;
    loading.value = true;
    error.value = '';
    provider.value = null;
    try {
      const result = await fetchCurrentProvider(current.signal);
      if (request === sequence) provider.value = result;
    } catch (reason) {
      if (request === sequence && !current.signal.aborted) error.value = errorMessage(reason);
    } finally {
      if (request === sequence) loading.value = false;
    }
  }
  onScopeDispose(() => { sequence++; controller?.abort(); });
  return { provider, loading, error, reload };
}
