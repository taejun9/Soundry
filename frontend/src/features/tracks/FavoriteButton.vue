<script setup lang="ts">
import StudioIcon from '../../components/StudioIcon.vue';
defineProps<{ title: string; favorite: boolean; pending?: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>
<template>
  <button type="button" class="favorite-toggle" :aria-disabled="Boolean(pending)" :aria-busy="Boolean(pending)" :aria-pressed="favorite" :aria-label="`${title} 즐겨찾기 ${favorite ? '해제' : '추가'}`" @click="!pending && emit('toggle')"><StudioIcon name="heart" />{{ pending ? '저장 중…' : favorite ? '보관 중' : '즐겨찾기' }}</button>
</template>
