import { computed, onScopeDispose, ref } from 'vue';
import type { CreateGenerationRequest, GenerationInput, GenerationSummary, TrackSummary } from '../../../../shared/contracts';
import * as generationApi from '../../api/generations';
import { ApiError, errorMessage } from '../../api/client';

export const isPending = (job: GenerationSummary) => job.status === 'queued' || job.status === 'processing';
const uncertainRequests = new Map<string, CreateGenerationRequest>();
export function forgetGenerationRequest(projectId: string) { uncertainRequests.delete(projectId); }

export function useGenerations(projectId: string, projectChanged: () => void, api = generationApi) {
  const jobs = ref<GenerationSummary[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const syncError = ref('');
  const retrySeconds = ref(0);
  const submitting = ref(false);
  const submitError = ref('');
  const notice = ref('');
  const uncertain = ref<CreateGenerationRequest | null>(uncertainRequests.get(projectId) ?? null);
  const cancelling = ref(new Set<string>());
  const actionErrors = ref<Record<string, string>>({});
  const pendingCount = computed(() => jobs.value.filter(isPending).length);
  const controllers = new Set<AbortController>();
  let disposed = false;
  let listSequence = 0;
  let listController: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let polling = false;
  let failures = 0;
  let revision = 0;
  let trackRevision = 0;
  const trackChanges = new Map<string, number>();
  let needsList = false;

  function controller() { const current = new AbortController(); controllers.add(current); return current; }
  function clearUncertain(key: string) {
    if (uncertain.value?.requestKey === key) {
      uncertain.value = null;
      uncertainRequests.delete(projectId);
      submitError.value = '';
    }
  }
  function merge(incoming: GenerationSummary[], replace = false, observedTracks = trackRevision) {
    const previous = new Map(jobs.value.map(job => [job.id, job]));
    const kept = replace ? jobs.value.filter(isPending) : jobs.value;
    const combined = new Map(kept.map(job => [job.id, job]));
    let changed = false;
    for (let job of incoming) {
      const old = previous.get(job.id);
      // A delayed GET must not undo a cancellation/completion already acknowledged by the server.
      if (old && !isPending(old) && isPending(job)) { combined.set(old.id, old); continue; }
      if (old && (trackChanges.get(job.id) ?? 0) > observedTracks) job = { ...job, tracks: old.tracks };
      combined.set(job.id, job);
      clearUncertain(job.requestKey);
      if (!isPending(job)) delete actionErrors.value[job.id];
      if ((!old && job.status === 'completed') || (old && old.status !== job.status && !isPending(job))) changed = true;
    }
    jobs.value = [...combined.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    revision++;
    if (changed) projectChanged();
  }
  function schedule() {
    if (timer) clearTimeout(timer);
    if (disposed || (!pendingCount.value && !needsList)) return;
    retrySeconds.value = failures ? Math.min(30, 2 ** Math.min(failures + 1, 5)) : 2;
    timer = setTimeout(() => { void poll(); }, retrySeconds.value * 1000);
  }
  function syncFailed(reason: unknown) {
    failures++;
    syncError.value = errorMessage(reason);
  }
  async function loadPage(append = false) {
    if (disposed || (append && (loading.value || loadingMore.value || !nextCursor.value))) return;
    listController?.abort();
    const current = controller(); listController = current;
    const request = ++listSequence;
    const observedRevision = revision;
    const observedTracks = trackRevision;
    const cursor = append ? nextCursor.value : null;
    loading.value = !append;
    loadingMore.value = append;
    try {
      const page = await api.listGenerations(projectId, cursor, current.signal);
      if (disposed || request !== listSequence) return;
      merge(page.items, !append && revision === observedRevision, observedTracks);
      nextCursor.value = page.nextCursor;
      syncError.value = ''; failures = 0; needsList = false;
    } catch (reason) {
      if (!disposed && request === listSequence && !current.signal.aborted) { syncFailed(reason); needsList = true; }
    } finally {
      controllers.delete(current);
      if (!disposed && request === listSequence) { loading.value = false; loadingMore.value = false; schedule(); }
    }
  }
  async function poll() {
    if (disposed || polling) return;
    if (needsList) { await loadPage(); return; }
    const active = jobs.value.filter(isPending);
    if (!active.length) return;
    polling = true;
    const observedTracks = trackRevision;
    const current = controller();
    try {
      const results = await Promise.allSettled(active.map(job => api.getGeneration(projectId, job.id, current.signal)));
      if (disposed) return;
      const updated: GenerationSummary[] = [];
      let failure: unknown;
      for (const result of results) {
        if (result.status === 'fulfilled') updated.push(result.value);
        else failure = result.reason;
      }
      merge(updated, false, observedTracks);
      if (failure) syncFailed(failure);
      else { syncError.value = ''; failures = 0; }
    } finally {
      polling = false; controllers.delete(current); schedule();
    }
  }
  async function send(body: CreateGenerationRequest) {
    if (disposed || submitting.value) return;
    const current = controller();
    const observedTracks = trackRevision;
    submitting.value = true; submitError.value = ''; notice.value = '';
    uncertain.value = body; uncertainRequests.set(projectId, body);
    try {
      const job = await api.createGeneration(projectId, body, current.signal);
      if (disposed) return;
      merge([job], false, observedTracks);
      clearUncertain(body.requestKey);
      notice.value = '작업을 접수했어요. 이 페이지를 이동해도 서버에서 계속 처리합니다.';
      projectChanged();
    } catch (reason) {
      if (disposed) return;
      if (!uncertain.value || uncertain.value.requestKey !== body.requestKey) return;
      if (reason instanceof ApiError && reason.status >= 400 && reason.status < 500 && reason.status !== 408) {
        clearUncertain(body.requestKey);
        submitError.value = errorMessage(reason);
      } else {
        submitError.value = '접수 결과를 확인하지 못했어요. 작업 실패를 뜻하지 않습니다. 아래에서 같은 요청의 접수 여부를 확인해 주세요.';
      }
    } finally {
      controllers.delete(current);
      if (!disposed) { submitting.value = false; schedule(); }
    }
  }
  async function submit(input: GenerationInput, sourceGenerationId?: string) {
    if (submitting.value || uncertain.value || disposed) return;
    const body = Object.freeze({ prompt: input.prompt, settings: Object.freeze({ ...input.settings }), variationCount: input.variationCount, requestKey: crypto.randomUUID(), ...(sourceGenerationId ? { sourceGenerationId } : {}) });
    await send(body);
  }
  async function confirmSubmission() {
    if (uncertain.value && !submitting.value) await send(uncertain.value);
  }
  async function cancel(id: string) {
    const job = jobs.value.find(item => item.id === id);
    if (!job || !isPending(job) || cancelling.value.has(id) || disposed) return;
    const current = controller();
    const observedTracks = trackRevision;
    cancelling.value.add(id); delete actionErrors.value[id];
    try {
      const result = await api.cancelGeneration(projectId, id, current.signal);
      if (disposed) return;
      merge([result], false, observedTracks);
      notice.value = result.status === 'cancelled' ? '작업을 취소했어요.' : '이미 종료된 작업입니다. 서버의 최종 결과를 표시합니다.';
    } catch (reason) {
      const latest = jobs.value.find(item => item.id === id);
      // Polling may have confirmed the terminal result while this POST was in flight.
      if (!disposed && latest && isPending(latest)) actionErrors.value[id] = reason instanceof ApiError && reason.status >= 400 && reason.status < 500
        ? errorMessage(reason) : '취소 결과를 확인하지 못했어요. 작업 상태를 다시 조회하고 있습니다.';
    } finally {
      controllers.delete(current);
      if (!disposed) { cancelling.value.delete(id); schedule(); }
    }
  }
  async function retry(job: GenerationSummary) {
    if (job.status !== 'failed' && job.status !== 'cancelled') return;
    await submit({ prompt: job.prompt, settings: job.settings, variationCount: job.variationCount }, job.id);
  }
  function changeTrack(track: TrackSummary, deleted = false) {
    listSequence++; listController?.abort(); loading.value = false; loadingMore.value = false;
    jobs.value = jobs.value.map(job => job.id === track.generationId ? { ...job, tracks: deleted ? job.tracks.filter(item => item.id !== track.id) : job.tracks.map(item => item.id === track.id ? track : item) } : job);
    revision++; trackChanges.set(track.generationId, ++trackRevision);
    // The invalidated list request cannot schedule its own retry in finally.
    schedule();
  }
  async function revealGeneration(id: string) {
    const observedTracks = trackRevision;
    const current = controller();
    try { const job = await api.getGeneration(projectId, id, current.signal); if (disposed) return false; merge([job], false, observedTracks); schedule(); return true; }
    finally { controllers.delete(current); }
  }
  onScopeDispose(() => {
    disposed = true; listSequence++;
    if (timer) clearTimeout(timer);
    controllers.forEach(current => current.abort());
    controllers.clear();
  });
  return { jobs, nextCursor, loading, loadingMore, syncError, retrySeconds, pendingCount, submitting, submitError, uncertain, notice, cancelling, actionErrors, refresh: () => loadPage(), loadMore: () => loadPage(true), submit, confirmSubmission, cancel, retry, changeTrack, revealGeneration };
}
