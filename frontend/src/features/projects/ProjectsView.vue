<script setup lang="ts">
import { RouterLink } from 'vue-router';
import StudioIcon from '../../components/StudioIcon.vue';
</script>

<template>
  <section class="page-heading">
    <div>
      <p class="eyebrow accent-text">A SPACE FOR YOUR SOUND</p>
      <h1>나의 프로젝트</h1>
      <p class="page-description">떠오르는 아이디어를 담고, 나만의 사운드를 찾아보세요.</p>
    </div>
    <button type="button" class="button button-primary" disabled aria-describedby="project-availability"><StudioIcon name="plus" />새 프로젝트</button>
  </section>

  <section class="welcome-panel" aria-labelledby="welcome-title">
    <div class="welcome-copy">
      <span class="small-tag">WELCOME TO SOUNDRY</span>
      <h2 id="welcome-title">당신의 다음 곡은<br />어떤 느낌인가요?</h2>
      <p>분위기, 장르, 떠오르는 장면까지.<br />음악의 시작을 당신의 언어로 그려보세요.</p>
      <RouterLink to="/workspace" class="text-link">작업 공간 둘러보기<StudioIcon name="arrow" /></RouterLink>
    </div>
    <div class="record-art" aria-hidden="true"><div class="record-disc"><div class="record-label"><StudioIcon name="sound" /></div></div><span class="record-caption">EVERY SOUND STARTS WITH AN IDEA.</span></div>
  </section>

  <section aria-labelledby="projects-title" class="project-section">
    <div class="section-heading"><h2 id="projects-title">프로젝트</h2><span class="muted-label">준비 중</span></div>
    <div class="empty-state project-empty">
      <span class="empty-icon"><StudioIcon name="folder" /></span>
      <h3>첫 프로젝트를 위한 공간</h3>
      <p id="project-availability">프로젝트 만들기와 저장 기능을 준비하고 있어요.<br />현재는 화면을 둘러보고 로컬 서버 연결을 확인할 수 있습니다.</p>
      <span class="availability-note">음악 생성은 아직 사용할 수 없습니다.</span>
    </div>
  </section>
</template>
