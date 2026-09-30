import { effectScope, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import * as generationApi from '../../api/generations';
import type { CreateGenerationRequest, GenerationSummary, Page } from '../../../../shared/contracts';
import { forgetGenerationRequest, useGenerations } from './useGenerations';
import { jobFixture, trackFixture } from './test-fixtures';

const scopes: EffectScope[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function setup() {
  const api = {
    ...generationApi,
    listGenerations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    getGeneration: vi.fn().mockResolvedValue(jobFixture()),
    createGeneration: vi.fn().mockImplementation(async (_id: string, body: CreateGenerationRequest) => jobFixture({ ...body })),
    cancelGeneration: vi.fn().mockResolvedValue(jobFixture({ status: 'cancelled', finishedAt: '2026-10-01T00:00:03.000Z' })),
  };
  const changed = vi.fn();
  const scope = effectScope(); scopes.push(scope);
  const state = scope.run(() => useGenerations('project-one', changed, api))!;
  return { api, state, scope, changed };
}
beforeEach(() => { vi.useFakeTimers(); forgetGenerationRequest('project-one'); });
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); forgetGenerationRequest('project-one'); vi.useRealTimers(); });

describe('generation request lifecycle', () => {
  it('keeps an immutable uncertain request and reconfirms with its original key only on user action', async () => {
    const { api, state } = setup();
    api.createGeneration.mockRejectedValueOnce(new ApiError('offline', 0, 'NETWORK_ERROR'));
    const input = { prompt: 'Original prompt', settings: { mode: 'instrumental' as const }, variationCount: 2 };
    await state.submit(input);
    const firstBody = api.createGeneration.mock.calls[0]?.[1];
    input.prompt = 'Edited after submitting';
    input.settings.mode = 'instrumental';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(api.createGeneration).toHaveBeenCalledTimes(1);
    await state.submit({ prompt: 'A different request', settings: {}, variationCount: 1 });
    expect(api.createGeneration).toHaveBeenCalledTimes(1);
    await state.confirmSubmission();
    expect(api.createGeneration.mock.calls[1]?.[1]).toEqual(firstBody);
    expect(api.createGeneration.mock.calls[1]?.[1].prompt).toBe('Original prompt');
    expect(state.uncertain.value).toBeNull();
  });

  it('blocks double submission while the original POST is pending', async () => {
    const { api, state } = setup();
    const pending = deferred<GenerationSummary>(); api.createGeneration.mockReturnValueOnce(pending.promise);
    const sending = state.submit({ prompt: 'One request', settings: {}, variationCount: 1 });
    await state.submit({ prompt: 'Duplicate click', settings: {}, variationCount: 1 });
    expect(api.createGeneration).toHaveBeenCalledTimes(1);
    pending.resolve(jobFixture({ requestKey: api.createGeneration.mock.calls[0]?.[1].requestKey }));
    await sending;
    expect(state.submitting.value).toBe(false);
  });

  it('retries as a new job and preserves the original cancelled history', async () => {
    const { api, state } = setup();
    const original = jobFixture({ status: 'cancelled' });
    api.listGenerations.mockResolvedValueOnce({ items: [original], nextCursor: null });
    api.createGeneration.mockImplementationOnce(async (_id: string, body: CreateGenerationRequest) => jobFixture({ ...body, id: 'retry-job' }));
    await state.refresh(); await state.retry(original);
    const sent = api.createGeneration.mock.calls[0]?.[1];
    expect(sent.sourceGenerationId).toBe(original.id);
    expect(sent.requestKey).not.toBe(original.requestKey);
    expect(state.jobs.value.find(job => job.id === original.id)?.status).toBe('cancelled');
    expect(state.jobs.value).toHaveLength(2);
  });

  it('does not let a delayed processing response undo confirmed cancellation', async () => {
    const { api, state } = setup();
    const pending = deferred<GenerationSummary>();
    api.listGenerations.mockResolvedValueOnce({ items: [jobFixture({ status: 'processing' })], nextCursor: null });
    api.getGeneration.mockReturnValueOnce(pending.promise);
    await state.refresh(); await vi.advanceTimersByTimeAsync(2000);
    await state.cancel('job-one');
    pending.resolve(jobFixture({ status: 'processing' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.jobs.value[0]?.status).toBe('cancelled');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts completion when completion wins the cancel race', async () => {
    const { api, state, changed } = setup();
    api.listGenerations.mockResolvedValueOnce({ items: [jobFixture({ status: 'processing' })], nextCursor: null });
    api.cancelGeneration.mockResolvedValueOnce(jobFixture({ status: 'completed', tracks: [trackFixture()] }));
    await state.refresh(); await state.cancel('job-one');
    expect(state.jobs.value[0]?.status).toBe('completed');
    expect(state.jobs.value[0]?.tracks).toHaveLength(1);
    expect(changed).toHaveBeenCalled();
  });

  it.each(['completed', 'failed', 'cancelled'] as const)('ignores a late cancel network failure after polling confirms %s', async (status) => {
    const { api, state } = setup();
    const cancellation = deferred<GenerationSummary>();
    api.listGenerations.mockResolvedValueOnce({ items: [jobFixture({ status: 'processing' })], nextCursor: null });
    api.cancelGeneration.mockReturnValueOnce(cancellation.promise);
    api.getGeneration.mockResolvedValueOnce(jobFixture({ status, tracks: status === 'completed' ? [trackFixture()] : [] }));
    await state.refresh();
    const cancelling = state.cancel('job-one');
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.jobs.value[0]?.status).toBe(status);
    cancellation.reject(new ApiError('offline', 0, 'NETWORK_ERROR'));
    await cancelling;
    expect(state.actionErrors.value['job-one']).toBeUndefined();
    expect(state.cancelling.value.has('job-one')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a cancel network failure visible while the job is still pending, then clears it on confirmed completion', async () => {
    const { api, state } = setup();
    api.listGenerations.mockResolvedValueOnce({ items: [jobFixture({ status: 'processing' })], nextCursor: null });
    api.cancelGeneration.mockRejectedValueOnce(new ApiError('offline', 0, 'NETWORK_ERROR'));
    api.getGeneration.mockResolvedValueOnce(jobFixture({ status: 'completed', tracks: [trackFixture()] }));
    await state.refresh();
    await state.cancel('job-one');
    expect(state.actionErrors.value['job-one']).toBeTruthy();
    expect(state.jobs.value[0]?.status).toBe('processing');
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.jobs.value[0]?.status).toBe('completed');
    expect(state.actionErrors.value['job-one']).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off a connection failure without changing the job to failed and stops after completion', async () => {
    const { api, state } = setup();
    api.listGenerations.mockResolvedValueOnce({ items: [jobFixture({ status: 'processing' })], nextCursor: null });
    api.getGeneration.mockRejectedValueOnce(new ApiError('offline', 0, 'NETWORK_ERROR')).mockResolvedValueOnce(jobFixture({ status: 'completed', tracks: [trackFixture()] }));
    await state.refresh(); await vi.advanceTimersByTimeAsync(2000);
    expect(state.jobs.value[0]?.status).toBe('processing');
    expect(state.retrySeconds.value).toBe(4);
    await vi.advanceTimersByTimeAsync(3999);
    expect(api.getGeneration).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.jobs.value[0]?.status).toBe('completed');
    expect(state.syncError.value).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a late response after leaving the project and aborts pending HTTP', async () => {
    const { api, state, scope } = setup();
    const pending = deferred<Page<GenerationSummary>>(); api.listGenerations.mockReturnValueOnce(pending.promise);
    const request = state.refresh();
    scope.stop();
    expect(api.listGenerations.mock.calls[0]?.[2].aborted).toBe(true);
    pending.resolve({ items: [jobFixture()], nextCursor: null }); await request;
    expect(state.jobs.value).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers an uncertain request after a route change through saved server history', async () => {
    const first = setup();
    const pending = deferred<GenerationSummary>(); first.api.createGeneration.mockReturnValueOnce(pending.promise);
    const sending = first.state.submit({ prompt: 'Route-safe request', settings: {}, variationCount: 1 });
    const body = first.api.createGeneration.mock.calls[0]?.[1];
    first.scope.stop();
    pending.resolve(jobFixture({ ...body })); await sending;
    const second = setup();
    expect(second.state.uncertain.value?.requestKey).toBe(body.requestKey);
    second.api.listGenerations.mockResolvedValueOnce({ items: [jobFixture({ ...body })], nextCursor: null });
    await second.state.refresh();
    expect(second.state.uncertain.value).toBeNull();
    expect(second.api.createGeneration).not.toHaveBeenCalled();
  });

  it('does not discard an accepted completed job when an older initial empty list arrives', async () => {
    const { api, state } = setup();
    const initial = deferred<Page<GenerationSummary>>(); api.listGenerations.mockReturnValueOnce(initial.promise);
    const listing = state.refresh();
    api.createGeneration.mockImplementationOnce(async (_id: string, body: CreateGenerationRequest) => jobFixture({ ...body, status: 'completed', tracks: [trackFixture()] }));
    await state.submit({ prompt: 'Latest request', settings: {}, variationCount: 1 });
    initial.resolve({ items: [], nextCursor: null }); await listing;
    expect(state.jobs.value).toHaveLength(1);
    expect(state.jobs.value[0]?.status).toBe('completed');
  });
});
