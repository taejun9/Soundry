import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentProvider } from './provider';

const response = { id: 'mock', model: 'demo-fixture', isMock: true, configured: true, generationEnabled: false, notice: 'Demo fixture only', capabilities: { modes: ['instrumental'], settings: [], maxVariations: 4, seedSupported: false, canCancelRemote: false } };
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
