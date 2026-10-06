/**
 * 프로젝트 목록, 작업 공간, 보관함과 404 화면의 SPA 경로를 정의한다.
 * 문서 제목과 이동 후 스크롤은 라우터가 갱신하고 실제 음악 재생은 App의 단일 controller가 유지한다.
 */
import { createRouter, createWebHistory } from 'vue-router';
import LandingView from '../features/marketing/LandingView.vue';
import PricingView from '../features/marketing/PricingView.vue';
import AccountView from '../features/members/AccountView.vue';
import { refreshSession, session } from '../features/members/session';
import ProjectsView from '../features/projects/ProjectsView.vue';
import WorkspaceView from '../features/generation/WorkspaceView.vue';
import LibraryView from '../features/library/LibraryView.vue';
import NotFoundView from './NotFoundView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LandingView, meta: { title: '음악이 시작되는 곳', public: true } },
    { path: '/pricing', component: PricingView, meta: { title: '상품 및 등급', public: true } },
    { path: '/account', component: AccountView, meta: { title: '내 계정', public: true } },
    { path: '/projects', component: ProjectsView, meta: { title: '프로젝트' } },
    { path: '/workspace', component: WorkspaceView, meta: { title: '작업 공간' } },
    { path: '/projects/:id', component: WorkspaceView, meta: { title: '작업 공간' } },
    { path: '/library', component: LibraryView, meta: { title: '보관함' } },
    { path: '/:pathMatch(.*)*', component: NotFoundView, meta: { title: '페이지 없음' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  try {
    await refreshSession();
    if (!session.member) return '/account';
  } catch {
    /* The view supplies the local connection error. */
  }
  return true;
});

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? '스튜디오')} · Soundry`;
});
