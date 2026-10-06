<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { session, refreshSession } from './session';
const props = defineProps<{ revision: number }>();
const error = ref('');
async function load() {
  try {
    await refreshSession();
    error.value = '';
  } catch {
    error.value = '사용량을 갱신하지 못했어요.';
  }
}
onMounted(load);
watch(() => props.revision, load);
</script>
<template>
  <aside v-if="session.member" class="studio-usage">
    <span>{{ session.member.tier.toUpperCase() }} · {{ session.usage?.month }}</span
    ><span v-if="session.usage"
      >이번 달 {{ session.usage.used }} / {{ session.usage.limit ?? '무제한' }}곡
      <small v-if="session.usage.remaining !== null">· {{ session.usage.remaining }}곡 남음</small></span
    ><span v-if="error" role="status">{{ error }}</span
    ><RouterLink to="/account">회원·사용량 확인 →</RouterLink>
  </aside>
</template>
