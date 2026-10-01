/**
 * 프롬프트 이력 페이지 추가, 새로고침과 오래된 응답의 경쟁을 검증한다.
 * 남은 음원이 없는 이력도 표시하고 조회 실패 뒤에는 기존 cursor와 무관하게 첫 페이지를 다시 확인한다.
 */
import { effectScope } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { Page, PromptSummary } from '../../../../shared/contracts';
import { usePromptHistory } from './usePromptHistory';
/** 음원이 없어도 보존되는 완료 작업 입력을 만들어 이력 조회에 사용한다. */
function prompt(id: string): PromptSummary { return { generationId: id, prompt: `Idea ${id}`, settings: {}, variationCount: 2, status: 'completed', trackCount: 0, createdAt: '2026-10-01T00:00:00.000Z' }; }
/** 응답 완료 순서를 테스트가 제어하여 늦은 응답과 화면 이탈 경쟁을 재현한다. */
function deferred() { let resolve!: (value: Page<PromptSummary>) => void; const promise = new Promise<Page<PromptSummary>>(done => { resolve = done; }); return { promise, resolve }; }

describe('prompt history retrieval', () => {
  it('paginates using the server cursor while preserving prompts with no remaining audio', async () => {
    const list = vi.fn().mockResolvedValueOnce({ items: [prompt('a')], nextCursor: 'cursor-a' }).mockResolvedValueOnce({ items: [prompt('a'), prompt('b')], nextCursor: null });
    const scope = effectScope(); const state = scope.run(() => usePromptHistory('project-one', list))!;
    await state.refresh(); await state.more();
    expect(list.mock.calls[1]?.[1]).toBe('cursor-a'); expect(state.items.value.map(item => item.generationId)).toEqual(['a', 'b']);
    expect(state.items.value[0]?.trackCount).toBe(0); scope.stop();
  });

  it('does not restore an old page after refresh or a response after changing projects', async () => {
    const old = deferred(); const leaving = deferred();
    const list = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [prompt('new')], nextCursor: null }).mockReturnValueOnce(leaving.promise);
    const scope = effectScope(); const state = scope.run(() => usePromptHistory('project-one', list))!;
    const first = state.refresh(); await state.refresh(); old.resolve({ items: [prompt('old')], nextCursor: 'old-cursor' }); await first;
    expect(state.items.value.map(item => item.generationId)).toEqual(['new']); expect(state.nextCursor.value).toBeNull();
    const pending = state.refresh(); scope.stop(); expect(list.mock.calls[2]?.[2].aborted).toBe(true);
    leaving.resolve({ items: [prompt('after-route')], nextCursor: null }); await pending;
    expect(state.items.value.map(item => item.generationId)).toEqual(['new']);
  });
  it('retries the first page after a refresh failure even when an older-page cursor remains', async () => {
    const oldItem = { ...prompt('latest'), trackCount: 2 };
    const updatedItem = { ...oldItem, trackCount: 0 };
    const list = vi.fn()
      .mockResolvedValueOnce({ items: [oldItem], nextCursor: 'older-cursor' })
      .mockRejectedValueOnce(new Error('refresh connection lost'))
      .mockResolvedValueOnce({ items: [updatedItem], nextCursor: 'older-cursor' });
    const scope = effectScope(); const state = scope.run(() => usePromptHistory('project-one', list))!;
    await state.refresh(); await state.refresh();
    expect(state.error.value).not.toBe('');
    expect(state.nextCursor.value).toBe('older-cursor');
    expect(state.items.value[0]?.trackCount).toBe(2);
    await state.refresh();
    expect(list.mock.calls.map(call => call[1])).toEqual([null, null, null]);
    expect(state.items.value[0]?.trackCount).toBe(0);
    expect(state.error.value).toBe('');
    scope.stop();
  });

});
