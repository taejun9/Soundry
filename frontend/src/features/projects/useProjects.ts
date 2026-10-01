/**
 * 프로젝트 목록과 cursor 페이지의 조회 상태를 관리한다.
 * 갱신일로 정렬되는 목록이므로 새로고침에서는 예전 cursor를 버리고 같은 ID는 중복으로 붙이지 않는다.
 */
import { onScopeDispose, ref } from 'vue';
import type { ProjectSummary } from '../../../../shared/contracts';
import { listProjects } from '../../api/projects';
import { errorMessage } from '../../api/client';

export function useProjects() {
  const projects = ref<ProjectSummary[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const error = ref('');
  let controller: AbortController | undefined;
  let sequence = 0;

  /** 첫 페이지 갱신과 더 보기를 구분한다. 새로고침으로 순서가 바뀔 수 있어 기존 cursor는 즉시 무효화한다. */
  async function load(append: boolean) {
    if (append && (loading.value || loadingMore.value || !nextCursor.value)) return;
    const cursor = append ? nextCursor.value : null;
    controller?.abort();
    controller = new AbortController();
    const currentController = controller;
    const request = ++sequence;
    loading.value = !append;
    loadingMore.value = append;
    error.value = '';
    if (!append) nextCursor.value = null;
    try {
      const page = await listProjects(cursor, currentController.signal);
      if (request !== sequence) return;
      projects.value = append
        ? [...new Map([...projects.value, ...page.items].map(project => [project.id, project])).values()]
        : page.items;
      nextCursor.value = page.nextCursor;
    } catch (reason) {
      if (request === sequence && !currentController.signal.aborted) error.value = errorMessage(reason);
    } finally {
      if (request === sequence) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  onScopeDispose(() => { sequence++; controller?.abort(); });
  return { projects, nextCursor, loading, loadingMore, error, refresh: () => load(false), loadMore: () => load(true) };
}
