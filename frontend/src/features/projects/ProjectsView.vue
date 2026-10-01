<script setup lang="ts">
/**
 * 프로젝트 대시보드와 생성·수정·삭제 대화상자를 연결한다.
 * 서버 목록을 기준으로 갱신하고 삭제한 프로젝트의 탭 메모리 초안과 불확실한 요청도 함께 정리한다.
 */
import { onMounted, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { DeleteResult, ProjectSummary } from '../../../../shared/contracts';
import StudioIcon from '../../components/StudioIcon.vue';
import ProjectDialog from './ProjectDialog.vue';
import { projectDate } from './dates';
import { useProjects } from './useProjects';
import { forgetGenerationRequest } from '../generation/useGenerations';
import { forgetProjectDraft } from '../generation/useComposer';
import { useAudioPlayer } from '../../audio/context';

const player = useAudioPlayer();

const router = useRouter();
const { projects, nextCursor, loading, loadingMore, error, refresh, loadMore } = useProjects();
const dialog = ref<{ mode: 'create' | 'rename' | 'delete'; project?: ProjectSummary } | null>(null);
const notice = ref('');
const createButton = ref<HTMLButtonElement>();

/** 변경 결과 안내를 지우고 사용자가 선택한 대상/모드를 확인창에 전달한다. */
function openDialog(mode: 'create' | 'rename' | 'delete', project?: ProjectSummary) {
  notice.value = '';
  dialog.value = { mode, project };
}

/** 새 프로젝트는 곧바로 작업 공간을 열고 이름 변경은 최신 정렬의 프로젝트 목록을 다시 읽는다. */
async function saved(project: ProjectSummary) {
  const created = dialog.value?.mode === 'create';
  dialog.value = null;
  if (created) { await router.push(`/projects/${project.id}`); return; }
  notice.value = '프로젝트 이름을 저장했어요.';
  await refresh();
}

/** 삭제 성공 뒤 관련 탭 메모리를 비우고 목록을 새로 읽는다. 없어진 카드 대신 생성 버튼으로 포커스를 복구한다. */
async function deleted(result: DeleteResult) {
  if (dialog.value?.project) { player.clearProject(dialog.value.project.id); forgetProjectDraft(dialog.value.project.id); forgetGenerationRequest(dialog.value.project.id); }
  dialog.value = null;
  notice.value = result.cleanupPending
    ? '프로젝트는 삭제되었지만 일부 음원 파일 정리가 남아 있어요. 다음 서버 시작 때 다시 정리합니다.'
    : '프로젝트를 삭제했어요.';
  await refresh();
  createButton.value?.focus();
}

onMounted(() => { void refresh(); });
</script>

<template>
  <!-- 첫 사용 안내와 목록 상태를 나누고 각 카드의 열기·이름 변경·삭제는 독립된 조작으로 제공한다. -->
  <section class="page-heading">
    <div><p class="eyebrow accent-text">A SPACE FOR YOUR SOUND</p><h1>나의 프로젝트</h1><p class="page-description">떠오르는 아이디어를 담고, 나만의 사운드를 찾아보세요.</p></div>
    <button ref="createButton" type="button" class="button button-primary" @click="openDialog('create')"><StudioIcon name="plus" />새 프로젝트</button>
  </section>

  <p v-if="notice" class="notice-banner" role="status">{{ notice }}</p>

  <section v-if="!loading && !error && projects.length === 0" class="welcome-panel" aria-labelledby="welcome-title">
    <div class="welcome-copy"><span class="small-tag">WELCOME TO SOUNDRY</span><h2 id="welcome-title">당신의 다음 곡은<br />어떤 느낌인가요?</h2><p>분위기, 장르, 떠오르는 장면까지.<br />음악의 시작을 당신의 언어로 그려보세요.</p><button type="button" class="text-link" @click="openDialog('create')">첫 프로젝트 만들기<StudioIcon name="arrow" /></button></div>
    <div class="record-art" aria-hidden="true"><div class="record-disc"><div class="record-label"><StudioIcon name="sound" /></div></div><span class="record-caption">EVERY SOUND STARTS WITH AN IDEA.</span></div>
  </section>

  <section aria-labelledby="projects-title" class="project-section" :aria-busy="loading || loadingMore">
    <div class="section-heading"><h2 id="projects-title">프로젝트 <span v-if="projects.length" class="project-count">{{ projects.length }}개{{ nextCursor ? ' 불러옴' : '' }}</span></h2><button type="button" class="text-link refresh-link" :disabled="loading || loadingMore" @click="refresh"><StudioIcon name="refresh" />새로고침</button></div>
    <div v-if="error" class="error-banner" role="alert"><p>{{ error }}</p><button type="button" class="button button-secondary" :disabled="loading || loadingMore" @click="nextCursor ? loadMore() : refresh()">다시 시도</button></div>
    <div v-if="loading && projects.length === 0" class="empty-state project-empty" role="status"><span class="loading-spinner" aria-hidden="true"></span><p>프로젝트를 불러오고 있어요.</p></div>
    <div v-else-if="!error && projects.length === 0" class="empty-state project-empty"><span class="empty-icon"><StudioIcon name="folder" /></span><h3>첫 프로젝트를 시작해 보세요</h3><p>만들고 싶은 음악마다 프로젝트를 나눠 관리할 수 있어요.<br />프로젝트와 이름은 이 컴퓨터에 저장됩니다.</p><span class="availability-note">프로젝트를 열어 작곡할 아이디어를 입력해 보세요.</span></div>
    <ul v-if="projects.length" class="project-grid" aria-label="저장한 프로젝트">
      <li v-for="project in projects" :key="project.id" class="project-card">
        <RouterLink :to="`/projects/${project.id}`" class="project-open" :aria-label="`${project.name} 프로젝트 열기`"><span class="project-cover"><StudioIcon name="folder" /></span><h3 :title="project.name">{{ project.name }}</h3><span class="project-track-count"><StudioIcon name="note" />{{ project.trackCount }}곡</span><dl class="project-dates"><div><dt>최근 수정</dt><dd><time :datetime="project.updatedAt">{{ projectDate(project.updatedAt) }}</time></dd></div><div><dt>만든 날짜</dt><dd><time :datetime="project.createdAt">{{ projectDate(project.createdAt) }}</time></dd></div></dl></RouterLink>
        <div class="project-actions"><button type="button" :aria-label="`${project.name} 이름 변경`" @click="openDialog('rename', project)"><StudioIcon name="edit" />이름 변경</button><button type="button" class="delete-action" :aria-label="`${project.name} 삭제`" @click="openDialog('delete', project)"><StudioIcon name="trash" />삭제</button></div>
      </li>
    </ul>
    <p v-if="loading && projects.length" class="list-status" role="status">프로젝트 목록을 새로고침하고 있어요.</p>
    <div v-if="nextCursor" class="load-more"><button type="button" class="button button-secondary" :disabled="loading || loadingMore" @click="loadMore">{{ loadingMore ? '불러오는 중…' : '프로젝트 더 보기' }}</button></div>
  </section>
  <ProjectDialog v-if="dialog" :mode="dialog.mode" :project="dialog.project" @close="dialog = null" @saved="saved" @deleted="deleted" />
</template>
