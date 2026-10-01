/**
 * 공급자 조회가 생성 호출 없이 지원 설정만 읽는지 검증한다.
 * 폼을 잘못 활성화할 수 있는 타입 오류·빈 mode·뒤집힌 범위 등을 파라미터화하여 차단한다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentProvider } from './provider';

const response = { id: 'mock', model: 'demo-fixture', isMock: true, configured: true, generationEnabled: false, notice: 'Demo fixture only', capabilities: { modes: ['instrumental'], settings: [], maxVariations: 4, seedSupported: false, canCancelRemote: false } };
// 전역 대역·scope·미디어 자원은 해당 테스트의 정리 훅에서 복구해 다음 사례를 오염시키지 않는다.
afterEach(() => { vi.unstubAllGlobals(); });
describe('provider capability response boundary', () => {
  it('loads the provider without enabling generation or requesting music', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchCurrentProvider(new AbortController().signal)).resolves.toEqual(response);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/providers/current');
    expect(fetchMock.mock.calls[0]?.[1].method).toBe('GET');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...response, generationEnabled: 'false' },
    { ...response, capabilities: { ...response.capabilities, modes: [] } },
    { ...response, capabilities: { ...response.capabilities, settings: ['unknown'] } },
    { ...response, capabilities: { ...response.capabilities, maxVariations: 0 } },
    { ...response, capabilities: { ...response.capabilities, durationRangeSeconds: { min: 180, max: 90 } } },
  ])('rejects malformed capabilities before they control the form', async payload => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(fetchCurrentProvider(new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_PROVIDER_RESPONSE' });
  });
});
