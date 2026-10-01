/**
 * 프로젝트별 작성 초안, 필드 오류 표시, 과거 입력 재사용을 관리하는 composable.
 * 초안은 현재 탭 메모리에만 남고 공급자 변경 시 프롬프트를 보존하면서 선택 설정만 지원 범위로 조정한다.
 */
import { computed, onScopeDispose, reactive, ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { ProviderSummary } from '../../../../shared/contracts';
import { draftFromGeneration, emptyDraft, prepareGenerationInput, sanitizeDraft, seedCharacterLimit } from './composer-input';
import type { ComposerDraft, ReusableGeneration } from './composer-input';

// This cache lives only in the current tab's JavaScript memory. It is never persisted.
const drafts = new Map<string, { draft: ComposerDraft; sourceGenerationId: string | null }>();
/** 프로젝트 삭제 확인 후 탭 메모리에 남은 초안과 원본 계보를 함께 제거한다. */
export function forgetProjectDraft(projectId: string) { drafts.delete(projectId); }

export function useComposer(projectId: string, provider: Ref<ProviderSummary | null>) {
  const draft = reactive<ComposerDraft>({ ...(drafts.get(projectId)?.draft ?? emptyDraft()) });
  const restored = drafts.has(projectId);
  const sourceGenerationId = ref(drafts.get(projectId)?.sourceGenerationId ?? null);
  const hasDraft = computed(() => { const blank = emptyDraft(); return (Object.keys(blank) as (keyof ComposerDraft)[]).some(key => draft[key] !== blank[key]); });
  const capabilityNotice = ref('');
  const touched = reactive(new Set<keyof ComposerDraft>());
  // capability 또는 공급자 ID가 바뀌면 현재 초안을 지원 범위에 맞춘다. prompt는 초기화 대상이 아니다.
  watch(() => [provider.value?.capabilities, provider.value?.id] as const, ([caps, providerId]) => {
    if (!caps) return;
    const sanitized = sanitizeDraft(draft, caps, seedCharacterLimit(providerId));
    if (sanitized.changed.length) {
      Object.assign(draft, sanitized.draft);
      capabilityNotice.value = '공급자의 지원 범위에 맞춰 선택 설정을 초기화했어요. 작성한 프롬프트는 그대로 유지됩니다.';
    }
  }, { immediate: true });
  // 검증 결과는 화면 표시용이며 제출 이벤트를 직접 만들지 않는다. 공급자 준비 상태는 별도로 합친다.
  const prepared = computed(() => provider.value ? prepareGenerationInput(draft, provider.value.capabilities, seedCharacterLimit(provider.value.id)) : null);
  const errors = computed(() => prepared.value?.errors ?? {});
  const input = computed(() => prepared.value?.input ?? null);
  const readyToGenerate = computed(() => Boolean(input.value && provider.value?.configured && provider.value.generationEnabled));
  /** 사용자가 만진 필드만 오류를 표시하되 전체 제출 검증 시에는 모든 필드를 표시한다. */
  function touch(field: keyof ComposerDraft) { touched.add(field); }
  /** 전체 필드를 touched로 표시하고 유효한 입력 snapshot만 반환한다. */
  function validate() {
    (Object.keys(draft) as (keyof ComposerDraft)[]).forEach(touch);
    return input.value;
  }
  /** 현재 공급자의 지원 범위를 확인한 뒤 과거 입력을 복사한다. 원본 Generation은 수정하지 않는다. */
  function reuse(input: ReusableGeneration): boolean {
    if (!provider.value) return false;
    const sanitized = sanitizeDraft(draftFromGeneration(input), provider.value.capabilities, seedCharacterLimit(provider.value.id));
    Object.assign(draft, sanitized.draft);
    sourceGenerationId.value = input.generationId; touched.clear();
    capabilityNotice.value = sanitized.changed.length ? '현재 공급자가 지원하지 않는 설정이나 범위를 벗어난 값은 초기화했어요. 프롬프트와 지원하는 설정은 복원했습니다.' : '';
    return true;
  }
  // 화면 이동 때 초안 복사본과 원본 계보를 함께 저장하므로 다른 프로젝트에 섞이지 않는다.
  onScopeDispose(() => { drafts.set(projectId, { draft: { ...draft }, sourceGenerationId: sourceGenerationId.value }); });
  return { draft, restored, capabilityNotice, touched, errors, input, readyToGenerate, touch, validate, hasDraft, reuse, sourceGenerationId };
}
