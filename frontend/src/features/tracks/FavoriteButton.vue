<script setup lang="ts">
/**
 * 즐겨찾기 상태를 접근 가능한 토글 버튼으로 표시한다.
 * 저장 중에도 포커스를 유지하도록 aria-disabled를 사용하고 클릭 처리에서 중복 이벤트를 막는다.
 */
import StudioIcon from '../../components/StudioIcon.vue';
defineProps<{ title: string; favorite: boolean; pending?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>
<template>
  <!-- aria-pressed는 저장된 상태이고 aria-busy는 요청 상태다. 저장 중에도 현재 버튼의 키보드 포커스를 유지한다. -->
  <button type="button" class="favorite-toggle" :aria-disabled="Boolean(pending)" :aria-busy="Boolean(pending)" :aria-pressed="favorite" :aria-label="`${title} 즐겨찾기 ${favorite ? '해제' : '추가'}`" @click="!pending && emit('toggle')"><StudioIcon name="heart" />{{ pending ? '저장 중…' : favorite ? '보관 중' : '즐겨찾기' }}</button>
</template>
