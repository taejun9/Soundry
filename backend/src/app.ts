import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { ApiExceptionFilter, jsonErrorHandler } from './api-errors.js';
import { AppModule } from './app.module.js';
import { createLocalBoundary, readUiPort } from './config/local-boundary.js';
import { StorageConfig } from './config/storage-config.js';

export async function createApplication(options: { uiPort?: string; dataDir?: string } = {}): Promise<NestExpressApplication> {
  const uiPort = readUiPort(options.uiPort ?? process.env.UI_PORT);
  const storage = new StorageConfig(options.dataDir);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(storage), {
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
