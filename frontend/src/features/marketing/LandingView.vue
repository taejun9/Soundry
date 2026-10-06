<script setup lang="ts">
import StudioIcon from '../../components/StudioIcon.vue';
</script>
<template>
  <section class="landing-hero">
    <div class="hero-copy">
      <p class="eyebrow accent-text">AN IDEA. A BEAT. YOUR SOUND.</p>
      <h1>떠오른 아이디어를<br /><span>당신의 음악으로.</span></h1>
      <p>
        말로 시작하고, 비트를 쌓고, 한 곡으로 완성하세요.<br />창작의 모든 순간이 당신의 스튜디오에 남습니다.
      </p>
      <div class="inline-actions">
        <RouterLink class="button button-primary" to="/projects"
          >스튜디오 시작하기<StudioIcon name="arrow" /></RouterLink
        ><RouterLink class="button button-secondary" to="/pricing">등급 살펴보기</RouterLink>
      </div>
      <div class="hero-notes">
        <span>로컬 음원 저장</span><span>구간별 비트 편집</span><span>결제 연동 없음</span>
      </div>
    </div>
    <div class="hero-studio" aria-label="다중 행 비트 편집 예시">
      <div class="demo-toolbar">
        <span class="demo-dot"></span><span>Late night session</span><span>ARRANGEMENT</span>
      </div>
      <div class="demo-ruler"><span>0:00</span><span>0:30</span><span>1:00</span><span>1:30</span></div>
      <div class="demo-lane">
        <small>01</small>
        <div class="demo-clip demo-a">A <span>기본 비트</span><i></i></div>
      </div>
      <div class="demo-lane">
        <small>02</small>
        <div class="demo-clip demo-b">B</div>
        <div class="demo-clip demo-c">C</div>
        <div class="demo-clip demo-b">B</div>
      </div>
      <div class="demo-lane">
        <small>03</small>
        <div class="demo-clip demo-d">D</div>
        <div class="demo-clip demo-e">E</div>
      </div>
      <div class="demo-add">＋ 새로운 행, 새로운 아이디어</div>
      <div class="demo-bottom">
        <span>▶</span><span>LAYERS MAKE THE DIFFERENCE</span><span>03 TRACKS</span>
      </div>
    </div>
  </section>
  <section class="landing-features">
    <article>
      <span>01 / CREATE</span>
      <h2>말에서 시작하는 음악</h2>
      <p>
        장르, 분위기, 템포를 골라 아이디어를 음악으로. 기존 CLI 계정으로 작곡하고 로컬에서 음원을 합성합니다.
      </p>
    </article>
    <article>
      <span>02 / ARRANGE</span>
      <h2>원하는 순간에, 원하는 비트</h2>
      <p>A는 길게, B와 C는 중간중간. 행을 더하고 클립을 움직여 당신만의 흐름을 만들어 보세요.</p>
    </article>
    <article>
      <span>03 / KEEP</span>
      <h2>다시 꺼내 듣는 아이디어</h2>
      <p>생성 이력과 즐겨찾기, 원본 다운로드까지. 회원별 프로젝트와 음원은 이 컴퓨터에 보관됩니다.</p>
    </article>
  </section>
  <section class="landing-cta">
    <div>
      <p class="eyebrow accent-text">MAKE ROOM FOR YOUR SOUND</p>
      <h2>다음 곡은, 여기서 시작됩니다.</h2>
    </div>
    <RouterLink class="button button-primary" to="/account"
      >내 계정 만들기<StudioIcon name="arrow"
    /></RouterLink>
  </section>
</template>
