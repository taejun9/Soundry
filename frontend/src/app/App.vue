<script setup lang="ts">
import { nextTick, onBeforeUnmount, provide, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import StudioIcon from '../components/StudioIcon.vue';
import ConnectionStatus from '../components/ConnectionStatus.vue';
import AudioPlayer from '../audio/AudioPlayer.vue';
import { createAudioController } from '../audio/controller';
import { audioControllerKey } from '../audio/context';

const player = createAudioController(new Audio(), window.location.href);
provide(audioControllerKey, player);
onBeforeUnmount(() => player.dispose());

const route = useRoute();
const menuOpen = ref(false);
const main = ref<HTMLElement>();
watch(() => route.fullPath, async () => {
  menuOpen.value = false;
  await nextTick();
  main.value?.focus();
});
</script>

<template>
  <a href="#main-content" class="skip-link">본문으로 이동</a>
  <div class="studio-shell">
    <aside class="sidebar">
      <div class="brand-row">
        <RouterLink to="/" class="brand" aria-label="Soundry 프로젝트 홈">
          <span class="brand-symbol"><StudioIcon name="sound" /></span>
          <span>soundry<span class="brand-period">.</span></span>
        </RouterLink>
        <button class="icon-button menu-toggle" type="button" :aria-expanded="menuOpen" aria-controls="studio-navigation" :aria-label="menuOpen ? '메뉴 닫기' : '메뉴 열기'" @click="menuOpen = !menuOpen">
          <StudioIcon :name="menuOpen ? 'close' : 'menu'" />
        </button>
      </div>
      <div id="studio-navigation" class="sidebar-body" :class="{ 'is-open': menuOpen }">
        <p class="eyebrow nav-caption">YOUR STUDIO</p>
        <nav aria-label="스튜디오 메뉴">
          <RouterLink to="/" class="nav-item" exact-active-class="is-active"><StudioIcon name="grid" />프로젝트</RouterLink>
          <RouterLink to="/workspace" class="nav-item" :class="{ 'is-active': route.path.startsWith('/projects/') }" active-class="is-active"><StudioIcon name="sliders" /><span>작업 공간<span class="nav-hint">프로젝트 선택</span></span></RouterLink>
          <RouterLink to="/library" class="nav-item" active-class="is-active"><StudioIcon name="heart" />보관함</RouterLink>
        </nav>
        <div class="sidebar-bottom">
          <div class="private-note"><StudioIcon name="lock" /><span>당신만의 창작 공간</span></div>
          <ConnectionStatus />
          <span class="build-label">SOUNDRY · EARLY PREVIEW</span>
        </div>
      </div>
    </aside>
    <div class="studio-body">
      <header class="topbar">
        <div class="breadcrumb">내 스튜디오<span>/</span><span class="breadcrumb-current">{{ route.meta.title }}</span></div>
        <span class="local-badge"><StudioIcon name="monitor" />LOCAL STUDIO</span>
      </header>
      <main id="main-content" ref="main" tabindex="-1" class="main-content">
        <RouterView />
      </main>
      <footer class="studio-footer"><span>아이디어부터, 한 곡씩.</span><span>Made for your sound.</span></footer>
      <AudioPlayer />
    </div>
  </div>
</template>
