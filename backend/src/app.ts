/**
 * HTTP 앱의 조립 지점이다. 포트·공급자·저장 경로를 한 번 확정한 뒤 Nest 의존성으로 전달한다.
 * listen은 main에서 수행해 테스트가 실제 사용자 포트와 데이터 폴더를 사용하지 않고 앱을 만들 수 있게 한다.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { ApiExceptionFilter, jsonErrorHandler } from './api-errors.js';
import { AppModule } from './app.module.js';
import { createLocalBoundary, readUiPort } from './config/local-boundary.js';
import { StorageConfig } from './config/storage-config.js';
import { ProviderService } from './providers/provider.service.js';
import type { MusicGenerationProvider } from './providers/music-generation-provider.js';
import type { CompositionRunner } from './providers/cli-runner.js';
import type { BatchStorage } from './storage/storage.types.js';

// override 항목은 같은 프로세스의 통합 테스트에서만 주입한다. HTTP 입력으로 구현체를 선택할 수 없다.
export interface ApplicationOptions {
  uiPort?: string;
  dataDir?: string;
  musicProvider?: string;
  /** In-process integration test dependencies, never environment or HTTP options. */
  providerOverride?: MusicGenerationProvider;
  cliRunnerOverride?: CompositionRunner;
  storageOverride?: BatchStorage;
  generationTimeoutMs?: number;
}

// 잘못된 설정은 서버를 공개하기 전에 거부한다. 미들웨어 순서도 보안 계약의 일부다.
export async function createApplication(options: ApplicationOptions = {}): Promise<NestExpressApplication> {
  const uiPort = readUiPort(options.uiPort ?? process.env.UI_PORT);
  const providers = new ProviderService(options.musicProvider ?? process.env.MUSIC_PROVIDER, options.providerOverride, options.cliRunnerOverride);
  const storage = new StorageConfig(options.dataDir);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(storage, providers, options), {
    logger: false,
    bodyParser: false,
    abortOnError: false,
    // A paused audio download must not keep shutdown and the data-root lock pending.
    forceCloseConnections: true,
  });
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  // Host/Origin을 먼저 검사해 외부 사이트 요청이 JSON 파싱이나 도메인 처리에 도달하지 않게 한다.
  // 압축 해제를 금지하고 64 KiB 상한을 두어 작은 로컬 API가 예상 밖 본문을 처리하지 않게 한다.
  app.use(createLocalBoundary(uiPort));
  app.use(express.json({ limit: '64kb', strict: true, inflate: false }));
  app.use(jsonErrorHandler);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
