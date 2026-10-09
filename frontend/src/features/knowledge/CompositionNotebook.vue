<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { CompositionKnowledge, GenerationSummary, KnowledgeReference } from '../../../../shared/contracts';
import { compositionArtifact, importCuratedKnowledge, listKnowledge, saveFeedback, saveKnowledge, knowledgeReferences } from '../../api/knowledge';
import type { KnowledgeInput } from '../../api/knowledge';
import { errorMessage, requestJson } from '../../api/client';
import { session } from '../members/session';
const props = defineProps<{ jobs: GenerationSummary[] }>();
const id = useId();
const open = ref(false); const items = ref<CompositionKnowledge[]>([]); const error = ref(''); const notice = ref('');
const loading = ref(false); const busy = ref(false); const editing = ref(''); const deleting = ref('');
const empty = (): KnowledgeInput => ({ title: '', content: '', tags: '', source: '직접 작성', rights: 'own', allowRemote: false });
const draft = ref<KnowledgeInput>(empty()); const selected = ref(''); const rating = ref(4); const notes = ref(''); const allowRemote = ref(false);
const feedbackDirty = ref(false);
function restoreFeedback() {
  if (feedbackDirty.value) return;
  const existing = items.value.find(item => item.trackId === selected.value);
  rating.value = existing?.rating ?? 4; notes.value = existing?.content ?? ''; allowRemote.value = existing?.allowRemote ?? false;
}
const references = ref<KnowledgeReference[]>([]); const summary = ref(''); const score = ref<object | null>(null); const artifactError = ref('');
const tracks = computed(() => props.jobs.flatMap(job => job.tracks).filter(track => track.provider !== 'mock'));
const track = computed(() => tracks.value.find(t => t.id === selected.value));
const memberId = computed(() => session.member?.id ?? '');
let controller = new AbortController(); let selectionController: AbortController | undefined; let sequence = 0;
async function load() {
  if (!memberId.value) return;
  loading.value = true; error.value = '';
  const signal = controller.signal;
  try { const result = await listKnowledge(signal); if (!signal.aborted) { items.value = result; restoreFeedback(); } } catch (reason) { if (!signal.aborted) error.value = errorMessage(reason); }
  finally { if (!signal.aborted) loading.value = false; }
}
watch(open, opened => { if (opened) void load(); });
watch(memberId, () => { controller.abort(); controller = new AbortController(); selectionController?.abort(); sequence++; items.value = []; draft.value = empty(); editing.value = ''; selected.value = ''; notice.value = ''; error.value = ''; busy.value = false; loading.value = false; if (open.value) void load(); });
function edit(item: CompositionKnowledge) {
  draft.value = { title: item.title, content: item.content, tags: item.tags, source: item.source, rights: item.rights, allowRemote: item.allowRemote };
  editing.value = item.id; deleting.value = ''; notice.value = '';
}
async function mutate(action: (signal: AbortSignal) => Promise<unknown>, message: string) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  const signal = controller.signal;
  try { await action(signal); if (signal.aborted) return; notice.value = message; await load(); }
  catch (reason) { if (!signal.aborted) error.value = errorMessage(reason); }
  finally { if (!signal.aborted) busy.value = false; }
}
async function importBasics() {
  await mutate(signal => importCuratedKnowledge(signal), '장르별 기본 자료를 준비했어요. 같은 내용은 중복 저장하지 않습니다.');
}
async function save() {
  const current = editing.value;
  await mutate(signal => saveKnowledge(draft.value, current || undefined, signal), '작곡 지식을 저장했어요. 관련된 다음 작곡부터 검색에 활용합니다.');
  if (!error.value) { editing.value = ''; draft.value = empty(); }
}
async function remove(item: CompositionKnowledge) {
  if (deleting.value !== item.id) { deleting.value = item.id; return; }
  await mutate(signal => requestJson('/knowledge/' + item.id, { method: 'DELETE', signal }), '지식을 삭제했어요. 다음 검색에서 제외됩니다.');
  deleting.value = ''; if (editing.value === item.id) { editing.value = ''; draft.value = empty(); }
}
async function evaluate() {
  if (!track.value) return;
  await mutate(signal => saveFeedback(selected.value, { rating: Number(rating.value), notes: notes.value, allowRemote: allowRemote.value }, signal), '청취 평가를 저장했어요. 4–5점은 참고 방식, 1–2점은 피할 점으로 활용합니다.');
}
watch(selected, async () => {
  const current = ++sequence; selectionController?.abort(); selectionController = new AbortController();
  const signal = selectionController.signal; references.value = []; summary.value = ''; score.value = null; artifactError.value = '';
  feedbackDirty.value = false; restoreFeedback();
  if (!track.value) return;
  const selectedTrack = track.value;
  const results = await Promise.allSettled([compositionArtifact(selectedTrack.id, signal), knowledgeReferences(selectedTrack.generationId, signal)]);
  if (signal.aborted || current !== sequence) return;
  const [artifact, refs] = results;
  if (artifact.status === 'fulfilled') { score.value = artifact.value.score; summary.value = artifact.value.summary; }
  else artifactError.value = errorMessage(artifact.reason);
  if (refs.status === 'fulfilled') references.value = refs.value; else artifactError.value += ' 참고 지식을 확인하지 못했어요.';
});
watch(tracks, () => { if (selected.value && !track.value) selected.value = ''; });
function download() {
  if (!score.value) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(score.value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'soundry-composition.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
onBeforeUnmount(() => { controller.abort(); selectionController?.abort(); sequence++; });
</script>
<template>
  <details class="composition-notebook" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary>작곡 노트 · 지식과 청취 평가</summary>
    <p class="notebook-copy">작곡 방식과 평가를 쌓아 다음 곡에 참고합니다. 관련 단어로 최대 6개를 검색하며 모델 가중치를 자동 훈련하지는 않습니다. 작곡 완성도는 직접 들어보고 판단해 주세요.</p>
    <p v-if="!memberId">로그인하면 나만의 작곡 지식과 평가를 저장할 수 있어요.</p>
    <template v-else>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p><p v-if="notice" class="notice-banner" role="status">{{ notice }}</p>
      <button type="button" class="button button-secondary" :disabled="busy || loading" @click="importBasics">16장르 기본 작곡 자료 추가</button>
      <p class="notebook-copy">형식·화성·리듬·선율·편곡·평가 기준 96건을 내 지식에 추가합니다. 독자 작성 기본 자료이며 청취 평가 사례는 아닙니다. 추가 자료는 로컬 전용으로 저장됩니다.</p>
      <div class="notebook-columns">
        <form @submit.prevent="save">
          <h3>{{ editing ? '작곡 지식 수정' : '작곡 지식 추가' }}</h3>
          <label :for="id + '-title'">제목</label><input :id="id + '-title'" v-model="draft.title" class="text-input" required maxlength="120" :disabled="busy" placeholder="예: 재즈 후렴의 보이스 리딩" />
          <label :for="id + '-content'">작곡 방식·개선점</label><textarea :id="id + '-content'" v-model="draft.content" class="text-input" required maxlength="4000" rows="4" :disabled="busy" placeholder="적용할 화성, 리듬, 곡 전개와 이유를 적어 주세요." />
          <label :for="id + '-tags'">검색 태그</label><input :id="id + '-tags'" v-model="draft.tags" class="text-input" maxlength="200" :disabled="busy" placeholder="jazz 재즈 화성 후렴" />
          <label :for="id + '-source'">출처</label><input :id="id + '-source'" v-model="draft.source" class="text-input" required maxlength="300" :disabled="busy" />
          <label :for="id + '-rights'">사용 권한</label><select :id="id + '-rights'" v-model="draft.rights" class="text-input" :disabled="busy"><option value="own">직접 작성</option><option value="licensed">사용 허가 자료</option><option value="public-domain">퍼블릭 도메인 자료</option></select>
          <label class="notebook-check"><input v-model="draft.allowRemote" type="checkbox" :disabled="busy" /> 이 항목을 Codex 작곡 요청에 전송하는 데 동의</label>
          <p class="notebook-copy">체크하지 않은 지식은 로컬 LLM에서만 참고합니다. 출처 내용과 이용 권한은 직접 확인해 주세요.</p>
          <button class="button button-primary" :disabled="busy">{{ busy ? '저장 중…' : '지식 저장' }}</button>
          <button v-if="editing" type="button" class="button button-secondary" :disabled="busy" @click="editing = ''; draft = empty()">수정 취소</button>
        </form>
        <div>
          <h3>청취 평가와 작곡 악보</h3>
          <label :for="id + '-track'">이 프로젝트의 작곡 결과</label><select :id="id + '-track'" v-model="selected" class="text-input" :disabled="busy"><option value="">음원 선택</option><option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.title }} · {{ t.genre ?? '장르 미확인' }} · {{ new Date(t.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</option></select>
          <p v-if="!tracks.length" class="notebook-copy">실제 작곡 결과가 생기면 평가할 수 있어요. 고정 Mock 데모는 학습 사례에서 제외합니다.</p>
          <form v-if="track" @submit.prevent="evaluate">
            <label :for="id + '-rating'">작곡 완성도</label><select :id="id + '-rating'" v-model="rating" @change="feedbackDirty = true" class="text-input" :disabled="busy"><option :value="5">5 · 매우 좋음</option><option :value="4">4 · 좋은 참고 사례</option><option :value="3">3 · 보통, 검색 제외</option><option :value="2">2 · 개선 필요</option><option :value="1">1 · 피할 방식</option></select>
            <label :for="id + '-notes'">좋은 점 또는 피할 점과 이유</label><textarea :id="id + '-notes'" v-model="notes" @input="feedbackDirty = true" class="text-input" required maxlength="4000" rows="4" :disabled="busy" />
            <label class="notebook-check"><input v-model="allowRemote" @change="feedbackDirty = true" type="checkbox" :disabled="busy" /> 평가와 곡 구조 요약을 Codex 요청에 전송하는 데 동의</label>
            <button class="button button-primary" :disabled="busy">평가 저장</button>
          </form>
          <p v-if="artifactError" class="notebook-copy" role="status">{{ artifactError }}</p>
          <template v-if="score"><p class="notebook-copy">{{ summary }}</p><button type="button" class="button button-secondary" @click="download">작곡 악보 JSON 저장</button><a v-if="track" :href="`/api/tracks/${track.id}/composition.mid`" class="button button-secondary" download>DAW용 MIDI 저장</a><p class="notebook-copy">MIDI 음색은 사용하는 DAW 악기에 따라 달라집니다.</p></template>
          <h4 v-if="track">생성 때 참고한 지식 {{ references.length }}개</h4>
          <ul class="notebook-references"><li v-for="reference in references" :key="reference.digest">{{ reference.title }} · {{ reference.source }}<span v-if="reference.rating"> · {{ reference.rating }}점</span></li></ul>
        </div>
      </div>
      <h3>저장한 작곡 지식 {{ items.length }}/500</h3><button type="button" class="button button-secondary" :disabled="busy || loading" @click="load">{{ loading ? '불러오는 중…' : '새로고침' }}</button>
      <ul class="notebook-items"><li v-for="item in items" :key="item.id"><div><strong>{{ item.title }}</strong><p>{{ item.tags }} · {{ item.allowRemote ? 'Codex 전송 동의' : '로컬 전용' }}<span v-if="item.rating"> · {{ item.rating }}점</span></p><p>{{ item.content }}</p><small>{{ item.source }}</small></div><div class="notebook-actions"><button type="button" class="button button-secondary" :disabled="busy" @click="edit(item)">수정</button><button type="button" class="button button-secondary" :disabled="busy" @click="remove(item)">{{ deleting === item.id ? '이 지식 삭제 확정' : '삭제' }}</button><button v-if="deleting === item.id" type="button" class="button button-secondary" :disabled="busy" @click="deleting = ''">취소</button></div></li></ul>
    </template>
  </details>
</template>
<style scoped>
.composition-notebook { margin: 1rem 0; padding: 1rem; border: 1px solid var(--border, #34343c); border-radius: 12px; background: var(--surface, #19191f); }
summary { cursor: pointer; font-weight: 600; padding: .3rem 0; }
h3 { margin: 1rem 0 .7rem; } h4 { margin-top: 1rem; }
.notebook-copy, small { font-size: .85rem; color: var(--text-muted, #b5b5c1); line-height: 1.6; margin: .6rem 0; overflow-wrap: anywhere; }
.notebook-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; }
label { display: block; font-size: .85rem; margin: .7rem 0 .35rem; }
.text-input { width: 100%; } textarea { resize: vertical; }
.notebook-check { display: flex; gap: .6rem; align-items: start; line-height: 1.5; }
.notebook-check input { margin-top: .3rem; }
.notebook-items { list-style: none; padding: 0; }
.notebook-items li { display: flex; justify-content: space-between; gap: 1rem; border-top: 1px solid #34343c; margin-top: .8rem; padding-top: .8rem; }
.notebook-items li > div:first-child { min-width: 0; flex: 1; } .notebook-items p { white-space: pre-wrap; overflow-wrap: anywhere; font-size: .85rem; margin: .4rem 0; }
.notebook-actions { display: flex; flex-wrap: wrap; gap: .4rem; align-content: start; }
.notebook-references { padding-left: 1rem; font-size: .85rem; overflow-wrap: anywhere; }
@media (max-width: 760px) { .notebook-columns { grid-template-columns: 1fr; } .notebook-items li { flex-direction: column; } }
</style>
