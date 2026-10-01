/**
 * 프로젝트 cursor 목록의 중복 제거와 오래된 응답 차단을 검증한다.
 * Vue scope를 화면 수명으로 사용하여 이동 후 요청 취소와 새로고침의 첫 페이지 복귀를 확인한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import { useProjects } from './useProjects';

const project = (id: string, name = id) => ({ id, name, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', trackCount: 0 });
const scopes: EffectScope[] = [];
/** 각 사례에 독립된 API 대역과 상태 수명을 만들어 다른 테스트의 요청/상태가 섞이지 않게 한다. */
function setup() {
  const scope = effectScope();
  scopes.push(scope);
  const state = scope.run(useProjects);
  if (!state) throw new Error('Scope did not initialize');
  return { state, scope };
}
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

// 전역 대역·scope·미디어 자원은 해당 테스트의 정리 훅에서 복구해 다음 사례를 오염시키지 않는다.
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); });

describe('project list request boundaries', () => {
  it('ignores an older response when refresh supersedes a pending page', async () => {
    const oldResponse = deferredResponse();
    const currentResponse = deferredResponse();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(currentResponse.promise));
    const { state } = setup();
    const oldRequest = state.refresh();
    const newRequest = state.refresh();
    currentResponse.resolve(Response.json({ items: [project('current')], nextCursor: null }));
    await newRequest;
    oldResponse.resolve(Response.json({ items: [project('old')], nextCursor: 'stale-cursor' }));
    await oldRequest;
    expect(state.projects.value.map(item => item.id)).toEqual(['current']);
    expect(state.nextCursor.value).toBeNull();
    expect(state.error.value).toBe('');
  });

  it('keeps loaded items on a page failure, retries its cursor and resets pagination on refresh', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ items: [project('one')], nextCursor: 'page-two' }))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json({ items: [project('two')], nextCursor: 'page-three' }))
      .mockResolvedValueOnce(Response.json({ items: [project('new')], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);
    const { state } = setup();
    await state.refresh();
    await state.loadMore();
    expect(state.projects.value).toHaveLength(1);
    expect(state.nextCursor.value).toBe('page-two');
    expect(state.error.value).toContain('로컬 서버');
    await state.loadMore();
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/projects?limit=30&cursor=page-two');
    expect(state.projects.value.map(item => item.id)).toEqual(['one', 'two']);
    await state.refresh();
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/projects?limit=30');
    expect(state.projects.value.map(item => item.id)).toEqual(['new']);
  });

  it('does not commit a late result after the view is disposed', async () => {
    const response = deferredResponse();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response.promise));
    const { state, scope } = setup();
    const request = state.refresh();
    scope.stop();
    response.resolve(Response.json({ items: [project('late')], nextCursor: null }));
    await request;
    expect(state.projects.value).toEqual([]);
    expect(state.error.value).toBe('');
  });
});
