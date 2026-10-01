<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { providerResultLabel } from '../features/generation/provider-display';
import StudioIcon from '../components/StudioIcon.vue';
import { useAudioPlayer } from './context';
import { audioTime } from './time';

const player = useAudioPlayer();
const { state } = player;
const panel = ref<HTMLElement>();
const height = ref(76);
let observer: ResizeObserver | undefined;
const status = computed(() => state.error ? '재생 오류' : state.loading ? '불러오는 중' : state.ended ? '재생 완료' : state.playing ? '재생 중' : '일시 정지');
const seekText = computed(() => `${audioTime(state.currentTime)} / ${audioTime(state.duration)}`);
function seek(event: Event) { player.seek(Number((event.target as HTMLInputElement).value)); }
function volume(event: Event) { player.setVolume(Number((event.target as HTMLInputElement).value) / 100); }
onMounted(() => {
  if (!panel.value) return;
  const measure = () => { height.value = Math.ceil(panel.value?.getBoundingClientRect().height ?? 76); };
  measure(); observer = new ResizeObserver(measure); observer.observe(panel.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="player-spacer" :style="{ height: `${height}px` }" aria-hidden="true"></div>
  <section ref="panel" class="audio-player" aria-label="음악 플레이어">
    <div v-if="!state.track" class="player-empty"><span class="player-art"><StudioIcon name="sound" /></span><div><p>어떤 사운드를 들어볼까요?</p><span>음원 카드의 재생 버튼을 눌러 보세요.</span></div></div>
    <div v-else class="player-grid">
      <div class="player-track"><span class="player-art" :class="{ 'is-playing': state.playing }"><StudioIcon name="sound" /></span><div class="player-track-copy"><p :title="state.track.title">{{ state.track.title }}</p><span class="player-provider" :title="state.track.provider">{{ state.track.provider === 'mock' ? 'Mock · 8초 고정 데모' : providerResultLabel(state.track.provider) }}</span><span class="player-status" role="status">{{ status }}</span></div></div>
      <div class="player-transport"><button type="button" class="player-toggle" :aria-label="state.playing || state.loading ? '현재 음원 일시 정지' : state.error ? '현재 음원 재생 다시 시도' : '현재 음원 재생'" @click="player.toggle()"><StudioIcon :name="state.playing || state.loading ? 'pause' : 'play'" /></button><div class="player-timeline"><label class="sr-only" for="player-seek">재생 위치</label><input id="player-seek" type="range" min="0" :max="state.duration ?? 1" step="0.1" :value="state.currentTime" :disabled="state.duration === null" :aria-valuetext="seekText" @input="seek" /><div class="player-times"><span>{{ audioTime(state.currentTime) }}</span><span>{{ audioTime(state.duration) }}</span></div></div></div>
      <div class="player-volume"><StudioIcon name="volume" /><label class="sr-only" for="player-volume">음량</label><input id="player-volume" type="range" min="0" max="100" step="1" :value="Math.round(state.volume * 100)" :aria-valuetext="`${Math.round(state.volume * 100)}%`" @input="volume" /><span>{{ Math.round(state.volume * 100) }}%</span></div>
      <div class="player-actions"><a class="icon-button" :href="state.track.downloadUrl" download :aria-label="`${state.track.title} 원본 다운로드`" title="원본 다운로드"><StudioIcon name="download" /></a><button type="button" class="icon-button" aria-label="플레이어 비우기" title="플레이어 비우기" @click="player.clear"><StudioIcon name="close" /></button></div>
    </div>
    <p v-if="state.error" class="player-error" role="alert">{{ state.error }}</p>
  </section>
</template>
