<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type {
  Arrangement,
  ArrangementClip,
  ArrangementLane,
  LibraryTrackSummary,
  Page,
} from '../../../../shared/contracts';
import { errorMessage, requestJson } from '../../api/client';
import { parseLibraryTrack } from '../../api/library';
import { useAudioPlayer } from '../../audio/context';
import { audibleClips, pcmWav, timelineDuration, assertMixDuration } from './arrangement';
import { scheduleMix, exportHeadroom } from './mix';
import { ArrangementHistory, beatPosition, snapTime, splitClip, launcherArrangement } from './studio';
const props = defineProps<{ projectId: string; revision: number }>();
const emit = defineEmits<{ saved: [] }>();
const player = useAudioPlayer();
const arrangement = ref<Arrangement>({ duration: 180, lanes: [] });
const tracks = ref<LibraryTrackSummary[]>([]);
const selected = ref('');
const sourceId = ref('');
const loading = ref(true);
const busy = ref(false);
const dirty = ref(false);
const error = ref('');
const notice = ref('');
const exportFile = ref<string | null>(null);
const position = ref(0);
const playing = ref(false);
const zoom = ref(5);
const view = ref<'arrangement' | 'session'>('arrangement');
const search = ref('');
const mixerId = ref('');
const mixer = computed(() => arrangement.value.lanes.find(lane => lane.id === mixerId.value) ?? arrangement.value.lanes[0]);
const filteredTracks = computed(() => tracks.value.filter(track => `${track.title} ${track.genre ?? ''}`.toLowerCase().includes(search.value.toLowerCase())));
const scenes = computed(() => Math.max(1, ...arrangement.value.lanes.map(lane => lane.clips.length)));
const history = new ArrangementHistory();
const canUndo = ref(false), canRedo = ref(false);
let replaying = false, dragging = false, savedSnapshot = '';
const waveform = ref<number[]>([]);
const waveformTrack = ref('');
function refreshHistory() { canUndo.value = history.canUndo; canRedo.value = history.canRedo; }
async function restore(direction: 'undo' | 'redo') {
  if (busy.value) return;
  const value = direction === 'undo' ? history.undo() : history.redo();
  if (!value) return;
  replaying = true; arrangement.value = value;
  await nextTick(); replaying = false; refreshHistory();
}
function split() {
  if (!clip.value || !selectedLane.value || arrangement.value.lanes.flatMap(lane => lane.clips).length >= 128) return;
  const result = splitClip(clip.value, position.value, crypto.randomUUID());
  if (!result) { notice.value = '분할 위치를 클립 내부에 놓으세요. 반복 클립은 반복을 해제한 뒤 분할할 수 있어요.'; return; }
  const index = selectedLane.value.clips.indexOf(clip.value);
  selectedLane.value.clips.splice(index, 1, ...result); selected.value = result[1].id;
}
function keydown(event: KeyboardEvent) {
  if (busy.value || loading.value || (event.target as HTMLElement).closest('input,select,textarea,[contenteditable="true"]')) return;
  const command = event.ctrlKey || event.metaKey;
  if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); void restore(event.shiftKey ? 'redo' : 'undo'); }
  else if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); copyClip(); }
  else if (command && event.key.toLowerCase() === 'e') { event.preventDefault(); split(); }
  else if (event.code === 'Space' && event.target === event.currentTarget) { event.preventDefault(); void preview(); }
  else if (event.key === 'Delete' && clip.value) { event.preventDefault(); removeClip(); }
}
async function loadWaveform() {
  const id = clip.value?.trackId;
  const track = tracks.value.find(track => track.id === id);
  if (!id || !track || busy.value) return;
  busy.value = true; error.value = ''; stop(); const token = version;
  try {
    context ??= new AudioContext();
    const response = await fetch(track.audioUrl, { signal: controller?.signal });
    if (!response.ok) throw new Error('SOURCE_MISSING');
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    if (!alive || token !== version || clip.value?.trackId !== id) return;
    const data = buffer.getChannelData(0);
    waveform.value = Array.from({length: 160}, (_, index) => {
      let peak = 0; for (let i = Math.floor(index * data.length / 160); i < Math.floor((index + 1) * data.length / 160); i++) peak = Math.max(peak, Math.abs(data[i]!));
      return peak;
    });
    waveformTrack.value = id;
  } catch { if (alive) error.value = '원본 파형을 읽지 못했어요.'; }
  finally { if (alive) busy.value = false; }
}
async function launch(scene: number, id?: string) {
  if (busy.value) return;
  stop(); position.value = 0;
  await preview(launcherArrangement(arrangement.value, scene, id));
}
const clip = computed(() =>
  arrangement.value.lanes.flatMap((l) => l.clips).find((c) => c.id === selected.value),
);
const selectedLane = computed(() =>
  arrangement.value.lanes.find((l) => l.clips.some((c) => c.id === selected.value)),
);
const visibleDuration = computed(() => timelineDuration(arrangement.value.duration));
const width = computed(() => Math.max(600, visibleDuration.value * zoom.value));
const scale = computed(() => width.value / visibleDuration.value);
const gridBpm = computed(() => Number.isFinite(arrangement.value.bpm) ? Math.max(30, Math.min(300, arrangement.value.bpm!)) : 120);
const ticks = computed(() =>
  Array.from({ length: Math.floor(visibleDuration.value / (240 / gridBpm.value * 4)) + 1 }, (_, i) => i * 240 / gridBpm.value * 4),
);
let context: AudioContext | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let version = 0;
let alive = true;
let loadVersion = 0;
let controller: AbortController | undefined;
const buffers = new Map<string, AudioBuffer>();
watch(
  arrangement,
  () => {
    dirty.value = JSON.stringify(arrangement.value) !== savedSnapshot;
    if (!replaying && !dragging && !loading.value) { history.record(arrangement.value); refreshHistory(); }
    stop();
    if (exportFile.value) {
      URL.revokeObjectURL(exportFile.value);
      exportFile.value = null;
      notice.value = '';
    }
  },
  { deep: true },
);
watch(
  () => player.state.playing,
  (v) => {
    if (v) stop();
  },
);
async function loadTracks() {
  const request = ++loadVersion;
  const all: LibraryTrackSummary[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ projectId: props.projectId, limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const page = (await requestJson(`/tracks?${query}`, {
      signal: controller?.signal,
    })) as Page<LibraryTrackSummary>;
    all.push(...page.items.map(parseLibraryTrack));
    cursor = page.nextCursor;
  } while (cursor && alive && request === loadVersion);
  if (alive && request === loadVersion) {
    tracks.value = all;
    if (!sourceId.value || !all.some((t) => t.id === sourceId.value)) sourceId.value = all[0]?.id ?? '';
  }
}
async function load() {
  loading.value = true;
  error.value = '';
  controller = new AbortController();
  try {
    const value = (await requestJson(`/projects/${props.projectId}/arrangement`, {
      signal: controller.signal,
    })) as Arrangement;
    await loadTracks();
    if (!alive) return;
    arrangement.value = { ...value, bpm: value.bpm ?? 120, snapBeats: value.snapBeats ?? 1, masterVolume: value.masterVolume ?? 0.7 };
    await nextTick();
    savedSnapshot = JSON.stringify(arrangement.value); history.reset(arrangement.value); refreshHistory();
    dirty.value = false;
  } catch (e) {
    if (alive) error.value = errorMessage(e);
  } finally {
    if (alive) loading.value = false;
  }
}
watch(
  () => props.revision,
  () => {
    void loadTracks().catch((e) => {
      if (alive) error.value = errorMessage(e);
    });
  },
);
function addLane() {
  if (arrangement.value.lanes.length >= 32) return;
  arrangement.value.lanes.push({
    id: crypto.randomUUID(),
    name: `행 ${arrangement.value.lanes.length + 1}`,
    muted: false,
    clips: [],
  });
}
function addClip(lane: ArrangementLane) {
  const track = tracks.value.find((t) => t.id === sourceId.value);
  if (!track?.durationSeconds || arrangement.value.lanes.flatMap(lane => lane.clips).length >= 128 || !Number.isFinite(arrangement.value.duration) || arrangement.value.duration < 1 || arrangement.value.duration > 600) return;
  const c: ArrangementClip = {
    id: crypto.randomUUID(),
    trackId: track.id,
    label: String.fromCharCode(65 + (arrangement.value.lanes.flatMap((l) => l.clips).length % 26)),
    start: 0,
    offset: 0,
    duration: Math.min(track.durationSeconds, arrangement.value.duration),
    volume: 0.8,
    loop: false,
  };
  lane.clips.push(c);
  selected.value = c.id;
}
function removeClip() {
  if (!selectedLane.value) return;
  selectedLane.value.clips = selectedLane.value.clips.filter((c) => c.id !== selected.value);
  selected.value = '';
}
function copyClip() {
  if (!clip.value || !selectedLane.value || arrangement.value.lanes.flatMap(lane => lane.clips).length >= 128) return;
  const c = { ...clip.value, id: crypto.randomUUID() };
  selectedLane.value.clips.push(c);
  selected.value = c.id;
}
function moveLane(event: Event) {
  const target = arrangement.value.lanes.find((l) => l.id === (event.target as HTMLSelectElement).value);
  if (!target || !clip.value || !selectedLane.value) return;
  const c = clip.value;
  selectedLane.value.clips = selectedLane.value.clips.filter((x) => x.id !== c.id);
  target.clips.push(c);
}
let removeDrag = () => {};
function drag(event: PointerEvent, c: ArrangementClip, resize = false) {
  if (event.button !== 0) return;
  event.preventDefault();
  selected.value = c.id;
  stop();
  removeDrag();
  dragging = true;
  const x = event.clientX;
  const start = c.start;
  const duration = c.duration;
  const move = (e: PointerEvent) => {
    const delta = (e.clientX - x) / scale.value;
    const rounded = e.altKey ? (resize ? duration : start) + delta : snapTime((resize ? duration : start) + delta, arrangement.value.bpm ?? 120, arrangement.value.snapBeats ?? 1);
    if (resize) {
      const t = tracks.value.find((t) => t.id === c.trackId);
      c.duration = Math.max(
        0.05,
        Math.min(
          arrangement.value.duration - c.start,
          c.loop ? 600 : Math.max(0.05, (t?.durationSeconds ?? duration) - c.offset),
          rounded,
        ),
      );
    } else c.start = Math.max(0, Math.min(arrangement.value.duration - c.duration, rounded));
  };
  const end = () => { removeDrag(); dragging = false; history.record(arrangement.value); refreshHistory(); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end, { once: true });
  window.addEventListener('pointercancel', end, { once: true });
  removeDrag = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
  };
}
async function save() {
  busy.value = true;
  error.value = '';
  notice.value = '';
  stop();
  try {
    await requestJson(`/projects/${props.projectId}/arrangement`, { method: 'PUT', body: arrangement.value });
    if (alive) {
      savedSnapshot = JSON.stringify(arrangement.value); dirty.value = false;
      notice.value = '비트 편집을 저장했어요.';
      emit('saved');
    }
  } catch (e) {
    if (alive) error.value = errorMessage(e);
  } finally {
    if (alive) busy.value = false;
  }
}
function stop() {
  version++;
  playing.value = false;
  cleanup();
  if (timer) clearInterval(timer);
  timer = undefined;

}
async function prepare(ctx: BaseAudioContext, clips: ArrangementClip[], token: number) {
  const ids = [...new Set(clips.map((c) => c.trackId))];
  if (
    ids.length > 8 ||
    ids.reduce((sum, id) => sum + (tracks.value.find((t) => t.id === id)?.durationSeconds ?? 600), 0) > 600
  )
    throw new Error('PREVIEW_SIZE');
  for (const id of buffers.keys()) if (!ids.includes(id)) buffers.delete(id);
  for (const id of ids) {
    const track = tracks.value.find((t) => t.id === id);
    if (!track) {
      buffers.delete(id);
      throw new Error('SOURCE_MISSING');
    }
    if (buffers.has(id)) continue;
    const response = await fetch(track.audioUrl, { signal: controller?.signal });
    if (!response.ok) throw new Error('SOURCE_MISSING');
    const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    if (!alive || token !== version) return false;
    buffers.set(id, buffer);
  }
  return alive && token === version;
}
let cleanup = () => {};
onBeforeRouteLeave(
  () => !dirty.value || window.confirm('저장하지 않은 비트 편집이 있어요. 저장하지 않고 이동할까요?'),
);
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
window.addEventListener('beforeunload', beforeUnload);

