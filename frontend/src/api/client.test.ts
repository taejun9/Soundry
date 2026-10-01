import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from './client';
afterEach(() => vi.unstubAllGlobals());

describe('CLI preflight error boundary', () => {
  it.each([
    ['CLI_NOT_INSTALLED', '설치'],
    ['CLI_LOGIN_REQUIRED', '로그인'],
    ['CLI_AUTH_UNSUPPORTED', 'API 키 로그인은 지원하지 않습니다'],
    ['CLI_UNAVAILABLE', '상태를 확인'],
  ])('gives a safe actionable reason for %s without exposing server output', async (code, guidance) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error: { code, message: '/private/secret/path: raw CLI output' } }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const error = await requestJson('/projects/project-one/generations', { method: 'POST', body: {} }).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code, status: 503, message: expect.stringContaining(guidance) });
    expect(String(error)).not.toContain('/private/secret/path');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('continues to hide unknown internal errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'STORAGE_FAILED', message: 'Internal secret' } }, { status: 500 })));
    await expect(requestJson('/projects/project-one/generations', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'STORAGE_FAILED', message: '요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.' });
  });
});
