<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { ProjectSummary } from '../../../../shared/contracts';
import { getProject } from '../../api/projects';
import { ApiError, errorMessage } from '../../api/client';
import StudioIcon from '../../components/StudioIcon.vue';
import { projectDate } from '../projects/dates';
import ProjectStudio from './ProjectStudio.vue';

const route = useRoute();
const projectId = computed(() => typeof route.params.id === 'string' ? route.params.id : '');
const project = ref<ProjectSummary | null>(null);
const loading = ref(false);
const error = ref('');
const notFound = ref(false);
const metadataError = ref('');
let metadataController: AbortController | undefined;
let controller: AbortController | undefined;
let sequence = 0;

async function loadProject() {
  controller?.abort();
  metadataController?.abort();
  metadataError.value = '';
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

async function refreshMetadata() {
  metadataController?.abort();
  metadataController = new AbortController();
  const current = metadataController;
  const request = sequence;
  const id = projectId.value;
  try {
    const result = await getProject(id, current.signal);
    if (request === sequence && id === projectId.value) { project.value = result; metadataError.value = ''; }
  } catch {
    if (!current.signal.aborted && request === sequence) metadataError.value = '프로젝트 요약을 갱신하지 못했어요. 생성 이력에서 작업 결과를 확인할 수 있습니다.';
  }
}

watch(projectId, () => { void loadProject(); }, { immediate: true });
onBeforeUnmount(() => { sequence++; controller?.abort(); metadataController?.abort(); });
</script>

<template>
  <section v-if="!projectId" class="workspace-select panel empty-state"><span class="empty-icon"><StudioIcon name="folder" /></span><p class="eyebrow accent-text">CHOOSE YOUR PROJECT</p><h1>먼저 프로젝트를 선택해 주세요</h1><p>프로젝트마다 아이디어와 음악을 모아 작업할 수 있어요.<br />목록에서 프로젝트를 열거나 새 프로젝트를 만들어 보세요.</p><RouterLink to="/" class="button button-primary">프로젝트 선택하기<StudioIcon name="arrow" /></RouterLink></section>
  <section v-else-if="loading" class="empty-state workspace-select" role="status" aria-busy="true"><span class="loading-spinner" aria-hidden="true"></span><h1>프로젝트 불러오는 중</h1><p>저장한 프로젝트를 확인하고 있어요.</p></section>
  <section v-else-if="error" class="empty-state workspace-select"><span class="empty-icon"><StudioIcon name="folder" /></span><h1>{{ notFound ? '프로젝트를 찾을 수 없어요' : '프로젝트를 불러오지 못했어요' }}</h1><p role="alert">{{ notFound ? '주소를 확인하거나 다른 프로젝트를 선택해 주세요.' : error }}</p><div class="inline-actions"><button type="button" class="button button-secondary" @click="loadProject">다시 시도</button><RouterLink to="/" class="button button-primary">프로젝트 목록</RouterLink></div></section>
  <template v-else-if="project">
    <RouterLink to="/" class="text-link workspace-back">모든 프로젝트<StudioIcon name="arrow" /></RouterLink>
    <section class="page-heading"><div class="workspace-title"><p class="eyebrow accent-text">CREATE YOUR NEXT SOUND</p><h1 class="break-name">{{ project.name }}</h1><p class="page-description">{{ project.trackCount }}곡 · 최근 수정 <time :datetime="project.updatedAt">{{ projectDate(project.updatedAt) }}</time></p></div><span class="outline-tag">이 컴퓨터에 저장됨</span></section>
    <p v-if="metadataError" class="error-banner" role="alert">{{ metadataError }}</p>
    <ProjectStudio :key="project.id" :project-id="project.id" @project-changed="refreshMetadata" />
  </template>
</template>
