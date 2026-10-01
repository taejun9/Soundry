/**
 * 즐겨찾기 API의 필터·cursor와 공개 음원 계약을 검사한다.
 * 정상 로컬 URL만 허용하고 favorite/project 필터에 맞지 않는 서버 응답은 화면에 넣지 않는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listFavorites, parseLibraryTrack } from './library';
import { trackFixture } from '../features/generation/test-fixtures';
const item = () => ({ ...trackFixture(), favorite: true, projectName: 'Project name' });
// 전역 대역·scope·미디어 자원은 해당 테스트의 정리 훅에서 복구해 다음 사례를 오염시키지 않는다.
afterEach(() => vi.unstubAllGlobals());
/** 실제 서버 없이 지정 JSON 응답으로 API 검증 경계를 실행한다. */
function respond(value: unknown) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }))); }
describe('favorite library API boundary', () => {
  it('keeps unknown metadata nullable and requires project metadata and safe local media URLs', () => {
    expect(parseLibraryTrack(item()).bpm).toBeNull();
    for (const changed of [{ projectName: '' }, { projectName: null }, { audioUrl: 'https://provider.invalid/audio' }, { downloadUrl: '/wrong' }, { durationSeconds: -1 }]) expect(() => parseLibraryTrack({ ...item(), ...changed })).toThrow();
  });
  it('uses favorite and stable pagination filters and preserves the server cursor', async () => {
    respond({ items: [item()], nextCursor: 'next-page' });
    const result = await listFavorites('cursor+a', new AbortController().signal, 'project-one');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/tracks?favorite=true&limit=30&cursor=cursor%2Ba&projectId=project-one');
    expect(result.nextCursor).toBe('next-page');
  });
  it.each([{ favorite: false }, { projectId: 'another-project' }])('rejects tracks outside the requested filter', async changed => {
    respond({ items: [{ ...item(), ...changed }], nextCursor: null });
    await expect(listFavorites(null, new AbortController().signal, 'project-one')).rejects.toMatchObject({ code: 'INVALID_LIBRARY_RESPONSE' });
  });
});
