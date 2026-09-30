import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { ProviderSummary } from '../../../../shared/contracts';
import { emptyDraft, prepareGenerationInput, sanitizeDraft } from './composer-input';
import type { ComposerDraft } from './composer-input';

// This cache lives only in the current tab's JavaScript memory. It is never persisted.
const drafts = new Map<string, ComposerDraft>();
export function forgetProjectDraft(projectId: string) { drafts.delete(projectId); }

export function useComposer(projectId: string, provider: Ref<ProviderSummary | null>) {
  const draft = reactive<ComposerDraft>({ ...(drafts.get(projectId) ?? emptyDraft()) });
  const restored = drafts.has(projectId);
  const capabilityNotice = ref('');
  const touched = reactive(new Set<keyof ComposerDraft>());
  watch(() => provider.value?.capabilities, caps => {
    if (!caps) return;
    const sanitized = sanitizeDraft(draft, caps);
    if (sanitized.changed.length) {
      Object.assign(draft, sanitized.draft);
      capabilityNotice.value = '공급자의 지원 범위에 맞춰 선택 설정을 초기화했어요. 작성한 프롬프트는 그대로 유지됩니다.';
    }
  }, { immediate: true });
  const prepared = computed(() => provider.value ? prepareGenerationInput(draft, provider.value.capabilities) : null);
  const errors = computed(() => prepared.value?.errors ?? {});
  const input = computed(() => prepared.value?.input ?? null);
  const readyToGenerate = computed(() => Boolean(input.value && provider.value?.configured && provider.value.generationEnabled));
  function touch(field: keyof ComposerDraft) { touched.add(field); }
  function validate() {
    (Object.keys(draft) as (keyof ComposerDraft)[]).forEach(touch);
    return input.value;
  }
  onScopeDispose(() => { drafts.set(projectId, { ...draft }); });
  return { draft, restored, capabilityNotice, touched, errors, input, readyToGenerate, touch, validate };
}
