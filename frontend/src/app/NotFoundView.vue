<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="empty-state not-found"><p class="eyebrow accent-text">404</p><h1>페이지를 찾을 수 없어요</h1><p>주소를 확인하거나 프로젝트 화면으로 돌아가 주세요.</p><RouterLink to="/" class="button button-primary">프로젝트로 돌아가기</RouterLink></section>
</template>
