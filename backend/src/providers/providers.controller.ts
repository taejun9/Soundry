/**
 * 현재 공급자의 공개 상태 조회 경로다. 요청 시 probe를 갱신해 설치/로그인 변경을 앱 재시작 없이 확인한다.
 * mockCapabilities 재수출은 기존 import 계약을 유지하며 인증 값이나 임의 실행 옵션을 외부에 노출하지 않는다.
 */
import { Controller, Get, Inject } from '@nestjs/common';
import type { ProviderSummary } from '../../../shared/contracts.js';
import { ProviderService } from './provider.service.js';

export { mockCapabilities } from './mock-provider.js';

@Controller('providers')
export class ProvidersController {
  constructor(@Inject(ProviderService) private readonly providers: ProviderService) {}

  @Get('current')
  async current(): Promise<ProviderSummary> {
    await this.providers.refreshConfiguration();
    return this.providers.summary();
  }
}
