<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { fetchHealth } from '../api/health';
import StudioIcon from './StudioIcon.vue';

const state = ref<'checking' | 'connected' | 'disconnected'>('checking');
const statusText = computed(() => ({ checking: '연결 확인 중', connected: '로컬 서버 연결됨', disconnected: '로컬 서버 연결 끊김' })[state.value]);
let controller: AbortController | undefined;
let requestId = 0;

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
