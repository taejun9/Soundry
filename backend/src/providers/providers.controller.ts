import { Controller, Get } from '@nestjs/common';
import type { ProviderCapabilities, ProviderSummary } from '../../../shared/contracts.js';

export function mockCapabilities(): ProviderCapabilities {
  return {
    modes: ['instrumental'], settings: [], maxVariations: 4,
    seedSupported: false, canCancelRemote: false,
  };
}

@Controller('providers')
export class ProvidersController {
  @Get('current')
  current(): ProviderSummary {
    return {
      id: 'mock', model: 'demo-fixture', isMock: true, configured: true,
      generationEnabled: false, capabilities: mockCapabilities(),
      notice: '데모 모드입니다. 음악 생성은 준비 중이며, 프롬프트는 외부로 전송되지 않습니다.',
    };
  }
}
