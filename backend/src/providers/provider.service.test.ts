import { describe, expect, it } from 'vitest';
import { ProviderService, readMusicProvider } from './provider.service.js';

describe('selected provider configuration', () => {
  it('defaults to mock and accepts only the explicit mock value', () => {
    expect(readMusicProvider(undefined)).toBe('mock');
    expect(readMusicProvider('mock')).toBe('mock');
    const providers = new ProviderService('mock');
    expect(providers.current.id).toBe('mock');
    expect(providers.summary()).toMatchObject({ id: 'mock', model: 'demo-fixture', generationEnabled: true, isMock: true, configured: true });
    expect(providers.summary().capabilities).toEqual(providers.current.capabilities);
  });

  it('rejects unknown, empty, or malformed values without reflecting them', () => {
    for (const value of ['fal', '', 'MOCK', ' mock ', 'https://example.test/private?key=example', '../mock']) {
      expect(() => new ProviderService(value)).toThrow(/^INVALID_MUSIC_PROVIDER$/);
    }
  });

  it('returns only public, independent summary data', () => {
    const providers = new ProviderService('mock');
    const summary = providers.summary();
    expect(Object.keys(summary).sort()).toEqual(['capabilities', 'configured', 'generationEnabled', 'id', 'isMock', 'model', 'notice']);
    expect(summary.notice).toContain('고정된');
    expect(summary.notice).toContain('프롬프트가 음원을 바꾸지 않으며');
    summary.capabilities.modes.push('vocal');
    expect(providers.summary().capabilities.modes).toEqual(['instrumental']);
  });
});
