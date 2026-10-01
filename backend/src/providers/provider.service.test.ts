/**
 * 공급자 선택 설정과 공개 summary의 정보 경계를 검증한다.
 * 기본 CLI/명시 Mock을 구분하고 오타 fallback·내부 설정 노출·capability 객체의 외부 변경을 막는다.
 */
import { describe, expect, it } from 'vitest';
import { ProviderService, readMusicProvider } from './provider.service.js';

describe('selected provider configuration', () => {
  it('defaults to CLI while retaining explicit mock mode', () => {
    expect(readMusicProvider(undefined)).toBe('cli');
    expect(readMusicProvider('cli')).toBe('cli');
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

  // 허용 필드를 정확히 비교하고 반환 capability를 변경해도 다음 summary가 영향을 받지 않아야 한다.
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
