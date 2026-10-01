<script setup lang="ts">
/**
 * 일치하는 라우트가 없을 때 표시하는 복귀 화면. 데이터 API를 호출하지 않고 프로젝트 홈으로 안내한다.
 */
import { RouterLink } from 'vue-router';
</script>

<template>
  <!-- 존재하지 않는 주소에서도 키보드로 홈에 복귀할 수 있는 실제 링크를 제공한다. -->
  <section class="empty-state not-found"><p class="eyebrow accent-text">404</p><h1>페이지를 찾을 수 없어요</h1><p>주소를 확인하거나 프로젝트 화면으로 돌아가 주세요.</p><RouterLink to="/" class="button button-primary">프로젝트로 돌아가기</RouterLink></section>
</template>
