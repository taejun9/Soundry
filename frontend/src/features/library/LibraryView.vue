<script setup lang="ts">
import { RouterLink } from 'vue-router';
import StudioIcon from '../../components/StudioIcon.vue';
</script>

<template>
  <section class="page-heading"><div><p class="eyebrow accent-text">KEEP WHAT MOVES YOU</p><h1>나의 보관함</h1><p class="page-description">다시 듣고 싶은 음악을 한곳에서.</p></div><span class="outline-tag">준비 중</span></section>
  <section class="panel library-panel" aria-labelledby="library-title">
    <div class="section-heading"><h2 id="library-title">즐겨찾는 음악</h2><StudioIcon name="heart" /></div>
    <div class="empty-state"><span class="empty-icon"><StudioIcon name="heart" /></span><h3>마음에 드는 사운드를 모아보세요</h3><p>즐겨찾기 기능을 준비하고 있어요.<br />연결 후 프로젝트의 음악을 이곳에 모을 수 있습니다.</p><RouterLink to="/" class="button button-secondary">프로젝트 둘러보기<StudioIcon name="arrow" /></RouterLink></div>
  </section>
</template>
