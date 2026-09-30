import { Controller, Get, Inject } from '@nestjs/common';
import type { ProviderSummary } from '../../../shared/contracts.js';
import { ProviderService } from './provider.service.js';

export { mockCapabilities } from './mock-provider.js';

@Controller('providers')
export class ProvidersController {
  constructor(@Inject(ProviderService) private readonly providers: ProviderService) {}

  @Get('current')
  current(): ProviderSummary {
    return this.providers.summary();
  }
}
