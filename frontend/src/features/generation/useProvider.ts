/**
 * 공급자 준비 상태와 지원 설정을 비동기로 가져오는 composable.
 * 재조회 중에는 이전 공급자를 비워 새 설정 확인 전에 생성 가능 상태가 남지 않게 한다.
 */
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
  /** 이전 요청을 취소하고 sequence를 올려 늦은 응답/오류가 새 공급자 상태를 덮지 않게 한다. */
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
