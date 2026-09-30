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
