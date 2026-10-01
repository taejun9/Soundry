/**
 * 프로젝트 API의 mutation 헤더, 응답 모양, 파일 정리 경고와 충돌 안내를 검증한다.
 * 쓰기 응답 유실은 결과 불확실로 안내하고 중복 저장을 만드는 자동 재전송이 없는지 확인한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject, deleteProject, listProjects } from './projects';

const signal = () => new AbortController().signal;
// 전역 대역·scope·미디어 자원은 해당 테스트의 정리 훅에서 복구해 다음 사례를 오염시키지 않는다.
afterEach(() => { vi.unstubAllGlobals(); });

describe('project API client', () => {
  it('sends mutation headers and a JSON name without manually supplying an Origin', async () => {
    const payload = { id: 'project', name: '새 음악', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', trackCount: 0 };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createProject('새 음악', signal())).resolves.toEqual(payload);
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/projects');
    expect(options).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Soundry-Request': '1' }, body: JSON.stringify({ name: '새 음악' }) });
    expect(options.headers.Origin).toBeUndefined();
  });

  it('preserves cleanupPending and provides an actionable conflict error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ deleted: true, cleanupPending: true }))
      .mockResolvedValueOnce(Response.json({ error: { code: 'PROJECT_BUSY', message: 'conflict' } }, { status: 409 })));
    await expect(deleteProject('project', signal())).resolves.toEqual({ deleted: true, cleanupPending: true });
    await expect(deleteProject('project', signal())).rejects.toMatchObject({ status: 409, message: expect.stringContaining('진행 중인 음악 생성') });
  });

  it('rejects an invalid list instead of showing malformed server data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [{ id: 'bad' }], nextCursor: null })));
    await expect(listProjects(null, signal())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('explains uncertain write results without automatically resubmitting', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network error'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(createProject('작업', signal())).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringContaining('반영 여부를 확인') });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
