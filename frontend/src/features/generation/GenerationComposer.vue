<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from 'vue';
import type { SettingKey } from '../../../../shared/contracts';
import StudioIcon from '../../components/StudioIcon.vue';
import ModalDialog from '../../components/ModalDialog.vue';
import { GENRE_PRESETS } from './genres';
import { maxVariations, supportsSetting } from './composer-input';
import type { ComposerDraft } from './composer-input';
import { useComposer } from './useComposer';
import { useProvider } from './useProvider';

const props = defineProps<{ projectId: string }>();
const id = useId();
const promptField = ref<HTMLTextAreaElement>();
const selectedPreset = ref('');
const pendingPreset = ref<(typeof GENRE_PRESETS)[number] | null>(null);
const presetNotice = ref('');
const replacementConfirmed = ref(false);
const preferredPresetFocus = () => replacementConfirmed.value ? promptField.value ?? null : null;
const { provider, loading, error, reload } = useProvider();
const { draft, restored, capabilityNotice, touched, errors, touch, validate } = useComposer(props.projectId, provider);
const caps = computed(() => provider.value?.capabilities ?? null);
const preset = computed(() => GENRE_PRESETS.find(item => item.id === selectedPreset.value));
const variationLimit = computed(() => maxVariations(caps.value));
const providerName = computed(() => provider.value?.isMock ? 'Mock' : provider.value?.id ?? '공급자');
const modeHelp = computed(() => {
  if (!caps.value) return '공급자 정보를 확인한 뒤 선택할 수 있어요.';
  if (caps.value.modes.length === 1) return caps.value.modes[0] === 'instrumental' ? '현재 공급자는 연주곡만 지원합니다.' : '현재 공급자는 보컬 음악만 지원합니다.';
  return '보컬 포함 여부를 선택할 수 있어요. 비워 두면 공급자 기본값을 사용합니다.';
});
function supported(key: SettingKey) { return supportsSetting(caps.value, key); }
function supportHelp(key: SettingKey) {
  if (!provider.value) return '공급자 정보를 확인한 뒤 선택할 수 있어요.';
  if (!supported(key)) return `현재 ${providerName.value}에서는 이 설정을 지원하지 않아요.`;
  const range = key === 'bpm' ? caps.value?.bpmRange : key === 'durationSeconds' ? caps.value?.durationRangeSeconds : undefined;
  return range ? `선택 범위 ${range.min}–${range.max}${key === 'durationSeconds' ? '초' : ' BPM'}. 비워 두면 자동으로 결정합니다.` : '선택 사항 · 비워 두면 자동으로 결정합니다.';
}
function visibleError(field: keyof ComposerDraft) { return touched.has(field) ? errors.value[field] : ''; }
function setNumber(field: 'bpm' | 'durationSeconds', event: Event) {
  if (event.target instanceof HTMLInputElement) draft[field] = event.target.value;
}
async function insertPreset(item: (typeof GENRE_PRESETS)[number]) {
  const closesDialog = pendingPreset.value !== null;
  replacementConfirmed.value = closesDialog;
  draft.prompt = item.prompt;
  pendingPreset.value = null;
  presetNotice.value = `${item.label} 예문을 넣었어요. 원하는 느낌으로 자유롭게 고쳐 보세요.`;
  if (!closesDialog) {
    await nextTick();
    promptField.value?.focus();
  }
}
function choosePreset() {
  if (!preset.value) return;
  replacementConfirmed.value = false;
  if (draft.prompt.trim() && draft.prompt !== preset.value.prompt) pendingPreset.value = preset.value;
  else void insertPreset(preset.value);
}
onMounted(() => { void reload(); });
</script>

