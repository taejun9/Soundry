<script setup lang="ts">
/**
 * 앱의 공통 셸과 단일 오디오 controller를 소유한다. RouterView만 교체하므로 화면 이동 중에도 재생이 유지된다.
 * 사이드 메뉴의 열림 상태와 이동 후 본문 포커스는 이 수준에서 일관되게 관리한다.
 */
import { nextTick, onBeforeUnmount, provide, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import StudioIcon from '../components/StudioIcon.vue';
import ConnectionStatus from '../components/ConnectionStatus.vue';
import AudioPlayer from '../audio/AudioPlayer.vue';
import { createAudioController } from '../audio/controller';
import { audioControllerKey } from '../audio/context';

// 셸에서 한 번만 생성한다. 프로젝트 카드와 보관함, 하단 플레이어가 모두 같은 인스턴스를 주입받는다.
const player = createAudioController(new Audio(), window.location.href);
provide(audioControllerKey, player);
onBeforeUnmount(() => player.dispose());

const route = useRoute();
const menuOpen = ref(false);
const main = ref<HTMLElement>();
// 라우트 화면이 갱신된 다음 본문으로 포커스를 옮겨 키보드 사용자가 새 화면에 진입했음을 알린다.
watch(() => route.fullPath, async () => {
  menuOpen.value = false;
  await nextTick();
  main.value?.focus();
});
</script>

<template>
  <!-- 라우트 화면은 main 안에서 교체하고 AudioPlayer는 밖에 두어 내비게이션으로 재생 UI를 해제하지 않는다. -->
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
