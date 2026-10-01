<script setup lang="ts">
/**
 * 로컬 서버 연결 여부만 표시하는 셸 위젯. 최초 진입과 명시적 다시 확인에서 health를 조회한다.
 * 연속 요청의 이전 결과는 무시하고 5초 안에 응답하지 않으면 연결 끊김으로 표시한다.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { fetchHealth } from '../api/health';
import StudioIcon from './StudioIcon.vue';

const state = ref<'checking' | 'connected' | 'disconnected'>('checking');
const statusText = computed(() => ({ checking: '연결 확인 중', connected: '로컬 서버 연결됨', disconnected: '로컬 서버 연결 끊김' })[state.value]);
let controller: AbortController | undefined;
let requestId = 0;

/** 이전 요청을 취소하고 요청 번호를 비교한다. timeout도 해당 요청의 controller만 중단한다. */
async function checkConnection() {
  controller?.abort();
  const currentId = ++requestId;
  controller = new AbortController();
  const currentController = controller;
  const timeout = window.setTimeout(() => currentController.abort(), 5000);
  state.value = 'checking';
  try {
    await fetchHealth(currentController.signal);
    if (currentId === requestId) state.value = 'connected';
  } catch {
    if (currentId === requestId) state.value = 'disconnected';
  } finally {
    window.clearTimeout(timeout);
  }
}

onMounted(() => { void checkConnection(); });
onUnmounted(() => { requestId++; controller?.abort(); });
</script>

<template>
  <!-- 색상 점과 텍스트를 함께 표시하며 재확인 중 중복 요청은 버튼 비활성화로 막는다. -->
  <div class="connection-card" :data-state="state">
    <div class="connection-heading">
      <span class="connection-dot" aria-hidden="true"></span>
      <span role="status" aria-live="polite">{{ statusText }}</span>
      <button class="icon-button" type="button" aria-label="로컬 서버 연결 다시 확인" :disabled="state === 'checking'" @click="checkConnection">
        <StudioIcon name="refresh" />
      </button>
    </div>
    <p v-if="state === 'disconnected'">서버 실행을 확인한 뒤 다시 연결해 주세요.</p>
    <p v-else>이 컴퓨터에서 실행 중</p>
  </div>
</template>
