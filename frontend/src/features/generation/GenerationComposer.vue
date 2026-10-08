<script setup lang="ts">
/**
 * 프롬프트와 공급자별 선택 설정을 입력하고 명시적 제출 이벤트를 내보내는 작성 화면.
 * 예문/과거 입력의 덮어쓰기는 확인을 거치며 재사용만으로 새 음악을 자동 요청하지 않는다.
 */
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue';
import type { GenerationInput, SettingKey } from '../../../../shared/contracts';
import StudioIcon from '../../components/StudioIcon.vue';
import ModalDialog from '../../components/ModalDialog.vue';
import { GENRE_PRESETS } from './genres';
import { providerName as displayProviderName } from './provider-display';
import { maxVariations, seedCharacterLimit, supportsSetting } from './composer-input';
import type { ComposerDraft, ReusableGeneration } from './composer-input';
import { useComposer } from './useComposer';
import { useProvider } from './useProvider';

const props = defineProps<{ projectId: string; submitting?: boolean; blocked?: boolean }>();
const emit = defineEmits<{ submit: [input: GenerationInput, sourceGenerationId?: string]; availability: [available: boolean] }>();
const id = useId();
const promptField = ref<HTMLTextAreaElement>();
const selectedPreset = ref('');
const pendingReuse = ref<ReusableGeneration | null>(null);
const pendingPreset = ref<(typeof GENRE_PRESETS)[number] | null>(null);
const presetNotice = ref('');
const replacementConfirmed = ref(false);
const preferredPresetFocus = () => replacementConfirmed.value ? promptField.value ?? null : null;
const { provider, loading, error, reload } = useProvider();
const { draft, restored, capabilityNotice, touched, errors, touch, validate, hasDraft, reuse, sourceGenerationId } = useComposer(props.projectId, provider);
const available = computed(() => Boolean(provider.value?.configured && provider.value.generationEnabled));
watch(available, value => emit('availability', value), { immediate: true });
/** 제출 시 전체 필드를 검사한다. 오류가 접힌 세부 설정 안에 있으면 펼친 뒤 첫 오류로 포커스를 옮긴다. */
async function requestGeneration() {
  if (!available.value || props.submitting || props.blocked) return;
  const input = validate();
  if (input) emit('submit', input, sourceGenerationId.value ?? undefined);
  else {
    await nextTick();
    const field = Object.keys(errors.value)[0] ?? 'prompt';
    const suffix = field === 'durationSeconds' ? 'duration' : field === 'variationCount' ? 'variations' : field;
    const firstInvalid = document.getElementById(`${id}-${suffix}`);
    if (firstInvalid instanceof HTMLElement) {
      const advanced = firstInvalid.closest('details');
      if (advanced instanceof HTMLDetailsElement) advanced.open = true;
      firstInvalid.focus();
    } else promptField.value?.focus();
  }
}
const caps = computed(() => provider.value?.capabilities ?? null);
const preset = computed(() => GENRE_PRESETS.find(item => item.id === selectedPreset.value));
const variationLimit = computed(() => maxVariations(caps.value));
const providerName = computed(() => provider.value?.isMock ? 'Mock' : provider.value ? displayProviderName(provider.value.id) : '공급자');
const isCli = computed(() => provider.value?.id === 'cli' && !provider.value.isMock);
const isLocal = computed(() => ['ollama', 'llamacpp'].includes(provider.value?.id ?? '') && !provider.value?.isMock);
const isScoreComposer = computed(() => isCli.value || isLocal.value);
const seedLimit = computed(() => seedCharacterLimit(provider.value?.id));
const modeHelp = computed(() => {
  if (!caps.value) return '공급자 정보를 확인한 뒤 선택할 수 있어요.';
  if (caps.value.modes.length === 1) return caps.value.modes[0] === 'instrumental' ? '현재 공급자는 연주곡만 지원합니다.' : '현재 공급자는 보컬 음악만 지원합니다.';
  return '보컬 포함 여부를 선택할 수 있어요. 비워 두면 공급자 기본값을 사용합니다.';
});
/** 현재 capability로 선택 설정의 활성 여부를 결정한다. */
function supported(key: SettingKey) { return supportsSetting(caps.value, key); }
/** 실제 지원 범위와 CLI 전송/합성 의미에 맞는 도움말을 제공한다. */
function supportHelp(key: SettingKey) {
  if (!provider.value) return '공급자 정보를 확인한 뒤 선택할 수 있어요.';
  if (!supported(key)) return `현재 ${providerName.value}에서는 이 설정을 지원하지 않아요.`;
  if (provider.value.id === 'llamacpp' && key === 'bpm') return '40–220 BPM · 비워 두면 120 BPM으로 작곡합니다.';
  if (isScoreComposer.value && key === 'seed') return '선택 사항 · 64자 이내. 같은 악보의 로컬 합성에 사용할 값이며, AI 작곡 결과가 같아지는 것을 보장하지 않습니다.';
  if (isScoreComposer.value && key === 'durationSeconds') return '90–180초 · 비워 두면 150초(2분 30초)로 만듭니다.';
  const range = key === 'bpm' ? caps.value?.bpmRange : key === 'durationSeconds' ? caps.value?.durationRangeSeconds : undefined;
  return range ? `선택 범위 ${range.min}–${range.max}${key === 'durationSeconds' ? '초' : ' BPM'}. 비워 두면 자동으로 결정합니다.` : '선택 사항 · 비워 두면 자동으로 결정합니다.';
}
/** 첫 방문부터 오류를 쏟지 않고 사용자가 만지거나 제출한 필드의 오류만 표시한다. */
function visibleError(field: keyof ComposerDraft) { return touched.has(field) ? errors.value[field] : ''; }
/** 입력 중 빈 값과 소수를 유지하기 위해 숫자 변환을 제출 검증 단계까지 미룬다. */
function setNumber(field: 'bpm' | 'durationSeconds', event: Event) {
  if (event.target instanceof HTMLInputElement) draft[field] = event.target.value;
}
/** 예문은 prompt만 교체하고 이전 작업 계보를 해제한다. 대화상자가 닫힐 때는 공통 포커스 복원에 맡긴다. */
async function insertPreset(item: (typeof GENRE_PRESETS)[number]) {
  const closesDialog = pendingPreset.value !== null;
  replacementConfirmed.value = closesDialog;
  draft.prompt = item.prompt;
  sourceGenerationId.value = null;
  pendingPreset.value = null;
  presetNotice.value = `${item.label} 예문을 넣었어요. 원하는 느낌으로 자유롭게 고쳐 보세요.`;
  if (!closesDialog) {
    await nextTick();
    promptField.value?.focus();
  }
}
/** 기존 프롬프트를 잃는 경우에만 확인창을 열고 비어 있거나 같은 예문이면 바로 반영한다. */
function choosePreset() {
  if (!preset.value) return;
  replacementConfirmed.value = false;
  if (draft.prompt.trim() && draft.prompt !== preset.value.prompt) pendingPreset.value = preset.value;
  else void insertPreset(preset.value);
}
/** 원본 입력을 현재 공급자 범위로 복원하고 자동 제출 없이 사용자 검토 상태로 남긴다. */
async function applyReuse(item: ReusableGeneration) {
  if (!reuse(item)) { presetNotice.value = '공급자 정보를 불러온 뒤 다시 시도해 주세요.'; return; }
  const closesDialog = pendingReuse.value !== null;
  replacementConfirmed.value = closesDialog;
  pendingReuse.value = null; selectedPreset.value = '';
  presetNotice.value = '프롬프트와 설정을 가져왔어요. 내용을 확인한 뒤 생성 버튼을 눌러 새 작업을 시작하세요.';
  if (!closesDialog) { await nextTick(); promptField.value?.focus(); promptField.value?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}
/** 전달된 설정을 복사해 확인 대기 중 원본 변경의 영향을 피하고 기존 초안이 있으면 덮어쓰기를 묻는다. */
function requestReuse(item: ReusableGeneration) {
  if (props.submitting || props.blocked) return;
  const snapshot = { ...item, settings: { ...item.settings } };
  replacementConfirmed.value = false;
  if (hasDraft.value) pendingReuse.value = snapshot;
  else void applyReuse(snapshot);
}
defineExpose({ reuse: requestReuse });
onMounted(() => { void reload(); });
</script>

<template>
  <!-- 폼은 브라우저 기본 검증 대신 공급자 계약 검증을 사용한다. 비활성 필드에도 지원 불가 이유를 설명한다. -->
  <section class="panel prompt-panel composer-panel" aria-labelledby="composer-title">
    <div class="section-heading"><h2 id="composer-title">어떤 음악을 만들까요?</h2><StudioIcon name="sound" /></div>
    <p class="muted-copy">분위기와 악기, 머릿속에 떠오르는 장면을 적어보세요.</p>

    <div v-if="loading" class="provider-panel" role="status" aria-busy="true">음악 공급자의 지원 설정을 확인하고 있어요.</div>
    <div v-else-if="error" class="error-banner provider-error" role="alert"><p>{{ error }}</p><button type="button" class="button button-secondary" @click="reload">공급자 다시 불러오기</button></div>
    <div v-else-if="provider" class="provider-panel">
      <div class="provider-heading"><span class="provider-badge">{{ providerName }}<span v-if="provider.model"> · {{ provider.model }}</span></span><button type="button" class="icon-button" aria-label="공급자 정보 다시 확인" @click="reload"><StudioIcon name="refresh" /></button></div>
      <p>{{ provider.notice }}</p>
      <p v-if="!provider.configured" class="provider-warning">공급자 설정이 필요해요. 연결한 뒤 음악을 만들 수 있습니다.</p>
      <span v-if="provider.isMock" class="provider-local"><StudioIcon name="lock" />외부 전송 없는 데모 모드</span>
    </div>
    <p v-if="capabilityNotice" class="notice-banner compact-notice" role="status">{{ capabilityNotice }}</p>

    <form novalidate @submit.prevent="requestGeneration">
      <div class="preset-block">
        <label :for="`${id}-preset`" class="field-label">장르별 아이디어 <span class="optional-label">선택</span></label>
        <div class="preset-controls"><select :id="`${id}-preset`" v-model="selectedPreset" class="text-input"><option value="">장르 예문 살펴보기</option><option v-for="item in GENRE_PRESETS" :key="item.id" :value="item.id">{{ item.label }}</option></select><button class="button button-secondary" type="button" :disabled="!preset" @click="choosePreset">예문 넣기</button></div>
        <p class="preset-concept">{{ preset ? `콘셉트: ${preset.concept}` : '장르를 골라 예문으로 시작해 보세요.' }}</p>
        <p class="field-help preset-explanation">예문은 프롬프트 작성을 돕는 아이디어이며, 생성 결과의 장르를 보장하지 않습니다.</p>
      </div>
      <div class="prompt-label-row"><label :for="`${id}-prompt`" class="field-label">음악 아이디어 <span class="required-label">필수</span></label><span class="input-counter" :class="{ 'near-limit': draft.prompt.length > 3800 }">{{ draft.prompt.length.toLocaleString() }} / 4,000</span></div>
      <textarea :id="`${id}-prompt`" ref="promptField" v-model="draft.prompt" rows="7" maxlength="4000" placeholder="예: 비가 내리는 밤의 도시. 따뜻한 일렉트릭 피아노와 묵직한 베이스, 느긋한 드럼이 어우러진 연주곡. 후반부에는 밝은 멜로디로 마무리해 줘." :aria-invalid="Boolean(visibleError('prompt'))" :aria-describedby="`${id}-prompt-help ${id}-prompt-error`" @blur="touch('prompt')" @input="presetNotice = ''"></textarea>
      <p :id="`${id}-prompt-help`" class="field-help prompt-help">장면 + 분위기 + 주요 악기 + 곡의 흐름을 적으면 아이디어가 더 선명해져요.</p>
      <p v-if="visibleError('prompt')" :id="`${id}-prompt-error`" class="field-error" role="alert">{{ visibleError('prompt') }}</p>
      <p v-if="presetNotice" class="preset-notice" role="status">{{ presetNotice }}</p>
      <p v-if="sourceGenerationId" class="source-note composer-source">이전 작업에서 가져온 입력입니다. 생성하면 새 작업으로 저장되고 원본은 유지됩니다.</p>

      <div class="variation-row"><div><label :for="`${id}-variations`" class="field-label">한 번에 만들 곡 수</label><p :id="`${id}-variations-help`" class="field-help">{{ provider ? `현재 공급자는 최대 ${variationLimit}곡을 지원해요.` : '공급자 정보를 확인하고 있어요.' }}</p></div><select :id="`${id}-variations`" v-model.number="draft.variationCount" class="text-input variation-select" :disabled="!provider" :aria-invalid="Boolean(visibleError('variationCount'))" :aria-describedby="`${id}-variations-help`" @blur="touch('variationCount')"><option v-for="count in 4" :key="count" :value="count" :disabled="count > variationLimit">{{ count }}곡</option></select></div>
      <p v-if="visibleError('variationCount')" class="field-error" role="alert">{{ visibleError('variationCount') }}</p>

      <details class="advanced-settings"><summary><span><StudioIcon name="sliders" />세부 설정<span class="optional-label">선택</span></span><StudioIcon name="chevron" /></summary><p class="advanced-intro">프롬프트만으로 시작해도 괜찮아요. 지원하지 않는 설정은 선택할 수 없습니다.</p>
        <div class="settings-grid">
          <div class="setting-field setting-wide"><label :for="`${id}-mode`" class="field-label">음악 유형</label><select :id="`${id}-mode`" v-model="draft.mode" class="text-input" :disabled="!provider" :aria-invalid="Boolean(visibleError('mode'))" :aria-describedby="`${id}-mode-help`" @blur="touch('mode')"><option value="">공급자 기본값</option><option value="instrumental" :disabled="!caps?.modes.includes('instrumental')">연주곡 · 보컬 없음</option><option value="vocal" :disabled="!caps?.modes.includes('vocal')">보컬 포함</option></select><p :id="`${id}-mode-help`" class="field-help">{{ modeHelp }}</p><p v-if="visibleError('mode')" class="field-error" role="alert">{{ visibleError('mode') }}</p></div>
          <div class="setting-field"><label :for="`${id}-genre`" class="field-label">장르</label><input :id="`${id}-genre`" v-model="draft.genre" class="text-input" :list="`${id}-genres`" maxlength="80" placeholder="자동" :disabled="!supported('genre')" :aria-describedby="`${id}-genre-help`" :aria-invalid="Boolean(visibleError('genre'))" @blur="touch('genre')" /><datalist :id="`${id}-genres`"><option v-for="item in GENRE_PRESETS" :key="item.id" :value="item.label" /></datalist><p :id="`${id}-genre-help`" class="field-help">{{ supportHelp('genre') }}</p><p v-if="visibleError('genre')" class="field-error" role="alert">{{ visibleError('genre') }}</p></div>
          <div class="setting-field"><label :for="`${id}-mood`" class="field-label">분위기</label><input :id="`${id}-mood`" v-model="draft.mood" class="text-input" maxlength="80" placeholder="예: 차분하고 몽환적인" :disabled="!supported('mood')" :aria-describedby="`${id}-mood-help`" :aria-invalid="Boolean(visibleError('mood'))" @blur="touch('mood')" /><p :id="`${id}-mood-help`" class="field-help">{{ supportHelp('mood') }}</p><p v-if="visibleError('mood')" class="field-error" role="alert">{{ visibleError('mood') }}</p></div>
          <div class="setting-field"><label :for="`${id}-bpm`" class="field-label">빠르기 · BPM</label><input :id="`${id}-bpm`" :value="draft.bpm" type="number" inputmode="decimal" step="any" :min="caps?.bpmRange?.min ?? 0.001" :max="caps?.bpmRange?.max" class="text-input" placeholder="자동" :disabled="!supported('bpm')" :aria-describedby="`${id}-bpm-help`" :aria-invalid="Boolean(visibleError('bpm'))" @input="setNumber('bpm', $event)" @blur="touch('bpm')" /><p :id="`${id}-bpm-help`" class="field-help">{{ supportHelp('bpm') }}</p><p v-if="visibleError('bpm')" class="field-error" role="alert">{{ visibleError('bpm') }}</p></div>
          <div class="setting-field"><label :for="`${id}-duration`" class="field-label">길이 · 초</label><input :id="`${id}-duration`" :value="draft.durationSeconds" type="number" inputmode="decimal" step="any" :min="caps?.durationRangeSeconds?.min ?? 0.001" :max="caps?.durationRangeSeconds?.max" class="text-input" placeholder="자동" :disabled="!supported('durationSeconds')" :aria-describedby="`${id}-duration-help`" :aria-invalid="Boolean(visibleError('durationSeconds'))" @input="setNumber('durationSeconds', $event)" @blur="touch('durationSeconds')" /><p :id="`${id}-duration-help`" class="field-help">{{ supportHelp('durationSeconds') }}</p><p v-if="visibleError('durationSeconds')" class="field-error" role="alert">{{ visibleError('durationSeconds') }}</p></div>
          <div class="setting-field setting-wide"><label :for="`${id}-seed`" class="field-label">시드 <span class="optional-label">{{ isScoreComposer ? '로컬 합성 값 · 선택' : '같은 설정으로 결과 비교' }}</span></label><input :id="`${id}-seed`" v-model="draft.seed" class="text-input" :maxlength="seedLimit" placeholder="자동" :disabled="!supported('seed')" :aria-describedby="`${id}-seed-help`" :aria-invalid="Boolean(visibleError('seed'))" @blur="touch('seed')" /><p :id="`${id}-seed-help`" class="field-help">{{ supportHelp('seed') }}</p><p v-if="visibleError('seed')" class="field-error" role="alert">{{ visibleError('seed') }}</p></div>
        </div>
      </details>
      <div class="composer-submit"><button class="button button-primary full-width" type="submit" :disabled="!available || submitting || blocked" :aria-describedby="`${id}-availability`"><StudioIcon name="plus" />{{ submitting ? '작업 접수 중…' : provider?.isMock ? '8초 데모 생성' : isScoreComposer ? 'AI 작곡 시작' : '음악 생성' }}</button><p :id="`${id}-availability`" class="field-help">{{ blocked && !submitting ? '이전 요청의 접수 여부를 먼저 확인해 주세요.' : !available ? '공급자 연결과 생성 가능 여부를 확인해 주세요.' : provider?.isMock ? '고정된 8초 데모 음원을 저장합니다. 프롬프트에 맞춘 새 작곡은 하지 않습니다.' : isCli ? 'Codex 로그인 계정으로 프롬프트와 설정 텍스트를 전송합니다. WAV는 로컬에서 합성하며 계정 사용 한도가 적용됩니다.' : isLocal ? '이 컴퓨터의 로컬 LLM이 작곡합니다. 작곡 지식도 로컬에서 참고하며 원격 AI로 전송하지 않습니다.' : '입력한 프롬프트와 설정을 연결한 음악 공급자에게 전송합니다.' }}</p></div>
    </form>
    <p class="draft-privacy"><StudioIcon name="lock" /><span>{{ restored ? '이 탭에서 작성하던 내용을 복원했어요. ' : '' }}작성 내용은 이 탭에서만 임시 보관되며, 새로고침하면 사라집니다.</span></p>
  </section>
  <ModalDialog v-if="pendingPreset" title="작성한 내용을 바꿀까요?" :preferred-return-focus="preferredPresetFocus" @close="pendingPreset = null"><p class="modal-copy">현재 음악 아이디어를 <strong>{{ pendingPreset.label }}</strong> 예문으로 바꿉니다. 작성한 프롬프트는 지워지고, 선택 설정은 유지됩니다.</p><div class="modal-actions"><button type="button" class="button button-secondary" data-initial-focus @click="pendingPreset = null">취소</button><button type="button" class="button button-primary" @click="insertPreset(pendingPreset)">예문으로 바꾸기</button></div></ModalDialog>
  <ModalDialog v-if="pendingReuse" title="작성 내용을 가져온 입력으로 바꿀까요?" :preferred-return-focus="preferredPresetFocus" @close="pendingReuse = null"><p class="modal-copy">현재 프롬프트와 세부 설정, 곡 수를 선택한 과거 작업의 입력으로 바꿉니다. 현재 공급자가 지원하지 않는 설정은 초기화됩니다. 아직 새 음악을 생성하지는 않습니다.</p><div class="modal-actions"><button type="button" class="button button-secondary" data-initial-focus @click="pendingReuse = null">취소</button><button type="button" class="button button-primary" @click="applyReuse(pendingReuse)">입력 가져오기</button></div></ModalDialog>
</template>
