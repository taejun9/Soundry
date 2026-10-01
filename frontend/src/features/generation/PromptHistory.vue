<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { PromptSummary } from '../../../../shared/contracts';
import StudioIcon from '../../components/StudioIcon.vue';
import { usePromptHistory } from './usePromptHistory';
const props = defineProps<{ projectId: string; refreshKey: number; reuseDisabled: boolean; revealingId: string }>();
const emit = defineEmits<{ reuse: [item: PromptSummary]; reveal: [id: string] }>();
const { items, nextCursor, loading, error, refresh, more } = usePromptHistory(props.projectId);
const notice = ref(''); let active = true; let copying = 0;
const dateFormat = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const settingsLabels: Record<string, string> = { mode: '유형', genre: '장르', mood: '분위기', bpm: 'BPM', durationSeconds: '길이(초)', seed: '시드' };
function settingsText(item: PromptSummary) { return Object.entries(item.settings).map(([key, value]) => `${settingsLabels[key]}: ${key === 'mode' ? value === 'instrumental' ? '연주곡' : '보컬' : value}`).join(' · '); }
const statuses = { queued: '대기', processing: '처리 중', completed: '완료', failed: '실패', cancelled: '취소' };
async function copy(item: PromptSummary) {
  const request = ++copying;
  try { await navigator.clipboard.writeText(item.prompt); if (active && request === copying) notice.value = '프롬프트를 복사했어요.'; }
  catch { if (active && request === copying) notice.value = '자동 복사를 사용할 수 없어요. 프롬프트를 펼쳐 텍스트를 직접 선택해 주세요.'; }
}
watch(() => props.refreshKey, () => { void refresh(); }, { immediate: true });
onBeforeUnmount(() => { active = false; });
</script>
<template>
  <section class="panel prompt-history" aria-labelledby="prompt-history-title">
    <div class="section-heading"><h2 id="prompt-history-title">프롬프트 이력</h2><button type="button" class="icon-button" aria-label="프롬프트 이력 새로고침" :disabled="loading" @click="refresh"><StudioIcon name="refresh" /></button></div>
    <p class="history-status">예전 아이디어를 가져와 새로운 음악으로 이어가세요. 결과가 없는 작업도 남아 있어요.</p>
    <p v-if="notice" class="notice-banner compact-notice" role="status">{{ notice }}</p>
    <div v-if="error" class="error-banner" role="alert"><p>{{ error }}</p><button class="button button-secondary" type="button" :disabled="loading" @click="refresh">다시 불러오기</button></div>
    <p v-if="loading && !items.length" class="history-status" role="status">프롬프트 이력을 불러오고 있어요.</p>
    <p v-else-if="!items.length && !error" class="history-status">생성을 요청하면 여기에 프롬프트와 설정이 보관됩니다.</p>
    <ol v-if="items.length" class="prompt-history-list"><li v-for="item in items" :key="item.generationId" class="prompt-history-item"><div class="prompt-history-meta"><time :datetime="item.createdAt">{{ dateFormat.format(new Date(item.createdAt)) }}</time><span>{{ statuses[item.status] }} · {{ item.trackCount }}곡 남음</span></div><details class="past-prompt"><summary><span>{{ item.prompt }}</span><StudioIcon name="chevron" /></summary><p>{{ item.prompt }}</p><p class="past-settings">{{ item.variationCount }}곡 요청<span v-if="Object.keys(item.settings).length"> · {{ settingsText(item) }}</span></p></details><div class="prompt-history-actions"><button type="button" class="text-link" @click="copy(item)"><StudioIcon name="copy" />복사</button><button type="button" class="text-link" :disabled="reuseDisabled" @click="emit('reuse', item)">작성칸에 재사용</button><button type="button" class="text-link" :disabled="Boolean(revealingId)" @click="emit('reveal', item.generationId)">{{ revealingId === item.generationId ? '불러오는 중…' : '결과 보기' }}<StudioIcon name="arrow" /></button></div></li></ol>
    <div v-if="nextCursor" class="load-more"><button type="button" class="button button-secondary" :disabled="loading" @click="more">{{ loading ? '불러오는 중…' : '이전 프롬프트 더 보기' }}</button></div>
  </section>
</template>
