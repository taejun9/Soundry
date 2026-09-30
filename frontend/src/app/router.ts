import { createRouter, createWebHistory } from 'vue-router';
import ProjectsView from '../features/projects/ProjectsView.vue';
import WorkspaceView from '../features/generation/WorkspaceView.vue';
import LibraryView from '../features/library/LibraryView.vue';
import NotFoundView from './NotFoundView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: ProjectsView, meta: { title: '프로젝트' } },
    { path: '/workspace', component: WorkspaceView, meta: { title: '작업 공간' } },
    { path: '/projects/:id', component: WorkspaceView, meta: { title: '작업 공간' } },
    { path: '/library', component: LibraryView, meta: { title: '보관함' } },
    { path: '/:pathMatch(.*)*', component: NotFoundView, meta: { title: '페이지 없음' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? '스튜디오')} · Soundry`;
});
