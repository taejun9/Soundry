<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { ProjectSummary } from '../../../../shared/contracts';
import { getProject } from '../../api/projects';
import { ApiError, errorMessage } from '../../api/client';
import StudioIcon from '../../components/StudioIcon.vue';
import { projectDate } from '../projects/dates';
import GenerationComposer from './GenerationComposer.vue';

const route = useRoute();
const projectId = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const project = ref<ProjectSummary | null>(null);
const loading = ref(false);
const error = ref('');
const notFound = ref(false);
let controller: AbortController | undefined;
let sequence = 0;

async function loadProject() {
  controller?.abort();
  const request = ++sequence;
  project.value = null;
  error.value = '';
  notFound.value = false;
  if (!projectId.value) { loading.value = false; return; }
  controller = new AbortController();
  const currentController = controller;
  loading.value = true;
  try {
    const result = await getProject(projectId.value, currentController.signal);
    if (request !== sequence) return;
    project.value = result;
    document.title = `${result.name} · Soundry`;
  } catch (reason) {
    if (request !== sequence || currentController.signal.aborted) return;
    notFound.value = reason instanceof ApiError && [400, 404].includes(reason.status);
    error.value = errorMessage(reason);
  } finally {
    if (request === sequence) loading.value = false;
  }
}

watch(projectId, () => { void loadProject(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; controller?.abort(); });
</script>

<template>
  <section v-if="!projectId" class="workspace-select panel empty-state"><span class="empty-icon"><StudioIcon name="folder" /></span><p class="eyebrow accent-text">CHOOSE YOUR PROJECT</p><h1>먼저 프로젝트를 선택해 주세요</h1><p>프로젝트마다 아이디어와 음악을 모아 작업할 수 있어요.<br />목록에서 프로젝트를 열거나 새 프로젝트를 만들어 보세요.</p><RouterLink to="/" class="button button-primary">프로젝트 선택하기<StudioIcon name="arrow" /></RouterLink></section>
  <section v-else-if="loading" class="empty-state workspace-select" role="status" aria-busy="true"><span class="loading-spinner" aria-hidden="true"></span><h1>프로젝트 불러오는 중</h1><p>저장한 프로젝트를 확인하고 있어요.</p></section>
  <section v-else-if="error" class="empty-state workspace-select"><span class="empty-icon"><StudioIcon name="folder" /></span><h1>{{ notFound ? '프로젝트를 찾을 수 없어요' : '프로젝트를 불러오지 못했어요' }}</h1><p role="alert">{{ notFound ? '주소를 확인하거나 다른 프로젝트를 선택해 주세요.' : error }}</p><div class="inline-actions"><button type="button" class="button button-secondary" @click="loadProject">다시 시도</button><RouterLink to="/" class="button button-primary">프로젝트 목록</RouterLink></div></section>
  <template v-else-if="project">
    <RouterLink to="/" class="text-link workspace-back">모든 프로젝트<StudioIcon name="arrow" /></RouterLink>
    <section class="page-heading"><div class="workspace-title"><p class="eyebrow accent-text">CREATE YOUR NEXT SOUND</p><h1 class="break-name">{{ project.name }}</h1><p class="page-description">{{ project.trackCount }}곡 · 최근 수정 <time :datetime="project.updatedAt">{{ projectDate(project.updatedAt) }}</time></p></div><span class="outline-tag">이 컴퓨터에 저장됨</span></section>
    <div class="workspace-grid">
      <GenerationComposer :key="project.id" :project-id="project.id" />
      <section class="panel workspace-results" aria-labelledby="results-title"><div class="section-heading"><h2 id="results-title">생성한 음악</h2><span class="muted-label">준비 중</span></div><div class="empty-state"><span class="empty-icon"><StudioIcon name="note" /></span><h3>새로운 사운드가 머무를 곳</h3><p>음악 생성 기능이 연결되면<br />이곳에서 결과를 듣고 비교할 수 있어요.</p></div><div class="writing-tips"><h3>아이디어가 막힌다면</h3><p><span>01</span>음악이 어울릴 장소나 시간을 떠올려 보세요.</p><p><span>02</span>주로 들렸으면 하는 악기를 두세 개 적어보세요.</p><p><span>03</span>시작과 끝의 감정 변화를 표현해 보세요.</p></div></section>
    </div>
  </template>
</template>
