/**
 * 프로젝트 생성 이력과 접수·취소·조회 재시도를 연결하는 composable. 서버의 작업 상태를 기준으로 삼는다.
 * 불확실한 POST는 같은 requestKey로 사용자가 재확인하고, 자동 처리는 생성 작업과 이력의 읽기 재조회에 한정한다.
 */
import { computed, onScopeDispose, ref } from 'vue';
import type { CreateGenerationRequest, GenerationInput, GenerationSummary, TrackSummary } from '../../../../shared/contracts';
import * as generationApi from '../../api/generations';
import { ApiError, errorMessage, isCliSetupError } from '../../api/client';

export const isPending = (job: GenerationSummary) => job.status === 'queued' || job.status === 'processing';
// 라우트 이동 뒤에도 같은 탭에서는 접수 여부를 재확인할 수 있다. 새로고침을 넘는 영구 저장은 하지 않는다.
const uncertainRequests = new Map<string, CreateGenerationRequest>();
/** 삭제한 프로젝트의 접수 확인 대기를 탭 메모리에서 제거한다. */
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
  // 목록과 음원 편집의 revision을 분리해 새 작업 보존과 개별 track 수정 보존을 독립적으로 판단한다.
  let revision = 0;
  let trackRevision = 0;
  const trackChanges = new Map<string, number>();
  let needsList = false;

  /** 모든 진행 중 HTTP를 등록해 scope 종료 시 한 번에 취소할 수 있게 한다. */
  function controller() { const current = new AbortController(); controllers.add(current); return current; }
  /** 같은 requestKey의 서버 결과를 확인한 경우에만 접수 불확실성을 해소한다. */
  function clearUncertain(key: string) {
    if (uncertain.value?.requestKey === key) {
      uncertain.value = null;
      uncertainRequests.delete(projectId);
      submitError.value = '';
    }
  }
  /** 서버의 terminal 상태와 이후 음원 편집을 이전 GET이 되돌리지 않도록 버전별로 병합한다. */
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
  /** 진행 작업/목록 복구가 필요할 때만 단일 timer를 둔다. 실패 시 간격을 늘리되 30초를 넘지 않는다. */
  function schedule() {
    if (timer) clearTimeout(timer);
    if (disposed || (!pendingCount.value && !needsList)) return;
    retrySeconds.value = failures ? Math.min(30, 2 ** Math.min(failures + 1, 5)) : 2;
    timer = setTimeout(() => { void poll(); }, retrySeconds.value * 1000);
  }
  /** 연결 오류는 조회 실패로만 기록한다. 서버 작업 자체를 failed로 추정하지 않는다. */
  function syncFailed(reason: unknown) {
    failures++;
    syncError.value = errorMessage(reason);
  }
  /** 조회 시작 시 목록/음원 revision을 캡처해 응답 대기 중 접수·편집된 항목이 사라지지 않게 한다. */
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
      return page.items;
    } catch (reason) {
      if (!disposed && request === listSequence && !current.signal.aborted) { syncFailed(reason); needsList = true; }
    } finally {
      controllers.delete(current);
      if (!disposed && request === listSequence) { loading.value = false; loadingMore.value = false; schedule(); }
    }
  }
  /** 현재 pending 작업을 각각 읽고 일부 조회가 실패해도 성공한 결과는 반영한다. */
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
  /** 전송 전에 immutable 요청을 보관한다. 확정 거부만 해제하고 응답 유실은 같은 key의 사용자 재확인을 기다린다. */
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
      if (reason instanceof ApiError && ((reason.status >= 400 && reason.status < 500 && reason.status !== 408) || isCliSetupError(reason))) {
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
  /** 새 제출에만 UUID를 만들고 입력을 복사·동결한다. 미확인 요청이 있으면 다른 새 요청을 막는다. */
  async function submit(input: GenerationInput, sourceGenerationId?: string) {
    if (submitting.value || uncertain.value || disposed) return;
    const body = Object.freeze({ prompt: input.prompt, settings: Object.freeze({ ...input.settings }), variationCount: input.variationCount, requestKey: crypto.randomUUID(), ...(sourceGenerationId ? { sourceGenerationId } : {}) });
    await send(body);
  }
  /** 사용자가 확인을 누른 경우에만 원래 입력과 requestKey를 그대로 재전송한다. */
  async function confirmSubmission() {
    if (uncertain.value && !submitting.value) await send(uncertain.value);
  }
  /** 취소와 완료 경쟁은 서버 최종 응답을 따른다. 요청 중 polling이 종료를 확인했다면 늦은 네트워크 오류를 숨긴다. */
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
  /** 실패/취소 작업만 원본 계보를 가진 새 Generation으로 제출하며 과거 상태를 되돌리지 않는다. */
  async function retry(job: GenerationSummary) {
    if (job.status !== 'failed' && job.status !== 'cancelled') return;
    await submit({ prompt: job.prompt, settings: job.settings, variationCount: job.variationCount }, job.id);
  }
  /** 확정된 음원 편집을 반영하고 이전 목록/음원 버전을 무효화한다. 중단된 조회 대신 polling 예약도 복구한다. */
  function changeTrack(track: TrackSummary, deleted = false) {
    listSequence++; listController?.abort(); loading.value = false; loadingMore.value = false;
    jobs.value = jobs.value.map(job => job.id === track.generationId ? { ...job, tracks: deleted ? job.tracks.filter(item => item.id !== track.id) : job.tracks.map(item => item.id === track.id ? track : item) } : job);
    revision++; trackChanges.set(track.generationId, ++trackRevision);
    // The invalidated list request cannot schedule its own retry in finally.
    schedule();
  }
  /** 현재 페이지 밖의 과거 결과를 단일 조회로 병합하여 프롬프트 이력에서 해당 카드로 이동할 수 있게 한다. */
  async function revealGeneration(id: string) {
    const observedTracks = trackRevision;
    const current = controller();
    try { const job = await api.getGeneration(projectId, id, current.signal); if (disposed) return false; merge([job], false, observedTracks); schedule(); return true; }
    finally { controllers.delete(current); }
  }
  // 로컬 HTTP와 timer만 정리한다. 이미 접수된 서버 작업을 화면 이탈만으로 취소하지 않는다.
  onScopeDispose(() => {
    disposed = true; listSequence++;
    if (timer) clearTimeout(timer);
    controllers.forEach(current => current.abort());
    controllers.clear();
  });
  return { jobs, nextCursor, loading, loadingMore, syncError, retrySeconds, pendingCount, submitting, submitError, uncertain, notice, cancelling, actionErrors, refresh: () => loadPage(), loadMore: () => loadPage(true), submit, confirmSubmission, cancel, retry, changeTrack, revealGeneration };
}
