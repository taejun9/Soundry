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
import type { BatchStorage } from './storage/storage.types.js';

export interface ApplicationOptions {
  uiPort?: string;
  dataDir?: string;
  musicProvider?: string;
  /** In-process integration test dependencies, never environment or HTTP options. */
  providerOverride?: MusicGenerationProvider;
  storageOverride?: BatchStorage;
  generationTimeoutMs?: number;
}

export async function createApplication(options: ApplicationOptions = {}): Promise<NestExpressApplication> {
  const uiPort = readUiPort(options.uiPort ?? process.env.UI_PORT);
  const providers = new ProviderService(options.musicProvider ?? process.env.MUSIC_PROVIDER, options.providerOverride);
  const storage = new StorageConfig(options.dataDir);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(storage, providers, options), {
    logger: false,
    bodyParser: false,
    abortOnError: false,
  });
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(createLocalBoundary(uiPort));
  app.use(express.json({ limit: '64kb', strict: true, inflate: false }));
  app.use(jsonErrorHandler);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
