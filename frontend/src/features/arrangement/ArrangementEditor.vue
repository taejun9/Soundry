<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import { audibleClips, clipPlayback, pcmWav, timelineDuration, assertMixDuration } from './arrangement';
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
const clip = computed(() =>
  arrangement.value.lanes.flatMap((l) => l.clips).find((c) => c.id === selected.value),
);
const selectedLane = computed(() =>
  arrangement.value.lanes.find((l) => l.clips.some((c) => c.id === selected.value)),
);
const visibleDuration = computed(() => timelineDuration(arrangement.value.duration));
const width = computed(() => Math.max(600, visibleDuration.value * zoom.value));
const scale = computed(() => width.value / visibleDuration.value);
const ticks = computed(() =>
  Array.from({ length: Math.floor(visibleDuration.value / 15) + 1 }, (_, i) => i * 15),
);
let context: AudioContext | undefined;
let nodes: AudioBufferSourceNode[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
let version = 0;
let alive = true;
let loadVersion = 0;
let controller: AbortController | undefined;
const buffers = new Map<string, AudioBuffer>();
watch(
  arrangement,
  () => {
    dirty.value = true;
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
    arrangement.value = value;
    await Promise.resolve();
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
  if (!track?.durationSeconds) return;
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
  if (!clip.value || !selectedLane.value) return;
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
  const x = event.clientX;
  const start = c.start;
  const duration = c.duration;
  const move = (e: PointerEvent) => {
    const delta = (e.clientX - x) / scale.value;
    const rounded = Math.round((resize ? duration : start) + delta) * 1;
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
  const end = () => removeDrag();
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
      dirty.value = false;
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
  for (const n of nodes) {
    try {
      n.stop();
    } catch {
      /*Already ended.*/
    }
    n.disconnect();
  }
  nodes = [];
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
function schedule(ctx: BaseAudioContext, clips: ArrangementClip[], at: number, base: number) {
  for (const c of clips) {
    const b = buffers.get(c.trackId);
    if (
      !b ||
      ![c.start, c.offset, c.duration, c.volume].every(Number.isFinite) ||
      c.start < 0 ||
      c.offset < 0 ||
      c.duration < 0.05 ||
      c.start + c.duration > arrangement.value.duration ||
      c.volume < 0 ||
      c.volume > 1 ||
      c.offset >= b.duration ||
      (!c.loop && c.offset + c.duration > b.duration + 0.01)
    )
      throw new Error('SOURCE_RANGE');
  }
  const master = ctx.createGain();
  master.gain.value = 0.7;
  const limiter = ctx.createDynamicsCompressor();
  master.connect(limiter);
  limiter.connect(ctx.destination);
  for (const c of clips) {
    const timing = clipPlayback(c, at);
    if (timing.duration <= 0) continue;
    const buffer = buffers.get(c.trackId);
    if (!buffer || c.offset >= buffer.duration || (!c.loop && c.offset + c.duration > buffer.duration + 0.01))
      throw new Error('SOURCE_RANGE');
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = c.loop;
    node.loopStart = c.offset;
    node.loopEnd = buffer.duration;
    const gain = ctx.createGain();
    gain.gain.value = c.volume;
    node.connect(gain);
    gain.connect(master);
    const offset = c.loop
      ? c.offset + (timing.elapsed % (buffer.duration - c.offset))
      : c.offset + timing.elapsed;
    node.start(base + timing.delay, offset, timing.duration);
    nodes.push(node);
  }
  return () => {
    master.disconnect();
    limiter.disconnect();
  };
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

async function preview() {
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
    assertMixDuration(arrangement.value.duration);
    await context.resume();
    const clips = audibleClips(arrangement.value);
    if (!clips.length) throw new Error('EMPTY');
    if (!(await prepare(context, clips, token))) return;
    if (position.value >= arrangement.value.duration) position.value = 0;
    const start = position.value;
    const base = context.currentTime + 0.08;
    cleanup = schedule(context, clips, start, base);
    playing.value = true;
    timer = setInterval(() => {
      position.value = Math.min(arrangement.value.duration, start + Math.max(0, context!.currentTime - base));
      if (position.value >= arrangement.value.duration) {
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
    const release = schedule(ctx, clips, 0, 0);
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.startRendering();
    } finally {
      release();
      nodes = [];
    }
    if (!alive || token !== version) return;
    if (exportFile.value) URL.revokeObjectURL(exportFile.value);
    exportFile.value = URL.createObjectURL(pcmWav(buffer));
    notice.value = 'WAV 믹스가 준비됐어요. 다운로드 버튼으로 저장해 주세요.';
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
  <section class="panel arrangement-editor" aria-label="비트 편집기">
    <div class="arrangement-heading">
      <div>
        <p class="eyebrow accent-text">BUILD YOUR ARRANGEMENT</p>
        <h2>비트 편집</h2>
        <p>
          A를 길게 깔고 B·C를 원하는 순간에 겹쳐 보세요. 클립을 드래그해 이동하고 오른쪽 끝으로 길이를
          조절합니다.
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
        ><button class="button button-secondary" :disabled="busy || !tracks.length" @click="preview">
          {{ playing ? '미리듣기 정지' : '미리듣기' }}</button
        ><button class="button button-primary" :disabled="busy || !dirty" @click="save">저장</button
        ><button class="button button-secondary" :disabled="busy || !tracks.length" @click="exportMix">
          WAV 내보내기
        </button>
      </div>
      <p v-if="!tracks.length" class="arrangement-empty">
        먼저 아래에서 음악을 생성하세요. 생성한 음원을 각 행에 클립으로 추가할 수 있습니다.
      </p>
      <fieldset :disabled="busy" class="arrangement-fields">
        <div class="arrangement-scroll">
          <div class="arrangement-canvas" :style="{ width: `${width + 160}px` }">
            <div class="arrangement-ruler">
              <span v-for="tick in ticks" :key="tick" :style="{ left: `${160 + tick * scale}px` }"
                >{{ tick }}s</span
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
                  ><button
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
                :class="{ 'lane-muted': lane.muted }"
                :style="{ backgroundSize: `${15 * scale}px 100%` }"
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
          ><button class="button button-secondary" @click="removeClip">클립 삭제</button>
        </div>
      </fieldset>
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
        긴 A: 클립을 선택해 원본 반복을 켜고 길이를 늘리세요. B·C: 시작 시점과 구간 길이를 지정하세요.
        미리듣기·내보내기는 원본 최대 8개 / 합계 600초를 지원합니다.
      </p>
    </template>
  </section>
</template>