<template>
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

    <form novalidate @submit.prevent="validate">
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

      <div class="variation-row"><div><label :for="`${id}-variations`" class="field-label">한 번에 만들 곡 수</label><p :id="`${id}-variations-help`" class="field-help">{{ provider ? `현재 공급자는 최대 ${variationLimit}곡을 지원해요.` : '공급자 정보를 확인하고 있어요.' }}</p></div><select :id="`${id}-variations`" v-model.number="draft.variationCount" class="text-input variation-select" :disabled="!provider" :aria-describedby="`${id}-variations-help`" @blur="touch('variationCount')"><option v-for="count in 4" :key="count" :value="count" :disabled="count > variationLimit">{{ count }}곡</option></select></div>
      <p v-if="visibleError('variationCount')" class="field-error" role="alert">{{ visibleError('variationCount') }}</p>

      <details class="advanced-settings"><summary><span><StudioIcon name="sliders" />세부 설정<span class="optional-label">선택</span></span><StudioIcon name="chevron" /></summary><p class="advanced-intro">프롬프트만으로 시작해도 괜찮아요. 지원하지 않는 설정은 선택할 수 없습니다.</p>
        <div class="settings-grid">
          <div class="setting-field setting-wide"><label :for="`${id}-mode`" class="field-label">음악 유형</label><select :id="`${id}-mode`" v-model="draft.mode" class="text-input" :disabled="!provider" :aria-describedby="`${id}-mode-help`" @blur="touch('mode')"><option value="">공급자 기본값</option><option value="instrumental" :disabled="!caps?.modes.includes('instrumental')">연주곡 · 보컬 없음</option><option value="vocal" :disabled="!caps?.modes.includes('vocal')">보컬 포함</option></select><p :id="`${id}-mode-help`" class="field-help">{{ modeHelp }}</p><p v-if="visibleError('mode')" class="field-error" role="alert">{{ visibleError('mode') }}</p></div>
          <div class="setting-field"><label :for="`${id}-genre`" class="field-label">장르</label><input :id="`${id}-genre`" v-model="draft.genre" class="text-input" :list="`${id}-genres`" maxlength="80" placeholder="자동" :disabled="!supported('genre')" :aria-describedby="`${id}-genre-help`" :aria-invalid="Boolean(visibleError('genre'))" @blur="touch('genre')" /><datalist :id="`${id}-genres`"><option v-for="item in GENRE_PRESETS" :key="item.id" :value="item.label" /></datalist><p :id="`${id}-genre-help`" class="field-help">{{ supportHelp('genre') }}</p><p v-if="visibleError('genre')" class="field-error" role="alert">{{ visibleError('genre') }}</p></div>
          <div class="setting-field"><label :for="`${id}-mood`" class="field-label">분위기</label><input :id="`${id}-mood`" v-model="draft.mood" class="text-input" maxlength="80" placeholder="예: 차분하고 몽환적인" :disabled="!supported('mood')" :aria-describedby="`${id}-mood-help`" :aria-invalid="Boolean(visibleError('mood'))" @blur="touch('mood')" /><p :id="`${id}-mood-help`" class="field-help">{{ supportHelp('mood') }}</p><p v-if="visibleError('mood')" class="field-error" role="alert">{{ visibleError('mood') }}</p></div>
          <div class="setting-field"><label :for="`${id}-bpm`" class="field-label">빠르기 · BPM</label><input :id="`${id}-bpm`" :value="draft.bpm" type="number" inputmode="decimal" step="any" :min="caps?.bpmRange?.min ?? 0.001" :max="caps?.bpmRange?.max" class="text-input" placeholder="자동" :disabled="!supported('bpm')" :aria-describedby="`${id}-bpm-help`" :aria-invalid="Boolean(visibleError('bpm'))" @input="setNumber('bpm', $event)" @blur="touch('bpm')" /><p :id="`${id}-bpm-help`" class="field-help">{{ supportHelp('bpm') }}</p><p v-if="visibleError('bpm')" class="field-error" role="alert">{{ visibleError('bpm') }}</p></div>
          <div class="setting-field"><label :for="`${id}-duration`" class="field-label">길이 · 초</label><input :id="`${id}-duration`" :value="draft.durationSeconds" type="number" inputmode="decimal" step="any" :min="caps?.durationRangeSeconds?.min ?? 0.001" :max="caps?.durationRangeSeconds?.max" class="text-input" placeholder="자동" :disabled="!supported('durationSeconds')" :aria-describedby="`${id}-duration-help`" :aria-invalid="Boolean(visibleError('durationSeconds'))" @input="setNumber('durationSeconds', $event)" @blur="touch('durationSeconds')" /><p :id="`${id}-duration-help`" class="field-help">{{ supportHelp('durationSeconds') }}</p><p v-if="visibleError('durationSeconds')" class="field-error" role="alert">{{ visibleError('durationSeconds') }}</p></div>
          <div class="setting-field setting-wide"><label :for="`${id}-seed`" class="field-label">시드 <span class="optional-label">같은 설정으로 결과 비교</span></label><input :id="`${id}-seed`" v-model="draft.seed" class="text-input" maxlength="120" placeholder="자동" :disabled="!supported('seed')" :aria-describedby="`${id}-seed-help`" :aria-invalid="Boolean(visibleError('seed'))" @blur="touch('seed')" /><p :id="`${id}-seed-help`" class="field-help">{{ supportHelp('seed') }}</p><p v-if="visibleError('seed')" class="field-error" role="alert">{{ visibleError('seed') }}</p></div>
        </div>
      </details>
      <div class="composer-submit"><button class="button button-primary full-width" type="button" disabled :aria-describedby="`${id}-availability`"><StudioIcon name="plus" />음악 생성 · 준비 중</button><p :id="`${id}-availability`" class="field-help">현재는 아이디어 작성과 설정을 할 수 있어요. 음악 생성 기능은 준비 중입니다.</p></div>
    </form>
    <p class="draft-privacy"><StudioIcon name="lock" /><span>{{ restored ? '이 탭에서 작성하던 내용을 복원했어요. ' : '' }}작성 내용은 이 탭에서만 임시 보관되며, 새로고침하면 사라집니다.</span></p>
  </section>
  <ModalDialog v-if="pendingPreset" title="작성한 내용을 바꿀까요?" :preferred-return-focus="preferredPresetFocus" @close="pendingPreset = null"><p class="modal-copy">현재 음악 아이디어를 <strong>{{ pendingPreset.label }}</strong> 예문으로 바꿉니다. 작성한 프롬프트는 지워지고, 선택 설정은 유지됩니다.</p><div class="modal-actions"><button type="button" class="button button-secondary" data-initial-focus @click="pendingPreset = null">취소</button><button type="button" class="button button-primary" @click="insertPreset(pendingPreset)">예문으로 바꾸기</button></div></ModalDialog>
</template>
