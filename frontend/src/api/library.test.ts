import { afterEach, describe, expect, it, vi } from 'vitest';
import { listFavorites, parseLibraryTrack } from './library';
import { trackFixture } from '../features/generation/test-fixtures';
const item = () => ({ ...trackFixture(), favorite: true, projectName: 'Project name' });
afterEach(() => vi.unstubAllGlobals());
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
