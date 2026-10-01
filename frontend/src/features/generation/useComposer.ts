import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { ProviderSummary } from '../../../../shared/contracts';
import { draftFromGeneration, emptyDraft, prepareGenerationInput, sanitizeDraft, seedCharacterLimit } from './composer-input';
import type { ComposerDraft, ReusableGeneration } from './composer-input';

// This cache lives only in the current tab's JavaScript memory. It is never persisted.
const drafts = new Map<string, { draft: ComposerDraft; sourceGenerationId: string | null }>();
export function forgetProjectDraft(projectId: string) { drafts.delete(projectId); }

export function useComposer(projectId: string, provider: Ref<ProviderSummary | null>) {
  const draft = reactive<ComposerDraft>({ ...(drafts.get(projectId)?.draft ?? emptyDraft()) });
  const restored = drafts.has(projectId);
  const sourceGenerationId = ref(drafts.get(projectId)?.sourceGenerationId ?? null);
  const hasDraft = computed(() => { const blank = emptyDraft(); return (Object.keys(blank) as (keyof ComposerDraft)[]).some(key => draft[key] !== blank[key]); });
  const capabilityNotice = ref('');
  const touched = reactive(new Set<keyof ComposerDraft>());
  watch(() => [provider.value?.capabilities, provider.value?.id] as const, ([caps, providerId]) => {
    if (!caps) return;
    const sanitized = sanitizeDraft(draft, caps, seedCharacterLimit(providerId));
    if (sanitized.changed.length) {
      Object.assign(draft, sanitized.draft);
      capabilityNotice.value = '공급자의 지원 범위에 맞춰 선택 설정을 초기화했어요. 작성한 프롬프트는 그대로 유지됩니다.';
    }
  }, { immediate: true });
  const prepared = computed(() => provider.value ? prepareGenerationInput(draft, provider.value.capabilities, seedCharacterLimit(provider.value.id)) : null);
  const errors = computed(() => prepared.value?.errors ?? {});
  const input = computed(() => prepared.value?.input ?? null);
  const readyToGenerate = computed(() => Boolean(input.value && provider.value?.configured && provider.value.generationEnabled));
  function touch(field: keyof ComposerDraft) { touched.add(field); }
  function validate() {
    (Object.keys(draft) as (keyof ComposerDraft)[]).forEach(touch);
    return input.value;
  }
  function reuse(input: ReusableGeneration): boolean {
    if (!provider.value) return false;
    const sanitized = sanitizeDraft(draftFromGeneration(input), provider.value.capabilities, seedCharacterLimit(provider.value.id));
    Object.assign(draft, sanitized.draft);
    sourceGenerationId.value = input.generationId; touched.clear();
    capabilityNotice.value = sanitized.changed.length ? '현재 공급자가 지원하지 않는 설정이나 범위를 벗어난 값은 초기화했어요. 프롬프트와 지원하는 설정은 복원했습니다.' : '';
    return true;
  }
  onScopeDispose(() => { drafts.set(projectId, { draft: { ...draft }, sourceGenerationId: sourceGenerationId.value }); });
  return { draft, restored, capabilityNotice, touched, errors, input, readyToGenerate, touch, validate, hasDraft, reuse, sourceGenerationId };
}
