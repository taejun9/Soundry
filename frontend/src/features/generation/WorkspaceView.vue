<script setup lang="ts">
import { RouterLink } from 'vue-router';
import StudioIcon from '../../components/StudioIcon.vue';
</script>

<template>
  <section class="page-heading">
    <div><p class="eyebrow accent-text">CREATE YOUR NEXT SOUND</p><h1>작업 공간</h1><p class="page-description">머릿속의 사운드를 한 곡의 음악으로.</p></div>
    <span class="outline-tag">미리 보기</span>
  </section>
  <div class="workspace-grid">
    <section class="panel prompt-panel" aria-labelledby="prompt-title">
      <div class="section-heading"><h2 id="prompt-title">어떤 음악을 만들까요?</h2><StudioIcon name="sound" /></div>
      <p class="muted-copy">장르와 분위기, 악기, 떠오르는 장면을 자유롭게 적어보세요.</p>
      <label for="prompt-preview" class="field-label">음악 아이디어</label>
      <textarea id="prompt-preview" disabled rows="7" placeholder="예: 비가 내리는 밤의 도시. 따뜻한 일렉트릭 피아노와 묵직한 베이스가 어우러진 느긋한 힙합 비트." aria-describedby="workspace-availability"></textarea>
      <p id="workspace-availability" class="field-help">프로젝트 저장과 음악 생성 기능을 준비하고 있습니다.</p>
      <button class="button button-primary full-width" type="button" disabled><StudioIcon name="plus" />음악 생성 · 준비 중</button>
    </section>
    <section class="panel workspace-results" aria-labelledby="results-title">
      <div class="section-heading"><h2 id="results-title">생성한 음악</h2><span class="muted-label">준비 중</span></div>
      <div class="empty-state"><span class="empty-icon"><StudioIcon name="note" /></span><h3>새로운 사운드가 머무를 곳</h3><p>음악 생성 기능이 연결되면<br />이곳에서 결과를 듣고 비교할 수 있어요.</p></div>
    </section>
  </div>
  <RouterLink to="/" class="text-link back-link">프로젝트로 돌아가기<StudioIcon name="arrow" /></RouterLink>
</template>
