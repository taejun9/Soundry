<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { MembershipPlan } from '../../../../shared/contracts';
import { requestJson, errorMessage } from '../../api/client';
const plans = ref<MembershipPlan[]>([]);
const error = ref('');
async function load() {
  try {
    plans.value = ((await requestJson('/members/plans')) as { items: MembershipPlan[] }).items.filter(
      (p) => p.tier !== 'admin',
    );
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(load);
</script>
<template>
  <section class="pricing-heading">
    <p class="eyebrow accent-text">FIND YOUR RHYTHM</p>
    <h1>창작의 속도에 맞는 등급</h1>
    <p>가볍게 시작하거나, 더 많은 아이디어를 만들어 보세요.</p>
    <span class="outline-tag">상품 안내 · 결제 연동 없음</span>
  </section>
  <p v-if="error" class="error-banner" role="alert">
    {{ error }} <button class="button button-secondary" @click="load">다시 불러오기</button>
  </p>
  <div class="pricing-grid">
    <article
      v-for="plan in plans"
      :key="plan.tier"
      class="panel pricing-card"
      :class="{ featured: plan.tier === 'plus' }"
    >
      <span v-if="plan.tier === 'plus'" class="pricing-recommend">꾸준한 창작을 위한 선택</span>
      <p class="eyebrow">{{ plan.name }}</p>
      <h2>{{ plan.name }}</h2>
      <p>
        {{
          plan.tier === 'free'
            ? '첫 아이디어를 위한 공간'
            : plan.tier === 'plus'
              ? '매일 새로운 비트를 만드는 당신에게'
              : '많은 아이디어를 완성하는 작업실'
        }}
      </p>
      <div class="pricing-amount">{{ plan.monthlyLimit }}<small>곡 / 월</small></div>
      <ul>
        <li>AI 음악 생성과 생성 이력</li>
        <li>다중 행 비트 편집</li>
        <li>즐겨찾기와 원본 다운로드</li>
        <li>회원별 로컬 프로젝트</li>
      </ul>
      <RouterLink
        to="/account"
        class="button"
        :class="plan.tier === 'plus' ? 'button-primary' : 'button-secondary'"
        >{{ plan.tier === 'free' ? '무료 등급으로 시작' : '회원 등급 확인' }}</RouterLink
      >
    </article>
  </div>
  <div class="pricing-footnote">
    <h2>사용량은 이렇게 계산합니다</h2>
    <p>
      한국 시간 기준 매월 1일에 새 한도가 적용됩니다. 생성 결과 1곡이 1회이며, 여러 variation은 각각
      계산합니다. 대기·생성 중인 곡은 한도를 예약하고 실패·취소 시 복원됩니다. 비트 편집·재생·다운로드는
      생성량을 사용하지 않습니다.
    </p>
    <p>
      관리자는 앱 생성량 제한이 없습니다. Plus·Pro는 관리자가 회원 관리에서 수동 지정합니다. 가격과 결제는
      아직 제공하지 않습니다. CLI 계정 자체의 사용 한도는 별도로 적용됩니다.
    </p>
  </div>
</template>