async function preview(value: Arrangement = arrangement.value) {
  if (playing.value) {
    stop();
    cleanup();
    return;
  }
  busy.value = true;
  error.value = '';
  player.pause();
  stop();
  cleanup();
  context ??= new AudioContext();
  const token = version;
  try {
    assertMixDuration(value.duration);
    await context.resume();
    const clips = audibleClips(value);
    if (!clips.length) throw new Error('EMPTY');
    if (!(await prepare(context, clips, token))) return;
    if (position.value >= value.duration) position.value = 0;
    const start = position.value;
    const base = context.currentTime + 0.08;
    cleanup = scheduleMix(context, value, buffers, start, base);
    playing.value = true;
    timer = setInterval(() => {
      position.value = Math.min(value.duration, start + Math.max(0, context!.currentTime - base));
      if (position.value >= value.duration) {
        stop();
        cleanup();
      }
    }, 50);
  } catch (e) {
    stop();
    cleanup();
    error.value =
      e instanceof Error && e.message === 'PREVIEW_SIZE'
        ? '미리듣기는 서로 다른 음원 8개, 원본 합계 600초까지 지원해요.'
        : '음원을 재생하지 못했어요. 클립의 원본과 재생 구간을 확인해 주세요.';
  } finally {
    if (alive) busy.value = false;
  }
}
async function exportMix() {
  busy.value = true;
  error.value = '';
  stop();
  cleanup();
  const token = version;
  try {
    const clips = audibleClips(arrangement.value);
    if (!clips.length) throw new Error('EMPTY');
    assertMixDuration(arrangement.value.duration);
    const ctx = new OfflineAudioContext(2, Math.ceil(arrangement.value.duration * 44100), 44100);
    if (!(await prepare(ctx, clips, token))) return;
    const release = scheduleMix(ctx, arrangement.value, buffers);
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.startRendering();
    } finally {
      release();
    }
    if (!alive || token !== version) return;
    if (exportFile.value) URL.revokeObjectURL(exportFile.value);
    const stats = exportHeadroom(buffer);
    exportFile.value = URL.createObjectURL(pcmWav(buffer));
    notice.value = `Stereo 44.1kHz PCM16 WAV 준비 · peak ${stats.peakDbfs?.toFixed(1) ?? '무음'} dBFS · 감쇠 ${stats.attenuationDb.toFixed(1)} dB. 다운로드 버튼으로 저장하세요.`;
  } catch {
    error.value = '믹스를 내보내지 못했어요. 원본 음원 수·길이와 클립 구간을 확인해 주세요.';
  } finally {
    if (alive) busy.value = false;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  alive = false;
  window.removeEventListener('beforeunload', beforeUnload);
  stop();
  cleanup();
  removeDrag();
  controller?.abort();
  buffers.clear();
  if (exportFile.value) URL.revokeObjectURL(exportFile.value);
  void context?.close();
});
</script>
<template>
  <section class="panel arrangement-editor live-studio" aria-label="제작 스튜디오" tabindex="0" @keydown="keydown">
    <div class="arrangement-heading">
      <div>
        <p class="eyebrow accent-text">SOUNDRY PRODUCTION STUDIO</p>
        <h2>제작 스튜디오</h2>
        <p>
          원본을 찾아 배치하고, 클립을 분할하고, 행별 믹서와 이펙트로 곡을 완성하세요.
        </p>
      </div>
      <span class="outline-tag">{{ dirty ? '저장하지 않은 변경' : '저장됨' }}</span>
    </div>
    <p v-if="error" class="error-banner" role="alert">
      {{ error }}
      <button v-if="!arrangement.lanes.length" class="button button-secondary" @click="load">
        다시 불러오기
      </button>
    </p>
    <p v-if="notice" class="notice-banner" role="status">{{ notice }}</p>
    <a
      v-if="exportFile"
      class="button button-primary mix-download"
      :href="exportFile"
      download="soundry-beat-mix.wav"
      >믹스 WAV 다운로드</a
    >
    <p v-if="loading" role="status">비트 편집을 불러오는 중…</p>
    <template v-else>
      <div class="studio-view-switch" aria-label="스튜디오 보기">
        <button :aria-pressed="view === 'arrangement'" @click="view = 'arrangement'">Arrangement · 편곡</button>
        <button :aria-pressed="view === 'session'" @click="view = 'session'">Session · 클립 런처</button>
        <button :disabled="busy || !canUndo" @click="restore('undo')">↶ 실행 취소</button>
        <button :disabled="busy || !canRedo" @click="restore('redo')">↷ 다시 실행</button>
      </div>
      <div class="arrangement-toolbar">
        <label
          >추가할 원본<select v-model="sourceId" :disabled="busy">
            <option value="" disabled>생성한 음원 선택</option>
            <option v-for="track in tracks" :key="track.id" :value="track.id">
              {{ track.title }} · {{ track.durationSeconds }}초
            </option>
          </select></label
        ><label
          >곡 길이 (초)<input
            v-model.number="arrangement.duration"
            type="number"
            min="1"
            max="600"
            :disabled="busy" /></label
        ><label>확대<input v-model.number="zoom" type="range" min="2" max="12" /></label
        ><button class="button button-secondary" :disabled="busy || !tracks.length" @click="preview()">
          {{ playing ? '미리듣기 정지' : '미리듣기' }}</button
        ><button class="button button-primary" :disabled="busy || !dirty" @click="save">저장</button
        ><button class="button button-secondary" :disabled="busy || !tracks.length" @click="exportMix">
          WAV 내보내기
        </button>
      </div>
      <div class="studio-transport">
        <label>BPM · 편집 격자<input v-model.number="arrangement.bpm" type="number" min="30" max="300" :disabled="busy" /></label>
        <label>스냅<select v-model.number="arrangement.snapBeats" :disabled="busy"><option :value="0">자유</option><option :value="0.25">1/16</option><option :value="0.5">1/8</option><option :value="1">1/4</option><option :value="4">1마디</option></select></label>
        <label>마스터<input v-model.number="arrangement.masterVolume" type="range" min="0" max="1" step="0.01" :disabled="busy" /></label>
        <output>{{ beatPosition(position, arrangement.bpm ?? 120) }} · {{ position.toFixed(1) }}s</output>
        <button class="button button-secondary" :disabled="busy" @click="stop(); position = 0">■ 처음으로</button>
      </div>
      <p v-if="!tracks.length" class="arrangement-empty">
        먼저 아래에서 음악을 생성하세요. 생성한 음원을 각 행에 클립으로 추가할 수 있습니다.
      </p>
      <div class="studio-layout">
      <aside class="studio-browser" aria-label="프로젝트 원본 브라우저">
        <p class="eyebrow">PROJECT AUDIO</p>
        <label>원본 검색<input v-model="search" type="search" placeholder="제목 또는 장르" /></label>
        <div class="studio-browser-list"><button v-for="track in filteredTracks" :key="track.id" :aria-pressed="sourceId === track.id" :disabled="busy" @click="sourceId = track.id"><strong>{{ track.title }}</strong><small>{{ track.genre ?? '장르 미확인' }} · {{ track.durationSeconds }}s</small></button></div>
        <p v-if="!filteredTracks.length">검색 결과가 없습니다.</p>
      </aside>
      <fieldset :disabled="busy" class="arrangement-fields">
        <div v-if="view === 'session'" class="studio-session">
          <table><thead><tr><th>장면</th><th v-for="lane in arrangement.lanes" :key="lane.id"><button @click="mixerId = lane.id">{{ lane.name }}</button></th></tr></thead>
          <tbody><tr v-for="scene in scenes" :key="scene"><th><button :aria-label="`장면 ${scene} 실행`" @click="launch(scene - 1)">▶ {{ scene }}</button></th><td v-for="lane in arrangement.lanes" :key="lane.id">
            <div v-if="lane.clips[scene - 1]" class="studio-slot"><button :aria-label="`${lane.clips[scene - 1]!.label} 클립 실행`" @click="launch(scene - 1, lane.clips[scene - 1]!.id)">▶</button><button @click="selected = lane.clips[scene - 1]!.id">{{ lane.clips[scene - 1]!.label }}</button></div><span v-else>—</span>
          </td></tr></tbody></table>
          <p>각 행의 같은 순번 클립을 동시에 시작합니다. 실행 시 이전 미리듣기는 정지합니다.</p>
        </div>
        <div v-else class="arrangement-scroll">
          <div class="arrangement-canvas" :style="{ width: `${width + 160}px` }">
            <div class="arrangement-ruler">
              <span v-for="tick in ticks" :key="tick" :style="{ left: `${160 + tick * scale}px` }"
                >{{ beatPosition(tick, arrangement.bpm ?? 120) }} · {{ tick.toFixed(0) }}s</span
              >
            </div>
            <div v-for="(lane, index) in arrangement.lanes" :key="lane.id" class="arrangement-row">
              <div class="lane-controls">
                <input v-model="lane.name" :aria-label="`행 ${index + 1} 이름`" maxlength="80" />
                <div>
                  <button
                    :aria-pressed="lane.muted"
                    :aria-label="`${lane.name} 음소거`"
                    @click="lane.muted = !lane.muted"
                  >
                    {{ lane.muted ? '음소거됨' : '음소거' }}</button
                  ><button :aria-pressed="Boolean(lane.solo)" :aria-label="`${lane.name} 솔로`" @click="lane.solo = !lane.solo">S</button><button :aria-label="`${lane.name} 믹서 선택`" @click="mixerId = lane.id">믹서</button><button
                    :disabled="!sourceId || arrangement.lanes.flatMap((l) => l.clips).length >= 128"
                    :aria-label="`${lane.name}에 클립 추가`"
                    @click="addClip(lane)"
                  >
                    ＋ 클립</button
                  ><button
                    :disabled="arrangement.lanes.length === 1 || lane.clips.length > 0"
                    :aria-label="`${lane.name} 삭제`"
                    @click="arrangement.lanes = arrangement.lanes.filter((l) => l.id !== lane.id)"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div
                class="lane-timeline"
                :class="{ 'lane-muted': lane.muted || (arrangement.lanes.some(l => l.solo) && !lane.solo) }"
                :style="{ backgroundSize: `${240 / gridBpm * scale}px 100%` }"
              >
                <div
                  v-for="c in lane.clips"
                  :key="c.id"
                  class="arrangement-clip"
                  :class="[`clip-color-${index % 4}`, { 'clip-selected': selected === c.id }]"
                  :style="{ left: `${c.start * scale}px`, width: `${Math.max(12, c.duration * scale)}px` }"
                >
                  <button
                    class="clip-move"
                    :aria-label="`클립 ${c.label} 선택 및 이동`"
                    @click="selected = c.id"
                    @pointerdown="drag($event, c)"
                  >
                    {{ c.label
                    }}<small>{{
                      tracks.find((t) => t.id === c.trackId)?.title ?? '삭제된 원본'
                    }}</small></button
                  ><button
                    class="clip-resize"
                    :aria-label="`클립 ${c.label} 길이 조절`"
                    @pointerdown="drag($event, c, true)"
                  ></button>
                </div>
                <div class="arrangement-playhead" :style="{ left: `${position * scale}px` }"></div>
              </div>
            </div>
          </div>
        </div>
        <button class="add-lane" :disabled="arrangement.lanes.length >= 32" @click="addLane">
          ＋ 아래에 행 추가
        </button>
        <div v-if="mixer" class="studio-mixer">
          <div class="studio-mixer-heading"><h3>믹서 · {{ mixer.name }}</h3><select :value="mixer.id" aria-label="믹서 행 선택" @change="mixerId = ($event.target as HTMLSelectElement).value"><option v-for="lane in arrangement.lanes" :key="lane.id" :value="lane.id">{{ lane.name }}</option></select><button :aria-pressed="mixer.muted" @click="mixer.muted = !mixer.muted">M · 음소거</button><button :aria-pressed="Boolean(mixer.solo)" @click="mixer.solo = !mixer.solo">S · 솔로</button></div>
          <div class="studio-devices">
            <label>행 볼륨<input type="range" :value="mixer.volume ?? 1" min="0" max="1" step="0.01" @input="mixer.volume = Number(($event.target as HTMLInputElement).value)" /></label>
            <label>팬 · L / R<input type="range" :value="mixer.pan ?? 0" min="-1" max="1" step="0.05" @input="mixer.pan = Number(($event.target as HTMLInputElement).value)" /></label>
            <label>Low-pass (Hz)<input type="number" :value="mixer.lowpassHz ?? 20000" min="40" max="20000" @change="mixer.lowpassHz = Number(($event.target as HTMLInputElement).value)" /></label>
            <label>Delay (초)<input type="number" :value="mixer.delaySeconds ?? 0" min="0" max="2" step="0.05" @change="mixer.delaySeconds = Number(($event.target as HTMLInputElement).value)" /></label>
            <label>Delay wet<input type="range" :value="mixer.delayWet ?? 0" min="0" max="1" step="0.05" @input="mixer.delayWet = Number(($event.target as HTMLInputElement).value)" /></label>
          </div>
        </div>
        <div v-if="clip" class="clip-properties">
          <label>클립 이름<input v-model="clip.label" maxlength="80" /></label
          ><label
            >배치 시작 (초)<input
              v-model.number="clip.start"
              type="number"
              min="0"
              :max="arrangement.duration - clip.duration"
              step="0.1" /></label
          ><label>원본 시작 (초)<input v-model.number="clip.offset" type="number" min="0" step="0.1" /></label
          ><label
            >클립 길이 (초)<input
              v-model.number="clip.duration"
              type="number"
              min="0.05"
              :max="arrangement.duration - clip.start"
              step="0.1" /></label
          ><label>볼륨<input v-model.number="clip.volume" type="range" min="0" max="1" step="0.05" /></label
          ><label class="loop-option"><input v-model="clip.loop" type="checkbox" />원본 반복</label
          ><label
            >배치 행<select :value="selectedLane?.id" @change="moveLane">
              <option v-for="lane in arrangement.lanes" :key="lane.id" :value="lane.id">
                {{ lane.name }}
              </option>
            </select></label
          ><button
            class="button button-secondary"
            :disabled="arrangement.lanes.flatMap((l) => l.clips).length >= 128"
            @click="copyClip"
          >
            복제</button
          ><button class="button button-secondary" @click="split">재생 위치에서 분할</button><button class="button button-secondary" @click="removeClip">클립 삭제</button>
          <label>Fade in (초)<input v-model.number="clip.fadeIn" type="number" min="0" :max="Math.max(0, clip.duration - (clip.fadeOut ?? 0))" step="0.01" /></label>
          <label>Fade out (초)<input v-model.number="clip.fadeOut" type="number" min="0" :max="Math.max(0, clip.duration - (clip.fadeIn ?? 0))" step="0.01" /></label>
          <button class="button button-secondary" @click="loadWaveform">원본 파형 읽기</button>
          <div v-if="waveformTrack === clip.trackId && waveform.length" class="studio-waveform"><p>원본 파형 · 왼쪽 채널 peak</p><svg viewBox="0 0 160 50" role="img" aria-label="실제 원본 오디오의 파형"><line v-for="(peak, index) in waveform" :key="index" :x1="index" :x2="index" :y1="25 - peak * 24" :y2="25 + peak * 24" stroke="currentColor" stroke-width="0.7" /></svg></div>
        </div>
      </fieldset>
      </div>
      <div class="arrangement-position">
        <label for="arrangement-position"
          >재생 위치 · {{ position.toFixed(1) }}초 / {{ arrangement.duration }}초</label
        ><input
          id="arrangement-position"
          v-model.number="position"
          type="range"
          min="0"
          :max="arrangement.duration"
          step="0.1"
          :disabled="busy"
          @input="
            stop();
            cleanup();
          "
        />
      </div>
      <p class="arrangement-help">
        BPM은 편집 격자 기준이며 원본 속도를 바꾸지 않습니다. Alt 드래그: 스냅 해제 · Ctrl/Cmd+Z: 실행 취소 · Ctrl/Cmd+Shift+Z: 다시 실행 · Ctrl/Cmd+D: 복제 · Ctrl/Cmd+E: 분할. 스튜디오 배경에 포커스 후 Space: 재생/정지. 미리듣기·내보내기: 원본 최대 8개 / 합계 600초. 딜레이 잔향은 곡 길이 끝에서 잘립니다.
      </p>
    </template>
  </section>
</template>
